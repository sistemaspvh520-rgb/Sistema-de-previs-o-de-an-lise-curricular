import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { getRuleSetById } from "@/repositories/rules-repository";
import {
  calculateCurriculumTotals,
  calculatePreviousBacklog,
  compareDocumentClaims,
  detectInconsistencies,
  simulateCurriculum,
  validateAnalysis,
  calculateAnalysisStatus,
  type SubjectRow,
  type SimulationResult,
  type CurriculumTotals,
  type AnalysisWarningInput,
  type DocumentClaimInput,
} from "@/domain/curricular-analysis";
import type { ValidationViolation } from "@/domain/curricular-analysis/validators/validate";

export interface ComputeResult {
  subjects: SubjectRow[];
  totals: CurriculumTotals;
  simulation: SimulationResult | null;
  entryPeriod: number | null;
  warnings: AnalysisWarningInput[];
  violations: ValidationViolation[];
  claims: DocumentClaimInput[];
  previousBacklogCount: number | null;
}

export async function loadSubjectRows(analysisId: string): Promise<SubjectRow[]> {
  const rows = await prisma.analyzedSubject.findMany({ where: { analysisId }, orderBy: { sortIndex: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    workload: r.workload,
    period: r.period,
    usedSubject: r.usedSubject,
    status: r.status,
    readability: r.readability,
    sourcePage: r.sourcePage,
    sourceRow: r.sourceRow,
    sortIndex: r.sortIndex,
  }));
}

/**
 * Executa as camadas 5 e 6 (motor + validador) a partir do estado persistido e grava:
 * projeções, warnings (VALIDATOR/PIPELINE), comparação de claims. Preserva warnings do AUDITOR
 * (a menos que `resetAuditorWarnings`).
 */
export async function computeAndPersist(analysisId: string, opts?: { resetAuditorWarnings?: boolean }): Promise<ComputeResult> {
  const analysis = await prisma.curricularAnalysis.findUniqueOrThrow({
    where: { id: analysisId },
    include: { claims: true },
  });
  const ruleSet = await getRuleSetById(analysis.ruleSetVersionId);
  const subjects = await loadSubjectRows(analysisId);
  const totals = calculateCurriculumTotals(subjects);
  const entryPeriod = analysis.entryPeriod;

  const warnings: AnalysisWarningInput[] = [];
  warnings.push(...detectInconsistencies(subjects, totals));

  let simulation: SimulationResult | null = null;
  let previousBacklogCount: number | null = null;
  if (entryPeriod !== null) {
    previousBacklogCount = calculatePreviousBacklog(subjects, entryPeriod, ruleSet.rules).length;
    simulation = simulateCurriculum({ subjects, entryPeriod, startTerm: analysis.startTerm, rules: ruleSet.rules });
    if (simulation.incomplete) {
      warnings.push({
        code: simulation.incompleteReason === "MAX_ADDITIONAL_SEMESTERS" ? "MAX_ADDITIONAL_SEMESTERS_REACHED" : "ADDITIONAL_SEMESTER_RULE_UNCONFIGURED",
        severity: "CRITICAL",
        source: "PIPELINE",
        message:
          simulation.incompleteReason === "MAX_ADDITIONAL_SEMESTERS"
            ? "O limite de semestres adicionais foi atingido sem zerar as pendências."
            : "Ainda restam pendências após o último período e a regra de semestre adicional não está configurada.",
      });
    }
  } else {
    warnings.push({
      code: "ENTRY_PERIOD_REQUIRED",
      severity: "CRITICAL",
      source: "PIPELINE",
      message: "O período de ingresso não pôde ser determinado pelo PDF. Use um cenário manual apenas se precisar comparar projeções.",
    });
  }

  const claims: DocumentClaimInput[] = analysis.claims.map((c) => ({
    id: c.id,
    type: c.type as DocumentClaimInput["type"],
    value: c.value,
    sourcePage: c.sourcePage,
    rawText: c.rawText,
  }));
  const claimResult = compareDocumentClaims(claims, totals, { entryPeriod, previousBacklogCount });
  warnings.push(...claimResult.warnings);

  const violations = validateAnalysis({ extractedCount: subjects.length, subjects, totals, simulation });
  for (const v of violations) {
    warnings.push({ code: `INVARIANT_${v.code}`, severity: "CRITICAL", source: "VALIDATOR", message: v.message, subjectId: v.subjectId ?? null });
  }

  await prisma.$transaction(async (tx) => {
    // claims: valores calculados
    for (const c of claimResult.comparisons) {
      if (!c.claim.id) continue;
      await tx.documentClaim.update({ where: { id: c.claim.id }, data: { calculatedValue: c.calculatedValue, matches: c.matches } });
    }
    // warnings determinísticos são recriados a cada cálculo; os do auditor são preservados
    await tx.analysisWarning.deleteMany({
      where: { analysisId, source: { in: opts?.resetAuditorWarnings ? ["VALIDATOR", "PIPELINE", "AUDITOR"] : ["VALIDATOR", "PIPELINE"] } },
    });
    if (warnings.length) {
      await tx.analysisWarning.createMany({
        data: warnings.map((w) => ({
          analysisId,
          code: w.code,
          severity: w.severity,
          source: w.source,
          message: w.message,
          subjectId: w.subjectId ?? null,
          sourcePage: w.sourcePage ?? null,
          data: (w.data ?? undefined) as Prisma.InputJsonValue | undefined,
        })),
      });
    }
    // projeções
    await tx.semesterProjection.deleteMany({ where: { analysisId } });
    if (simulation) {
      for (const s of simulation.semesters) {
        await tx.semesterProjection.create({
          data: {
            analysisId,
            index: s.index,
            term: s.term,
            periodNumber: s.periodNumber,
            isAdditional: s.isAdditional,
            subjectsInPeriod: s.subjectsInPeriod,
            exemptedInPeriod: s.exemptedInPeriod,
            regularSubjectsToTake: s.regularSubjectsToTake,
            maximumCapacity: s.maximumCapacity,
            backlogCapacity: s.backlogCapacity,
            subjectsFromBacklog: s.subjectsFromBacklog,
            semesterLoad: s.semesterLoad,
            remainingBacklog: s.remainingBacklog,
            subjects: {
              create: [
                ...s.regularSubjectIds.map((id, i) => ({ subjectId: id, kind: "REGULAR" as const, order: i })),
                ...s.backlogSubjectIds.map((id, i) => ({ subjectId: id, kind: "BACKLOG" as const, order: i })),
              ],
            },
          },
        });
      }
    }
    await tx.curricularAnalysis.update({
      where: { id: analysisId },
      data: { projectionIncomplete: simulation?.incomplete ?? false, lastCalculatedAt: new Date() },
    });
  });

  return { subjects, totals, simulation, entryPeriod, warnings, violations, claims, previousBacklogCount };
}

/** Recalcula a confiabilidade e o status final a partir do estado persistido. */
/** 24h entre a entrega e a cobrança do retorno de matrícula. */
export const FOLLOW_UP_DELAY_MS = 24 * 60 * 60_000;

export async function finalizeStatus(analysisId: string): Promise<{ reliability: "HIGH" | "REVIEW_RECOMMENDED" | "REVIEW_REQUIRED"; reviewItemsCount: number; status: "COMPLETED" | "WAITING_REVIEW" }> {
  const analysis = await prisma.curricularAnalysis.findUniqueOrThrow({
    where: { id: analysisId },
    include: { warnings: { where: { resolvedAt: null } }, reviews: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const subjects = await loadSubjectRows(analysisId);
  const warnings: AnalysisWarningInput[] = analysis.warnings
    .filter((w) => w.source !== "AUDITOR")
    .map((w) => ({ code: w.code, severity: w.severity, source: w.source, message: w.message }));
  const auditorWarnings = analysis.warnings.filter((w) => w.source === "AUDITOR");
  const review = analysis.reviews[0] ?? null;

  const status = calculateAnalysisStatus({
    subjects,
    warnings: warnings.filter((w) => !w.code.startsWith("INVARIANT_") && w.code !== "ENTRY_PERIOD_REQUIRED" && !w.code.includes("ADDITIONAL_SEMESTER")),
    violations: warnings.filter((w) => w.code.startsWith("INVARIANT_")).map((w) => ({ code: "TOTALS_DO_NOT_ADD_UP" as const, message: w.message })),
    entryPeriodConfirmed: analysis.entryPeriod !== null,
    simulationIncomplete: analysis.projectionIncomplete,
    auditorStatus: review ? review.status : null,
    auditorCriticalIssues: auditorWarnings.filter((w) => w.severity === "CRITICAL").length,
    auditorMinorIssues: auditorWarnings.filter((w) => w.severity !== "CRITICAL").length,
  });
  // A auditoria da IA é a revisão padrão. Alertas continuam visíveis e rastreáveis,
  // mas não bloqueiam a entrega automática; apenas análises legadas sem ingresso ficam pendentes.
  const finalStatus = analysis.entryPeriod === null ? "WAITING_REVIEW" : "COMPLETED";
  await prisma.curricularAnalysis.update({
    where: { id: analysisId },
    data: {
      reliability: status.reliability,
      reviewItemsCount: status.reviewItemsCount,
      status: finalStatus,
      completedAt: finalStatus === "COMPLETED" ? new Date() : null,
      // Retorno de matrícula: o consultor é cobrado 24h após a primeira entrega.
      ...(finalStatus === "COMPLETED" && analysis.followUpDueAt === null ? { followUpDueAt: new Date(Date.now() + FOLLOW_UP_DELAY_MS) } : {}),
    },
  });
  return { ...status, status: finalStatus };
}

export type JsonValue = Prisma.InputJsonValue;
