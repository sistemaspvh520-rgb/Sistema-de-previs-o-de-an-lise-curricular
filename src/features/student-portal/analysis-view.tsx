import { SourceAttribution } from "./source-attribution";
import {
  AcademicDashboardOverview,
  AcademicPeriodJourney,
  PendingDistribution,
} from "@/features/academic-analysis/academic-dashboard-visuals";
import type { AcademicGridSnapshot } from "@/domain/academic-analysis/types";
import { estimateGraduation } from "@/domain/academic-analysis/graduation-forecast";
import { getAcademicCalendar } from "@/repositories/academic-calendar-repository";
import { zonedDateParts } from "@/lib/time";
import { readableName } from "@/lib/text";
import { ConclusionPath } from "./conclusion-path";

export async function StudentAnalysisView({
  snapshot,
  createdAt,
}: {
  snapshot: AcademicGridSnapshot;
  createdAt: Date;
}) {
  const result = snapshot.result;
  const date = zonedDateParts(createdAt);
  const analysisDate = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
  const calendar = await getAcademicCalendar(date.year + 20);
  const mappingRequired =
    snapshot.disciplines.some(
      (row) => row.inMainCurriculum && row.period === null,
    ) || !result.currentPeriodConfirmed;
  const forecast = mappingRequired
    ? null
    : estimateGraduation({
        disciplines: snapshot.disciplines,
        currentPeriod: result.currentPeriod,
        analysisDate,
        calendarTerms: calendar,
        rules: snapshot.projectionRules,
        extractionWarnings: snapshot.extractionWarnings,
        sourceDisciplineCount: snapshot.sourceDisciplineCount,
        sourceParsedDisciplineCount: snapshot.sourceParsedDisciplineCount,
      });
  const status = {
    NO_PENDING: "Sem pendências de períodos anteriores",
    CAN_ADD: "Há espaço para avançar nas pendências",
    NEAR_LIMIT: "Semestre próximo do limite",
    LIMIT_REACHED: "Semestre com a carga completa",
    MANUAL_REVIEW_REQUIRED:
      "A equipe precisa conferir alguns dados do documento",
  }[result.status];
  const completion = forecast?.completionTermMin
    ? forecast.completionTermMin === forecast.completionTermMax
      ? forecast.completionTermMin
      : `${forecast.completionTermMin} a ${forecast.completionTermMax}`
    : null;
  const officialTerms = new Set(
    calendar
      .filter((term) => term.confidence === "OFFICIAL")
      .map((term) => term.term),
  );
  // No celular as seções ficam sem moldura, usando toda a largura; a caixa aparece a partir do tablet.
  const block = "sm:rounded-2xl sm:border sm:border-slate-200 sm:bg-white sm:p-6 sm:shadow-[0_16px_40px_-36px_rgba(15,42,66,0.62)]";
  return (
    <div className="space-y-8 sm:space-y-6">
      <SourceAttribution type={snapshot.documentType} />
      <AcademicDashboardOverview
        audience="student"
        mappingRequired={mappingRequired}
        workloadProgress={
          snapshot.documentType !== "CURRICULAR_EXTRACT" &&
          snapshot.plannedWorkload &&
          snapshot.integralizedWorkload != null
            ? {
                planned: snapshot.plannedWorkload,
                integralized: snapshot.integralizedWorkload,
              }
            : undefined
        }
        disciplines={snapshot.disciplines}
        currentPeriod={result.currentPeriod}
        currentPeriodConfirmed={result.currentPeriodConfirmed}
        pending={result.previousPending}
        inProgress={result.previousAlreadyAdded}
        currentAE={result.currentPeriodAE}
        availableSlots={result.remainingExtraSlots}
        completionTerm={completion}
        needsReview={
          result.status === "MANUAL_REVIEW_REQUIRED" ||
          Boolean(forecast?.incomplete)
        }
      />
      {mappingRequired ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-semibold text-amber-900">
            Mapeamento curricular necessário
          </h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            Seu histórico foi recebido. A equipe precisa confirmar o período
            atual e a posição das disciplinas na grade antes de calcular a
            previsão de conclusão. As notas, situações e cargas horárias já
            estão disponíveis abaixo.
          </p>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white p-5 sm:p-6">
            <p className="text-xs font-semibold tracking-[0.13em] text-brand-cyan-700 uppercase">
              Entenda sua situação
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[#003B71]">{status}</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              {result.currentPeriod
                ? `Você está no ${result.currentPeriod}º período${result.previousPending ? ` e tem ${result.previousPending} disciplina(s) de períodos anteriores para cursar` : " e não tem disciplinas de períodos anteriores para cursar"}.`
                : "O período atual precisa ser conferido pela equipe acadêmica."}{" "}
              {result.previousAlreadyAdded > 0
                ? `${result.previousAlreadyAdded} delas já estão em andamento neste semestre.`
                : ""}{" "}
              {result.previousPending > 0
                ? result.remainingExtraSlots === 0
                  ? "Neste semestre a sua carga já está completa; as demais pendências entram nos próximos semestres, como mostra o caminho abaixo."
                  : `Ainda cabe(m) ${result.remainingExtraSlots} disciplina(s) a mais neste semestre. Converse com a equipe sobre oferta e matrícula.`
                : ""}
            </p>
            {result.status === "MANUAL_REVIEW_REQUIRED" && (
              <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                Alguns dados precisam de conferência. Os indicadores e a
                previsão podem ser ajustados após a revisão da equipe.
              </p>
            )}
          </section>
          {forecast && (
            <section className={block} aria-labelledby="caminho-conclusao">
              <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-[0.13em] text-brand-cyan-700 uppercase">Planejamento</p>
                  <h2 id="caminho-conclusao" className="mt-1 text-xl font-semibold tracking-tight text-[#003B71]">
                    Seu caminho até a conclusão
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                    Semestre a semestre, as disciplinas previstas até a sua
                    formatura. A estimativa depende de aprovação, oferta de
                    disciplinas e rematrícula no prazo.
                    {forecast.incomplete
                      ? " Alguns dados ainda precisam de conferência."
                      : ""}
                  </p>
                </div>
                {completion && (
                  <p className="rounded-2xl bg-[#003B71] px-4 py-2.5 text-white">
                    <span className="block text-[10px] font-semibold tracking-[0.14em] text-cyan-100 uppercase">Conclusão prevista</span>
                    <span className="text-lg font-semibold tabular-nums">{completion}</span>
                  </p>
                )}
              </div>
              <ConclusionPath steps={forecast.plan} officialTerms={officialTerms} completion={completion} />
            </section>
          )}
          <AcademicPeriodJourney
            disciplines={snapshot.disciplines}
            currentPeriod={result.currentPeriod}
          />
          <section className={block}>
            <h2 className="text-lg font-semibold text-[#003B71]">
              Pendências de períodos anteriores
            </h2>
            <p className="mt-1 mb-4 text-sm text-slate-500">
              Disciplinas de períodos que você já passou e que ainda precisam ser cursadas.
            </p>
            <PendingDistribution
              byPeriod={result.pendingByPeriod}
              totalPending={result.previousPending}
              disciplines={result.pendingDisciplines}
            />
          </section>
          {result.previousCoursesInProgress.length > 0 && (
            <section className={block}>
              <h2 className="text-lg font-semibold text-[#003B71]">
                Disciplinas anteriores em andamento
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Pendências que você já está cursando neste semestre.
              </p>
              <ul className="mt-4 grid gap-x-8 sm:grid-cols-2">
                {result.previousCoursesInProgress.map((row, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2.5 border-b border-slate-100 py-2.5 text-sm"
                  >
                    <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-cyan-500" />
                    <span className="min-w-0">
                      <span className="block font-medium text-slate-800">{readableName(row.name)}</span>
                      <span className="text-xs text-slate-500">{row.period}º período</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <details className="group rounded-2xl border border-slate-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 font-semibold text-[#003B71] [&::-webkit-details-marker]:hidden">
          <span>
            Disciplinas e resultados
            <span className="mt-0.5 block text-xs font-normal text-slate-500">Todas as disciplinas lidas do seu documento</span>
          </span>
          <span aria-hidden="true" className="text-slate-400 transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <ul className="divide-y divide-slate-100 border-t border-slate-100 md:hidden">
          {snapshot.disciplines.map((row, i) => (
            <li key={i} className="px-5 py-3 text-sm">
              <p className="font-medium text-slate-800">{readableName(row.name)}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {[row.period ? `${row.period}º período` : "Período a confirmar", row.originalStatus, gradeOf(row), row.workload ? `${row.workload}h` : null].filter(Boolean).join(" · ")}
              </p>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto border-t border-slate-100 px-5 pb-5 md:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {[
                  "Disciplina",
                  "Período",
                  "Semestre letivo",
                  "Situação",
                  "Nota",
                  "Carga",
                ].map((label) => (
                  <th key={label} className="px-2 py-3 text-xs font-medium text-slate-500">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.disciplines.map((row, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="min-w-56 px-2 py-2.5 font-medium text-slate-800">
                    {readableName(row.name)}
                    {row.code && <span className="ml-1.5 text-xs font-normal text-slate-400">{row.code}</span>}
                  </td>
                  <td className="px-2 py-2.5">
                    {row.period ? `${row.period}º` : "A confirmar"}
                  </td>
                  <td className="px-2 py-2.5">{row.academicTerm ?? "—"}</td>
                  <td className="px-2 py-2.5">{row.originalStatus}</td>
                  <td className="px-2 py-2.5">{gradeOf(row) ?? "—"}</td>
                  <td className="px-2 py-2.5">{row.workload ?? "—"}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function gradeOf(row: AcademicGridSnapshot["disciplines"][number]): string | null {
  if (row.grade != null) return String(row.grade);
  return /^\d+(?:[.,]\d+)?$/.test(row.normalizedStatus) ? row.normalizedStatus : null;
}
