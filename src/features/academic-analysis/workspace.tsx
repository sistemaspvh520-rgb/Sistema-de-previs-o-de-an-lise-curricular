"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { academicDisciplineNeedsReview, academicGridHasUnresolvedRowCount, analyzeAcademicGrid, buildStudentMessage, normalizeAcademicStatus } from "@/domain/academic-analysis/analyze";
import { estimateGraduation, formatGraduationForecast, isBlockingForecastExtractionWarning } from "@/domain/academic-analysis/graduation-forecast";
import { ACADEMIC_RULES } from "@/domain/academic-analysis/rules";
import type { AcademicDiscipline, AcademicGridSnapshot } from "@/domain/academic-analysis/types";
import type { AcademicCalendarTerm } from "@/domain/academic-calendar/calendar";
import type { AcademicRules } from "@/domain/curricular-analysis/rules/types";
import { updateAcademicGridFieldAction, addAcademicDisciplineAction, confirmAcademicGridProceedAction } from "@/features/academic-analysis/actions";
import { DeleteAcademicGridReviewButton } from "@/features/academic-analysis/delete-review-button";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ReviewRecord = {
  id: string;
  studentName: string | null;
  rgm: string | null;
  courseName: string | null;
  currentPeriod: number | null;
  currentPeriodRaw: string | null;
  currentPeriodConfirmed: boolean;
  sourceFilename: string;
  sourcePageCount: number;
  sourceSha256: string;
  createdAt: string;
  analysisDate: string;
  createdByName: string;
  snapshot: AcademicGridSnapshot;
  proceedConfirmed: boolean;
  previous: { id: string; previousPending: number } | null;
  corrections: Array<{ id: string; field: string; disciplineIndex: number | null; previousValue: unknown; newValue: unknown; reason: string | null; createdAt: string; user: { name: string } }>;
};

const STATUS: Record<string, { label: string; tone: string }> = {
  NO_PENDING: { label: "Sem pendências anteriores", tone: "border-slate-300 bg-slate-100 text-slate-700" },
  CAN_ADD: { label: "Há vagas disponíveis", tone: "border-status-success/30 bg-status-success-bg text-status-success" },
  NEAR_LIMIT: { label: "Resta 1 vaga", tone: "border-status-warning/35 bg-status-warning-bg text-status-warning" },
  LIMIT_REACHED: { label: "Limite atingido", tone: "border-status-danger/30 bg-status-danger-bg text-status-danger" },
  MANUAL_REVIEW_REQUIRED: { label: "Revisão manual necessária", tone: "border-orange-300 bg-orange-50 text-orange-800" },
};

export function AcademicGridWorkspace({ review, calendarTerms, rules, rulesVersion, isAdmin }: { review: ReviewRecord; calendarTerms: AcademicCalendarTerm[]; rules: AcademicRules; rulesVersion: string; isAdmin: boolean }) {
  const [snapshot, setSnapshot] = useState(review.snapshot);
  const [periodText, setPeriodText] = useState(review.currentPeriod?.toString() ?? "");
  const [currentPeriodValue, setCurrentPeriodValue] = useState<number | null>(review.currentPeriod);
  const [working, start] = useTransition();
  const [savingField, setSavingField] = useState(false);
  const savingFieldRef = useRef(false);
  const [filter, setFilter] = useState("");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [sortBy, setSortBy] = useState("period-asc");
  const [selected, setSelected] = useState<string[]>([]);
  const [scenarioAE, setScenarioAE] = useState(snapshot.result.currentPeriodAE);
  const [messageOverride, setMessageOverride] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState(false);
  const [aiReviewBusy, setAiReviewBusy] = useState(false);
  const [aiReviews, setAiReviews] = useState<Array<{ rowRef: string; reasonToReview: string; tutorCheck: string }> | null>(null);
  const [proceedConfirmed, setProceedConfirmed] = useState(review.proceedConfirmed);
  const [proceedSelected, setProceedSelected] = useState(false);
  const [confirmingProceed, setConfirmingProceed] = useState(false);
  const result = snapshot.result;
  const actionableExtractionWarnings = proceedConfirmed ? [] : snapshot.extractionWarnings.filter(isBlockingForecastExtractionWarning);
  const reviewNeeded = !proceedConfirmed || result.status === "MANUAL_REVIEW_REQUIRED" || actionableExtractionWarnings.length > 0;
  const reviewWarnings = [...new Set([...actionableExtractionWarnings, ...result.warnings])];
  const byPeriod = Object.keys(result.pendingByPeriod).sort((a, b) => Number(a) - Number(b));
  const analysisDate = review.analysisDate;
  const graduationForecast = estimateGraduation({ disciplines: snapshot.disciplines, currentPeriod: result.currentPeriod, analysisDate, calendarTerms, rules, extractionWarnings: proceedConfirmed ? [] : snapshot.extractionWarnings });
  const formattedForecast = graduationForecast ? formatGraduationForecast(graduationForecast) : null;
  const forecastReadyToShare = Boolean(graduationForecast && !reviewNeeded && !graduationForecast.incomplete && graduationForecast.completionTermMin);
  const forecastFootnote = graduationForecast && formattedForecast
    ? `Cenário calculado conforme regras v${snapshot.projectionRulesVersion ?? rulesVersion}: ${formattedForecast.completion || `${formattedForecast.semesters} a partir do próximo período`} (${formattedForecast.years}; ${formattedForecast.calendarLabel}). ${reviewNeeded ? "Aguardando conferência do tutor. " : ""}Pressupõe aprovação nas disciplinas em andamento e depende de oferta e pré-requisitos.${graduationForecast.incomplete ? ` Ressalvas: ${graduationForecast.reasons.join(" ")}` : ""}`
    : null;
  const suggestedMessage = buildStudentMessage({ studentName: snapshot.studentName, courseName: snapshot.courseName, result, forecast: graduationForecast, forecastReviewPending: !forecastReadyToShare });
  const message = messageOverride ?? suggestedMessage;
  const ambiguousRows = snapshot.disciplines.flatMap((item) =>
    item.period === null || !item.normalizedStatus
      ? [{ rowRef: `${item.sourcePage}-${item.sourceRow}`, code: item.code, name: item.name, rawPeriod: item.rawPeriod, period: item.period, status: item.originalStatus }]
      : [],
  ).slice(0, 12);
  const incompleteMainCurriculumRows = snapshot.disciplines.filter((item) =>
    academicDisciplineNeedsReview(item),
  ).length;
  const currentPeriodConfirmed = result.currentPeriod !== null && result.currentPeriodConfirmed;
  const currentPeriodGridRows = snapshot.disciplines.filter((item) => item.inMainCurriculum && item.period === currentPeriodValue).length;
  const rowCountMismatch = academicGridHasUnresolvedRowCount(snapshot.disciplines, snapshot.sourceDisciplineCount, snapshot.sourceParsedDisciplineCount);
  const proceedBlocked = !currentPeriodConfirmed || currentPeriodGridRows === 0 || incompleteMainCurriculumRows > 0 || rowCountMismatch || result.status === "MANUAL_REVIEW_REQUIRED";

  async function requestAiReview() {
    if (!ambiguousRows.length) { toast.info("Não há linhas ambíguas identificadas para priorizar."); return; }
    setAiReviewBusy(true);
    try {
      const response = await fetch("/api/academic-analysis/ai-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: ambiguousRows, warnings: snapshot.extractionWarnings.slice(0, 12) }),
      });
      const data = await response.json() as { error?: string; reviews?: Array<{ rowRef: string; reasonToReview: string; tutorCheck: string }> };
      if (!response.ok || !data.reviews) { toast.error(data.error ?? "Não foi possível priorizar a revisão."); return; }
      setAiReviews(data.reviews);
      toast.success("Revisão assistida concluída. Confira cada linha no PDF original.");
    } catch {
      toast.error("Falha ao conectar à IA. A revisão manual continua disponível.");
    } finally {
      setAiReviewBusy(false);
    }
  }

  async function confirmProceed() {
    if (!proceedSelected || confirmingProceed || proceedBlocked) return;
    setConfirmingProceed(true);
    try {
      const response = await confirmAcademicGridProceedAction(review.id);
      if (!response.ok) { toast.error(response.error); return; }
      setProceedConfirmed(true);
      setProceedSelected(false);
      toast.success(response.message);
    } catch {
      toast.error("Não foi possível salvar a confirmação. Tente novamente.");
    } finally {
      setConfirmingProceed(false);
    }
  }

  const filteredPending = useMemo(() => {
    const q = filter.trim().toLocaleLowerCase("pt-BR");
    const rows = result.pendingDisciplines.filter((item) =>
      (periodFilter === "all" || String(item.period) === periodFilter) &&
      (!q || item.name.toLocaleLowerCase("pt-BR").includes(q) || (item.code ?? "").toLocaleLowerCase("pt-BR").includes(q)),
    );
    return rows.sort((a, b) => {
      if (sortBy === "period-desc") return (b.period ?? 0) - (a.period ?? 0) || a.name.localeCompare(b.name, "pt-BR");
      if (sortBy === "name") return a.name.localeCompare(b.name, "pt-BR");
      if (sortBy === "workload") return (b.workload ?? -1) - (a.workload ?? -1);
      return (a.period ?? 99) - (b.period ?? 99) || a.name.localeCompare(b.name, "pt-BR");
    });
  }, [filter, periodFilter, result.pendingDisciplines, sortBy]);

  async function saveField(field: string, value: string | number | boolean | null, disciplineIndex?: number) {
    if (savingFieldRef.current) {
      toast.info("Aguarde a gravação atual antes de editar outro campo.");
      return false;
    }
    savingFieldRef.current = true;
    setSavingField(true);
    try {
      const res = await updateAcademicGridFieldAction({ reviewId: review.id, disciplineIndex, field, value });
      if (!res.ok) { toast.error(res.error); return false; }
      setMessageOverride(null);
      if (disciplineIndex !== undefined || field === "currentPeriod") {
        setProceedConfirmed(false);
      }
      if (field === "currentPeriod") setCurrentPeriodValue(value === null || value === "" ? null : Number(value));
      setSnapshot((current) => {
        const next: AcademicGridSnapshot = structuredClone(current);
        if (disciplineIndex !== undefined || field === "currentPeriod") {
          next.proceedConfirmed = false;
        }
        let currentPeriod = currentPeriodValue;
        if (field === "currentPeriod") {
          currentPeriod = value === null || value === "" ? null : Number(value);
        } else if (field === "studentName") {
          next.studentName = value === null ? null : String(value);
        } else if (field === "rgm") {
          next.rgm = value === null ? null : String(value);
        } else if (field === "courseName") {
          next.courseName = value === null ? null : String(value);
        } else if (disciplineIndex !== undefined) {
          const discipline = next.disciplines[disciplineIndex];
          if (!discipline) return current;
          if (field === "name") discipline.name = String(value ?? "").trim();
          if (field === "code") discipline.code = value === null ? null : String(value);
          if (field === "rawPeriod") {
            discipline.rawPeriod = String(value ?? "");
            const parsed = Number(discipline.rawPeriod.match(/\d{1,2}/)?.[0]);
            discipline.period = parsed >= 1 && parsed <= 20 ? parsed : null;
          }
          if (field === "period") {
            discipline.period = value === null || value === "" ? null : Number(value);
            discipline.rawPeriod = discipline.period?.toString() ?? "";
          }
          if (field === "originalStatus") {
            discipline.originalStatus = String(value ?? "");
            discipline.normalizedStatus = normalizeAcademicStatus(discipline.originalStatus);
          }
          if (field === "workload") discipline.workload = value === null || value === "" ? null : Number(value);
          if (field === "inMainCurriculum") discipline.inMainCurriculum = value === true;
          discipline.manualEdited = true;
        }
        next.manuallyEdited = true;
        next.result = analyzeAcademicGrid({ disciplines: next.disciplines, currentPeriod, currentPeriodConfirmed: currentPeriod !== null });
        return next;
      });
      toast.success(res.message);
      return true;
    } finally {
      savingFieldRef.current = false;
      setSavingField(false);
    }
  }

  async function confirmPeriod() {
    const value = periodText.trim() ? Number(periodText) : null;
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 20)) { toast.error("Informe um período entre 1 e 20."); return; }
    await saveField("currentPeriod", value);
  }

  async function addDiscipline() {
    start(async () => {
      const res = await addAcademicDisciplineAction(review.id);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(res.message);
      window.location.reload();
    });
  }

  function toggleSelected(rowKey: string) {
    setSelected((current) => current.includes(rowKey) ? current.filter((key) => key !== rowKey) : [...current, rowKey]);
  }

  async function copyMessage() {
    try { await navigator.clipboard.writeText(message); toast.success("Mensagem copiada."); }
    catch { toast.error("Não foi possível copiar; selecione o texto manualmente."); }
  }

  const scenarioAllowance = result.baseExtraAllowance + Math.max(0, Math.min(20, scenarioAE)) * ACADEMIC_RULES.EXTRA_PER_CURRENT_PERIOD_AE;
  const scenarioCanAdd = Math.min(result.previousPending, Math.max(0, scenarioAllowance - result.usedExtraSlots));
  const simulatedRemaining = Math.max(0, scenarioAllowance - result.usedExtraSlots - selected.length);

  return (
    <div className="academic-report-page mx-auto max-w-[1440px] space-y-5 px-1 pb-10 sm:space-y-6 sm:px-0">
      <div className="no-print">
        <PageHeader eyebrow="Análise acadêmica" title={snapshot.studentName ?? "Conferência do extrato"} description={<>{snapshot.courseName ?? "Curso não identificado"}{snapshot.rgm ? ` · RGM ${snapshot.rgm}` : ""} · {review.sourceFilename} · {review.sourcePageCount} página(s) · enviado por {review.createdByName}</>} actions={<div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/academic-analysis">Reanalisar PDF</Link></Button><Button variant="outline" onClick={() => window.print()}>Gerar relatório</Button>{isAdmin && <DeleteAcademicGridReviewButton reviewId={review.id} />}</div>} />
      </div>

      {reviewNeeded && <section className={cn("rounded-xl border px-4 py-3 sm:px-5", proceedConfirmed ? "border-status-success/30 bg-status-success-bg/60" : "border-orange-300/70 bg-orange-50/70")} aria-live="polite">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={cn("text-xs font-bold uppercase tracking-[0.12em]", proceedConfirmed ? "text-status-success" : "text-orange-800")}>{proceedConfirmed ? "Conferência registrada" : "Ação necessária"}</span>
          <p className="flex-1 text-sm text-foreground">{proceedConfirmed ? `Tutor confirmou os ${snapshot.disciplines.length} componentes identificados.` : reviewWarnings.length === 0 ? "Confirme o período e a classificação da grade para prosseguir." : `${reviewWarnings.length} ${reviewWarnings.length === 1 ? "ponto precisa" : "pontos precisam"} de conferência no extrato.`}</p>
          {!proceedConfirmed && ambiguousRows.length > 0 && <Button type="button" variant="outline" size="sm" onClick={requestAiReview} disabled={aiReviewBusy} className="border-orange-300 bg-white">{aiReviewBusy ? "Analisando…" : "Priorizar revisão"}</Button>}
        </div>
        {!proceedConfirmed && <details className="mt-2 text-sm">
          <summary className="w-fit cursor-pointer font-medium text-orange-950">Ver detalhes e confirmar</summary>
          <div className="mt-3 grid gap-3 border-t border-orange-200/80 pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="min-w-0">
              {reviewWarnings.length > 0 && <ul className="mb-3 list-inside list-disc space-y-1 text-muted-foreground">{reviewWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
              {!currentPeriodConfirmed ? <p className="text-sm">Confirme o período atual do aluno na seção de dados principais.</p> : incompleteMainCurriculumRows > 0 ? <p className="text-sm">Complete nome, período e status de {incompleteMainCurriculumRows} componente(s) na revisão manual abaixo.</p> : <label className="flex cursor-pointer items-start gap-2 text-sm"><input type="checkbox" checked={proceedSelected} onChange={(event) => setProceedSelected(event.target.checked)} className="mt-1 size-4 shrink-0 accent-brand-navy" /><span>Conferi o PDF e confirmo que todos os componentes da grade principal estão incluídos.</span></label>}
            </div>
            {currentPeriodConfirmed && incompleteMainCurriculumRows === 0 && <Button type="button" size="sm" onClick={confirmProceed} disabled={!proceedSelected || confirmingProceed || proceedBlocked}>{confirmingProceed ? "Salvando…" : "Confirmar conferência"}</Button>}
          </div>
          {aiReviews && <div className="mt-3 border-t border-orange-200/80 pt-3"><p className="font-medium">Sugestões de revisão</p><p className="mt-1 text-xs text-muted-foreground">A IA não aprova dados. Compare com o PDF e salve manualmente qualquer correção.</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{aiReviews.length ? aiReviews.map((item) => { const row = ambiguousRows.find((candidate) => candidate.rowRef === item.rowRef); return <div key={item.rowRef} className="rounded-lg border border-orange-200 bg-white p-3"><p className="font-semibold">{row?.code ? `${row.code} · ` : ""}{row?.name ?? `Linha ${item.rowRef}`}</p><p className="mt-1">{item.reasonToReview}</p><p className="mt-1 text-xs text-muted-foreground">Confira no PDF: {item.tutorCheck}</p></div>; }) : <p>Nenhum aspecto adicional foi priorizado.</p>}</div></div>}
        </details>}
      </section>}
      {snapshot.manuallyEdited && <div className="rounded-lg border border-brand-cyan/30 bg-brand-cyan-50 px-4 py-2 text-sm font-medium text-brand-navy">Dados alterados manualmente · alterações registradas no histórico</div>}

      <Card className={cn("overflow-hidden border", STATUS[result.status].tone)}>
        <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div><p className="text-xs font-semibold uppercase tracking-wide opacity-75">Situação da análise</p><h2 className="mt-1 text-lg font-bold">{STATUS[result.status].label}</h2><p className="mt-1 text-sm opacity-80">{result.status === "CAN_ADD" ? `A regra permite avaliar até ${result.canAddNow} disciplina(s) anterior(es) para inclusão neste período.` : result.status === "NEAR_LIMIT" ? "Resta uma vaga adicional calculada para este período." : result.status === "NO_PENDING" ? "Não identificamos disciplinas anteriores pendentes no extrato." : result.status === "LIMIT_REACHED" ? "As vagas adicionais calculadas já estão utilizadas." : "Confirme o período e revise os dados destacados antes de orientar o aluno."}</p></div>
          <div className="rounded-lg bg-white/65 px-4 py-2 sm:min-w-36 sm:text-center"><span className="text-2xl font-bold tabular-nums">{result.remainingExtraSlots}</span><span className="ml-2 text-sm font-medium">vagas adicionais</span><p className="text-xs opacity-75">para avaliação neste período</p></div>
        </CardContent>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Período atual" value={result.currentPeriod ? `${result.currentPeriod}º` : "—"} detail="Conforme período confirmado" tone="cyan" />
        <Metric label="Pendências na projeção" value={graduationForecast?.knownBacklog ?? result.previousPending} detail="Inclui notas abaixo da média" tone="navy" />
        <Metric label="Já em andamento" value={result.previousAlreadyAdded} detail="Disciplinas anteriores como CURSANDO" tone="blue" />
        <Card className="border-l-4 border-l-brand-gold"><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">Previsão preliminar</p><p className="mt-1 text-xl font-bold tabular-nums text-brand-navy">{graduationForecast?.completionTermMin ?? "A confirmar"}</p><p className="mt-1 text-xs text-muted-foreground">{reviewNeeded ? "Aguardando conferência do tutor" : graduationForecast?.incomplete ? "Dados ou regras pendentes de validação" : `Motor curricular · regra ${snapshot.projectionRulesVersion ?? rulesVersion}`}</p></CardContent></Card>
      </section>

      {graduationForecast && <Card className="border-brand-cyan/30">
        <CardHeader>
          <CardTitle className="text-base">Previsão automática de conclusão</CardTitle>
          <p className="text-sm text-muted-foreground">Cenário calculado pelo mesmo motor da Análise Curricular ({snapshot.projectionRulesVersion ?? rulesVersion}), com regras determinísticas e conferência das linhas extraídas. A data não é garantia: pressupõe aprovação e rematrícula no prazo e depende da oferta de disciplinas e dos pré-requisitos.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-3">Período</th><th className="p-3">Semestre projetado</th><th className="p-3">Regulares</th><th className="p-3">Anteriores em curso</th><th className="p-3">Dispensas</th><th className="p-3">Pendências alocadas</th><th className="p-3">Carga / capacidade</th></tr></thead>
              <tbody>{graduationForecast.plan.map((step, index) => <tr key={`${step.curriculumPeriod}-${step.term}-${index}`} className="border-t">
                <td className="p-3 font-medium">{step.isAdditional ? `Adaptações · semestre ${step.adaptationSemesterNumber}` : `${step.curriculumPeriod}º período`}</td>
                <td className="p-3">{step.term ?? "A confirmar"}{step.term && !calendarTerms.some((item) => item.term === step.term && item.confidence === "OFFICIAL") ? <span className="ml-1 text-xs text-muted-foreground">(projetado)</span> : null}</td>
                <td className="p-3">{step.regularSubjects}</td><td className="p-3">{step.inProgressFromPrevious || "—"}</td><td className="p-3">{step.exemptions}</td>
                <td className="p-3">{step.previousSubjects.length ? <details><summary className="cursor-pointer">{step.previousSubjects.length} disciplina(s)</summary><ul className="mt-2 list-inside list-disc text-xs">{step.previousSubjects.map((name, nameIndex) => <li key={`${name}-${nameIndex}`}>{name}</li>)}</ul></details> : "—"}</td>
                <td className="p-3 tabular-nums">{step.totalLoad} / {step.capacity}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {graduationForecast.incomplete && <div className="rounded-lg border border-status-warning/30 bg-status-warning-bg p-3 text-sm"><p className="font-semibold">Projeção calculada com ressalvas</p><ul className="mt-1 list-inside list-disc space-y-1">{graduationForecast.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>}
          <p className="text-xs text-muted-foreground">As AE/AE* liberam vagas somente no período em que aparecem; se não houver pendências para alocar, períodos posteriores compostos apenas por dispensas são omitidos. Semestres de adaptações usam a capacidade regular do último período simulado, sem carregar bônus pontuais de AE. A simulação não presume oferta nem pré-requisitos: a conclusão depende de aprovação e rematrícula no prazo. Situações desconhecidas permanecem como REVISAR.</p>
        </CardContent>
      </Card>}

      <details className="no-print rounded-xl border bg-card p-4">
        <summary className="cursor-pointer font-semibold">Conferir período e ver critérios do cálculo</summary>
      <div className="mt-4 space-y-4">
      <Card className="border-brand-cyan/30">
        <CardHeader className="pb-3"><CardTitle className="text-base">Conferência dos dados principais</CardTitle><p className="text-sm text-muted-foreground">O S/T do cabeçalho é a fonte prioritária. O maior período encontrado não é usado automaticamente.</p></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_auto_1fr] sm:items-end">
          <label className="space-y-1.5 text-sm font-medium">Período atual do aluno<Input type="number" min={1} max={20} value={periodText} onChange={(event) => setPeriodText(event.target.value)} placeholder="Ex.: 7" aria-label="Período atual do aluno" /></label>
          <Button onClick={confirmPeriod} disabled={working}>{working ? "Salvando…" : review.currentPeriodConfirmed ? "Confirmar / corrigir período" : "Confirmar período"}</Button>
          <p className="text-xs leading-5 text-muted-foreground">{review.currentPeriodRaw ? `Valor encontrado no documento: ${review.currentPeriodRaw}. ` : "Período não reconhecido automaticamente. "}Se corrigir, essa alteração será registrada na auditoria.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Como o cálculo foi feito</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-4">
            <FormulaCell value={result.currentPeriodComponents} label="componentes do período atual" />
            <FormulaCell value={`+ ${result.baseExtraAllowance}`} label="vagas padrão" />
            <FormulaCell value={`+ ${result.currentPeriodAE}`} label="vagas por AE atual" />
            <FormulaCell value={`= ${result.semesterMaximum}`} label="limite máximo" emphasis />
          </div>
          <div className="grid gap-2 rounded-xl bg-muted/40 p-3 sm:grid-cols-3 sm:items-center">
            <FormulaCell value={result.extraAllowance} label="vagas extras disponíveis originalmente" />
            <FormulaCell value={`− ${result.usedExtraSlots}`} label="vagas usadas por CURSANDO anteriores" />
            <FormulaCell value={`= ${result.remainingExtraSlots}`} label="vagas extras restantes" emphasis />
          </div>
          <p className="text-xs text-muted-foreground">Pendência = status normalizado exatamente igual a “A CURSAR”. “CURSANDO”, AE, notas e outros resultados não entram nessa contagem. AE em períodos diferentes do atual não altera o limite.</p>
        </CardContent>
      </Card>

      {review.previous && <Card className="border-brand-cyan/30"><CardHeader><CardTitle className="text-base">Análise anterior registrada para este RGM</CardTitle></CardHeader><CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"><span>Anterior: <strong>{review.previous.previousPending} pendências</strong></span><span>Atual: <strong>{result.previousPending} pendências</strong></span><Badge variant="outline">Redução: {Math.max(0, review.previous.previousPending - result.previousPending)}</Badge><Link href={`/academic-analysis/${review.previous.id}`} className="text-brand-cyan-700 underline">Abrir análise anterior</Link></CardContent></Card>}
      </div>
      </details>

      <Card>
        <CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><CardTitle className="text-base">Pendências por período</CardTitle><p className="mt-1 text-sm text-muted-foreground">Ordenação padrão: período mais antigo primeiro.</p></div><div className="no-print flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={addDiscipline} disabled={working}>Adicionar manualmente</Button></div></div></CardHeader>
        <CardContent className="space-y-3">
          {byPeriod.length ? byPeriod.map((period) => {
            const rows = result.pendingDisciplines.filter((item) => String(item.period) === period);
            return <details key={period} className="group rounded-xl border open:border-brand-cyan/40"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3"><span className="font-semibold">{period}º período</span><span className="rounded-full bg-brand-navy-50 px-2.5 py-1 text-xs font-semibold text-brand-navy">{rows.length} pendência{rows.length === 1 ? "" : "s"}</span></summary><div className="divide-y border-t">{rows.map((item) => <div key={`${item.sourcePage}-${item.sourceRow}-${item.code}-${item.name}`} className="grid gap-1 p-3 text-sm sm:grid-cols-[6rem_1fr_auto_auto]"><span className="font-mono text-xs text-muted-foreground">{item.code ?? "Sem código"}</span><span className="font-medium">{item.name}</span><span>{item.workload === null ? "CH —" : `${item.workload}h`}</span><Badge variant="outline">{item.originalStatus}</Badge></div>)}</div></details>;
          }) : <p className="rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground">Não foram identificadas pendências anteriores com situação A CURSAR.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Já incluídas neste semestre</CardTitle><p className="text-sm text-muted-foreground">Estas disciplinas têm status CURSANDO em períodos anteriores e já utilizam vagas extras.</p></CardHeader>
        <CardContent>{result.previousCoursesInProgress.length ? <><div className="space-y-2 md:hidden">{result.previousCoursesInProgress.map((item, index) => <div key={`mobile-${item.sourcePage}-${item.sourceRow}-${index}`} className="rounded-lg border p-3"><p className="font-medium">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.code ? `${item.code} · ` : ""}{item.period}º período · {item.originalStatus} · {item.workload === null ? "CH não informada" : `${item.workload}h`}</p></div>)}</div><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[36rem] text-left text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="p-2">Código</th><th className="p-2">Disciplina</th><th className="p-2">Período</th><th className="p-2">Situação</th><th className="p-2">C.H.</th></tr></thead><tbody>{result.previousCoursesInProgress.map((item, index) => <tr key={`${item.sourcePage}-${item.sourceRow}-${index}`} className="border-b last:border-0"><td className="p-2 font-mono text-xs">{item.code ?? "—"}</td><td className="p-2 font-medium">{item.name}</td><td className="p-2">{item.period}º</td><td className="p-2">{item.originalStatus}</td><td className="p-2">{item.workload === null ? "—" : `${item.workload}h`}</td></tr>)}</tbody></table></div></> : <p className="rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground">Nenhuma disciplina anterior aparece como CURSANDO.</p>}</CardContent>
      </Card>

      <details className="no-print rounded-xl border bg-card p-4">
        <summary className="cursor-pointer font-semibold">Ferramentas da equipe acadêmica <span className="ml-1 text-sm font-normal text-muted-foreground">· simulação, correções e histórico</span></summary>
      <div className="mt-4 space-y-4">
      <Card>
        <CardHeader><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="text-base">Simulador de inclusão</CardTitle><p className="mt-1 text-sm text-muted-foreground">Selecione pendências antigas até a quantidade de vagas extras disponíveis. A simulação não altera o resultado oficial.</p></div><Badge variant="outline">SIMULAÇÃO</Badge></div></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 rounded-xl bg-muted/40 p-3 sm:grid-cols-3 sm:items-end"><div><p className="text-xs text-muted-foreground">Capacidade oficial</p><p className="text-lg font-semibold">{result.currentPeriodComponents} + {result.extraAllowance} = {result.semesterMaximum}</p></div><div><p className="text-xs text-muted-foreground">Slots extras</p><p className="text-lg font-semibold">{result.usedExtraSlots} usados · {result.remainingExtraSlots} livres</p></div><label className="space-y-1 text-sm font-medium">Simular AE no período atual<Input type="number" min={0} max={20} value={scenarioAE} onChange={(event) => setScenarioAE(Math.max(0, Math.min(20, Number(event.target.value) || 0)))} /></label></div>
          <div className="grid gap-3 sm:grid-cols-2"><Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filtrar por nome ou código" aria-label="Filtrar disciplinas por nome ou código" /><select className="h-9 rounded-lg border bg-card px-3 text-sm" value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)}><option value="all">Todos os períodos</option>{byPeriod.map((period) => <option key={period} value={period}>{period}º período</option>)}</select><select className="h-9 rounded-lg border bg-card px-3 text-sm sm:col-start-2" value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="period-asc">Período mais antigo</option><option value="period-desc">Período mais recente</option><option value="name">Nome</option><option value="workload">Carga horária</option></select></div>
          <div className="max-h-[32rem] divide-y overflow-auto rounded-xl border">{filteredPending.map((item) => {
            const key = `${item.sourcePage}:${item.sourceRow}:${item.code ?? item.name}`;
            const checked = selected.includes(key);
            const disabled = !checked && (selected.length >= scenarioCanAdd || result.status === "MANUAL_REVIEW_REQUIRED");
            return <label key={key} className={cn("flex cursor-pointer items-start gap-3 p-3 transition-colors", disabled ? "cursor-not-allowed opacity-50" : "hover:bg-muted/40")}><input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleSelected(key)} className="mt-1 size-4 accent-brand-navy" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{item.name}</span><span className="text-xs text-muted-foreground">{item.code ? `${item.code} · ` : ""}{item.period}º período · {item.workload === null ? "CH não identificada" : `${item.workload}h`}</span></span><Badge variant="outline">{item.originalStatus}</Badge></label>;
          })}{!filteredPending.length && <p className="p-5 text-center text-sm text-muted-foreground">Nenhuma pendência encontrada com esse filtro.</p>}</div>
          <div className="rounded-xl border border-brand-cyan/25 bg-brand-cyan-50/45 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-brand-navy">Cenário simulado</p><p className="mt-1 text-lg font-bold text-brand-navy">Novo limite: {result.currentPeriodComponents + scenarioAllowance} · vagas extras restantes: {simulatedRemaining}</p><p className="text-sm text-muted-foreground">Selecionadas: {selected.length} · se forem efetivamente incluídas, permaneceriam {Math.max(0, result.previousPending - selected.length)} com A CURSAR. Pendências oficiais atuais: {result.previousPending}.</p></div>
          <p className="text-xs leading-5 text-muted-foreground">Sugestão ordenada por antiguidade. Antes da inclusão, confirme oferta, pré-requisitos, dependências e demais regras acadêmicas.</p>
        </CardContent>
      </Card>

      </div>
      </details>

      <Card className="border-brand-cyan/30">
        <CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="text-base">Mensagem para enviar com o extrato</CardTitle><p className="mt-1 text-sm text-muted-foreground">Texto simples para o aluno, com a previsão identificada como estimativa.</p></div><div className="no-print flex flex-wrap gap-2"><Button size="sm" onClick={copyMessage}>Copiar mensagem</Button><Button size="sm" variant="outline" onClick={() => setEditingMessage((value) => !value)}>{editingMessage ? "Concluir edição" : "Personalizar"}</Button><Button size="sm" variant="ghost" onClick={() => setMessageOverride(null)}>Restaurar sugestão</Button></div></div></CardHeader>
        <CardContent>{editingMessage ? <Textarea value={message} onChange={(event) => setMessageOverride(event.target.value)} rows={8} className="leading-6" /> : <div className="whitespace-pre-wrap rounded-xl bg-muted/35 p-4 text-sm leading-6">{message}</div>}{forecastFootnote && <p className="mt-3 text-xs leading-5 text-muted-foreground">{forecastFootnote}</p>}</CardContent>
      </Card>

      <details className="no-print rounded-xl border bg-card p-4">
        <summary className="cursor-pointer font-semibold">Revisar ou corrigir os dados extraídos</summary>
      <div className="mt-4 space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Revisão manual dos componentes</CardTitle><p className="text-sm text-muted-foreground">Edite código, disciplina, período, status, carga horária ou participação na grade. Cada alteração gera um evento de auditoria.</p></CardHeader>
        <CardContent className="space-y-3">{snapshot.disciplines.length ? snapshot.disciplines.map((item, index) => <EditableDiscipline key={`${index}-${item.sourcePage}-${item.sourceRow}`} index={index} discipline={item} busy={working || savingField} onSave={saveField} />) : <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Nenhum componente foi extraído. Use “Adicionar manualmente” para construir a grade e o período.</p>}</CardContent>
      </Card>

      <details className="rounded-xl border bg-card p-4">
        <summary className="cursor-pointer font-semibold">Ver como o cálculo foi feito · auditoria</summary>
        <div className="mt-4 space-y-4 text-sm">
          <dl className="grid gap-2 sm:grid-cols-2">{[
            ["Período atual", result.currentPeriod === null ? "A confirmar" : `${result.currentPeriod}º`],
            ["Componentes da grade no período", result.currentPeriodComponents],
            ["Acréscimo padrão", result.baseExtraAllowance],
            ["AE no período atual", result.currentPeriodAE],
            ["Limite máximo", result.semesterMaximum],
            ["Vagas extras utilizadas", `${result.usedExtraSlots} / ${result.extraAllowance}`],
            ["Vagas extras restantes", result.remainingExtraSlots],
            ["Pendências anteriores A CURSAR", result.previousPending],
            ["Pode incluir agora", result.canAddNow],
            ["Permanecem após inclusão simulada", result.pendingAfterPossibleInclusion],
            ["PDF", `${review.sourceFilename} · SHA-256 ${review.sourceSha256 ?? "registrado"}`],
          ].map(([label, value]) => <div key={label} className="rounded-lg bg-muted/35 p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-0.5 font-semibold">{value}</dd></div>)}</dl>
          <div><h3 className="font-semibold">Histórico de alterações</h3>{review.corrections.length ? <ul className="mt-2 space-y-2">{review.corrections.map((change) => <li key={change.id} className="rounded-lg border p-3 text-xs"><strong>{change.user.name}</strong> · {change.field === "proceedConfirmed" ? "confirmou prosseguimento" : change.field}{change.disciplineIndex !== null ? ` · componente ${change.disciplineIndex + 1}` : ""}<div className="mt-1 text-muted-foreground">{change.field === "proceedConfirmed" ? change.reason : `${JSON.stringify(change.previousValue)} → ${JSON.stringify(change.newValue)}${change.reason ? ` · ${change.reason}` : ""}`}</div></li>)}</ul> : <p className="mt-1 text-muted-foreground">Nenhuma correção registrada.</p>}</div>
        </div>
      </details>
      </div>
      </details>
      <div className="no-print text-xs text-muted-foreground">Esta ferramenta orienta a conferência acadêmica. As vagas simuladas não alteram o extrato nem confirmam oferta ou elegibilidade.</div>
    </div>
  );
}

function Metric({ label, value, detail, tone }: { label: string; value: string | number; detail: string; tone: "navy" | "cyan" | "blue" | "gold" | "slate" | "success" | "danger" }) {
  const colors = { navy: "border-l-brand-navy", cyan: "border-l-brand-cyan", blue: "border-l-brand-blue", gold: "border-l-brand-gold", slate: "border-l-slate-400", success: "border-l-status-success", danger: "border-l-status-danger" };
  return <Card className={cn("border-l-4", colors[tone])}><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-bold tabular-nums text-brand-navy">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></CardContent></Card>;
}

function FormulaCell({ value, label, emphasis = false }: { value: string | number; label: string; emphasis?: boolean }) {
  return <div className={cn("rounded-lg border p-3", emphasis ? "border-brand-navy/20 bg-brand-navy text-white" : "bg-card")}><p className="text-2xl font-bold tabular-nums">{value}</p><p className={cn("text-xs", emphasis ? "text-white/75" : "text-muted-foreground")}>{label}</p></div>;
}

const ACADEMIC_STATUS_OPTIONS = [
  ["A CURSAR", "A cursar"],
  ["CURSANDO", "Cursando"],
  ["AE", "Dispensa (AE)"],
  ["AE*", "Dispensa (AE*)"],
  ["APROVADO", "Aprovado"],
  ["REPROVADO", "Reprovado"],
  ["REPROVADO POR NOTA", "Reprovado por nota"],
  ["REPROVADO POR FALTA", "Reprovado por falta"],
  ["CONCLUIDO", "Concluído"],
  ["DISPENSADO", "Dispensado"],
  ["S", "Satisfatório (S)"],
] as const;

function EditableDiscipline({ index, discipline, busy, onSave }: { index: number; discipline: AcademicDiscipline; busy: boolean; onSave: (field: string, value: string | number | boolean | null, index: number) => Promise<boolean> }) {
  const periodOptions = Array.from({ length: 20 }, (_, optionIndex) => optionIndex + 1);
  const statusIsKnown = ACADEMIC_STATUS_OPTIONS.some(([value]) => value === discipline.normalizedStatus);
  const currentStatusValue = discipline.normalizedStatus || "";
  return <div className={cn("grid gap-2 rounded-xl border p-3 sm:grid-cols-12 sm:items-end", discipline.manualEdited && "border-brand-cyan/50 bg-brand-cyan-50/20")}>
    <label className="space-y-1 text-[11px] font-medium text-muted-foreground sm:col-span-2">Código<input aria-label={`Código, componente ${index + 1}`} className="h-9 w-full rounded-md border bg-card px-2 text-sm text-foreground" defaultValue={discipline.code ?? ""} onBlur={(event) => onSave("code", event.currentTarget.value || null, index)} disabled={busy} /></label>
    <label className="space-y-1 text-[11px] font-medium text-muted-foreground sm:col-span-4">Componente<input aria-label={`Componente, linha ${index + 1}`} className="h-9 w-full rounded-md border bg-card px-2 text-sm text-foreground" defaultValue={discipline.name} onBlur={(event) => onSave("name", event.currentTarget.value, index)} disabled={busy} /></label>
    <label className="space-y-1 text-[11px] font-medium text-muted-foreground sm:col-span-1">Período<select aria-label={`Período, componente ${index + 1}`} className="h-9 w-full rounded-md border bg-card px-2 text-sm text-foreground" defaultValue={discipline.period?.toString() ?? ""} onChange={(event) => { const value = event.currentTarget.value; void onSave("period", value ? Number(value) : null, index); }} disabled={busy}><option value="">Selecionar</option>{periodOptions.map((period) => <option key={period} value={period}>{period}º</option>)}</select></label>
    <label className="space-y-1 text-[11px] font-medium text-muted-foreground sm:col-span-2">Status<select aria-label={`Status, componente ${index + 1}`} className="h-9 w-full rounded-md border bg-card px-2 text-sm text-foreground" defaultValue={currentStatusValue} onChange={(event) => { void onSave("originalStatus", event.currentTarget.value, index); }} disabled={busy}><option value="">Selecionar status</option>{!statusIsKnown && currentStatusValue && <option value={currentStatusValue}>Atual: {discipline.originalStatus} · revisar</option>}{ACADEMIC_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label className="space-y-1 text-[11px] font-medium text-muted-foreground sm:col-span-1">C.H.<input aria-label={`Carga horária, componente ${index + 1}`} type="number" min={0} max={2000} className="h-9 w-full rounded-md border bg-card px-2 text-sm text-foreground" defaultValue={discipline.workload ?? ""} onBlur={(event) => onSave("workload", event.currentTarget.value ? Number(event.currentTarget.value) : null, index)} disabled={busy} /></label>
    <label className="flex min-h-9 items-center gap-2 text-xs sm:col-span-2"><input type="checkbox" defaultChecked={discipline.inMainCurriculum} onChange={(event) => onSave("inMainCurriculum", event.currentTarget.checked, index)} disabled={busy} className="size-4 accent-brand-navy" />Na grade principal</label>
    <div className="text-[10px] text-muted-foreground sm:col-span-12">Original: “{discipline.originalStatus}” · normalizado: “{discipline.normalizedStatus}” · período original: “{discipline.rawPeriod || "não identificado"}” · pág. {discipline.sourcePage || "manual"}</div>
  </div>;
}
