import { SourceAttribution } from "./source-attribution";
import {
  AcademicDashboardOverview,
  AcademicPeriodJourney,
  AcademicForecastRoadmap,
  PendingDistribution,
} from "@/features/academic-analysis/academic-dashboard-visuals";
import type { AcademicGridSnapshot } from "@/domain/academic-analysis/types";
import { estimateGraduation } from "@/domain/academic-analysis/graduation-forecast";
import { getAcademicCalendar } from "@/repositories/academic-calendar-repository";
import { zonedDateParts } from "@/lib/time";

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
    LIMIT_REACHED: "Vagas adicionais ocupadas",
    MANUAL_REVIEW_REQUIRED:
      "A equipe precisa conferir alguns dados do documento",
  }[result.status];
  const completion = forecast?.completionTermMin
    ? forecast.completionTermMin === forecast.completionTermMax
      ? forecast.completionTermMin
      : `${forecast.completionTermMin} a ${forecast.completionTermMax}`
    : null;
  return (
    <div className="space-y-6">
      <SourceAttribution type={snapshot.documentType} />
      <AcademicDashboardOverview
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
            atual e a posição das disciplinas na grade antes de calcular vagas e
            previsão de conclusão. As notas, situações e cargas horárias já
            estão disponíveis abaixo.
          </p>
        </section>
      ) : (
        <>
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-100 bg-sky-50 px-5 py-4">
            <div>
              <p className="text-xs font-medium text-slate-500">
                Situação do semestre
              </p>
              <h2 className="mt-1 font-semibold text-[#003B71]">{status}</h2>
            </div>
            <p className="text-sm text-slate-600">
              {result.usedExtraSlots} de {result.extraAllowance} vagas
              adicionais ocupadas
            </p>
          </section>
          <AcademicPeriodJourney
            disciplines={snapshot.disciplines}
            currentPeriod={result.currentPeriod}
          />
          <section className="rounded-2xl border bg-white p-5 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-[#003B71]">
              Pendências de períodos anteriores
            </h2>
            <PendingDistribution
              byPeriod={result.pendingByPeriod}
              totalPending={result.previousPending}
              disciplines={result.pendingDisciplines}
            />
          </section>
          {result.previousCoursesInProgress.length > 0 && (
            <section className="rounded-2xl border bg-white p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-[#003B71]">
                Disciplinas anteriores em andamento
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Estas disciplinas já estão ocupando vagas neste semestre.
              </p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {result.previousCoursesInProgress.map((row, index) => (
                  <li
                    key={index}
                    className="rounded-xl border border-cyan-100 bg-cyan-50/50 p-4 text-sm"
                  >
                    <p className="font-medium">{row.name}</p>
                    <p className="mt-1 text-slate-500">
                      {row.period}º período · {row.originalStatus}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="rounded-2xl border bg-white p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-[#003B71]">
              Entenda sua situação
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              {result.currentPeriod
                ? `Você está no ${result.currentPeriod}º período e possui ${result.previousPending} disciplina(s) de períodos anteriores ainda pendente(s).`
                : "O período atual precisa ser conferido pela equipe acadêmica."}{" "}
              {result.previousAlreadyAdded > 0
                ? `${result.previousAlreadyAdded} disciplina(s) anterior(es) já estão em andamento.`
                : ""}{" "}
              {result.remainingExtraSlots === 0
                ? "Neste semestre, as vagas adicionais já estão ocupadas."
                : `O cálculo do semestre indica ${result.remainingExtraSlots} vaga(s) adicional(is). Consulte a equipe sobre oferta e matrícula.`}
            </p>
            {result.status === "MANUAL_REVIEW_REQUIRED" && (
              <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                Alguns dados precisam de conferência. Os indicadores e a
                previsão podem ser ajustados após a revisão da equipe.
              </p>
            )}
          </section>
        </>
      )}
      <details className="rounded-2xl border bg-white p-5">
        <summary className="cursor-pointer font-semibold text-[#003B71]">
          Disciplinas e resultados
        </summary>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {[
                  "Disciplina",
                  "Período curricular",
                  "Semestre letivo",
                  "Situação",
                  "Nota",
                  "Carga",
                ].map((label) => (
                  <th key={label} className="p-2 text-xs text-slate-500">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.disciplines.map((row, i) => (
                <tr key={i} className="border-t">
                  <td className="min-w-48 p-2">
                    {row.code} · {row.name}
                  </td>
                  <td className="p-2">
                    {row.period ? `${row.period}º` : "A confirmar"}
                  </td>
                  <td className="p-2">{row.academicTerm ?? "—"}</td>
                  <td className="p-2">{row.originalStatus}</td>
                  <td className="p-2">
                    {row.grade ??
                      (/^\d+(?:[.,]\d+)?$/.test(row.normalizedStatus)
                        ? row.normalizedStatus
                        : "—")}
                  </td>
                  <td className="p-2">{row.workload ?? "—"}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {forecast && (
        <section className="rounded-2xl border bg-white p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-[#003B71]">
            Seu caminho até a conclusão
          </h2>
          <p className="mb-5 mt-2 text-sm leading-6 text-slate-600">
            Previsão: {completion ?? "prazo ainda não identificado"}. A
            estimativa depende de aprovação, oferta de disciplinas e rematrícula
            no prazo.
            {forecast.incomplete
              ? " Alguns dados ainda precisam de conferência."
              : ""}
          </p>
          <AcademicForecastRoadmap
            steps={forecast.plan}
            officialTerms={
              new Set(
                calendar
                  .filter((term) => term.confidence === "OFFICIAL")
                  .map((term) => term.term),
              )
            }
          />
        </section>
      )}
    </div>
  );
}
