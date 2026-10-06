import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  BellRing,
  Clock3,
  Users,
} from "lucide-react";
import { requirePagePermission } from "@/lib/session";
import { getTeamInsights } from "@/services/student-portal/team-insights";
import { TutorScoreboard } from "@/features/team/tutor-scoreboard";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { startOfCurrentMonth } from "@/lib/time";
import { resolveUsagePeriod } from "@/domain/usage/metrics";
import { getTeamPulse } from "@/services/usage/team-usage";
import { countAnalysesByPolo } from "@/repositories/analysis-repository";
import { PoloReportCard } from "@/features/analyses/components/polo-report";
import { PeriodFilter } from "@/features/usage/period-filter";
import { DashboardRing } from "@/components/dashboard/dashboard-ring";
import { countStaleEnrollmentCases } from "@/services/follow-up/management-alerts";
import { getCommercialInsights } from "@/repositories/commercial-repository";
import { ManagementTabs } from "@/features/usage/management-tabs";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Gestão" };
export const dynamic = "force-dynamic";

export default async function ManagementPage({
  searchParams,
}: PageProps<"/management">) {
  await requirePagePermission("audit:read");
  const params = await searchParams;
  const now = new Date();
  const monthStart = startOfCurrentMonth(now);
  // Mesmo filtro de período das demais telas de gestão; o padrão é "Este mês".
  const period = resolveUsagePeriod({ period: typeof params.period === "string" ? params.period : undefined, from: typeof params.from === "string" ? params.from : undefined, to: typeof params.to === "string" ? params.to : undefined }, now, "month");
  const periodWhere: Prisma.CurricularAnalysisWhereInput = { createdAt: { gte: period.from, lte: period.to } };

  const [
    pulse,
    byPolo,
    total,
    completed,
    enrolled,
    overdueFollowUps,
    awaitingInitialReturn,
    reanalysesInProgress,
    commercialInsights,
    teamInsights,
  ] = await Promise.all([
    getTeamPulse(now),
    countAnalysesByPolo({ monthStart }),
    prisma.curricularAnalysis.count({ where: periodWhere }),
    prisma.curricularAnalysis.count({
      where: { ...periodWhere, status: "COMPLETED" },
    }),
    prisma.curricularAnalysis.count({
      where: { ...periodWhere, enrollmentStatus: "ENROLLED" },
    }),
    countStaleEnrollmentCases(periodWhere),
    prisma.curricularAnalysis.count({
      where: {
        ...periodWhere,
        status: "COMPLETED",
        enrollmentStatus: "PENDING",
        enrollmentReanalysisAt: null,
      },
    }),
    prisma.curricularAnalysis.count({
      where: {
        ...periodWhere,
        status: "COMPLETED",
        enrollmentStatus: "PENDING",
        enrollmentReanalysisAt: { not: null },
      },
    }),
    getCommercialInsights({ from: period.from, to: period.to }),
    getTeamInsights({}),
  ]);
  /** Conversão comercial: das análises efetivamente concluídas, quantas viraram matrícula. */
  const conversion = completed ? Math.round((enrolled / completed) * 100) : 0;
  const exportQuery = `?from=${period.fromDay}&to=${period.toDay}`;

  return (
    <>
      <PageHeader
        eyebrow="Gestão"
        title="Resultados"
        description="Conversão, pendências e operação comercial no período. O uso do sistema pela equipe fica em Uso da equipe."
      />
      <ManagementTabs active="/management" />
      <section className="relative overflow-hidden rounded-2xl border border-brand-cyan/30 bg-[radial-gradient(circle_at_18%_0%,rgba(6,147,227,0.45),transparent_42%),linear-gradient(135deg,#00284d,#071426)] text-white shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-brand-cyan/15 blur-3xl" />
        <div className="relative flex flex-col gap-5 px-6 py-7 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">
              Painel executivo
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Saúde comercial da operação
            </h2>
            <p className="mt-1 text-sm text-slate-200">
              Matrículas, retornos pendentes e riscos que precisam de ação.
            </p>
          </div>
          <div className="flex flex-col items-center gap-2 sm:flex-row">
            <DashboardRing
              value={enrolled}
              total={completed}
              label="matrículas"
              detail={`${enrolled} matrícula(s) em ${completed} análises concluídas`}
            />
            <Link
              href="/analyses?enrollment=ENROLLED"
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-white/20"
            >
              Ver matrículas
            </Link>
          </div>
        </div>
      </section>
      <div className="mt-4">
        <PeriodFilter defaultPeriod="month" period={period.key} fromDay={period.fromDay} toDay={period.toDay} />
      </div>

      <section
        className="mt-5 grid gap-3 rounded-2xl bg-brand-navy p-3 shadow-xl md:grid-cols-2 xl:grid-cols-5"
        aria-label="Resumo operacional"
      >
        <ManagementMetric
          label="Entradas"
          value={total}
          detail="Recebidas no período"
          href="/analyses"
          tone="cyan"
        />
        <ManagementMetric
          label="Matrículas"
          value={`${enrolled} · ${conversion}%`}
          detail="Conversão das entradas"
          href="/analyses"
          tone="success"
        />
        <ManagementMetric
          label="Aguardando retorno"
          value={awaitingInitialReturn}
          detail="Resultado ainda não confirmado"
          href="/analyses?followUp=due"
          tone="cyan"
        />
        <ManagementMetric
          label="Em reanálise"
          value={reanalysesInProgress}
          detail="Aguardando novo resultado"
          href="/analyses?reanalysis=active"
          tone="gold"
        />
        <ManagementMetric
          label="Críticas +2 dias úteis"
          value={overdueFollowUps}
          detail="Sem matrícula, inclusive reanálise"
          href="/analyses?followUp=due"
          tone="danger"
          alert={overdueFollowUps > 0}
        />
      </section>

      <Link
        href="/management/team-usage"
        className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-cyan/25 bg-brand-cyan-50/35 px-4 py-3 shadow-sm transition-colors hover:border-brand-cyan-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-3 text-sm">
          <span className="flex size-9 items-center justify-center rounded-full bg-brand-navy text-white"><Users className="size-4" /></span>
          <span>
            <strong className="tabular-nums">{pulse.online}</strong> online agora · <strong className={pulse.idle + pulse.never ? "tabular-nums text-status-danger" : "tabular-nums"}>{pulse.idle + pulse.never}</strong> {pulse.idle + pulse.never === 1 ? "pessoa parada" : "pessoas paradas"} (14+ dias ou nunca acessaram)
            <span className="block text-xs text-muted-foreground">de {pulse.accounts} contas da equipe</span>
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-cyan-700">Ver uso da equipe <ArrowUpRight className="size-4" /></span>
      </Link>
      <div className="mt-6">
        <TutorScoreboard tutors={teamInsights.tutors} />
      </div>
      <section className="mt-6 grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="border-brand-cyan/25 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock3 className="size-4 text-brand-cyan" /> Eficiência do processo
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Tempo entre o envio e a conclusão da análise.</p>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-brand-navy">{formatProcessingDuration(commercialInsights.averageProcessingMinutes)}</p>
            <p className="mt-1 text-sm text-muted-foreground">média no período selecionado</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden rounded-2xl border border-amber-200/80 bg-white shadow-[0_12px_34px_-28px_rgba(120,53,15,0.48)] [--card-spacing:0px]">
          <CardHeader className="border-b border-amber-100 bg-gradient-to-r from-amber-50 via-white to-white px-5 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">Acompanhamento comercial</p>
                <CardTitle className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Oportunidades prioritárias</CardTitle>
                <p className="mt-1.5 max-w-2xl text-sm leading-5 text-slate-600">Análises concluídas, sem matrícula confirmada e com pelo menos 50% da grade aproveitada.</p>
              </div>
              <span className="shrink-0 rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-sm">{commercialInsights.highValueLeads.length} {commercialInsights.highValueLeads.length === 1 ? "oportunidade" : "oportunidades"}</span>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            {commercialInsights.highValueLeads.length ? (
              <ul className="grid gap-3 sm:grid-cols-2">
                {commercialInsights.highValueLeads.slice(0, 6).map((lead) => (
                  <li key={lead.id} className="min-w-0">
                    <Link href={`/analyses/${lead.id}`} className="flex h-full items-center justify-between gap-3 rounded-xl border border-slate-200 border-l-4 border-l-amber-400 bg-white px-4 py-3.5 shadow-sm transition hover:border-amber-300 hover:bg-amber-50/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
                      <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-900">{lead.studentName ?? "Candidato não identificado"}</span><span className="mt-1 block truncate text-xs text-slate-600">{lead.courseName ?? "Curso não identificado"}{lead.poloName ? ` · ${lead.poloName}` : ""}</span><span className="mt-2 block text-[11px] font-medium uppercase tracking-wide text-amber-800">Análise concluída · matrícula pendente</span></span>
                      <span className="shrink-0 rounded-lg bg-amber-100 px-2.5 py-2 text-center text-xs font-bold leading-tight text-amber-900"><span className="block text-base">{lead.exemptedPercentage}%</span><span className="block">aproveitado</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <div className="flex items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-4 sm:px-5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-lg font-bold text-amber-800">0</span>
              <div><p className="text-sm font-semibold text-slate-800">Nenhuma oportunidade prioritária no período selecionado</p><p className="mt-1 text-xs leading-5 text-slate-600">Análises que atenderem a esses critérios aparecerão automaticamente aqui.</p></div>
            </div>}
          </CardContent>
        </Card>
      </section>
      <PoloReportCard
        className="mt-2"
        description="Atendimentos por polo no período. Abra a lista ou exporte o CSV."
        rows={byPolo}
        exportQuery={exportQuery}
        variant="flat"
      />
    </>
  );
}

function formatProcessingDuration(minutes: number | null) {
  if (minutes === null) return "—";
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}min`
    : `${minutes} min`;
}

function ManagementMetric({
  label,
  value,
  detail,
  href,
  tone,
  alert = false,
}: {
  label: string;
  value: string | number;
  detail: string;
  href: string;
  tone: "cyan" | "success" | "gold" | "danger";
  alert?: boolean;
}) {
  const tones = {
    cyan: "border-t-brand-cyan text-brand-cyan",
    success: "border-t-status-success text-status-success",
    gold: "border-t-brand-gold text-brand-gold",
    danger: "border-t-status-danger text-status-danger",
  };
  return (
    <Link
      href={href}
      className="group rounded-xl focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <Card
        className={`h-full border border-white/10 border-t-4 ${tones[tone]} bg-white/7 text-white shadow-lg transition-all duration-300 group-hover:-translate-y-0.5 group-hover:bg-white/12`}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-semibold text-cyan-100">
            {label}
          </CardTitle>
          {alert && (
            <BellRing className="size-4 animate-pulse text-status-danger motion-reduce:animate-none" />
          )}
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-white">{value}</div>
          <p className="mt-1 text-xs text-slate-300">{detail}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
