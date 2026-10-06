import "server-only";
import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { STAFF_ROLES } from "@/lib/rbac";
import { findPolo } from "@/domain/polos";
import { GRADE_ACTIONS, isGradeAction, type GradeActionName } from "@/domain/usage/actions";
import type { StaffRole } from "@/services/usage/team-usage";

/**
 * Uso das grades comerciais: quem abriu a mensagem, copiou para o WhatsApp ou baixou o PDF de cada grade, e quando.
 * Fonte: UsageEvent (ações de grade guardam o id e o nome do curso no momento do uso).
 */

export interface GradeUsageFilters {
  from: Date;
  to: Date;
  role?: StaffRole;
  polo?: string;
  userId?: string;
  gradeId?: string;
}

interface Counts {
  opens: number;
  copies: number;
  downloads: number;
  total: number;
}

export interface PersonGradeUse extends Counts {
  gradeId: string;
  label: string;
  /** false quando a grade foi excluída depois do uso (o nome vem do histórico). */
  exists: boolean;
  firstAt: Date;
  lastAt: Date;
}

export interface PersonGradeUsage extends Counts {
  id: string;
  name: string;
  role: Role;
  poloName: string | null;
  lastAt: Date | null;
  grades: PersonGradeUse[];
}

export interface GradeUsageSummary extends Counts {
  gradeId: string;
  label: string;
  exists: boolean;
  lastAt: Date;
  people: Array<{ id: string; name: string; count: number; copies: number; lastAt: Date }>;
}

export interface GradeUsageLogItem {
  at: Date;
  userId: string;
  userName: string;
  gradeId: string;
  label: string;
  exists: boolean;
  action: GradeActionName;
}

export interface GradeUsageReport {
  totals: Counts & { people: number; accounts: number; gradesUsed: number; gradesTotal: number };
  byPerson: PersonGradeUsage[];
  byGrade: GradeUsageSummary[];
  unusedGrades: Array<{ id: string; label: string; detail: string | null }>;
  /** Toda a equipe filtrada (admins inclusive) que não usou nenhuma grade no período. */
  notUsing: Array<{ id: string; name: string; role: Role }>;
  log: GradeUsageLogItem[];
  logTotal: number;
  logPage: number;
  logPages: number;
  /** Para os filtros: grades atuais (nome) e pessoas da equipe. */
  options: { grades: Array<{ id: string; label: string }>; people: Array<{ id: string; name: string }> };
}

const emptyCounts = (): Counts => ({ opens: 0, copies: 0, downloads: 0, total: 0 });

function add(counts: Counts, action: GradeActionName) {
  counts.total += 1;
  if (action === "grade.whatsapp_open") counts.opens += 1;
  else if (action === "grade.whatsapp_copy") counts.copies += 1;
  else counts.downloads += 1;
}

export const LOG_PAGE_SIZE = 50;

/** `logPageSize: Infinity` devolve o registro inteiro (exportação CSV). */
export async function getGradeUsage(filters: GradeUsageFilters, options: { logPage?: number; logPageSize?: number } = {}): Promise<GradeUsageReport> {
  const { from, to, role, polo, userId, gradeId } = filters;
  const [team, grades] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, role: role ? role : { in: [...STAFF_ROLES] }, ...(polo ? { poloCode: polo } : {}) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true, poloCode: true },
    }),
    prisma.commercialGrade.findMany({ orderBy: { courseName: "asc" }, select: { id: true, courseName: true, modality: true, curriculumTerm: true } }),
  ]);
  const users = userId ? team.filter((user) => user.id === userId) : team;
  const ids = users.map((user) => user.id);
  const events = await prisma.usageEvent.findMany({
    where: { userId: { in: ids }, kind: "ACTION", name: { in: [...GRADE_ACTIONS] }, entityId: gradeId ? gradeId : { not: null }, createdAt: { gte: from, lte: to } },
    orderBy: { createdAt: "desc" },
    take: 20_000,
    select: { userId: true, name: true, entityId: true, entityLabel: true, createdAt: true },
  });

  const current = new Map(grades.map((grade) => [grade.id, grade]));
  const userById = new Map(users.map((user) => [user.id, user]));
  // Nome atual da grade quando ela ainda existe; senão, o nome guardado no momento do uso.
  const labelOf = (id: string, stored: string | null) => current.get(id)?.courseName ?? stored ?? "Grade excluída";

  const totals = emptyCounts();
  const perPerson = new Map<string, Map<string, PersonGradeUse>>();
  const perGrade = new Map<string, GradeUsageSummary & { peopleMap: Map<string, { id: string; name: string; count: number; copies: number; lastAt: Date }> }>();
  const log: GradeUsageLogItem[] = [];

  for (const event of events) {
    if (!event.entityId || !isGradeAction(event.name)) continue;
    const user = userById.get(event.userId);
    if (!user) continue;
    const action = event.name;
    const label = labelOf(event.entityId, event.entityLabel);
    const exists = current.has(event.entityId);
    add(totals, action);
    log.push({ at: event.createdAt, userId: user.id, userName: user.name, gradeId: event.entityId, label, exists, action });

    const personGrades = perPerson.get(user.id) ?? new Map<string, PersonGradeUse>();
    perPerson.set(user.id, personGrades);
    const use = personGrades.get(event.entityId) ?? { gradeId: event.entityId, label, exists, ...emptyCounts(), firstAt: event.createdAt, lastAt: event.createdAt };
    add(use, action);
    if (event.createdAt < use.firstAt) use.firstAt = event.createdAt;
    if (event.createdAt > use.lastAt) use.lastAt = event.createdAt;
    personGrades.set(event.entityId, use);

    const grade = perGrade.get(event.entityId) ?? { gradeId: event.entityId, label, exists, ...emptyCounts(), lastAt: event.createdAt, people: [], peopleMap: new Map() };
    add(grade, action);
    if (event.createdAt > grade.lastAt) grade.lastAt = event.createdAt;
    const person = grade.peopleMap.get(user.id) ?? { id: user.id, name: user.name, count: 0, copies: 0, lastAt: event.createdAt };
    person.count += 1;
    if (action === "grade.whatsapp_copy") person.copies += 1;
    if (event.createdAt > person.lastAt) person.lastAt = event.createdAt;
    grade.peopleMap.set(user.id, person);
    perGrade.set(event.entityId, grade);
  }

  const byPerson: PersonGradeUsage[] = users
    .map((user) => {
      const list = [...(perPerson.get(user.id)?.values() ?? [])].sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
      const counts = list.reduce((sum, use) => ({ opens: sum.opens + use.opens, copies: sum.copies + use.copies, downloads: sum.downloads + use.downloads, total: sum.total + use.total }), emptyCounts());
      return { id: user.id, name: user.name, role: user.role, poloName: findPolo(user.poloCode)?.name ?? null, lastAt: list[0]?.lastAt ?? null, grades: list, ...counts };
    })
    // Quem mais usou primeiro; quem não usou nenhuma grade fica no fim, em ordem alfabética.
    .sort((a, b) => b.total - a.total || (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0) || a.name.localeCompare(b.name, "pt-BR"));

  const byGrade: GradeUsageSummary[] = [...perGrade.values()]
    .map(({ peopleMap, ...grade }) => ({ ...grade, people: [...peopleMap.values()].sort((a, b) => b.count - a.count || b.lastAt.getTime() - a.lastAt.getTime()) }))
    .sort((a, b) => b.total - a.total || b.lastAt.getTime() - a.lastAt.getTime());

  const used = new Set(perGrade.keys());
  const unusedGrades = (gradeId ? grades.filter((grade) => grade.id === gradeId) : grades)
    .filter((grade) => !used.has(grade.id))
    .map((grade) => ({ id: grade.id, label: grade.courseName, detail: [grade.modality, grade.curriculumTerm].filter(Boolean).join(" · ") || null }));

  const pageSize = options.logPageSize ?? LOG_PAGE_SIZE;
  const logPages = Math.max(1, Math.ceil(log.length / pageSize));
  const logPage = Math.min(Math.max(1, options.logPage ?? 1), logPages);
  return {
    totals: { ...totals, people: byPerson.filter((person) => person.total > 0).length, accounts: users.length, gradesUsed: used.size, gradesTotal: grades.length },
    byPerson,
    byGrade,
    unusedGrades,
    notUsing: byPerson.filter((person) => person.total === 0).map((person) => ({ id: person.id, name: person.name, role: person.role })),
    log: Number.isFinite(pageSize) ? log.slice((logPage - 1) * pageSize, logPage * pageSize) : log,
    logTotal: log.length,
    logPage,
    logPages,
    options: { grades: grades.map((grade) => ({ id: grade.id, label: grade.courseName })), people: team.map((user) => ({ id: user.id, name: user.name })) },
  };
}

/** Linha de uso em cada card do catálogo (desde o início do registro): vezes usada, pessoas e o último uso. */
export async function getGradeUsageStamps(): Promise<Map<string, { uses: number; people: number; copies: number; lastAt: Date; lastBy: string }>> {
  const [byGrade, byPair, latest] = await Promise.all([
    prisma.usageEvent.groupBy({ by: ["entityId"], where: { kind: "ACTION", name: { in: [...GRADE_ACTIONS] }, entityId: { not: null } }, _count: { _all: true }, _max: { createdAt: true } }),
    prisma.usageEvent.groupBy({ by: ["entityId", "userId", "name"], where: { kind: "ACTION", name: { in: [...GRADE_ACTIONS] }, entityId: { not: null } }, _count: { _all: true } }),
    prisma.usageEvent.findMany({ where: { kind: "ACTION", name: { in: [...GRADE_ACTIONS] }, entityId: { not: null } }, orderBy: { createdAt: "desc" }, distinct: ["entityId"], select: { entityId: true, createdAt: true, user: { select: { name: true } } } }),
  ]);
  const people = new Map<string, Set<string>>();
  const copies = new Map<string, number>();
  for (const row of byPair) {
    if (!row.entityId) continue;
    people.set(row.entityId, (people.get(row.entityId) ?? new Set()).add(row.userId));
    if (row.name === "grade.whatsapp_copy") copies.set(row.entityId, (copies.get(row.entityId) ?? 0) + row._count._all);
  }
  const last = new Map(latest.flatMap((row) => (row.entityId ? [[row.entityId, row] as const] : [])));
  const stamps = new Map<string, { uses: number; people: number; copies: number; lastAt: Date; lastBy: string }>();
  for (const row of byGrade) {
    if (!row.entityId || !row._max.createdAt) continue;
    stamps.set(row.entityId, { uses: row._count._all, people: people.get(row.entityId)?.size ?? 0, copies: copies.get(row.entityId) ?? 0, lastAt: row._max.createdAt, lastBy: last.get(row.entityId)?.user.name ?? "—" });
  }
  return stamps;
}
