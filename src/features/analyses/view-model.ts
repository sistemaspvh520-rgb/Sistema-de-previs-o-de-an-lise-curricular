import "server-only";
import type { AnalysisDetail } from "@/repositories/analysis-repository";
import { buildRulesFromRecords, type AcademicRules } from "@/domain/curricular-analysis/rules/types";
import { calculateCurriculumTotals, explainProjection, buildProjectionNarrative, type ProjectionExplanation, type ProjectionNarrative } from "@/domain/curricular-analysis";
import type { ProcessingStep } from "@/services/pipeline/steps";
import { parseSteps } from "@/services/pipeline/steps";
import type { AnalysisStatus, EntryPeriodSource, Readability, ReliabilityLevel, SubjectOrigin, SubjectStatus, WarningSeverity, WarningSource } from "@/generated/prisma/enums";

export interface SubjectVM {
  id: string;
  rowHash: string;
  code: string | null;
  name: string;
  workload: number;
  period: number;
  usedSubject: string | null;
  status: SubjectStatus;
  readability: Readability;
  sourcePage: number;
  sourceRow: number;
  bbox: { page: number; x: number; y: number; w: number; h: number; pageWidth: number; pageHeight: number } | null;
  origin: SubjectOrigin;
  note: string | null;
  sortIndex: number;
  /** Semestre em que foi programada (termo), se houver. */
  scheduledTerm: string | null;
  scheduledKind: "REGULAR" | "BACKLOG" | null;
  inRemainingBacklog: boolean;
}

export interface ProjectionVM {
  id: string;
  index: number;
  term: string;
  periodNumber: number | null;
  isAdditional: boolean;
  subjectsInPeriod: number;
  exemptedInPeriod: number;
  regularSubjectsToTake: number;
  maximumCapacity: number;
  backlogCapacity: number;
  subjectsFromBacklog: number;
  semesterLoad: number;
  remainingBacklog: number;
  regularSubjectIds: string[];
  backlogSubjectIds: string[];
  explanation: ProjectionExplanation;
}

export interface WarningVM {
  id: string;
  code: string;
  severity: WarningSeverity;
  source: WarningSource;
  message: string;
  subjectId: string | null;
  sourcePage: number | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface CorrectionVM {
  id: string;
  field: string;
  previousValue: string | null;
  newValue: string | null;
  reason: string | null;
  createdAt: string;
  user: string;
  subjectName: string | null;
}

export interface ClaimVM {
  id: string;
  type: string;
  value: number | null;
  sourcePage: number;
  rawText: string | null;
  calculatedValue: number | null;
  matches: boolean | null;
}

export interface AnalysisVM {
  id: string;
  status: AnalysisStatus;
  isProcessing: boolean;
  steps: ProcessingStep[];
  errorCode: string | null;
  errorMessage: string | null;
  courseName: string | null;
  matrixLabel: string | null;
  candidateLabel: string | null;
  entryPeriod: number | null;
  entryPeriodSource: EntryPeriodSource | null;
  entryTerm: string | null;
  startTerm: string;
  reliability: ReliabilityLevel | null;
  reviewItemsCount: number;
  projectionIncomplete: boolean;
  createdAt: string;
  completedAt: string | null;
  lastCalculatedAt: string | null;
  createdBy: { name: string; email: string };
  document: { originalName: string; pageCount: number | null; sizeBytes: number; sha256: string; deletedAt: string | null } | null;
  versions: {
    ruleSetVersion: string;
    engineVersion: string;
    extractorPromptVersion: string | null;
    auditorPromptVersion: string | null;
    extractionModel: string | null;
    auditModel: string | null;
  };
  rules: AcademicRules;
  totals: { total: number; exempted: number; pending: number; review: number; periods: number[] };
  previousBacklogCount: number | null;
  remainingBacklogCount: number;
  semestersRemaining: number | null;
  estimatedCompletionTerm: string | null;
  subjects: SubjectVM[];
  projections: ProjectionVM[];
  warnings: WarningVM[];
  corrections: CorrectionVM[];
  claims: ClaimVM[];
  review: { status: "OK" | "REVIEW"; model: string; promptVersion: string; issues: number; createdAt: string } | null;
  extraction: { model: string; promptVersion: string; privacyMode: string; durationMs: number; createdAt: string } | null;
  usage: { totalTokens: number; estimatedCost: number; calls: number };
  matrix: { label: string; course: string } | null;
  narrative: ProjectionNarrative | null;
}

const PROCESSING_STATUSES: AnalysisStatus[] = ["UPLOADED", "PARSING", "AI_EXTRACTION", "NORMALIZING", "CALCULATING", "VALIDATING", "AI_AUDIT"];

export function buildAnalysisViewModel(a: AnalysisDetail): AnalysisVM {
  const rules = buildRulesFromRecords(a.ruleSetVersion.rules);
  const scheduled = new Map<string, { term: string; kind: "REGULAR" | "BACKLOG" }>();
  for (const p of a.projections) for (const ps of p.subjects) scheduled.set(ps.subjectId, { term: p.term, kind: ps.kind });

  const subjectsRows = a.subjects.map((s) => ({
    id: s.id,
    name: s.name,
    workload: s.workload,
    period: s.period,
    usedSubject: s.usedSubject,
    status: s.status,
    readability: s.readability,
    sourcePage: s.sourcePage,
    sourceRow: s.sourceRow,
    sortIndex: s.sortIndex,
  }));
  const totals = calculateCurriculumTotals(subjectsRows);

  const entryPeriod = a.entryPeriod;
  const needsTaking = (s: (typeof a.subjects)[number]) => s.status === "PENDING" || (s.status === "REVIEW" && rules.reviewCountsAsPending);
  const previousBacklogCount = entryPeriod === null ? null : a.subjects.filter((s) => s.period < entryPeriod && needsTaking(s)).length;
  const remainingIds = new Set(
    entryPeriod === null ? [] : a.subjects.filter((s) => s.period < entryPeriod && needsTaking(s) && !scheduled.has(s.id)).map((s) => s.id),
  );

  const last = a.projections[a.projections.length - 1];
  const projectionRows = a.projections.map((p) => ({
    index: p.index,
    term: p.term,
    periodNumber: p.periodNumber,
    isAdditional: p.isAdditional,
    subjectsInPeriod: p.subjectsInPeriod,
    exemptedInPeriod: p.exemptedInPeriod,
    regularSubjectsToTake: p.regularSubjectsToTake,
    maximumCapacity: p.maximumCapacity,
    backlogCapacity: p.backlogCapacity,
    subjectsFromBacklog: p.subjectsFromBacklog,
    semesterLoad: p.semesterLoad,
    remainingBacklog: p.remainingBacklog,
    regularSubjectIds: p.subjects.filter((x) => x.kind === "REGULAR").map((x) => x.subjectId),
    backlogSubjectIds: p.subjects.filter((x) => x.kind === "BACKLOG").map((x) => x.subjectId),
  }));
  const backlogSubjects = entryPeriod === null ? [] : a.subjects.filter((s) => s.period < entryPeriod && needsTaking(s));
  const narrative =
    entryPeriod === null
      ? null
      : buildProjectionNarrative({
          semesters: projectionRows,
          entryPeriod,
          backlogTotal: backlogSubjects.length,
          backlogPeriodRange: backlogSubjects.length
            ? { from: Math.min(...backlogSubjects.map((s) => s.period)), to: Math.max(...backlogSubjects.map((s) => s.period)) }
            : null,
          maximumCapacity: Math.max(0, ...projectionRows.map((p) => p.maximumCapacity)),
          incomplete: a.projectionIncomplete,
          remainingBacklog: remainingIds.size,
        });
  const usageTotals = a.usages.reduce(
    (acc, u) => ({ totalTokens: acc.totalTokens + u.totalTokens, estimatedCost: acc.estimatedCost + Number(u.estimatedCost), calls: acc.calls + 1 }),
    { totalTokens: 0, estimatedCost: 0, calls: 0 },
  );

  return {
    id: a.id,
    status: a.status,
    isProcessing: PROCESSING_STATUSES.includes(a.status),
    steps: parseSteps(a.processingSteps),
    errorCode: a.errorCode,
    errorMessage: a.errorMessage,
    courseName: a.courseName,
    matrixLabel: a.matrixLabel,
    candidateLabel: a.candidateLabel,
    entryPeriod,
    entryPeriodSource: a.entryPeriodSource,
    entryTerm: a.entryTerm,
    startTerm: a.startTerm,
    reliability: a.reliability,
    reviewItemsCount: a.reviewItemsCount,
    projectionIncomplete: a.projectionIncomplete,
    createdAt: a.createdAt.toISOString(),
    completedAt: a.completedAt?.toISOString() ?? null,
    lastCalculatedAt: a.lastCalculatedAt?.toISOString() ?? null,
    createdBy: { name: a.createdBy.name, email: a.createdBy.email },
    document: a.document
      ? { originalName: a.document.originalName, pageCount: a.document.pageCount, sizeBytes: a.document.sizeBytes, sha256: a.document.sha256, deletedAt: a.document.deletedAt?.toISOString() ?? null }
      : null,
    versions: {
      ruleSetVersion: a.ruleSetVersion.version,
      engineVersion: a.engineVersion,
      extractorPromptVersion: a.extractorPromptVersion,
      auditorPromptVersion: a.auditorPromptVersion,
      extractionModel: a.extractionModel,
      auditModel: a.auditModel,
    },
    rules,
    totals: { total: totals.total, exempted: totals.exempted, pending: totals.pending, review: totals.review, periods: totals.periods },
    previousBacklogCount,
    remainingBacklogCount: remainingIds.size,
    semestersRemaining: entryPeriod === null ? null : a.projections.length,
    estimatedCompletionTerm: entryPeriod !== null && !a.projectionIncomplete && last ? last.term : null,
    subjects: a.subjects.map((s) => ({
      id: s.id,
      rowHash: s.rowHash,
      code: s.code,
      name: s.name,
      workload: s.workload,
      period: s.period,
      usedSubject: s.usedSubject,
      status: s.status,
      readability: s.readability,
      sourcePage: s.sourcePage,
      sourceRow: s.sourceRow,
      bbox: (s.bbox as SubjectVM["bbox"]) ?? null,
      origin: s.origin,
      note: s.note,
      sortIndex: s.sortIndex,
      scheduledTerm: scheduled.get(s.id)?.term ?? null,
      scheduledKind: scheduled.get(s.id)?.kind ?? null,
      inRemainingBacklog: remainingIds.has(s.id),
    })),
    projections: a.projections.map((p, i) => ({ id: p.id, ...projectionRows[i], explanation: explainProjection(projectionRows[i], rules) })),
    warnings: a.warnings.map((w) => ({
      id: w.id,
      code: w.code,
      severity: w.severity,
      source: w.source,
      message: w.message,
      subjectId: w.subjectId,
      sourcePage: w.sourcePage,
      resolvedAt: w.resolvedAt?.toISOString() ?? null,
      resolvedBy: w.resolvedBy?.name ?? null,
    })),
    corrections: a.corrections.map((c) => ({
      id: c.id,
      field: c.field,
      previousValue: c.previousValue,
      newValue: c.newValue,
      reason: c.reason,
      createdAt: c.createdAt.toISOString(),
      user: c.user.name,
      subjectName: c.subject?.name ?? null,
    })),
    claims: a.claims.map((c) => ({ id: c.id, type: c.type, value: c.value, sourcePage: c.sourcePage, rawText: c.rawText, calculatedValue: c.calculatedValue, matches: c.matches })),
    review: a.reviews[0]
      ? { status: a.reviews[0].status, model: a.reviews[0].model, promptVersion: a.reviews[0].promptVersion, issues: Array.isArray(a.reviews[0].issues) ? (a.reviews[0].issues as unknown[]).length : 0, createdAt: a.reviews[0].createdAt.toISOString() }
      : null,
    extraction: a.extractions[0]
      ? { model: a.extractions[0].model, promptVersion: a.extractions[0].promptVersion, privacyMode: a.extractions[0].privacyMode, durationMs: a.extractions[0].durationMs, createdAt: a.extractions[0].createdAt.toISOString() }
      : null,
    usage: usageTotals,
    matrix: a.curriculumMatrix ? { label: a.curriculumMatrix.label, course: a.curriculumMatrix.course.name } : null,
    narrative,
  };
}
