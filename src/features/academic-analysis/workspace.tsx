"use client";
import { SourceAttribution } from "@/features/student-portal/source-attribution";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BorderBeam } from "@/components/ui/border-beam";
import { academicDisciplineNeedsReview, academicGridCompletionBlockers, academicGridHasUnresolvedRowCount, analyzeAcademicGrid, buildStudentMessage, isBlankManualDisciplineDraft, normalizeAcademicStatus, unresolvedAcademicGridRowCount } from "@/domain/academic-analysis/analyze";
import { academicStatusOutcome } from "@/domain/academic-analysis/rules";
import { estimateGraduation, formatGraduationForecast, isBlockingForecastExtractionWarning, isGraduationRowUncertain, type GraduationForecast } from "@/domain/academic-analysis/graduation-forecast";
import type { AcademicDiscipline, AcademicGridSnapshot } from "@/domain/academic-analysis/types";
import type { AcademicCalendarTerm } from "@/domain/academic-calendar/calendar";
import type { AcademicRules } from "@/domain/curricular-analysis/rules/types";
import { updateAcademicGridFieldAction, addAcademicDisciplineAction, completeAcademicGridReviewAction, autoMapAcademicGridAction } from "@/features/academic-analysis/actions";
import { DeleteAcademicGridReviewButton } from "@/features/academic-analysis/delete-review-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AcademicDashboardOverview, AcademicForecastRoadmap, AcademicPeriodJourney, PendingDistribution } from "@/features/academic-analysis/academic-dashboard-visuals";

type ReviewRecord = {
  id: string;
  studentName: string | null;
  rgm: string | null;
  courseName: string | null;
  currentPeriod: number | null;
  currentPeriodConfirmed: boolean;
  completedAt: string | null;
  sourceFilename: string;
  sourcePageCount: number;
  analysisDate: string;
  snapshot: AcademicGridSnapshot;
  previous: { id: string; previousPending: number } | null;
};

export function AcademicGridWorkspace({ review, calendarTerms, rules }: { review: ReviewRecord; calendarTerms: AcademicCalendarTerm[]; rules: AcademicRules }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(review.snapshot);
  const [newDisciplineIndex, setNewDisciplineIndex] = useState<number | null>(null);
  const [periodText, setPeriodText] = useState(review.currentPeriod?.toString() ?? "");
  const [currentPeriodValue, setCurrentPeriodValue] = useState<number | null>(review.currentPeriod);
  const [working, start] = useTransition();
  const [addingDiscipline, setAddingDiscipline] = useState(false);
  const [savingField, setSavingField] = useState(false);
  const savingFieldRef = useRef(false);
  const reviewDetailsRef = useRef<HTMLDetailsElement>(null);
  const draftDetailsRef = useRef<HTMLDetailsElement>(null);
  const [messageOverride, setMessageOverride] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState(false);
  const [aiReviewBusy, setAiReviewBusy] = useState(false);
  const [aiReviews, setAiReviews] = useState<Array<{ rowRef: string; reasonToReview: string; tutorCheck: string }> | null>(null);
  const [periodConfirmed, setPeriodConfirmed] = useState(review.currentPeriod !== null && review.currentPeriodConfirmed);
  const [completedAt, setCompletedAt] = useState(review.completedAt);
  const result = snapshot.result;
  const selectedPeriod = periodText.trim() ? Number(periodText) : null;
  const periodHasChanged = selectedPeriod !== currentPeriodValue;
  const analysisDate = review.analysisDate;
  const incompleteMainCurriculumRows = snapshot.disciplines.filter(academicDisciplineNeedsReview).length;
  const blankManualDraftIndexes = snapshot.disciplines.flatMap((discipline, index) => isBlankManualDisciplineDraft(discipline) ? [index] : []);
  const uncertainForecastIndexes = new Set(snapshot.disciplines.flatMap((discipline, index) => discipline.inMainCurriculum && isGraduationRowUncertain(discipline) ? [index] : []));
  const rowCountMismatch = academicGridHasUnresolvedRowCount(snapshot.disciplines, snapshot.sourceDisciplineCount, snapshot.sourceParsedDisciplineCount);
  const unresolvedSourceRows = unresolvedAcademicGridRowCount(snapshot.disciplines, snapshot.sourceDisciplineCount, snapshot.sourceParsedDisciplineCount);
  const completionBlockers = academicGridCompletionBlockers({ disciplines: snapshot.disciplines, currentPeriod: result.currentPeriod, currentPeriodConfirmed: periodConfirmed, sourceDisciplineCount: snapshot.sourceDisciplineCount, sourceParsedDisciplineCount: snapshot.sourceParsedDisciplineCount });
  const canCompleteAnalysis = completionBlockers.length === 0;
  const actionableExtractionWarnings = snapshot.extractionWarnings.filter((warning) => {
    if (!isBlockingForecastExtractionWarning(warning)) return false;
    if (/período atual|período.*segurança/i.test(warning) && periodConfirmed) return false;
    if (/componente.*(nome|período|situação)|campo.*linha acadêmica/i.test(warning) && incompleteMainCurriculumRows === 0 && !rowCountMismatch) return false;
    if (/linha\(s\) acadêmica\(s\)|linhas foram mantidas|não entram nos cálculos/i.test(warning) && incompleteMainCurriculumRows === 0 && !rowCountMismatch) return false;
    if (/tabela principal/i.test(warning) && snapshot.disciplines.length > 0 && incompleteMainCurriculumRows === 0 && !rowCountMismatch) return false;
    if (/conferência automática encontrou/i.test(warning) && !rowCountMismatch) return false;
    return true;
  });
  const unmappedDisciplines = snapshot.disciplines.filter((row) => row.inMainCurriculum && row.period === null).length;
  const historyMappingRequired = Boolean(snapshot.documentType && snapshot.documentType !== "CURRICULAR_EXTRACT" && (!periodConfirmed || unmappedDisciplines > 0));
  const graduationForecast = historyMappingRequired ? null : estimateGraduation({ disciplines: snapshot.disciplines, currentPeriod: result.currentPeriod, analysisDate, calendarTerms, rules, extractionWarnings: actionableExtractionWarnings, sourceDisciplineCount: snapshot.sourceDisciplineCount, sourceParsedDisciplineCount: snapshot.sourceParsedDisciplineCount });
  const formattedForecast = graduationForecast ? formatGraduationForecast(graduationForecast) : null;
  const forecastCalculated = Boolean(graduationForecast?.completionTermMin);
  const suggestedMessage = buildStudentMessage({ result, forecast: graduationForecast });
  const message = messageOverride ?? suggestedMessage;
  const ambiguousRows = snapshot.disciplines.flatMap((item) => {
    if (isBlankManualDisciplineDraft(item)) return [];
    return item.name.trim() && (item.period === null || !item.normalizedStatus)
      ? [{ rowRef: `${item.sourcePage}-${item.sourceRow}`, code: item.code, name: item.name, rawPeriod: item.rawPeriod, period: item.period, status: item.originalStatus }]
      : [];
  }).slice(0, 12);

  const isHistoryDocument = snapshot.documentType === "SIMPLE_ACADEMIC_HISTORY" || snapshot.documentType === "OFFICIAL_ACADEMIC_HISTORY";
  const [autoMapping, setAutoMapping] = useState(false);
  const autoMapTried = useRef(false);
  async function runAutoMapping(silent = false) {
    if (autoMapping) return;
    setAutoMapping(true);
    try {
      const res = await autoMapAcademicGridAction(review.id);
      if (!res.ok) { if (!silent) toast.error(res.error); return; }
      setSnapshot(res.data.snapshot);
      setCurrentPeriodValue(res.data.currentPeriod);
      setPeriodText(res.data.currentPeriod?.toString() ?? "");
      setPeriodConfirmed(res.data.currentPeriod !== null);
      setCompletedAt(null);
      setMessageOverride(null);
      toast.success(res.message ?? "Períodos identificados automaticamente.");
      router.refresh();
    } catch {
      if (!silent) toast.error("Não foi possível mapear automaticamente. Tente novamente.");
    } finally {
      setAutoMapping(false);
    }
  }
  useEffect(() => {
    if (autoMapTried.current || !isHistoryDocument || !historyMappingRequired) return;
    autoMapTried.current = true;
    void runAutoMapping(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- executa uma única vez ao abrir a análise
  }, []);

  async function requestAiReview() {
    if (!ambiguousRows.length) { toast.info("Não há linhas ambíguas identificadas para priorizar."); return; }
    setAiReviewBusy(true);
    try {
      const response = await fetch("/api/academic-analysis/ai-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: ambiguousRows, warnings: actionableExtractionWarnings.slice(0, 12) }),
      });
      const data = await response.json() as { error?: string; reviews?: Array<{ rowRef: string; reasonToReview: string; tutorCheck: string }> };
      if (!response.ok || !data.reviews) { toast.error(data.error ?? "Não foi possível priorizar a revisão."); return; }
      setAiReviews(data.reviews);
      toast.success("Sugestões prontas. Compare cada linha com o PDF e salve os ajustes.");
    } catch {
      toast.error("Falha ao conectar à IA. A revisão manual continua disponível.");
    } finally {
      setAiReviewBusy(false);
    }
  }
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
      setCompletedAt(null);
      setMessageOverride(null);
      if (field === "currentPeriod") {
        const nextPeriod = value === null || value === "" ? null : Number(value);
        setCurrentPeriodValue(nextPeriod);
        setPeriodConfirmed(nextPeriod !== null);
      }
      setSnapshot((current) => {
        const next: AcademicGridSnapshot = structuredClone(current);
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
    } catch {
      toast.error("Não foi possível salvar esta alteração. Confira sua conexão e tente novamente.");
      return false;
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

  function openDisciplineReview() {
    if (!reviewDetailsRef.current) return;
    reviewDetailsRef.current.open = true;
    if (uncertainForecastIndexes.size === 0 && unresolvedSourceRows > 0 && draftDetailsRef.current) draftDetailsRef.current.open = true;
    window.requestAnimationFrame(() => {
      const firstUncertainIndex = [...uncertainForecastIndexes][0] ?? blankManualDraftIndexes[0];
      const firstUncertain = firstUncertainIndex === undefined ? null : document.getElementById(`academic-discipline-${firstUncertainIndex}`);
      (firstUncertain ?? reviewDetailsRef.current)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  async function addDiscipline() {
    setAddingDiscipline(true);
    start(async () => {
      try {
        const res = await addAcademicDisciplineAction(review.id);
        if (!res.ok) { toast.error(res.error); return; }
        const { discipline, disciplineIndex } = res.data;
        setCompletedAt(null);
        setMessageOverride(null);
        setNewDisciplineIndex(disciplineIndex);
        setSnapshot((current) => {
          const next = structuredClone(current);
          next.disciplines.push(discipline);
          next.manuallyEdited = true;
          next.result = analyzeAcademicGrid({ disciplines: next.disciplines, currentPeriod: currentPeriodValue, currentPeriodConfirmed: periodConfirmed });
          return next;
        });
        if (reviewDetailsRef.current) reviewDetailsRef.current.open = true;
        toast.success(res.message);
        window.requestAnimationFrame(() => {
          if (draftDetailsRef.current) draftDetailsRef.current.open = true;
          document.getElementById(`academic-discipline-${disciplineIndex}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      } catch {
        toast.error("Não foi possível adicionar a disciplina. Confira sua conexão e tente novamente.");
      } finally {
        setAddingDiscipline(false);
      }
    });
  }

  async function completeAnalysis() {
    start(async () => {
      try {
        const response = await completeAcademicGridReviewAction(review.id);
        if (!response.ok) { toast.error(response.error); return; }
        toast.success(response.message);
        router.push("/academic-analysis");
      } catch {
        toast.error("Não foi possível concluir a análise. Confira sua conexão e tente novamente.");
      }
    });
  }

  async function copyMessage() {
    try { await navigator.clipboard.writeText(message); toast.success("Mensagem copiada."); }
    catch { toast.error("Não foi possível copiar; selecione o texto manualmente."); }
  }

  return (
    <div className="academic-report-page mx-auto min-w-0 max-w-[1440px] space-y-5 p-4 pb-10 sm:space-y-6 sm:p-6 sm:pb-10 lg:p-8 lg:pb-10">
      <SourceAttribution type={review.snapshot.documentType} />
      {historyMappingRequired && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">MAPEAMENTO CURRICULAR NECESSÁRIO. O semestre letivo não representa o período curricular por si só.</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          {!periodConfirmed && <li>Período atual ainda não confirmado.</li>}
          {unmappedDisciplines > 0 && <li>{unmappedDisciplines} disciplina(s) da grade principal sem período mapeado.</li>}
        </ul>
        <p className="mt-2 text-xs leading-5 text-amber-900/80">Enquanto essas pendências existirem, vagas e prazo de conclusão não são calculados.</p>
        {isHistoryDocument && <Button type="button" size="sm" className="no-print mt-3 h-9 bg-brand-cyan text-white hover:bg-brand-cyan/90" onClick={() => void runAutoMapping()} disabled={autoMapping}>{autoMapping ? "Identificando períodos pelo histórico…" : "Mapear períodos automaticamente"}</Button>}
      </div>}
      <div className="no-print">
        <header className="mb-6 grid min-w-0 gap-5 border-b border-slate-200/80 pb-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-cyan-700">Análise acadêmica</p>
            <h1 className="mt-1 break-words text-2xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-3xl">{snapshot.studentName ?? "Análise do extrato"}</h1>
            <p className="mt-2 break-words text-sm font-medium text-slate-600 sm:text-base">{snapshot.courseName ?? "Curso não identificado"}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
              {snapshot.rgm && <span className="rounded-md border border-slate-200 bg-white/80 px-2.5 py-1">RGM {snapshot.rgm}</span>}
              <span className="max-w-full truncate rounded-md border border-slate-200 bg-white/80 px-2.5 py-1" title={review.sourceFilename}>{review.sourceFilename}</span>
              <span className="rounded-md border border-slate-200 bg-white/80 px-2.5 py-1">{review.sourcePageCount} {review.sourcePageCount === 1 ? "página" : "páginas"}</span>
              <span className="rounded-md border border-slate-200 bg-white/80 px-2.5 py-1">Análise de {formatDate(review.analysisDate)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Button size="lg" onClick={() => window.print()}>Gerar relatório do aluno</Button>
            <DeleteAcademicGridReviewButton reviewId={review.id} />
          </div>
        </header>
      </div>

      {!periodConfirmed && <aside id="confirmar-periodo" className="no-print fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-amber-300 bg-white p-4 shadow-[0_18px_60px_-18px_rgba(15,42,66,0.35)] sm:inset-x-auto sm:bottom-5 sm:right-5 sm:p-5" aria-live="polite" aria-labelledby="confirm-period-title">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-1 size-2.5 shrink-0 rounded-full bg-amber-500 ring-4 ring-amber-100" />
          <div className="min-w-0 flex-1">
            <p id="confirm-period-title" className="text-sm font-semibold text-slate-900">Confirme o período para calcular a previsão</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">Não identificamos essa informação com segurança no extrato. Selecione o período atual; o sistema recalcula o resultado automaticamente.</p>
            <div className="mt-3 flex items-end gap-2">
              <label htmlFor="current-period" className="min-w-0 flex-1 text-xs font-medium text-slate-700">Período atual
                <Input id="current-period" type="number" min={1} max={20} value={periodText} onChange={(event) => setPeriodText(event.target.value)} placeholder="Ex.: 7" aria-label="Período atual do aluno" className="mt-1 h-10" />
              </label>
              <Button type="button" size="sm" className="h-10 shrink-0" onClick={confirmPeriod} disabled={working || (periodConfirmed && !periodHasChanged) || selectedPeriod === null}>{working ? "Salvando…" : "Confirmar"}</Button>
            </div>
          </div>
        </div>
      </aside>}

      {periodConfirmed && unmappedDisciplines > 0 && <aside id="confirmar-mapeamento" className="no-print fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-amber-300 bg-white p-4 shadow-[0_18px_60px_-18px_rgba(15,42,66,0.35)] sm:inset-x-auto sm:bottom-5 sm:right-5 sm:p-5" aria-live="polite" aria-labelledby="confirm-mapping-title">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-1 size-2.5 shrink-0 rounded-full bg-amber-500 ring-4 ring-amber-100" />
          <div className="min-w-0 flex-1">
            <p id="confirm-mapping-title" className="text-sm font-semibold text-slate-900">{unmappedDisciplines} disciplina(s) sem período mapeado</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">O período foi confirmado, mas ainda faltam disciplinas da grade principal sem posição no currículo. Enquanto isso não for resolvido, vagas e prazo de conclusão não são calculados.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {isHistoryDocument && <Button type="button" size="sm" className="h-9 bg-brand-cyan text-white hover:bg-brand-cyan/90" onClick={() => void runAutoMapping()} disabled={autoMapping}>{autoMapping ? "Identificando períodos…" : "Mapear automaticamente"}</Button>}
              <Button type="button" size="sm" variant="outline" className="h-9" onClick={openDisciplineReview}>Revisar disciplinas</Button>
            </div>
          </div>
        </div>
      </aside>}

      <AcademicDashboardOverview
        mappingRequired={historyMappingRequired}
        workloadProgress={review.snapshot.documentType !== "CURRICULAR_EXTRACT" && review.snapshot.plannedWorkload && review.snapshot.integralizedWorkload != null ? { planned: review.snapshot.plannedWorkload, integralized: review.snapshot.integralizedWorkload } : undefined}
        disciplines={snapshot.disciplines}
        currentPeriod={result.currentPeriod}
        currentPeriodConfirmed={periodConfirmed}
        pending={graduationForecast?.knownBacklog ?? result.previousPending}
        inProgress={result.previousAlreadyAdded}
        currentAE={result.currentPeriodAE}
        availableSlots={result.remainingExtraSlots}
        completionTerm={formattedForecast?.completion ?? null}
        needsReview={Boolean(graduationForecast?.incomplete)}
      />

      <AcademicPeriodJourney disciplines={snapshot.disciplines} currentPeriod={result.currentPeriod} />

      {graduationForecast && <Card className="border-brand-cyan/30">
        <CardHeader>
          <CardTitle className="text-base">Previsão automática de conclusão</CardTitle>
          <p className="text-sm text-muted-foreground">Estimativa automática com base nos dados identificados. O prazo pode mudar conforme aprovação, rematrícula, oferta e pré-requisitos.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {graduationForecast.incomplete && <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm leading-5 text-amber-950"><span className="font-semibold">Projeção automática com ressalvas.</span> {graduationForecast.uncertainRows > 0 ? `${graduationForecast.uncertainRows} linha(s) têm dados incompletos ou não identificados; foi incluída uma margem adicional.` : "O prazo depende das regras e da capacidade acadêmica cadastradas."} A estimativa é exibida sem exigir confirmação manual.</div>}
          {graduationForecast.plan.length ? <AcademicForecastRoadmap steps={graduationForecast.plan} officialTerms={new Set(calendarTerms.filter((item) => item.confidence === "OFFICIAL").map((item) => item.term))} /> : <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Não foi possível calcular etapas com os dados disponíveis. A análise não exige confirmação manual para exibir uma previsão quando houver informações suficientes.</div>}
        </CardContent>
      </Card>}

      <details className="no-print rounded-xl border bg-card p-4">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-2 font-semibold [&::-webkit-details-marker]:hidden">
          <span>Orientações para tutores</span>
          {graduationForecast?.uncertainRows ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">{graduationForecast.uncertainRows} item(ns) incerto(s)</span> : <span className="text-xs font-normal text-slate-500">Como interpretar a estimativa automática</span>}
        </summary>
      <div className="mt-4 space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Como esta análise é feita</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm leading-6 text-slate-700">
          <p>O sistema usa as disciplinas e situações lidas do extrato, o período atual e as regras acadêmicas cadastradas. Ao corrigir um dado na revisão, a análise e a previsão são recalculadas automaticamente.</p>
          <p className="text-xs leading-5 text-muted-foreground">A projeção pressupõe aprovação e rematrícula no prazo. Oferta de disciplinas e pré-requisitos podem alterar a conclusão. AE/AE* liberam vagas no semestre em que aparecem; o sistema não presume oferta nem pré-requisitos.</p>
          {graduationForecast?.incomplete && <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-amber-950">
            {graduationForecast.uncertainRows > 0 ? <>
              <p className="font-semibold">{uncertainForecastIndexes.size > 0 ? `${uncertainForecastIndexes.size} disciplina(s) têm período ou situação não identificados` : `${unresolvedSourceRows} linha(s) do extrato não foram identificadas na grade`}</p>
              <p className="mt-1 text-sm leading-5 text-amber-900/80">A estimativa já foi calculada automaticamente com uma margem para esses dados. Se a tutoria reconhecer as informações, pode preenchê-las para refinar o resultado; não é necessário fazer isso para obter a previsão.</p>
              {(uncertainForecastIndexes.size > 0 || unresolvedSourceRows > 0) && <Button type="button" variant="link" size="sm" className="mt-1 h-auto px-0 py-1 font-semibold text-amber-950 underline underline-offset-4" onClick={openDisciplineReview}>Abrir revisão opcional</Button>}
            </> : <p className="font-semibold">A estimativa é calculada automaticamente e pode ser refinada se houver correções no extrato.</p>}
            {graduationForecast.reasons.filter((reason) => !/^\d+ componente\(s\) com período ou situação acadêmica não identificada com segurança\.$/.test(reason)).length > 0 && <ul className="mt-2 list-inside list-disc space-y-1 text-sm">{graduationForecast.reasons.filter((reason) => !/^\d+ componente\(s\) com período ou situação acadêmica não identificada com segurança\.$/.test(reason)).map((reason) => <li key={reason}>{reason}</li>)}</ul>}
          </div>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Regras de vagas do período atual</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <FormulaFlow label="Limite total do período" values={[
            { value: result.currentPeriodComponents, label: "componentes do período" },
            { value: result.baseExtraAllowance, label: "vagas padrão" },
            { value: result.currentPeriodAE, label: "vagas por AE/AE*" },
            { value: result.semesterMaximum, label: "limite máximo" },
          ]} operators={["+", "+", "="]} />
          <FormulaFlow label="Vagas extras ainda disponíveis" values={[
            { value: result.extraAllowance, label: "vagas extras calculadas" },
            { value: result.usedExtraSlots, label: "ocupadas por CURSANDO" },
            { value: result.remainingExtraSlots, label: "vagas livres" },
          ]} operators={["−", "="]} />
          <p className="text-xs text-muted-foreground">Pendência = status normalizado exatamente igual a “A CURSAR”. “CURSANDO”, AE, notas e outros resultados não entram nessa contagem. AE em períodos diferentes do atual não altera o limite.</p>
        </CardContent>
      </Card>

      {review.previous && <Card className="border-brand-cyan/30"><CardHeader><CardTitle className="text-base">Análise anterior registrada para este RGM</CardTitle></CardHeader><CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"><span>Anterior: <strong>{review.previous.previousPending} pendências</strong></span><span>Atual: <strong>{result.previousPending} pendências</strong></span><Badge variant="outline">Redução: {Math.max(0, review.previous.previousPending - result.previousPending)}</Badge><Link href={`/academic-analysis/${review.previous.id}`} className="text-brand-cyan-700 underline">Abrir análise anterior</Link></CardContent></Card>}
      </div>
      </details>

      <Card>
        <CardHeader><div><CardTitle className="text-base">Pendências por período</CardTitle><p className="mt-1 text-sm text-muted-foreground">Distribuição resumida e lista expansível por semestre.</p></div></CardHeader>
        <CardContent className="space-y-4">
          <PendingDistribution byPeriod={result.pendingByPeriod} totalPending={result.previousPending} disciplines={result.pendingDisciplines} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Já incluídas neste semestre</CardTitle><p className="text-sm text-muted-foreground">Estas disciplinas têm status CURSANDO em períodos anteriores e já utilizam vagas extras.</p></CardHeader>
        <CardContent>{result.previousCoursesInProgress.length ? <><div className="space-y-2 md:hidden">{result.previousCoursesInProgress.map((item, index) => <div key={`mobile-${item.sourcePage}-${item.sourceRow}-${index}`} className="rounded-lg border p-3"><p className="font-medium">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.code ? `${item.code} · ` : ""}{item.period}º período · {item.originalStatus} · {item.workload === null ? "CH não informada" : `${item.workload}h`}</p></div>)}</div><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[36rem] text-left text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="p-2">Código</th><th className="p-2">Disciplina</th><th className="p-2">Período</th><th className="p-2">Situação</th><th className="p-2">C.H.</th></tr></thead><tbody>{result.previousCoursesInProgress.map((item, index) => <tr key={`${item.sourcePage}-${item.sourceRow}-${index}`} className="border-b last:border-0"><td className="p-2 font-mono text-xs">{item.code ?? "—"}</td><td className="p-2 font-medium">{item.name}</td><td className="p-2">{item.period}º</td><td className="p-2">{item.originalStatus}</td><td className="p-2">{item.workload === null ? "—" : `${item.workload}h`}</td></tr>)}</tbody></table></div></> : <p className="rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground">Nenhuma disciplina anterior aparece como CURSANDO.</p>}</CardContent>
      </Card>

      <BorderBeam size="md" colorVariant="ice" theme="light" staticColors strength={0.55} glowSize={0.65} duration={8} className="w-full rounded-2xl">
        <section className="relative overflow-hidden rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-cyan-50 shadow-[0_18px_44px_-38px_rgba(15,42,66,0.65)]" aria-labelledby="student-message-title">
          <div className="flex flex-col gap-4 border-b border-sky-100 bg-sky-100/55 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div><p className="text-xs font-semibold uppercase tracking-[0.13em] text-brand-cyan-700">Comunicação · acompanha o extrato escolar</p><h2 id="student-message-title" className="mt-1 text-lg font-semibold text-slate-900">Resumo da análise para o aluno</h2><p className="mt-1 text-sm text-slate-600">Mensagem independente do extrato em anexo, pronta para copiar e enviar.</p></div><div className="no-print flex flex-wrap gap-2"><Button size="sm" onClick={copyMessage}>Copiar mensagem</Button><Button size="sm" variant="outline" onClick={() => setEditingMessage((value) => !value)}>{editingMessage ? "Concluir edição" : "Personalizar"}</Button>{messageOverride !== null && <Button size="sm" variant="ghost" onClick={() => setMessageOverride(null)}>Restaurar sugestão</Button>}</div></div>
          <div className="p-4 sm:p-5">
            {editingMessage ? <div className="rounded-xl border border-sky-100 bg-white p-4 shadow-sm sm:p-5"><Textarea value={message} onChange={(event) => setMessageOverride(event.target.value)} rows={8} className="min-h-40 resize-y border-0 bg-transparent p-0 leading-6 shadow-none focus-visible:ring-0" aria-label="Editar mensagem para o aluno" /></div> : <StudentMessagePreview message={message} />}
          </div>
        </section>
      </BorderBeam>

      <details id="revisar-dados" ref={reviewDetailsRef} className="no-print scroll-mt-6">
        <summary className="w-fit cursor-pointer py-2 pl-2 pr-3 font-semibold text-slate-800 underline decoration-slate-300 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Revisar ou corrigir os dados extraídos</summary>
      <div className="mt-4 space-y-4">
      <Card>
        <CardHeader><div className="flex flex-wrap items-start justify-between gap-2"><div><CardTitle className="text-base">Revisão manual dos componentes</CardTitle><p className="text-sm text-muted-foreground">Abra uma disciplina para conferir ou corrigir os dados. Pode adicionar mais de uma linha, se necessário.</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={addDiscipline} disabled={working || savingField}>{addingDiscipline ? "Adicionando…" : "Adicionar disciplina"}</Button>{ambiguousRows.length > 0 && <Button type="button" variant="outline" size="sm" onClick={requestAiReview} disabled={aiReviewBusy}>{aiReviewBusy ? "Analisando…" : "Analisar linhas incertas"}</Button>}</div></div></CardHeader>
        <CardContent className="space-y-3">
          {snapshot.disciplines.map((item, index) => isBlankManualDisciplineDraft(item) ? null : <EditableDiscipline key={`${index}-${item.sourcePage}-${item.sourceRow}`} index={index} discipline={item} uncertain={uncertainForecastIndexes.has(index)} initiallyOpen={newDisciplineIndex === index} busy={working || savingField} onSave={saveField} />)}
          {blankManualDraftIndexes.length > 0 && <details ref={draftDetailsRef} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-100/70 [&::-webkit-details-marker]:hidden">
              <span>{blankManualDraftIndexes.length} rascunho(s) vazio(s) <span className="font-normal text-slate-500">· opcional preencher</span></span><span className="text-xs font-medium text-slate-500">Abrir lista <span aria-hidden="true">⌄</span></span>
            </summary>
            <div className="space-y-3 border-t border-slate-200 p-3">
              <p className="text-xs leading-5 text-slate-600">Essas linhas não entram na contagem enquanto estiverem vazias. A projeção já considera automaticamente uma margem para itens do extrato não identificados{unresolvedSourceRows ? ` (${unresolvedSourceRows})` : ""}.</p>
              {blankManualDraftIndexes.map((index) => {
                const item = snapshot.disciplines[index];
                return <EditableDiscipline key={`${index}-${item.sourcePage}-${item.sourceRow}`} index={index} discipline={item} uncertain={false} initiallyOpen={newDisciplineIndex === index} busy={working || savingField} onSave={saveField} />;
              })}
            </div>
          </details>}
          {!snapshot.disciplines.length && <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Nenhum componente foi extraído. Use “Adicionar disciplina” para construir a grade.</p>}
          {aiReviews && <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3"><p className="text-sm font-semibold text-slate-900">Linhas que merecem atenção</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{aiReviews.length ? aiReviews.map((item) => { const row = ambiguousRows.find((candidate) => candidate.rowRef === item.rowRef); return <div key={item.rowRef} className="rounded-lg border border-sky-100 bg-white p-3 text-sm"><p className="font-semibold">{row?.code ? `${row.code} · ` : ""}{row?.name ?? `Linha ${item.rowRef}`}</p><p className="mt-1">{item.reasonToReview}</p><p className="mt-1 text-xs text-muted-foreground">Compare com o PDF: {item.tutorCheck}</p></div>; }) : <p className="text-sm">Nenhuma divergência adicional foi priorizada.</p>}</div></div>}
        </CardContent>
      </Card>

      </div>
      </details>
      <section className="no-print rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-5" aria-labelledby="finish-analysis-title">
        <div><h2 id="finish-analysis-title" className="font-semibold text-slate-900">Encerramento da análise</h2><p className="mt-1 max-w-2xl text-sm text-slate-600">{completedAt ? `Análise concluída em ${formatDate(completedAt.slice(0, 10))}. Se editar algum dado, ela volta automaticamente para revisão.` : canCompleteAnalysis ? "Os dados obrigatórios estão conferidos. Conclua para registrar o atendimento e voltar ao histórico." : "Para habilitar a conclusão, resolva os itens abaixo:"}</p>{!completedAt && completionBlockers.length > 0 && <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-800">{completionBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}</div>
        <div className="mt-4 flex flex-wrap gap-2 sm:mt-0 sm:shrink-0">
          <Button type="button" onClick={completeAnalysis} disabled={working || Boolean(completedAt) || !canCompleteAnalysis}>{working ? "Concluindo…" : completedAt ? "Análise concluída" : "Concluir análise"}</Button>
          <Button asChild variant="outline"><Link href="/dashboard">Ir ao início</Link></Button>
          <Button asChild variant="outline"><Link href="/academic-analysis">Fazer outra análise</Link></Button>
        </div>
      </section>
      <StudentAcademicPrintReport
        sourceSnapshot={review.snapshot}
        studentName={snapshot.studentName}
        courseName={snapshot.courseName}
        rgm={snapshot.rgm}
        analysisDate={review.analysisDate}
        currentPeriod={result.currentPeriod}
        disciplines={snapshot.disciplines}
        result={result}
        forecast={graduationForecast}
        forecastCalculated={forecastCalculated}
      />
    </div>
  );
}

function StudentMessagePreview({ message }: { message: string }) {
  const blocks = message.trim().split(/\n\s*\n/).filter(Boolean);

  return <div className="space-y-4 rounded-2xl border border-sky-100 bg-gradient-to-br from-white via-white to-sky-50/80 p-4 shadow-sm sm:p-5">
    {blocks.map((block, index) => {
      const lines = block.split("\n").filter(Boolean);
      if (lines.every((line) => line.trimStart().startsWith("•"))) {
        return <div key={`results-${index}`} className="grid gap-2 sm:grid-cols-2" aria-label="Resumo dos resultados">
          {lines.map((line, lineIndex) => {
            const content = line.trim().replace(/^•\s*/, "");
            const separator = content.indexOf(":");
            const label = separator >= 0 ? content.slice(0, separator) : `Resultado ${lineIndex + 1}`;
            const value = separator >= 0 ? content.slice(separator + 1).trim() : content;
            return <div key={`${label}-${lineIndex}`} className="min-w-0 rounded-xl border border-sky-100 bg-sky-50/65 p-3 sm:p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-sky-800">{label}</p>
              <p className="mt-1 break-words text-sm font-medium leading-5 text-slate-800">{value}</p>
            </div>;
          })}
        </div>;
      }

      return <p key={`paragraph-${index}`} className={cn("whitespace-pre-wrap text-sm leading-6 text-slate-700", index === 0 && "border-l-4 border-sky-500 pl-3 font-medium text-slate-900")}>{block}</p>;
    })}
  </div>;
}

function StudentAcademicPrintReport({ sourceSnapshot, studentName, courseName, rgm, analysisDate, currentPeriod, disciplines, result, forecast, forecastCalculated }: {
  sourceSnapshot: AcademicGridSnapshot;
  studentName: string | null;
  courseName: string | null;
  rgm: string | null;
  analysisDate: string;
  currentPeriod: number | null;
  disciplines: AcademicDiscipline[];
  result: AcademicGridSnapshot["result"];
  forecast: GraduationForecast | null;
  forecastCalculated: boolean;
}) {
  const reportDisciplines = disciplines.filter((item) => !isBlankManualDisciplineDraft(item));
  const included = reportDisciplines.filter((item) => item.inMainCurriculum);
  const completed = included.filter((item) => ["COMPLETED", "EXEMPT"].includes(academicStatusOutcome(item.normalizedStatus))).length;
  const inProgress = included.filter((item) => academicStatusOutcome(item.normalizedStatus) === "IN_PROGRESS").length;
  const needsReview = included.filter(academicDisciplineNeedsReview).length;
  const completion = forecast ? formatGraduationForecast(forecast).completion : "";
  const pendingByPeriod = Object.entries(result.pendingByPeriod).sort(([periodA], [periodB]) => Number(periodA) - Number(periodB));
  const reportStatus = getAcademicReportStatus(result.status);
  const nextStep = getAcademicReportNextStep(result, needsReview);
  const mappingMissing = Boolean(sourceSnapshot.documentType && sourceSnapshot.documentType !== "CURRICULAR_EXTRACT" && (currentPeriod === null || disciplines.some(row => row.inMainCurriculum && row.period === null)));

  return <article className="print-report" aria-label="Relatório acadêmico para o aluno">
    <SourceAttribution type={sourceSnapshot.documentType} report />
    {sourceSnapshot.plannedWorkload && sourceSnapshot.integralizedWorkload != null && <p className="report-source-footer">Curso integralizado: {Math.round(sourceSnapshot.integralizedWorkload / sourceSnapshot.plannedWorkload * 100)}% · {sourceSnapshot.integralizedWorkload.toLocaleString("pt-BR")}h de {sourceSnapshot.plannedWorkload.toLocaleString("pt-BR")}h</p>}
    <div className="report-brand-row">
      <Image src="/brand/logo-cruzeiro-do-sul-virtual.png" alt="Cruzeiro do Sul Virtual" width={221} height={53} className="report-logo" unoptimized />
      <div className="report-title"><p>ACOMPANHAMENTO ACADÊMICO</p><h1>Resumo da análise</h1><span>Indicadores e próximos passos</span></div>
    </div>
    <div className="report-student">
      <h2>{studentName ?? "Estudante"}</h2>
      <p>{courseName ?? "Curso não identificado"}{rgm ? ` · RGM ${rgm}` : ""}</p>
      <p className="report-date">Análise de {formatDate(analysisDate)}</p>
    </div>

    <section className="report-forecast">
      <div className="report-forecast-heading"><div><p className="report-kicker">RESULTADO</p><h2>{reportStatus.title}</h2></div><span className={forecastCalculated ? "report-status report-status-ready" : "report-status report-status-review"}>{forecastCalculated ? forecast?.incomplete ? "Faixa estimada" : "Cálculo automático" : "Dados insuficientes"}</span></div>
      <div className="report-completion"><span>Previsão estimada de conclusão</span><strong>{forecastCalculated && completion ? completion : "Indisponível com os dados atuais"}</strong></div>
      <p>{forecastCalculated ? forecast?.incomplete ? forecast.uncertainRows > 0 ? `Projeção automática com margem para ${forecast.uncertainRows} linha(s) incerta(s) do extrato.` : "Projeção automática com ressalvas nas regras acadêmicas cadastradas." : "Estimativa calculada automaticamente com base na grade e nas regras acadêmicas." : "O extrato não trouxe dados suficientes para calcular um prazo confiável."}</p>
      <p className="report-assumption">Estimativa sujeita à aprovação, rematrícula no prazo, oferta de disciplinas e pré-requisitos.</p>
    </section>

    <section className="report-summary">
      <div><strong>{completed}</strong><span>aprovadas ou dispensadas</span></div>
      <div><strong>{inProgress}</strong><span>em andamento</span></div>
      <div><strong>{result.previousPending}</strong><span>pendências anteriores</span></div>
      <div><strong>{result.status === "MANUAL_REVIEW_REQUIRED" ? "—" : result.canAddNow}</strong><span>pendências que cabem no limite atual*</span></div>
    </section>

    {mappingMissing ? <p className="report-empty-state">Mapeamento curricular necessário. Vagas e pendências por período aguardam confirmação do tutor.</p> : <>
    <section className="report-section report-capacity">
      <div className="report-section-heading"><p className="report-kicker">PERÍODO ATUAL</p><h2>{currentPeriod ? `${currentPeriod}º período` : "Período não identificado"}</h2><p>Capacidade estimada para inclusão de disciplinas anteriores.</p></div>
      <div className="report-capacity-grid">
        <div><span>Componentes do período</span><strong>{result.currentPeriodComponents}</strong></div>
        <div><span>Limite total calculado</span><strong>{result.semesterMaximum}</strong></div>
        <div><span>Vagas extras livres</span><strong>{result.remainingExtraSlots}</strong></div>
        <div><span>Dispensas AE/AE* no período</span><strong>{result.currentPeriodAE}</strong></div>
      </div>
      <p className="report-muted">*O número de pendências que cabem no limite é uma simulação; a inclusão depende da conferência da grade e da oferta acadêmica.</p>
    </section>

    <section className="report-section">
      <div className="report-section-heading"><p className="report-kicker">PENDÊNCIAS</p><h2>Distribuição por período</h2><p>Resumo das disciplinas anteriores que ainda constam como A CURSAR.</p></div>
      {pendingByPeriod.length ? <div className="report-pending-grid">{pendingByPeriod.map(([period, count]) => <div key={period}><span>{period}º período</span><strong>{count}</strong><small>{count === 1 ? "pendência" : "pendências"}</small></div>)}</div> : <p className="report-empty-state">Não há pendências anteriores classificadas como A CURSAR.</p>}
    </section>

    </>}
    {forecast?.plan.length ? <section className="report-section">
      <div className="report-section-heading"><p className="report-kicker">PROJEÇÃO</p><h2>Etapas acadêmicas previstas</h2><p>Estimativa por semestre, sem repetir a relação completa de disciplinas.</p></div>
      <ol className="report-plan">
        {forecast.plan.slice(0, 6).map((step, index) => {
          const plannedCount = new Set([...step.regularSubjectNames, ...step.inProgressSubjectNames, ...step.previousSubjects]).size;
          return <li key={`${step.curriculumPeriod}-${step.term}-${index}`} className="report-plan-step">
            <div><span>{step.isAdditional ? `Adaptação ${step.adaptationSemesterNumber}` : `${step.curriculumPeriod}º período`}{!step.isAdditional && step.curriculumPeriod === currentPeriod ? " · atual" : ""}</span><strong>{step.term ?? "Calendário indisponível"}</strong></div>
            <b>{plannedCount} {plannedCount === 1 ? "componente" : "componentes"}</b>
          </li>;
        })}
      </ol>
      {forecast.plan.length > 6 && <p className="report-muted">A projeção continua nas etapas seguintes do plano acadêmico.</p>}
    </section> : <section className="report-section"><div className="report-section-heading"><p className="report-kicker">PROJEÇÃO</p><h2>Etapas acadêmicas</h2></div><p className="report-empty-state">Não foi possível simular etapas com os dados disponíveis no extrato.</p></section>}

    <section className={forecastCalculated ? "report-next-step report-next-step-ready" : "report-next-step report-next-step-review"}><div><p className="report-kicker">PRÓXIMO PASSO</p><h2>{nextStep.title}</h2></div><p>{nextStep.description}</p></section>
    <footer className="report-footer"><p>Resumo informativo para apoiar o planejamento acadêmico. A confirmação final depende dos registros e das regras oficiais da instituição.</p><span>{formatDate(analysisDate)}</span></footer>
  </article>;
}

function getAcademicReportStatus(status: AcademicGridSnapshot["result"]["status"]): { title: string } {
  switch (status) {
    case "NO_PENDING": return { title: "Sem pendências anteriores" };
    case "CAN_ADD": return { title: "Há capacidade para inclusão" };
    case "NEAR_LIMIT": return { title: "Próximo do limite de inclusão" };
    case "LIMIT_REACHED": return { title: "Limite de inclusão atingido" };
    case "MANUAL_REVIEW_REQUIRED": return { title: "Análise com ressalvas" };
  }
}

function getAcademicReportNextStep(result: AcademicGridSnapshot["result"], needsReview: number): { title: string; description: string } {
  if (result.status === "MANUAL_REVIEW_REQUIRED" || needsReview > 0) {
    return { title: "Usar a faixa como referência", description: "A estimativa já foi calculada automaticamente com os dados legíveis. Se houver divergência no extrato, a revisão opcional pode refinar o resultado." };
  }
  if (result.canAddNow > 0) {
    return { title: "Avaliar inclusão de disciplinas pendentes", description: `${result.canAddNow} pendência(s) cabem na capacidade estimada do período. Confirme a oferta e os pré-requisitos antes de orientar a inclusão.` };
  }
  if (result.previousPending > 0) {
    return { title: "Planejar as pendências restantes", description: "A capacidade adicional do período está ocupada. As pendências devem ser planejadas para etapas futuras, conforme a oferta acadêmica." };
  }
  return { title: "Manter o planejamento atualizado", description: "Revise a grade a cada novo período para atualizar a estimativa de conclusão." };
}

function formatDate(date: string): string {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function FormulaFlow({ label, values, operators }: { label: string; values: Array<{ value: number; label: string }>; operators: string[] }) {
  return <div role="group" aria-label={label} className="rounded-xl border border-slate-200 bg-slate-50/65 p-3 sm:p-4">
    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <div className="flex flex-wrap items-stretch gap-2">
      {values.map((item, index) => <div key={item.label} className="flex min-w-0 flex-1 basis-[7.5rem] items-center gap-2">
        <div className={cn("min-w-0 flex-1 rounded-lg border p-3", index === values.length - 1 ? "border-brand-navy/20 bg-brand-navy text-white" : "border-slate-200 bg-white")}>
          <p className="text-2xl font-bold tabular-nums">{item.value}</p><p className={cn("text-[11px] leading-4", index === values.length - 1 ? "text-white/75" : "text-muted-foreground")}>{item.label}</p>
        </div>
        {operators[index] && <span className="shrink-0 self-center text-lg font-medium text-slate-400" aria-hidden="true">{operators[index]}</span>}
      </div>)}
    </div>
  </div>;
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

function EditableDiscipline({ index, discipline, uncertain, initiallyOpen = false, busy, onSave }: { index: number; discipline: AcademicDiscipline; uncertain: boolean; initiallyOpen?: boolean; busy: boolean; onSave: (field: string, value: string | number | boolean | null, index: number) => Promise<boolean> }) {
  const [isOpen, setIsOpen] = useState(uncertain || initiallyOpen);
  const periodOptions = Array.from({ length: 20 }, (_, optionIndex) => optionIndex + 1);
  const statusIsKnown = ACADEMIC_STATUS_OPTIONS.some(([value]) => value === discipline.normalizedStatus);
  const currentStatusValue = discipline.normalizedStatus || "";
  const periodLabel = discipline.period ? `${discipline.period}º período` : "Período a identificar";
  const statusLabel = discipline.originalStatus || "Status a identificar";
  const summary = [discipline.code, periodLabel, statusLabel].filter(Boolean).join(" · ");
  return <div id={`academic-discipline-${index}`} className={cn("group min-w-0 overflow-hidden rounded-xl border bg-white", uncertain ? "border-amber-300" : discipline.manualEdited && "border-brand-cyan/50")}>
    <button type="button" aria-expanded={isOpen} onClick={() => setIsOpen((value) => !value)} className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3 px-5 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{discipline.name.trim() || "Nova disciplina (rascunho)"}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{summary}</span></span>
      <span className="flex shrink-0 items-center gap-2"><span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", uncertain ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600")}>{uncertain ? "Revisar" : isOpen ? "Recolher" : "Editar"}</span><span aria-hidden="true" className={cn("text-base leading-none text-slate-500 transition-transform", isOpen && "rotate-180")}>⌄</span></span>
    </button>
    {isOpen && <div className="grid min-w-0 grid-cols-1 gap-3 border-t bg-slate-50/50 p-3 md:grid-cols-2 md:items-end xl:grid-cols-[minmax(5rem,0.8fr)_minmax(12rem,2.3fr)_7rem_minmax(10rem,1.1fr)_6rem_minmax(9rem,1fr)]">
      <label className="min-w-0 space-y-1 text-[11px] font-medium text-muted-foreground">Código<input aria-label={`Código, componente ${index + 1}`} className="block h-9 min-w-0 w-full rounded-md border bg-card px-2 text-sm text-foreground" defaultValue={discipline.code ?? ""} onBlur={(event) => onSave("code", event.currentTarget.value || null, index)} disabled={busy} /></label>
      <label className="min-w-0 space-y-1 text-[11px] font-medium text-muted-foreground">Componente<input aria-label={`Componente, linha ${index + 1}`} className="block h-9 min-w-0 w-full rounded-md border bg-card px-2 text-sm text-foreground" defaultValue={discipline.name} onBlur={(event) => onSave("name", event.currentTarget.value, index)} disabled={busy} /></label>
      <label className="min-w-0 space-y-1 text-[11px] font-medium text-muted-foreground">Período<select aria-label={`Período, componente ${index + 1}`} className="block h-9 min-w-0 w-full rounded-md border bg-card px-2 text-sm text-foreground" defaultValue={discipline.period?.toString() ?? ""} onChange={(event) => { const select = event.currentTarget; const previous = discipline.period?.toString() ?? ""; const value = select.value; void onSave("period", value ? Number(value) : null, index).then((saved) => { if (!saved) select.value = previous; }); }} disabled={busy}><option value="">Selecionar</option>{periodOptions.map((period) => <option key={period} value={period}>{period}º</option>)}</select></label>
      <label className="min-w-0 space-y-1 text-[11px] font-medium text-muted-foreground">Status<select aria-label={`Status, componente ${index + 1}`} className="block h-9 min-w-0 w-full rounded-md border bg-card px-2 text-sm text-foreground" defaultValue={currentStatusValue} onChange={(event) => { const select = event.currentTarget; const previous = currentStatusValue; void onSave("originalStatus", select.value, index).then((saved) => { if (!saved) select.value = previous; }); }} disabled={busy}><option value="">Selecionar status</option>{!statusIsKnown && currentStatusValue && <option value={currentStatusValue}>Atual: {discipline.originalStatus} · revisar</option>}{ACADEMIC_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="min-w-0 space-y-1 text-[11px] font-medium text-muted-foreground">C.H.<input aria-label={`Carga horária, componente ${index + 1}`} type="number" min={0} max={2000} className="block h-9 min-w-0 w-full rounded-md border bg-card px-2 text-sm text-foreground" defaultValue={discipline.workload ?? ""} onBlur={(event) => onSave("workload", event.currentTarget.value ? Number(event.currentTarget.value) : null, index)} disabled={busy} /></label>
      <label className={cn("flex min-w-0 min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold", discipline.inMainCurriculum ? "border-sky-200 bg-sky-50 text-[#003B71]" : "border-slate-200 bg-slate-50 text-slate-600")}><input type="checkbox" checked={discipline.inMainCurriculum} onChange={(event) => void onSave("inMainCurriculum", event.currentTarget.checked, index)} disabled={busy} className="size-4 shrink-0 accent-brand-navy" /><span className="min-w-0 break-words">{discipline.inMainCurriculum ? "Incluir nos cálculos" : "Fora da grade principal"}</span></label>
      <div className="min-w-0 break-words text-[10px] text-muted-foreground md:col-span-2 xl:col-span-full">Original: “{discipline.originalStatus}” · normalizado: “{discipline.normalizedStatus}” · período original: “{discipline.rawPeriod || "não identificado"}” · pág. {discipline.sourcePage || "manual"}</div>
    </div>}
  </div>;
}
