import "server-only";
import type { Role, UsageModule } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { STAFF_ROLES } from "@/lib/rbac";
import { findPolo } from "@/domain/polos";
import { AUDITED_ACTION_NAMES, GRADE_ACTIONS, usageAction } from "@/domain/usage/actions";
import { MODULE_LABELS, WORK_MODULES, pageLabel, type WorkModule } from "@/domain/usage/modules";
import {
  ONLINE_WINDOW_MS,
  groupSessions,
  lastDayKeys,
  personStatus,
  zonedDayKey,
  zonedWeekdayHour,
  type PersonStatus,
} from "@/domain/usage/metrics";
import { hourStart } from "@/services/usage/track";

/** Dias do minigráfico de tendência (por pessoa e por módulo). */
export const TREND_DAYS = 14;

export type StaffRole = (typeof STAFF_ROLES)[number];

export interface UsageFilters {
  from: Date;
  to: Date;
  role?: StaffRole;
  polo?: string;
  module?: WorkModule;
}

export interface ActionCount {
  name: string;
  label: string;
  plural: string;
  module: UsageModule;
  count: number;
  key: boolean;
}

export interface PersonUsage {
  id: string;
  name: string;
  role: Role;
  poloCode: string | null;
  poloName: string | null;
  status: PersonStatus;
  online: boolean;
  /** Onde a pessoa está agora (só quando online). */
  currentModule: UsageModule | null;
  currentScreen: string | null;
  lastSeenAt: Date | null;
  /** Tempo ativo no período (no módulo filtrado, se houver). */
  activeSeconds: number;
  activeDays: number;
  moduleSeconds: Record<UsageModule, number>;
  moduleActions: Record<UsageModule, number>;
  /** Ações de trabalho no período (no módulo filtrado, se houver); logins não contam. */
  actions: number;
  logins: number;
  /** Até 3 ações mais frequentes, já com rótulo ("Análises criadas: 5"). */
  highlights: string[];
  /** Minutos ativos por dia, dos últimos 14 dias (o último é hoje). */
  trend: number[];
  managedStudents: number;
}

export interface ModuleSummary {
  module: WorkModule;
  label: string;
  people: number;
  activeSeconds: number;
  actions: ActionCount[];
  totalActions: number;
  trend: number[];
  top: Array<{ id: string; name: string; activeSeconds: number; actions: number }>;
}

export interface TeamUsageReport {
  generatedAt: Date;
  accounts: number;
  online: Array<{ id: string; name: string; module: UsageModule | null; screen: string | null }>;
  activeToday: number;
  active7d: number;
  active30d: number;
  activeInPeriod: number;
  activeSeconds: number;
  actions: number;
  logins: number;
  modules: ModuleSummary[];
  people: PersonUsage[];
  /** Minutos ativos por dia da semana (0 = domingo) × hora (0–23). */
  heatmap: number[][];
  attention: {
    neverAccessed: Array<{ id: string; name: string; role: Role }>;
    idle: Array<{ id: string; name: string; role: Role; days: number }>;
    tutorsWithoutAcademic: Array<{ id: string; name: string; students: number }>;
    analystsWithoutAnalyses: Array<{ id: string; name: string }>;
    /** Toda a equipe (admins inclusive) sem abrir, copiar ou baixar nenhuma grade no período. */
    withoutGrades: Array<{ id: string; name: string; role: Role }>;
  };
}

const emptyByModule = (): Record<UsageModule, number> => ({ CURRICULAR: 0, GRADES: 0, ACADEMIC: 0, MANAGEMENT: 0, SETTINGS: 0, OTHER: 0 });
const latest = (...dates: Array<Date | null | undefined>) => dates.reduce<Date | null>((max, date) => (date && (!max || date > max) ? date : max), null);
const inRange = (at: Date, from: Date, to: Date) => at >= from && at <= to;

/** Painel completo do período: indicadores, módulos, equipe, mapa de calor e atenção. */
export async function getTeamUsage(filters: UsageFilters, now = new Date()): Promise<TeamUsageReport> {
  const { from, to, role, polo, module: focus } = filters;
  const users = await prisma.user.findMany({
    where: { isActive: true, role: role ? role : { in: [...STAFF_ROLES] }, ...(polo ? { poloCode: polo } : {}) },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      role: true,
      poloCode: true,
      lastActiveAt: true,
      lastLoginAt: true,
      usagePresence: { select: { module: true, routeLabel: true, seenAt: true } },
      _count: { select: { managedStudents: true } },
    },
  });
  const ids = users.map((user) => user.id);
  const trendKeys = lastDayKeys(now, TREND_DAYS);
  const dataStart = new Date(Math.min(from.getTime(), new Date(`${trendKeys[0]}T00:00:00-04:00`).getTime()));
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
  const [hours, audits, tracked, academicLastWeek] = await Promise.all([
    prisma.usageHourly.findMany({ where: { userId: { in: ids }, hour: { gte: hourStart(dataStart), lte: to > now ? now : to } }, select: { userId: true, hour: true, module: true, activeSeconds: true, pageViews: true } }),
    prisma.auditLog.findMany({ where: { userId: { in: ids }, action: { in: AUDITED_ACTION_NAMES }, createdAt: { gte: from, lte: to } }, select: { userId: true, action: true, createdAt: true } }),
    prisma.usageEvent.findMany({ where: { userId: { in: ids }, kind: "ACTION", createdAt: { gte: from, lte: to } }, select: { userId: true, name: true, createdAt: true } }),
    // Tutores: atividade acadêmica (tempo ou ação) na última semana, independente do período escolhido.
    prisma.usageHourly.groupBy({ by: ["userId"], where: { userId: { in: ids }, module: "ACADEMIC", hour: { gte: hourStart(weekAgo) } }, _sum: { activeSeconds: true, pageViews: true } }),
  ]);
  const academicAudits = await prisma.auditLog.groupBy({
    by: ["userId"],
    where: { userId: { in: ids }, createdAt: { gte: weekAgo }, action: { in: AUDITED_ACTION_NAMES.filter((name) => usageAction(name)?.module === "ACADEMIC") } },
    _count: { _all: true },
  });

  const heatmap = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const perUser = new Map(ids.map((id) => [id, {
    moduleSeconds: emptyByModule(),
    moduleActions: emptyByModule(),
    days: new Set<string>(),
    actions: new Map<string, number>(),
    logins: 0,
    trend: new Array<number>(TREND_DAYS).fill(0),
    lastActionAt: null as Date | null,
  }]));
  const moduleTrend = new Map<WorkModule, number[]>(WORK_MODULES.map((module) => [module, new Array<number>(TREND_DAYS).fill(0)]));

  for (const row of hours) {
    const stats = perUser.get(row.userId)!;
    const dayKey = zonedDayKey(row.hour);
    const trendIndex = trendKeys.indexOf(dayKey);
    if (trendIndex >= 0 && (!focus || row.module === focus)) stats.trend[trendIndex] += Math.round(row.activeSeconds / 60);
    if (trendIndex >= 0 && (WORK_MODULES as readonly UsageModule[]).includes(row.module)) moduleTrend.get(row.module as WorkModule)![trendIndex] += Math.round(row.activeSeconds / 60);
    // A linha da hora pertence ao período se a hora começou dentro dele (ou é a hora em que ele começa).
    if (!inRange(row.hour, hourStart(from), to)) continue;
    stats.moduleSeconds[row.module] += row.activeSeconds;
    if (row.activeSeconds > 0 || row.pageViews > 0) stats.days.add(dayKey);
    if (row.activeSeconds > 0 && (!focus || row.module === focus)) {
      const { weekday, hour } = zonedWeekdayHour(row.hour);
      heatmap[weekday][hour] += Math.round(row.activeSeconds / 60);
    }
  }
  const countAction = (userId: string | null, name: string, at: Date) => {
    const stats = userId ? perUser.get(userId) : undefined;
    const def = usageAction(name);
    if (!stats || !def) return;
    stats.days.add(zonedDayKey(at));
    if (!stats.lastActionAt || at > stats.lastActionAt) stats.lastActionAt = at;
    if (name === "auth.login") {
      stats.logins += 1;
      return;
    }
    stats.actions.set(name, (stats.actions.get(name) ?? 0) + 1);
    stats.moduleActions[def.module] += 1;
  };
  for (const row of audits) countAction(row.userId, row.action, row.createdAt);
  for (const row of tracked) countAction(row.userId, row.name, row.createdAt);

  const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MS);
  const people: PersonUsage[] = users.map((user) => {
    const stats = perUser.get(user.id)!;
    const presence = user.usagePresence;
    const online = Boolean(presence && presence.seenAt >= onlineSince);
    // Qualquer sinal de vida conta: presença, sessão, login ou uma ação registrada no período.
    const lastSeenAt = latest(presence?.seenAt, user.lastActiveAt, user.lastLoginAt, stats.lastActionAt);
    const actionList = [...stats.actions.entries()]
      .map(([name, count]) => ({ name, count, def: usageAction(name)! }))
      .filter((item) => !focus || item.def.module === focus)
      .sort((a, b) => b.count - a.count);
    const totalSeconds = Object.values(stats.moduleSeconds).reduce((sum, value) => sum + value, 0);
    return {
      id: user.id,
      name: user.name,
      role: user.role,
      poloCode: user.poloCode,
      poloName: findPolo(user.poloCode)?.name ?? null,
      status: personStatus(lastSeenAt, online, now),
      online,
      currentModule: online ? presence!.module : null,
      currentScreen: online ? pageLabel(presence!.routeLabel) : null,
      lastSeenAt,
      activeSeconds: focus ? stats.moduleSeconds[focus] : totalSeconds,
      activeDays: stats.days.size,
      moduleSeconds: stats.moduleSeconds,
      moduleActions: stats.moduleActions,
      actions: actionList.reduce((sum, item) => sum + item.count, 0),
      logins: stats.logins,
      highlights: actionList.slice(0, 3).map((item) => `${item.def.plural.charAt(0).toUpperCase()}${item.def.plural.slice(1)}: ${item.count}`),
      trend: stats.trend,
      managedStudents: user._count.managedStudents,
    };
  });
  // Mais uso primeiro; quem nunca acessou vai para o fim.
  people.sort((a, b) => Number(b.online) - Number(a.online) || b.activeSeconds - a.activeSeconds || b.actions - a.actions || (b.lastSeenAt?.getTime() ?? 0) - (a.lastSeenAt?.getTime() ?? 0));

  const modules: ModuleSummary[] = WORK_MODULES.map((module) => {
    const counts = new Map<string, number>();
    for (const stats of perUser.values()) for (const [name, count] of stats.actions) if (usageAction(name)?.module === module) counts.set(name, (counts.get(name) ?? 0) + count);
    const actions = [...counts.entries()]
      .map(([name, count]) => {
        const def = usageAction(name)!;
        return { name, label: def.label, plural: def.plural, module: def.module, count, key: Boolean(def.key) };
      })
      .sort((a, b) => Number(b.key) - Number(a.key) || b.count - a.count);
    const ranked = people
      .map((person) => ({ id: person.id, name: person.name, activeSeconds: person.moduleSeconds[module], actions: person.moduleActions[module] }))
      .filter((person) => person.activeSeconds > 0 || person.actions > 0)
      .sort((a, b) => b.activeSeconds - a.activeSeconds || b.actions - a.actions);
    return {
      module,
      label: MODULE_LABELS[module],
      people: ranked.length,
      activeSeconds: ranked.reduce((sum, person) => sum + person.activeSeconds, 0),
      actions,
      totalActions: actions.reduce((sum, action) => sum + action.count, 0),
      trend: moduleTrend.get(module)!,
      top: ranked.slice(0, 3),
    };
  });

  const day = 24 * 60 * 60_000;
  const seenWithin = (ms: number) => people.filter((person) => person.lastSeenAt && person.lastSeenAt.getTime() >= now.getTime() - ms).length;
  const academicActive = new Set([
    ...academicLastWeek.filter((row) => (row._sum.activeSeconds ?? 0) > 0 || (row._sum.pageViews ?? 0) > 0).map((row) => row.userId),
    ...academicAudits.flatMap((row) => (row.userId ? [row.userId] : [])),
  ]);
  return {
    generatedAt: now,
    accounts: users.length,
    online: people.filter((person) => person.online).map((person) => ({ id: person.id, name: person.name, module: person.currentModule, screen: person.currentScreen })),
    activeToday: people.filter((person) => person.status.kind === "online" || person.status.kind === "today").length,
    active7d: seenWithin(7 * day),
    active30d: seenWithin(30 * day),
    activeInPeriod: people.filter((person) => person.activeSeconds > 0 || person.actions > 0 || person.logins > 0 || person.activeDays > 0 || (person.lastSeenAt && inRange(person.lastSeenAt, from, to))).length,
    activeSeconds: people.reduce((sum, person) => sum + person.activeSeconds, 0),
    actions: people.reduce((sum, person) => sum + person.actions, 0),
    logins: people.reduce((sum, person) => sum + person.logins, 0),
    modules,
    people,
    heatmap,
    attention: {
      neverAccessed: people.filter((person) => person.status.kind === "never").map((person) => ({ id: person.id, name: person.name, role: person.role })),
      idle: people.filter((person) => person.status.kind === "idle").map((person) => ({ id: person.id, name: person.name, role: person.role, days: person.status.days ?? 0 })).sort((a, b) => b.days - a.days),
      tutorsWithoutAcademic: people.filter((person) => person.role === "TUTOR" && person.managedStudents > 0 && !academicActive.has(person.id)).map((person) => ({ id: person.id, name: person.name, students: person.managedStudents })),
      analystsWithoutAnalyses: people.filter((person) => person.role === "ANALYST" && !(perUser.get(person.id)!.actions.get("analysis.create"))).map((person) => ({ id: person.id, name: person.name })),
      withoutGrades: people.filter((person) => !GRADE_ACTIONS.some((name) => perUser.get(person.id)!.actions.get(name))).map((person) => ({ id: person.id, name: person.name, role: person.role })),
    },
  };
}

export interface PersonTimelineItem {
  at: Date;
  kind: "login" | "page" | "action";
  module: UsageModule;
  label: string;
  /** Repetições seguidas do mesmo item (ex.: a mesma tela aberta 3 vezes em sequência). */
  count: number;
}

export interface PersonUsageDetail {
  person: PersonUsage;
  daily: Array<{ day: string; seconds: Record<UsageModule, number> }>;
  topScreens: Array<{ name: string; label: string; module: UsageModule; views: number }>;
  sessions: Array<{ start: Date; end: Date; modules: UsageModule[]; screens: number; actions: number; login: boolean; summary: string[] }>;
  timeline: PersonTimelineItem[];
}

/** Detalhe de uma pessoa: série diária por módulo, telas mais usadas, sessões e linha do tempo. */
export async function getPersonUsage(userId: string, filters: Pick<UsageFilters, "from" | "to">, now = new Date()): Promise<PersonUsageDetail | null> {
  const user = await prisma.user.findFirst({ where: { id: userId, role: { in: [...STAFF_ROLES] } }, select: { id: true, role: true, poloCode: true } });
  if (!user) return null;
  const report = await getTeamUsage({ ...filters, role: user.role as StaffRole, polo: user.poloCode ?? undefined }, now);
  const person = report.people.find((item) => item.id === userId);
  if (!person) return null;
  const { from, to } = filters;
  const [hours, events, audits] = await Promise.all([
    prisma.usageHourly.findMany({ where: { userId, hour: { gte: hourStart(from), lte: to } }, select: { hour: true, module: true, activeSeconds: true } }),
    prisma.usageEvent.findMany({ where: { userId, createdAt: { gte: from, lte: to } }, orderBy: { createdAt: "desc" }, take: 3000, select: { kind: true, name: true, module: true, createdAt: true } }),
    prisma.auditLog.findMany({ where: { userId, action: { in: AUDITED_ACTION_NAMES }, createdAt: { gte: from, lte: to } }, orderBy: { createdAt: "desc" }, take: 1000, select: { action: true, createdAt: true } }),
  ]);

  const dayKeys: string[] = [];
  for (let at = new Date(`${zonedDayKey(from)}T12:00:00-04:00`); zonedDayKey(at) <= zonedDayKey(to > now ? now : to) && dayKeys.length < 120; at = new Date(at.getTime() + 24 * 60 * 60_000)) dayKeys.push(zonedDayKey(at));
  const daily = dayKeys.map((day) => ({ day, seconds: emptyByModule() }));
  const dayIndex = new Map(dayKeys.map((day, index) => [day, index]));
  for (const row of hours) {
    const index = dayIndex.get(zonedDayKey(row.hour));
    if (index !== undefined) daily[index].seconds[row.module] += row.activeSeconds;
  }

  const screens = new Map<string, { module: UsageModule; views: number }>();
  for (const event of events) {
    if (event.kind !== "PAGE_VIEW") continue;
    const current = screens.get(event.name) ?? { module: event.module, views: 0 };
    current.views += 1;
    screens.set(event.name, current);
  }
  const topScreens = [...screens.entries()]
    .map(([name, value]) => ({ name, label: pageLabel(name), module: value.module, views: value.views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 8);

  const items: PersonTimelineItem[] = [
    ...events.map((event) => ({
      at: event.createdAt,
      kind: event.kind === "PAGE_VIEW" ? ("page" as const) : ("action" as const),
      module: event.module,
      label: event.kind === "PAGE_VIEW" ? `Abriu ${pageLabel(event.name)}` : (usageAction(event.name)?.label ?? event.name),
      count: 1,
    })),
    ...audits.flatMap((audit) => {
      const def = usageAction(audit.action);
      return def ? [{ at: audit.createdAt, kind: audit.action === "auth.login" ? ("login" as const) : ("action" as const), module: def.module, label: def.label, count: 1 }] : [];
    }),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const sessions = groupSessions(items).slice(0, 20).map((session) => {
    const actionCounts = new Map<string, number>();
    for (const item of session.items) if (item.kind === "action") actionCounts.set(item.label, (actionCounts.get(item.label) ?? 0) + 1);
    return {
      start: session.start,
      end: session.end,
      modules: [...new Set(session.items.map((item) => item.module).filter((area) => area !== "OTHER"))],
      screens: session.items.filter((item) => item.kind === "page").length,
      actions: session.items.filter((item) => item.kind === "action").length,
      login: session.items.some((item) => item.kind === "login"),
      summary: [...actionCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([label, count]) => (count > 1 ? `${label} ×${count}` : label)),
    };
  });

  // A mesma tela/ação repetida em sequência (recarregar a página, várias análises seguidas) vira uma linha com contagem.
  const timeline: PersonTimelineItem[] = [];
  for (const item of items) {
    const previous = timeline[timeline.length - 1];
    if (previous && previous.kind === item.kind && previous.label === item.label && previous.at.getTime() - item.at.getTime() <= 30 * 60_000) previous.count += 1;
    else timeline.push({ ...item });
  }

  return { person, daily, topScreens, sessions, timeline: timeline.slice(0, 60) };
}

/** Pulso da equipe para a Gestão: quantos estão online agora e quantos estão parados (14+ dias ou nunca acessaram). */
export async function getTeamPulse(now = new Date()): Promise<{ accounts: number; online: number; idle: number; never: number }> {
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { in: [...STAFF_ROLES] } },
    select: { lastActiveAt: true, lastLoginAt: true, usagePresence: { select: { seenAt: true } } },
  });
  const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MS);
  let online = 0;
  let idle = 0;
  let never = 0;
  for (const user of users) {
    const isOnline = Boolean(user.usagePresence && user.usagePresence.seenAt >= onlineSince);
    const status = personStatus(latest(user.usagePresence?.seenAt, user.lastActiveAt, user.lastLoginAt), isOnline, now);
    if (status.kind === "online") online += 1;
    else if (status.kind === "idle") idle += 1;
    else if (status.kind === "never") never += 1;
  }
  return { accounts: users.length, online, idle, never };
}
