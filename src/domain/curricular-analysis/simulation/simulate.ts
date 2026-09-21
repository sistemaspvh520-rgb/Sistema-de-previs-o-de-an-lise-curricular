import type { AcademicRules } from "@/domain/curricular-analysis/rules/types";
import type { SemesterSimulation, SimulationResult, SubjectRow } from "@/domain/curricular-analysis/types";
import { calculateBacklogCapacity, calculateMaximumCapacity } from "@/domain/curricular-analysis/engine/capacity";
import { allocateBacklogSubjects, calculatePreviousBacklog, needsToBeTaken } from "@/domain/curricular-analysis/engine/backlog";
import { groupSubjectsByPeriod } from "@/domain/curricular-analysis/engine/totals";
import { formatTerm, nextTerm, parseTerm } from "@/domain/curricular-analysis/simulation/terms";

export interface SemesterContext {
  index: number;
  term: string;
  periodNumber: number | null;
  isAdditional: boolean;
  /** Disciplinas do período regular (todas, inclusive dispensadas). Vazio em semestre adicional. */
  periodSubjects: SubjectRow[];
  /** Backlog disponível ao iniciar o semestre, já ordenado. */
  availableBacklog: SubjectRow[];
  /** Capacidade máxima explícita (usada em semestres adicionais). */
  maximumCapacityOverride?: number;
  rules: AcademicRules;
}

/**
 * simulateSemester — executa os 12 passos do §18 para um único semestre.
 */
export function simulateSemester(ctx: SemesterContext): { semester: SemesterSimulation; remainingBacklog: SubjectRow[] } {
  const subjectsInPeriod = ctx.periodSubjects.length;
  const exemptedInPeriod = ctx.periodSubjects.filter((s) => s.status === "EXEMPTED").length;
  const regularSubjects = ctx.periodSubjects
    .filter((s) => needsToBeTaken(s, ctx.rules))
    .sort((a, b) => a.sortIndex - b.sortIndex);
  const regularSubjectsToTake = regularSubjects.length;

  const maximumCapacity =
    ctx.maximumCapacityOverride !== undefined
      ? Math.max(0, ctx.maximumCapacityOverride)
      : calculateMaximumCapacity(subjectsInPeriod, ctx.rules);
  const backlogCapacity = calculateBacklogCapacity(maximumCapacity, regularSubjectsToTake);

  const { allocated, remaining } = allocateBacklogSubjects(ctx.availableBacklog, backlogCapacity);
  const subjectsFromBacklog = allocated.length;
  const semesterLoad = regularSubjectsToTake + subjectsFromBacklog;

  if (semesterLoad > maximumCapacity) {
    // Só pode ocorrer se regularSubjectsToTake > maximumCapacity (extraSubjectsAllowed negativo) — proteção.
    throw new Error(`Carga do semestre (${semesterLoad}) excede a capacidade máxima (${maximumCapacity}).`);
  }

  return {
    semester: {
      index: ctx.index,
      term: ctx.term,
      periodNumber: ctx.periodNumber,
      isAdditional: ctx.isAdditional,
      subjectsInPeriod,
      exemptedInPeriod,
      regularSubjectsToTake,
      maximumCapacity,
      backlogCapacity,
      subjectsFromBacklog,
      semesterLoad,
      remainingBacklog: remaining.length,
      regularSubjectIds: regularSubjects.map((s) => s.id),
      backlogSubjectIds: allocated.map((s) => s.id),
    },
    remainingBacklog: remaining,
  };
}

export interface SimulateCurriculumInput {
  subjects: SubjectRow[];
  entryPeriod: number;
  startTerm: string;
  rules: AcademicRules;
}

/**
 * simulateCurriculum — percorre do período de ingresso até o último período oficial,
 * depois cria semestres adicionais conforme a regra configurada (§19).
 */
export function simulateCurriculum(input: SimulateCurriculumInput): SimulationResult {
  const { subjects, entryPeriod, rules } = input;
  const grouped = groupSubjectsByPeriod(subjects);
  const periods = [...grouped.keys()];
  const lastPeriod = periods.length ? Math.max(...periods) : entryPeriod - 1;

  const initialBacklog = calculatePreviousBacklog(subjects, entryPeriod, rules);
  let backlog = initialBacklog;
  const semesters: SemesterSimulation[] = [];
  const unit = rules.periodUnit === "YEAR" ? "YEAR" : "SEMESTER";
  let term = parseTerm(input.startTerm);
  let index = 0;
  let lastRegularCapacity: number | null = null;

  // Períodos regulares
  for (let p = entryPeriod; p <= lastPeriod; p++) {
    const { semester, remainingBacklog } = simulateSemester({
      index,
      term: formatTerm(term, unit),
      periodNumber: p,
      isAdditional: false,
      periodSubjects: grouped.get(p) ?? [],
      availableBacklog: backlog,
      rules,
    });
    semesters.push(semester);
    backlog = remainingBacklog;
    lastRegularCapacity = semester.maximumCapacity;
    term = nextTerm(term, unit);
    index++;
  }

  // Semestres adicionais
  let incomplete = false;
  let incompleteReason: SimulationResult["incompleteReason"] = null;
  let additionalCount = 0;
  while (backlog.length > 0) {
    const rule = rules.additionalSemesterCapacityRule;
    if (rule.type === "UNCONFIGURED") {
      incomplete = true;
      incompleteReason = "ADDITIONAL_SEMESTER_RULE_UNCONFIGURED";
      break;
    }
    if (additionalCount >= rules.maxAdditionalSemesters) {
      incomplete = true;
      incompleteReason = "MAX_ADDITIONAL_SEMESTERS";
      break;
    }
    let capacity: number;
    if (rule.type === "SAME_AS_LAST_PERIOD") {
      capacity = lastRegularCapacity ?? calculateMaximumCapacity(grouped.get(lastPeriod)?.length ?? 0, rules);
    } else if (rule.type === "FIXED_VALUE") {
      capacity = rule.value;
    } else {
      capacity = rule.regular + rule.extra;
    }
    if (capacity <= 0) {
      incomplete = true;
      incompleteReason = "ADDITIONAL_SEMESTER_RULE_UNCONFIGURED";
      break;
    }
    additionalCount++;
    const { semester, remainingBacklog } = simulateSemester({
      index,
      term: formatTerm(term, unit),
      periodNumber: null,
      isAdditional: true,
      periodSubjects: [],
      availableBacklog: backlog,
      maximumCapacityOverride: capacity,
      rules,
    });
    semesters.push(semester);
    backlog = remainingBacklog;
    term = nextTerm(term, unit);
    index++;
  }

  const lastSemester = semesters[semesters.length - 1];
  return {
    semesters,
    initialBacklogIds: initialBacklog.map((s) => s.id),
    remainingBacklogIds: backlog.map((s) => s.id),
    incomplete,
    incompleteReason,
    estimatedCompletionTerm: !incomplete && lastSemester ? lastSemester.term : null,
    semestersRemaining: semesters.length,
  };
}

export interface ProjectionExplanation {
  term: string;
  periodLabel: string;
  lines: Array<{ label: string; value: string | number; note?: string }>;
  summary: string;
}

/** explainProjection — texto estruturado para "COMO CHEGAMOS NESTA PREVISÃO?" (§53). */
export function explainProjection(s: SemesterSimulation, rules: AcademicRules): ProjectionExplanation {
  const periodLabel = s.isAdditional ? `Semestre adicional` : `${s.periodNumber}º período`;
  if (s.isAdditional) {
    return {
      term: s.term,
      periodLabel,
      lines: [
        { label: "Capacidade (regra de semestre adicional)", value: s.maximumCapacity },
        { label: "Adaptações alocadas", value: s.subjectsFromBacklog },
        { label: "Pendências restantes", value: s.remainingBacklog },
      ],
      summary: `${s.subjectsFromBacklog} adaptações = ${s.semesterLoad} disciplinas (capacidade ${s.maximumCapacity}).`,
    };
  }
  return {
    term: s.term,
    periodLabel,
    lines: [
      { label: "O período possui", value: `${s.subjectsInPeriod} disciplinas` },
      { label: "Dispensadas", value: s.exemptedInPeriod },
      { label: "A cursar (regulares)", value: s.regularSubjectsToTake, note: `${s.subjectsInPeriod} − ${s.exemptedInPeriod}` },
      { label: "Regra adicional", value: `até +${rules.extraSubjectsAllowed}` },
      { label: "Capacidade máxima", value: s.maximumCapacity, note: rules.maximumSubjectsPerSemester === null ? `${s.subjectsInPeriod} + ${rules.extraSubjectsAllowed}` : `menor entre ${s.subjectsInPeriod} + ${rules.extraSubjectsAllowed} e teto ${rules.maximumSubjectsPerSemester}` },
      {
        label: "Vagas para adaptação",
        value: s.backlogCapacity,
        note: `${rules.extraSubjectsAllowed} extras + ${s.exemptedInPeriod} liberadas pelas dispensas`,
      },
      { label: "Adaptações alocadas", value: s.subjectsFromBacklog, note: `min(backlog disponível, ${s.backlogCapacity})` },
      { label: "Pendências restantes", value: s.remainingBacklog },
    ],
    summary: `${s.regularSubjectsToTake} regulares + ${s.subjectsFromBacklog} adaptações = ${s.semesterLoad} disciplinas (capacidade ${s.maximumCapacity}).`,
  };
}
