import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { UsageModule } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { SessionUser } from "@/lib/session";
import { moduleForPath, routePattern } from "@/domain/usage/modules";
import { TRACKED_ACTIONS, isGradeAction, type TrackedActionName } from "@/domain/usage/actions";

/** Cada sinal de atividade vale no máximo este tempo; o navegador envia um por minuto. */
export const HEARTBEAT_SECONDS = 60;
/** Sinais mais próximos que isto (outra aba aberta) não somam tempo. */
const MIN_BEAT_INTERVAL_MS = 45_000;
/** Retenção (LGPD): a linha do tempo detalhada some antes; o agregado por hora fica para comparar períodos. */
export const EVENT_RETENTION_DAYS = 180;
export const HOURLY_RETENTION_DAYS = 730;

/** Só a equipe conta: alunos e sessões de "Acessar como" (impersonação) ficam de fora. */
export function isTrackableUser(user: Pick<SessionUser, "role" | "impersonator"> | null): boolean {
  return Boolean(user && user.role !== "STUDENT" && !user.impersonator);
}

/** Início da hora (o fuso de Porto Velho tem deslocamento inteiro, então a hora UTC coincide com a local). */
export function hourStart(at: Date): Date {
  const hour = new Date(at);
  hour.setUTCMinutes(0, 0, 0);
  return hour;
}

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** Upsert com uma nova tentativa: dois sinais simultâneos podem disputar a criação da mesma linha. */
async function bumpHour(userId: string, module: UsageModule, at: Date, data: { activeSeconds?: number; pageViews?: number }) {
  const key = { userId, hour: hourStart(at), module };
  const run = () =>
    prisma.usageHourly.upsert({
      where: { userId_hour_module: key },
      create: { ...key, activeSeconds: data.activeSeconds ?? 0, pageViews: data.pageViews ?? 0 },
      update: {
        ...(data.activeSeconds ? { activeSeconds: { increment: data.activeSeconds } } : {}),
        ...(data.pageViews ? { pageViews: { increment: data.pageViews } } : {}),
      },
    });
  try {
    await run();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    await run();
  }
}

async function touchPresence(userId: string, module: UsageModule, routeLabel: string, at: Date) {
  await prisma.userPresence.upsert({
    where: { userId },
    create: { userId, module, routeLabel, seenAt: at },
    update: { module, routeLabel, seenAt: at },
  });
}

/** Tela aberta: linha do tempo + contagem por hora + presença. */
export async function recordPageView(userId: string, path: string, at = new Date()): Promise<void> {
  const name = routePattern(path);
  const area = moduleForPath(name);
  await prisma.usageEvent.create({ data: { userId, module: area, kind: "PAGE_VIEW", name, createdAt: at } });
  await bumpHour(userId, area, at, { pageViews: 1 });
  await touchPresence(userId, area, name, at);
}

/**
 * Minuto de uso real (aba visível e interação recente, conferidas no navegador). Só soma tempo se o último sinal
 * contado foi há mais de 45 s — duas abas abertas não dobram o tempo. Devolve os segundos somados.
 */
export async function recordHeartbeat(userId: string, path: string, at = new Date()): Promise<number> {
  const name = routePattern(path);
  const area = moduleForPath(name);
  await touchPresence(userId, area, name, at);
  const claimed = await prisma.userPresence.updateMany({
    where: { userId, OR: [{ beatAt: null }, { beatAt: { lt: new Date(at.getTime() - MIN_BEAT_INTERVAL_MS) } }] },
    data: { beatAt: at },
  });
  if (claimed.count === 0) return 0;
  await bumpHour(userId, area, at, { activeSeconds: HEARTBEAT_SECONDS });
  return HEARTBEAT_SECONDS;
}

/** Ação que a auditoria não registra (ex.: baixar o PDF de uma grade). */
export async function recordAction(userId: string, name: TrackedActionName, entityId?: string | null, at = new Date()): Promise<boolean> {
  let entityLabel: string | null = null;
  if (isGradeAction(name)) {
    // Uso de grade exige a grade: o nome do curso é lido aqui (nunca vem do navegador) e fica no histórico.
    const grade = entityId ? await prisma.commercialGrade.findUnique({ where: { id: entityId }, select: { courseName: true } }) : null;
    if (!grade) return false;
    entityLabel = grade.courseName;
  }
  await prisma.usageEvent.create({ data: { userId, module: TRACKED_ACTIONS[name].module, kind: "ACTION", name, entityId: entityId ?? null, entityLabel, createdAt: at } });
  return true;
}

/** Para chamar de dentro de outras rotas: nunca lança nem atrasa a resposta por causa do rastreamento. */
export function trackAction(user: Pick<SessionUser, "id" | "role" | "impersonator"> | null, name: TrackedActionName, entityId?: string | null): void {
  if (!user || !isTrackableUser(user)) return;
  recordAction(user.id, name, entityId).catch((error) => logger.warn("usage.track_failed", { name, error: String(error) }));
}

/** Limpeza diária (cron de retenção). */
export async function purgeOldUsage(now = new Date()): Promise<{ events: number; hours: number }> {
  const day = 24 * 60 * 60_000;
  const [events, hours] = await Promise.all([
    prisma.usageEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - EVENT_RETENTION_DAYS * day) } } }),
    prisma.usageHourly.deleteMany({ where: { hour: { lt: new Date(now.getTime() - HOURLY_RETENTION_DAYS * day) } } }),
  ]);
  return { events: events.count, hours: hours.count };
}
