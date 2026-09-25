import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  BellRing,
  Clock3,
  Users,
} from "lucide-react";
import { requirePagePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/time";
import { startOfCurrentMonth } from "@/lib/time";
import { countAnalysesByPolo } from "@/repositories/analysis-repository";
import { PoloReportCard } from "@/features/analyses/components/polo-report";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { DashboardRing } from "@/components/dashboard/dashboard-ring";
import { countStaleEnrollmentCases } from "@/services/follow-up/management-alerts";
import { getCommercialInsights } from "@/repositories/commercial-repository";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Gestão" };
export const dynamic = "force-dynamic";

export default async function ManagementPage({
  searchParams,
}: PageProps<"/management">) {
  await requirePagePermission("audit:read");
  const params = await searchParams;
  const monthStart = startOfCurrentMonth();
  const fromParam = typeof params.from === "string" ? params.from : undefined;
  const toParam = typeof params.to === "string" ? params.to : undefined;
  const from =
    fromParam && !Number.isNaN(Date.parse(fromParam))
      ? new Date(`${fromParam}T00:00:00-04:00`)
      : undefined;
  const to =
    toParam && !Number.isNaN(Date.parse(toParam))
      ? new Date(`${toParam}T23:59:59.999-04:00`)
      : undefined;
  const createdAt: Prisma.DateTimeFilter | undefined =
    from || to
      ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }
      : undefined;
  const periodWhere: Prisma.CurricularAnalysisWhereInput = createdAt
    ? { createdAt }
    : { createdAt: { gte: monthStart } };

  const [
    activeUsers,
    users,
    periodByUserRows,
    completedByUserRows,
    byPolo,
    total,
    completed,
    enrolled,
    overdueFollowUps,
    awaitingInitialReturn,
    reanalysesInProgress,
    commercialInsights,
  ] = await Promise.all([
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: [
        { lastActiveAt: { sort: "desc", nulls: "last" } },
        { name: "asc" },
      ],
      take: 12,
      select: {
        id: true,
        name: true,
        role: true,
        lastActiveAt: true,
        analyses: {
          select: { courseName: true, studentName: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),
    prisma.curricularAnalysis.groupBy({
      by: ["createdById"],
      where: periodWhere,
      _count: { _all: true },
    }),
    prisma.curricularAnalysis.groupBy({
      by: ["createdById"],
      where: { ...periodWhere, status: "COMPLETED" },
      _count: { _all: true },
    }),
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
    getCommercialInsights({
      from: from ?? (to ? undefined : monthStart),
      to,
    }),
  ]);
  const periodByUser = new Map(
    periodByUserRows.map((item) => [item.createdById, item._count._all]),
  );
  const completedByUser = new Map(
    completedByUserRows.map((item) => [item.createdById, item._count._all]),
  );
  /** Conversão comercial: das análises efetivamente concluídas, quantas viraram matrícula. */
  const conversion = completed ? Math.round((enrolled / completed) * 100) : 0;
  const exportQuery = `${fromParam ? `?from=${encodeURIComponent(fromParam)}` : ""}${toParam ? `${fromParam ? "&" : "?"}to=${encodeURIComponent(toParam)}` : ""}`;

  return (
    <>
      <PageHeader
        eyebrow="Gestão"
        title="Gestão à vista"
        description="Acompanhe conversão, pendências e a atuação da equipe no período."
      />
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
        <DateRangeFilter />
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

      <section id="atividade-equipe" className="mt-6">
        <Card className="overflow-hidden border-brand-cyan/25 bg-brand-cyan-50/35 shadow-md">
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="size-4 text-brand-navy" /> Equipe
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Produção e último acesso por responsável.
              </p>
            </div>
            <span className="rounded-full bg-brand-navy px-2.5 py-1 text-xs font-semibold text-white">
              {activeUsers} ativos
            </span>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {users.map((user) => {
              const latest = user.analyses[0];
              return (
                <Link
                  key={user.id}
                  href={`/analyses?user=${user.id}`}
                  className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-brand-cyan-500 hover:bg-brand-cyan-50/40"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-navy text-xs font-semibold text-white">
                    {initials(user.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {user.name}
                    </div>
                    <div className="mt-0.5 flex gap-2 text-xs text-muted-foreground">
                      <span>{periodByUser.get(user.id) ?? 0} no período</span>
                      <span className="text-status-success">
                        {completedByUser.get(user.id) ?? 0} prontas
                      </span>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-muted-foreground">
                      Último acesso:{" "}
                      {user.lastActiveAt
                        ? formatDateTime(user.lastActiveAt)
                        : "nunca acessou"}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {latest
                        ? `Última análise: ${latest.studentName ?? latest.courseName ?? "—"}`
                        : "Sem análises"}
                    </div>
                  </div>
                  <ArrowUpRight className="size-4 text-muted-foreground" />
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </section>
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

function initials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "—"
  );
}
