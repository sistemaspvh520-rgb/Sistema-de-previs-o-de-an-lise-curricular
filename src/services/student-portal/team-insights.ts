import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { AcademicGridSnapshot } from "@/domain/academic-analysis/types";
import { estimateGraduation } from "@/domain/academic-analysis/graduation-forecast";
import type { AcademicCalendarTerm } from "@/domain/academic-calendar/calendar";
import { getAcademicCalendar } from "@/repositories/academic-calendar-repository";
import { zonedDateParts } from "@/lib/time";

/**
 * Painel do time: o que cada tutor precisa fazer e quem vale procurar. Tudo é derivado da versão
 * atual (e da anterior) de cada aluno. Versões são imutáveis, então o resumo de cada uma fica em
 * cache por instância — só as versões novas são lidas do banco.
 */

export const ATTENTION_PENDING = 5;
const INVITE_STALE_DAYS = 7;
const INACTIVE_DAYS = 60;
const DAY = 86_400_000;

type VersionSummary = {
  status: AcademicGridSnapshot["result"]["status"];
  currentPeriod: number | null;
  mappingRequired: boolean;
  pending: number;
  inProgressPrevious: number;
  canAddNow: number;
  completionMin: string | null;
  completionMax: string | null;
};

const summaries = new Map<string, VersionSummary>();
let summariesCalendarKey = "";

function summarize(snapshot: AcademicGridSnapshot, createdAt: Date, calendar: AcademicCalendarTerm[]): VersionSummary {
  const result = snapshot.result;
  const mappingRequired = !result.currentPeriodConfirmed || snapshot.disciplines.some((row) => row.inMainCurriculum && row.period === null);
  const date = zonedDateParts(createdAt);
  const forecast = mappingRequired
    ? null
    : estimateGraduation({
        disciplines: snapshot.disciplines,
        currentPeriod: result.currentPeriod,
        analysisDate: `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`,
        calendarTerms: calendar,
        rules: snapshot.projectionRules,
        extractionWarnings: snapshot.extractionWarnings,
        sourceDisciplineCount: snapshot.sourceDisciplineCount,
        sourceParsedDisciplineCount: snapshot.sourceParsedDisciplineCount,
      });
  return {
    status: result.status,
    currentPeriod: result.currentPeriod,
    mappingRequired,
    pending: result.previousPending,
    inProgressPrevious: result.previousAlreadyAdded,
    canAddNow: result.status === "MANUAL_REVIEW_REQUIRED" ? 0 : result.canAddNow,
    completionMin: forecast?.completionTermMin ?? null,
    completionMax: forecast?.completionTermMax ?? null,
  };
}

async function versionSummaries(ids: string[], calendar: AcademicCalendarTerm[]) {
  const calendarKey = calendar.map((term) => `${term.term}:${term.startsOn}:${term.confidence}`).join("|");
  if (calendarKey !== summariesCalendarKey) {
    summaries.clear();
    summariesCalendarKey = calendarKey;
  }
  const missing = ids.filter((id) => !summaries.has(id));
  for (let i = 0; i < missing.length; i += 200) {
    const rows = await prisma.academicAnalysisVersion.findMany({
      where: { id: { in: missing.slice(i, i + 200) } },
      select: { id: true, snapshot: true, createdAt: true },
    });
    for (const row of rows) summaries.set(row.id, summarize(row.snapshot as unknown as AcademicGridSnapshot, row.createdAt, calendar));
  }
  if (summaries.size > 20_000) summaries.clear();
  return summaries;
}

/** "2026.2" → número comparável. */
export function termIndex(term: string | null | undefined): number | null {
  const match = term ? /^(\d{4})\.(\d)$/.exec(term) : null;
  return match ? Number(match[1]) * 2 + Number(match[2]) - 1 : null;
}

function currentTerm(calendar: AcademicCalendarTerm[], now = new Date()) {
  const { year, month, day } = zonedDateParts(now);
  const today = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const found = calendar.find((term) => term.startsOn <= today && today <= term.endsOn);
  return { term: found?.term ?? `${year}.${month >= 7 ? 2 : 1}`, startsOn: found?.startsOn ?? `${year}-${month >= 7 ? "07" : "01"}-01` };
}

export type StudentRef = {
  enrollmentId: string;
  name: string;
  rgm: string;
  courseName: string | null;
  tutor: { id: string; name: string };
  email: string | null;
  reviewId: string | null;
};

export type ActionItem = StudentRef & {
  kind: "DELETION" | "MAPPING" | "DOCUMENT" | "NO_ACCESS" | "INVITE" | "OUTDATED";
  detail: string;
  href: string;
};

export type AdvanceItem = StudentRef & { canAddNow: number; pending: number; message: string };
export type GraduatingItem = StudentRef & { completion: string; pending: number };
export type AttentionItem = StudentRef & { reasons: string[] };
export type TutorScore = {
  tutor: { id: string; name: string };
  students: number;
  activeAccess: number;
  analysesThisMonth: number;
  advanced: number;
  canAdvance: number;
  actions: number;
};

export type TeamInsights = {
  currentTerm: string;
  actions: ActionItem[];
  canAdvance: AdvanceItem[];
  graduating: GraduatingItem[];
  attention: AttentionItem[];
  tutors: TutorScore[];
};

const ACTION_ORDER: Record<ActionItem["kind"], number> = { DELETION: 0, DOCUMENT: 1, MAPPING: 2, NO_ACCESS: 3, INVITE: 4, OUTDATED: 5 };

export async function getTeamInsights(scope: Prisma.StudentEnrollmentWhereInput, now = new Date(), options: { deletionRequests?: boolean } = {}): Promise<TeamInsights> {
  const calendar = await getAcademicCalendar(zonedDateParts(now).year + 20);
  const term = currentTerm(calendar, now);
  const termStart = new Date(`${term.startsOn}T00:00:00-04:00`);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const enrollments = await prisma.studentEnrollment.findMany({
    where: scope,
    orderBy: { name: "asc" },
    take: 5000,
    select: {
      id: true,
      name: true,
      rgm: true,
      courseName: true,
      owner: { select: { id: true, name: true } },
      studentUser: { select: { email: true, isActive: true, mustChangePassword: true, inviteSentAt: true, lastLoginAt: true, lastActiveAt: true } },
      currentVersion: { select: { id: true, reviewId: true, createdAt: true, previousVersionId: true } },
      sources: { orderBy: { updatedAt: "desc" }, take: 1, select: { status: true, errorMessage: true, updatedAt: true } },
      _count: { select: { versions: { where: { createdAt: { gte: monthStart } } } } },
    },
  });

  const versionIds = enrollments.flatMap((row) => row.currentVersion ? [row.currentVersion.id, ...(row.currentVersion.previousVersionId ? [row.currentVersion.previousVersionId] : [])] : []);
  const cache = await versionSummaries(versionIds, calendar);
  const nextTermIndex = (termIndex(term.term) ?? 0) + 1;

  const actions: ActionItem[] = [];
  const canAdvance: AdvanceItem[] = [];
  const graduating: GraduatingItem[] = [];
  const attention: AttentionItem[] = [];
  const tutors = new Map<string, TutorScore>();

  for (const row of enrollments) {
    const ref: StudentRef = {
      enrollmentId: row.id,
      name: row.name,
      rgm: row.rgm,
      courseName: row.courseName,
      tutor: row.owner,
      email: row.studentUser?.email ?? null,
      reviewId: row.currentVersion?.reviewId ?? null,
    };
    const studentHref = `/academic-analysis/students/${row.id}`;
    const summary = row.currentVersion ? cache.get(row.currentVersion.id) : undefined;
    const previous = row.currentVersion?.previousVersionId ? cache.get(row.currentVersion.previousVersionId) : undefined;
    const score = tutors.get(row.owner.id) ?? { tutor: row.owner, students: 0, activeAccess: 0, analysesThisMonth: 0, advanced: 0, canAdvance: 0, actions: 0 };
    tutors.set(row.owner.id, score);
    score.students += 1;
    score.analysesThisMonth += row._count.versions;
    const user = row.studentUser;
    if (user?.isActive && !user.mustChangePassword) score.activeAccess += 1;
    const before = actions.length;

    const source = row.sources[0];
    if (source?.status === "FAILED")
      actions.push({ ...ref, kind: "DOCUMENT", detail: "O último documento enviado não pôde ser lido. Peça um novo arquivo ao aluno.", href: studentHref });
    if (summary?.mappingRequired && row.currentVersion)
      actions.push({ ...ref, kind: "MAPPING", detail: "Confirme o período atual e a posição das disciplinas para liberar a previsão.", href: `/academic-analysis/${row.currentVersion.reviewId}` });
    if (row.currentVersion && !user)
      actions.push({ ...ref, kind: "NO_ACCESS", detail: "Tem análise pronta, mas ainda não tem acesso ao Portal Acadêmico.", href: studentHref });
    if (user?.isActive && user.mustChangePassword && user.inviteSentAt && now.getTime() - user.inviteSentAt.getTime() > INVITE_STALE_DAYS * DAY)
      actions.push({ ...ref, kind: "INVITE", detail: `Convite enviado há ${Math.floor((now.getTime() - user.inviteSentAt.getTime()) / DAY)} dias e ainda não aceito.`, href: studentHref });
    if (row.currentVersion && row.currentVersion.createdAt < termStart)
      actions.push({ ...ref, kind: "OUTDATED", detail: `Análise anterior ao semestre ${term.term}. Peça o documento atualizado.`, href: studentHref });
    score.actions += actions.length - before;

    if (!summary || summary.mappingRequired) continue;

    if (summary.canAddNow > 0 && summary.pending > 0) {
      score.canAdvance += 1;
      const first = row.name.trim().split(/\s+/)[0] ?? "";
      const firstName = first.charAt(0).toLocaleUpperCase("pt-BR") + first.slice(1).toLocaleLowerCase("pt-BR");
      canAdvance.push({
        ...ref,
        canAddNow: summary.canAddNow,
        pending: summary.pending,
        message: `Olá, ${firstName}! Analisamos o seu histórico e você pode incluir ${summary.canAddNow} ${summary.canAddNow === 1 ? "disciplina pendente" : "disciplinas pendentes"} neste semestre, adiantando a sua formatura. Podemos conversar para organizar a sua matrícula?`,
      });
    }

    const completion = summary.completionMin;
    const completionIndex = termIndex(summary.completionMax ?? completion);
    if (completion && completionIndex !== null && completionIndex <= nextTermIndex)
      graduating.push({ ...ref, completion: summary.completionMin === summary.completionMax || !summary.completionMax ? completion : `${completion} a ${summary.completionMax}`, pending: summary.pending });

    const reasons: string[] = [];
    if (summary.pending >= ATTENTION_PENDING) reasons.push(`${summary.pending} pendências de períodos anteriores`);
    const prevIndex = termIndex(previous?.completionMax ?? previous?.completionMin);
    const nowIndex = termIndex(summary.completionMax ?? summary.completionMin);
    if (prevIndex !== null && nowIndex !== null && nowIndex > prevIndex) reasons.push(`Previsão de conclusão adiada (${previous?.completionMax ?? previous?.completionMin} → ${summary.completionMax ?? summary.completionMin})`);
    const lastSeen = user?.lastActiveAt ?? user?.lastLoginAt;
    if (user?.isActive && !user.mustChangePassword && (!lastSeen || now.getTime() - lastSeen.getTime() > INACTIVE_DAYS * DAY))
      reasons.push(lastSeen ? `Sem entrar no portal há ${Math.floor((now.getTime() - lastSeen.getTime()) / DAY)} dias` : "Ainda não entrou no portal");
    if (reasons.length) attention.push({ ...ref, reasons });

    if (previous && summary.pending < previous.pending) score.advanced += 1;
  }

  if (options.deletionRequests) {
    const requests = await prisma.studentDeletionRequest.findMany({
      where: { status: "PENDING", enrollment: scope },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: { studentName: true, rgm: true, reason: true, enrollment: { select: { id: true, courseName: true, owner: { select: { id: true, name: true } } } }, requestedBy: { select: { name: true } } },
    });
    for (const request of requests) {
      if (!request.enrollment) continue;
      actions.push({ enrollmentId: request.enrollment.id, name: request.studentName, rgm: request.rgm, courseName: request.enrollment.courseName, tutor: request.enrollment.owner, email: null, reviewId: null, kind: "DELETION", detail: `${request.requestedBy.name} pediu a exclusão${request.reason ? `: “${request.reason}”` : "."}`, href: "/academic-analysis/students#pedidos-exclusao" });
    }
  }

  actions.sort((a, b) => ACTION_ORDER[a.kind] - ACTION_ORDER[b.kind] || a.name.localeCompare(b.name, "pt-BR"));
  canAdvance.sort((a, b) => b.canAddNow - a.canAddNow || b.pending - a.pending);
  graduating.sort((a, b) => (termIndex(a.completion.slice(0, 6)) ?? 0) - (termIndex(b.completion.slice(0, 6)) ?? 0));
  attention.sort((a, b) => b.reasons.length - a.reasons.length || a.name.localeCompare(b.name, "pt-BR"));

  return {
    currentTerm: term.term,
    actions,
    canAdvance,
    graduating,
    attention,
    tutors: [...tutors.values()].sort((a, b) => b.students - a.students || a.tutor.name.localeCompare(b.tutor.name, "pt-BR")),
  };
}
