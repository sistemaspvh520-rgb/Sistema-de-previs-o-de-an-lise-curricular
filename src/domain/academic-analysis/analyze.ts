import { ACADEMIC_RULES, academicStatusOutcome } from "@/domain/academic-analysis/rules";
import type { AcademicDiscipline, AcademicGridResult, AcademicReviewStatus } from "@/domain/academic-analysis/types";
import type { GraduationForecast } from "@/domain/academic-analysis/graduation-forecast";

export function normalizeAcademicStatus(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[\u00a0\t\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.replace(/^AE\s*\*$/, "AE*");
}

export function parseAcademicPeriod(raw: string): number | null {
  const value = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const match = value.match(/(?:^|\D)(\d{1,2})(?:\s*[ºª°]?\s*(?:PERIODO|PERIOD|SERIE|ETAPA|MODULO)?\b|\s*\/\s*[A-Z])?/i);
  if (!match) return null;
  const period = Number(match[1]);
  return Number.isInteger(period) && period >= 1 && period <= 20 ? period : null;
}

export function academicDisciplineNeedsReview(discipline: AcademicDiscipline): boolean {
  return discipline.inMainCurriculum && (
    !discipline.name.trim() ||
    discipline.name.startsWith("COMPONENTE NÃO IDENTIFICADO") ||
    discipline.period === null ||
    academicStatusOutcome(discipline.normalizedStatus) === "UNKNOWN"
  );
}

export function academicGridHasUnresolvedRowCount(
  disciplines: AcademicDiscipline[],
  sourceDisciplineCount?: number,
  sourceParsedDisciplineCount?: number,
): boolean {
  if (sourceDisciplineCount === undefined) return false;
  if (sourceParsedDisciplineCount === undefined) return disciplines.length !== sourceDisciplineCount;
  if (sourceParsedDisciplineCount > sourceDisciplineCount) return true;
  const missingFromExtraction = sourceDisciplineCount - sourceParsedDisciplineCount;
  const tutorAddedRows = disciplines.filter((discipline) => discipline.sourcePage === 0).length;
  return tutorAddedRows < missingFromExtraction;
}

export function analyzeAcademicGrid(input: {
  disciplines: AcademicDiscipline[];
  currentPeriod: number | null;
  currentPeriodConfirmed?: boolean;
}): AcademicGridResult {
  const currentPeriodConfirmed = input.currentPeriodConfirmed ?? input.currentPeriod !== null;
  const period = input.currentPeriod;
  const inGrid = input.disciplines.filter((discipline) => discipline.inMainCurriculum);
  const forCurrentPeriod = period === null ? [] : inGrid.filter((discipline) => discipline.period === period);
  const previous = period === null ? [] : inGrid.filter((discipline) => discipline.period !== null && discipline.period < period);
  const pendingDisciplines = previous.filter((discipline) => discipline.normalizedStatus === "A CURSAR");
  const previousCoursesInProgress = previous.filter((discipline) => discipline.normalizedStatus === "CURSANDO");
  const currentPeriodAE = forCurrentPeriod.filter((discipline) => discipline.normalizedStatus === "AE" || discipline.normalizedStatus === "AE*").length;
  const previousPending = pendingDisciplines.length;
  const previousAlreadyAdded = previousCoursesInProgress.length;
  const currentPeriodComponents = forCurrentPeriod.length;
  const baseExtraAllowance = ACADEMIC_RULES.BASE_EXTRA_ALLOWANCE;
  const extraAllowance = baseExtraAllowance + currentPeriodAE * ACADEMIC_RULES.EXTRA_PER_CURRENT_PERIOD_AE;
  const semesterMaximum = currentPeriodComponents + extraAllowance;
  const usedExtraSlots = previousAlreadyAdded;
  const remainingExtraSlots = Math.max(0, extraAllowance - usedExtraSlots);
  const canAddNow = Math.min(previousPending, remainingExtraSlots);
  const pendingByPeriod: Record<string, number> = {};
  for (const discipline of pendingDisciplines) {
    const key = String(discipline.period);
    pendingByPeriod[key] = (pendingByPeriod[key] ?? 0) + 1;
  }
  const warnings: string[] = [];
  const incompleteRows = inGrid.filter(academicDisciplineNeedsReview);
  if (incompleteRows.length) {
    warnings.push(`${incompleteRows.length} componente(s) da grade principal têm nome, período ou situação sem confirmação.`);
  }
  let status: AcademicReviewStatus;
  if (period === null || !currentPeriodConfirmed || currentPeriodComponents === 0) {
    status = "MANUAL_REVIEW_REQUIRED";
    if (period === null || !currentPeriodConfirmed) warnings.push("Confirme o período atual do aluno para continuar.");
    if (currentPeriodComponents === 0) warnings.push("Nenhum componente da grade foi identificado no período atual. Revise a classificação da grade principal.");
  } else if (incompleteRows.length > 0) {
    status = "MANUAL_REVIEW_REQUIRED";
  } else if (usedExtraSlots > extraAllowance) {
    status = "MANUAL_REVIEW_REQUIRED";
    warnings.push("REVISÃO NECESSÁRIA: foram identificadas mais disciplinas anteriores CURSANDO do que vagas adicionais calculadas.");
  } else if (previousPending === 0) {
    status = "NO_PENDING";
  } else if (remainingExtraSlots === 0) {
    status = "LIMIT_REACHED";
  } else if (remainingExtraSlots === 1) {
    status = "NEAR_LIMIT";
  } else {
    status = "CAN_ADD";
  }
  return {
    currentPeriod: period,
    currentPeriodConfirmed,
    currentPeriodComponents,
    previousPending,
    previousAlreadyAdded,
    currentPeriodAE,
    baseExtraAllowance,
    extraAllowance,
    semesterMaximum,
    usedExtraSlots,
    remainingExtraSlots,
    canAddNow,
    pendingAfterPossibleInclusion: previousPending - canAddNow,
    status,
    pendingByPeriod,
    pendingDisciplines,
    previousCoursesInProgress,
    suggestedCourses: [...pendingDisciplines].sort((a, b) => (a.period ?? 99) - (b.period ?? 99) || a.name.localeCompare(b.name, "pt-BR")),
    warnings,
  };
}

export function buildStudentMessage(input: {
  studentName: string | null;
  result: AcademicGridResult;
  courseName?: string | null;
  forecast?: GraduationForecast | null;
  tutorExpectedCompletionTerm?: string | null;
  forecastReviewPending?: boolean;
}): string {
  const { result } = input;
  const greeting = input.studentName ? `Olá, ${input.studentName}!` : "Olá!";
  const course = input.courseName ? ` no curso de ${input.courseName}` : "";
  const pendingCount = input.forecast?.knownBacklog ?? result.previousPending;
  const pending = `${pendingCount} disciplina${pendingCount === 1 ? "" : "s"} de períodos anteriores ainda consta${pendingCount === 1 ? "" : "m"} como pendente${pendingCount === 1 ? "" : "s"}`;
  const yearsEstimate = input.forecast
    ? input.forecast.yearsMin === input.forecast.yearsMax
      ? `${input.forecast.yearsMin.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${input.forecast.yearsMin === 1 ? "ano" : "anos"}`
      : `de ${input.forecast.yearsMin.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} a ${input.forecast.yearsMax.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} anos`
    : null;
  const completionTerms = input.tutorExpectedCompletionTerm
    ? `no período ${input.tutorExpectedCompletionTerm}`
    : input.forecastReviewPending
    ? null
    : input.forecast?.completionTermMin && input.forecast.completionTermMax
    ? input.forecast.completionTermMin === input.forecast.completionTermMax
      ? `no período ${input.forecast.completionTermMin}`
      : `entre os períodos ${input.forecast.completionTermMin} e ${input.forecast.completionTermMax}`
    : null;
  const completionDates = input.forecast?.completionDateMin && input.forecast.completionDateMax
    ? `${formatMonthYear(input.forecast.completionDateMin)}${input.forecast.completionDateMin === input.forecast.completionDateMax ? "" : ` a ${formatMonthYear(input.forecast.completionDateMax)}`}`
    : null;
  const lines = [
    `${greeting} Como você já está cursando${course}, conferimos seu extrato curricular. Segue o documento em anexo para você acompanhar as informações.`,
    "",
    result.currentPeriod === null
      ? "Precisamos confirmar seu período atual antes de concluir a conferência."
      : `Você está no ${result.currentPeriod}º período. No extrato, ${pending}.`,
    result.previousAlreadyAdded > 0
      ? `${result.previousAlreadyAdded} disciplina${result.previousAlreadyAdded === 1 ? " anterior já aparece" : "s anteriores já aparecem"} como em andamento.`
      : null,
    input.tutorExpectedCompletionTerm
      ? `Conforme o plano conferido pela tutoria, a previsão é concluir ${completionTerms}. Esse cenário pressupõe aprovação nas disciplinas e rematrícula dentro do prazo.`
      : input.forecastReviewPending
      ? "A previsão de conclusão está em conferência pela tutoria. Compartilharemos o período após validar os componentes e as regras acadêmicas."
      : input.forecast
      ? input.forecast.incomplete
        ? `Montamos um plano preliminar por semestre, mas ainda não é possível informar uma data de conclusão. A equipe precisa confirmar os pontos pendentes da análise antes de estimar o prazo.`
        : completionTerms
        ? `Considerando o andamento atual da grade, a previsão preliminar de conclusão é ${completionTerms}${completionDates ? ` (${completionDates})` : ""}. O calendário dessa faixa está ${input.forecast.calendarConfidence === "OFFICIAL" ? "oficialmente confirmado" : "projetado e ainda precisa ser confirmado"}.`
        : `Considerando o andamento atual da grade, a previsão preliminar de conclusão é de ${input.forecast.semestersMin === input.forecast.semestersMax ? `${input.forecast.semestersMin} semestre${input.forecast.semestersMin === 1 ? "" : "s"}` : `${input.forecast.semestersMin} a ${input.forecast.semestersMax} semestres`} após o período atual (aproximadamente ${yearsEstimate}).`
      : null,
    "Essa é uma estimativa para orientação. A conclusão depende da oferta das disciplinas, dos pré-requisitos e da validação acadêmica; por isso, o prazo pode mudar.",
    "Se quiser, posso esclarecer qualquer informação do extrato com você.",
  ].filter((line): line is string => line !== null);
  return lines.join("\n");
}

function formatMonthYear(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}
