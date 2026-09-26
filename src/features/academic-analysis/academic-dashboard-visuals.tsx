import { academicStatusOutcome } from "@/domain/academic-analysis/rules";
import type { AcademicDiscipline } from "@/domain/academic-analysis/types";
import type { GraduationPlanStep } from "@/domain/academic-analysis/graduation-forecast";
import { cn } from "@/lib/utils";
import { readableName } from "@/lib/text";
import { SpotlightCard } from "@/components/magic/spotlight-card";
import { NumberTicker } from "@/components/magic/number-ticker";
import { DotPattern } from "@/components/magic/dot-pattern";

type JourneyState = "completed" | "attention" | "underway" | "current" | "future";

export function AcademicDashboardOverview({
  disciplines,
  currentPeriod,
  currentPeriodConfirmed,
  pending,
  inProgress,
  currentAE,
  availableSlots,
  completionTerm,
  needsReview,
  workloadProgress,
  mappingRequired = false,
  audience = "staff",
}: {
  disciplines: AcademicDiscipline[];
  currentPeriod: number | null;
  currentPeriodConfirmed: boolean;
  pending: number;
  inProgress: number;
  currentAE: number;
  availableSlots: number;
  completionTerm: string | null;
  needsReview: boolean;
  workloadProgress?: { planned: number; integralized: number };
  mappingRequired?: boolean;
  /** "student": indicadores em linguagem do aluno, sem termos internos como vagas adicionais. */
  audience?: "staff" | "student";
}) {
  const mainGrid = disciplines.filter((discipline) => discipline.inMainCurriculum);
  const completed = mainGrid.filter((discipline) => {
    const state = academicStatusOutcome(discipline.normalizedStatus);
    return state === "COMPLETED" || state === "EXEMPT";
  }).length;
  const progress = workloadProgress ? Math.round(workloadProgress.integralized / workloadProgress.planned * 100) : mainGrid.length ? Math.round((completed / mainGrid.length) * 100) : 0;

  return (
    <section aria-label="Resumo da trajetória acadêmica" className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.9fr)]">
      <article className="relative isolate overflow-hidden rounded-2xl border border-[#003B71]/15 bg-[linear-gradient(135deg,#003B71_0%,#07558f_64%,#087db0_100%)] p-5 text-white shadow-[0_20px_48px_-32px_rgba(0,59,113,0.78)] sm:p-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-14 -top-24 -z-10 size-72 rounded-full bg-cyan-200/10 blur-3xl" />
        <DotPattern className="-z-10 text-white/10" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100">Visão da jornada</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">Progresso acadêmico</h2>
            <p className="mt-1 max-w-lg text-sm leading-6 text-blue-50/85">{workloadProgress ? "Curso integralizado conforme a carga horária informada no histórico escolar." : "Percentual de componentes da grade principal com situação concluída ou dispensada. Disciplinas em andamento não são contadas como concluídas."}</p>
          </div>
          <div className="relative grid size-[108px] shrink-0 place-items-center" role="img" aria-label={`${progress}% ${workloadProgress ? "do curso integralizado" : "dos componentes da grade estão concluídos ou dispensados"}`}>
            <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
              <circle cx="60" cy="60" r="49" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="9" />
              <circle cx="60" cy="60" r="49" fill="none" stroke="#FEF84C" strokeWidth="9" strokeLinecap="round" strokeDasharray={2 * Math.PI * 49} strokeDashoffset={2 * Math.PI * 49 * (1 - progress / 100)} className="transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none" />
            </svg>
            <span className="absolute text-2xl font-semibold tabular-nums">{progress}<span className="text-sm">%</span></span>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-white/15 pt-4">
          <div><p className="text-xs text-blue-100/80">{workloadProgress ? "Carga horária integralizada" : "Componentes concluídos ou dispensados"}</p><p className="mt-1 text-lg font-semibold tabular-nums">{workloadProgress ? `${workloadProgress.integralized.toLocaleString("pt-BR")}h` : completed} <span className="text-sm font-normal text-blue-100/80">de {workloadProgress ? `${workloadProgress.planned.toLocaleString("pt-BR")}h` : mainGrid.length}</span></p></div>
          <div className="max-w-full rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 backdrop-blur-sm">
            <p className="text-[11px] font-medium uppercase tracking-wide text-blue-100/80">Conclusão estimada</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums">{completionTerm ?? "Sem prazo calculado"}</p>
            <p className="mt-0.5 text-[10px] leading-4 text-blue-100/75">{needsReview ? "Faixa automática · dados parciais" : "Estimativa automática"}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-blue-100/70">Projeção automática; pode variar conforme aprovação, oferta e rematrícula no prazo.</p>
      </article>

      {audience === "student" ? (
        <div className="grid grid-cols-2 gap-3">
          <CompactStat label="Período atual" value={currentPeriod ? `${currentPeriod}º` : "—"} note={currentPeriodConfirmed ? "Seu período no curso" : "Em conferência pela equipe"} tone="blue" />
          <CompactStat label="Concluídas" value={completed} note={`de ${mainGrid.length} disciplinas do curso`} tone="cyan" />
          <CompactStat label="Pendências" value={mappingRequired ? "—" : pending} note="De períodos anteriores, a cursar" tone="gold" />
          <CompactStat label="Em andamento" value={mappingRequired ? "—" : inProgress} note="Disciplinas anteriores que você já cursa" tone="slate" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <CompactStat label="Período atual" value={currentPeriod ? `${currentPeriod}º` : "—"} note={currentPeriodConfirmed ? "Mapeamento confirmado" : "Não identificado · conferir se necessário"} tone="blue" />
          <CompactStat label="Pendências anteriores" value={mappingRequired ? "—" : pending} note="Inclui reprovações registradas" tone="gold" />
          <CompactStat label="Em andamento" value={mappingRequired ? "—" : inProgress} note="Já ocupam vagas adicionais" tone="cyan" />
          <CompactStat label="Vagas adicionais" value={mappingRequired ? "—" : availableSlots} note={`${currentAE} AE/AE* no período atual`} tone="slate" />
        </div>
      )}
    </section>
  );
}

export function AcademicPeriodJourney({ disciplines, currentPeriod }: { disciplines: AcademicDiscipline[]; currentPeriod: number | null }) {
  const periods = [...new Set(disciplines.filter((discipline) => discipline.inMainCurriculum && discipline.period !== null).map((discipline) => discipline.period as number))].sort((a, b) => a - b);
  if (!periods.length) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_16px_40px_-36px_rgba(15,42,66,0.62)] sm:p-5" aria-labelledby="period-journey-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><p className="text-xs font-semibold uppercase tracking-[0.13em] text-brand-cyan-700">Mapa curricular</p><h2 id="period-journey-title" className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Jornada por período</h2></div>
        <p className="text-xs text-slate-500">Situações lidas do documento acadêmico, organizadas por período curricular.</p>
      </div>
      <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6" aria-label="Situação das disciplinas em cada período">
        {periods.map((period) => {
          const rows = disciplines.filter((discipline) => discipline.inMainCurriculum && discipline.period === period);
          const done = rows.filter((discipline) => ["COMPLETED", "EXEMPT"].includes(academicStatusOutcome(discipline.normalizedStatus))).length;
          const pending = rows.filter((discipline) => academicStatusOutcome(discipline.normalizedStatus) === "PENDING").length;
          const underway = rows.filter((discipline) => academicStatusOutcome(discipline.normalizedStatus) === "IN_PROGRESS").length;
          const unknown = rows.filter((discipline) => academicStatusOutcome(discipline.normalizedStatus) === "UNKNOWN").length;
          const isCurrent = period === currentPeriod;
          const isFuture = currentPeriod !== null && period > currentPeriod;
          const state: JourneyState = isCurrent ? "current" : isFuture ? "future" : pending || unknown ? "attention" : underway ? "underway" : "completed";
          const ratio = rows.length ? Math.round((done / rows.length) * 100) : 0;
          const title = state === "current" ? "Período atual" : state === "future" ? "Futuro" : state === "attention" ? "Com pendências" : state === "underway" ? "Em andamento" : "Concluído ou dispensado";
          return <li key={period} aria-current={state === "current" ? "step" : undefined} className={cn("min-w-0 rounded-xl border p-3", state === "current" ? "border-[#0693E3]/60 bg-sky-50 shadow-[0_8px_24px_-20px_rgba(0,100,180,0.65)]" : state === "attention" ? "border-amber-200 bg-amber-50/65" : state === "completed" ? "border-slate-200 bg-slate-50/70" : state === "underway" ? "border-cyan-200 bg-cyan-50/60" : "border-slate-200 bg-white")}>
            <div className="flex items-center justify-between gap-1"><span className="text-sm font-semibold text-slate-900">{period}º período</span><span className={cn("size-2 rounded-full", state === "current" ? "bg-[#0693E3]" : state === "attention" ? "bg-amber-500" : state === "completed" ? "bg-emerald-500" : state === "underway" ? "bg-cyan-500" : "bg-slate-300")} aria-hidden="true" /></div>
            <p className={cn("mt-1 truncate text-[11px] font-medium", state === "current" ? "text-sky-800" : state === "attention" ? "text-amber-800" : state === "underway" ? "text-cyan-800" : "text-slate-500")}>{title}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label={`Componentes concluídos no ${period}º período`} aria-valuemin={0} aria-valuemax={rows.length} aria-valuenow={done}>
              <div className={cn("h-full rounded-full", state === "current" ? "bg-[#0693E3]" : state === "underway" ? "bg-cyan-500" : "bg-emerald-500")} style={{ width: `${ratio}%` }} />
            </div>
            <p className="mt-2 text-[10px] leading-4 text-slate-600">{done}/{rows.length} concluídas{pending ? ` · ${pending} pend.` : ""}{underway ? ` · ${underway} cursando` : ""}{unknown ? ` · ${unknown} revisar` : ""}</p>
          </li>;
        })}
      </ol>
    </section>
  );
}

export function AcademicForecastRoadmap({ steps, officialTerms }: { steps: GraduationPlanStep[]; officialTerms: Set<string> }) {
  return (
    <ol className="relative space-y-3 before:absolute before:bottom-6 before:left-[18px] before:top-6 before:w-px before:bg-slate-200 sm:space-y-2" aria-label="Semestres previstos até a conclusão">
      {steps.map((step, index) => {
        const loadRatio = step.capacity > 0 ? Math.min(100, Math.round((step.totalLoad / step.capacity) * 100)) : 0;
        const isOfficial = Boolean(step.term && officialTerms.has(step.term));
        return <li key={`${step.curriculumPeriod}-${step.term}-${index}`} className="relative pl-10">
          <span className={cn("absolute left-[11px] top-5 size-[15px] rounded-full border-[3px] border-white ring-1", step.isAdditional ? "bg-[#FEF84C] ring-amber-300" : "bg-[#0693E3] ring-sky-200")} aria-hidden="true" />
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_-26px_rgba(15,42,66,0.55)] sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{step.isAdditional ? `Adaptação ${step.adaptationSemesterNumber}` : `${step.curriculumPeriod}º período`}</p><h3 className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{step.term ?? "Calendário indisponível"}{step.term && !isOfficial && <span className="ml-2 align-middle text-xs font-normal text-slate-500">projetado</span>}</h3></div>
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-right"><p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Carga / capacidade</p><p className="text-sm font-semibold tabular-nums text-slate-900">{step.totalLoad} / {step.capacity}</p></div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`Ocupação prevista no semestre ${step.term ?? index + 1}`} aria-valuemin={0} aria-valuemax={step.capacity} aria-valuenow={step.totalLoad}>
              <div className={cn("h-full rounded-full transition-[width] motion-reduce:transition-none", loadRatio >= 100 ? "bg-amber-400" : "bg-[#0693E3]")} style={{ width: `${loadRatio}%` }} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
              <ForecastFact label="Regulares" value={step.regularSubjects} />
              <ForecastFact label="Em andamento" value={step.inProgressFromPrevious} />
              <ForecastFact label="Dispensas" value={step.exemptions} />
              <ForecastFact label="Adaptações alocadas" value={step.previousSubjects.length} />
            </dl>
            {step.previousSubjects.length > 0 && <details className="group mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 text-sm open:bg-white">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 text-slate-800 transition-colors hover:bg-slate-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 sm:px-6 [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 flex-1 basis-52 items-center gap-3"><span className="inline-flex min-w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold tabular-nums text-slate-700">{step.previousSubjects.length}</span><span className="min-w-0 leading-5"><span className="block font-semibold">Disciplinas de adaptação</span><span className="mt-0.5 block text-xs font-normal text-slate-500">Alocadas neste semestre previsto</span></span></span>
                <span className="ml-auto shrink-0 text-xs font-semibold text-brand-cyan-700 group-open:hidden">Ver disciplinas <span aria-hidden="true">⌄</span></span>
                <span className="ml-auto hidden shrink-0 text-xs font-semibold text-brand-cyan-700 group-open:inline">Ocultar <span aria-hidden="true">⌃</span></span>
              </summary>
              <ul className="grid list-none gap-2 border-t border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2 sm:p-4">{step.previousSubjects.map((name, nameIndex) => <li key={`${name}-${nameIndex}`} className="flex min-w-0 items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm font-medium leading-5 text-slate-800 shadow-[0_2px_8px_-6px_rgba(15,23,42,0.35)]"><span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-[#0693E3]" /><span>{name}</span></li>)}</ul>
            </details>}
          </article>
        </li>;
      })}
    </ol>
  );
}

export function PendingDistribution({ byPeriod, totalPending, disciplines }: { byPeriod: Record<string, number>; totalPending: number; disciplines: AcademicDiscipline[] }) {
  const periods = Object.entries(byPeriod).sort(([a], [b]) => Number(a) - Number(b));
  if (!periods.length) return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-center"><p className="text-sm font-semibold text-slate-800">Nenhuma pendência anterior identificada</p><p className="mt-1 text-xs text-slate-500">Não há disciplinas com situação “A CURSAR” em períodos anteriores.</p></div>;
  const max = Math.max(...periods.map(([, count]) => count), 1);
  return <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={`${totalPending} pendências distribuídas por período`}>
    {periods.map(([period, count]) => {
      const rows = disciplines.filter((discipline) => String(discipline.period) === period);
      return <details key={period} className="group min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white open:border-slate-300 open:shadow-sm">
        <summary className="cursor-pointer list-none transition-colors hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 [&::-webkit-details-marker]:hidden">
          <div className="px-5 py-3.5">
            <div className="flex items-baseline justify-between gap-2"><span className="text-sm font-semibold text-slate-800">{period}º período</span><span className="text-xs tabular-nums text-slate-500">{count} de {totalPending}</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${count} pendências no ${period}º período`}><div className="h-full rounded-full bg-[#0693E3]" style={{ width: `${Math.max(5, Math.round((count / max) * 100))}%` }} /></div>
            <div className="mt-3 flex items-center justify-between gap-2 text-sm font-medium text-slate-700">
              <span>Ver disciplinas do {period}º período</span>
              <span className="flex shrink-0 items-center gap-2"><span className="rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800">{count} {count === 1 ? "pendência" : "pendências"}</span><span aria-hidden="true" className="text-xs text-slate-500 group-open:rotate-180">⌄</span></span>
            </div>
          </div>
        </summary>
        <div className="divide-y border-t border-slate-200 bg-slate-50/40">{rows.map((item) => <div key={`${item.sourcePage}-${item.sourceRow}-${item.code}-${item.name}`} className="grid gap-1 px-3 py-2.5 text-sm sm:grid-cols-[5rem_minmax(0,1fr)]"><span className="font-mono text-xs text-slate-500">{item.code ?? "Sem código"}</span><span className="min-w-0 font-medium text-slate-800">{readableName(item.name)}<span className="mt-0.5 block text-xs font-normal text-slate-500">{item.workload === null ? "CH não informada" : `${item.workload}h`} · {item.originalStatus}</span></span></div>)}</div>
      </details>;
    })}
  </div>;
}

function CompactStat({ label, value, note, tone }: { label: string; value: number | string; note: string; tone: "blue" | "gold" | "cyan" | "slate" }) {
  const top = { blue: "border-t-[#0693E3]", gold: "border-t-[#d6ce23]", cyan: "border-t-[#1ca9b4]", slate: "border-t-slate-400" }[tone];
  const numeric = typeof value === "number" ? value : /^(\d+)º$/.exec(value);
  return <SpotlightCard className={cn("min-w-0 rounded-xl border border-slate-200 border-t-[3px] bg-white p-3.5 shadow-[0_12px_30px_-28px_rgba(15,42,66,0.6)] sm:p-4", top)}><p className="truncate text-xs font-medium text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{typeof numeric === "number" ? <NumberTicker value={numeric} /> : numeric ? <NumberTicker value={Number(numeric[1])} suffix="º" /> : value}</p><p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{note}</p></SpotlightCard>;
}

function ForecastFact({ label, value }: { label: string; value: number }) {
  return <div><dt className="text-slate-500">{label}</dt><dd className="mt-0.5 font-semibold tabular-nums text-slate-800">{value}</dd></div>;
}
