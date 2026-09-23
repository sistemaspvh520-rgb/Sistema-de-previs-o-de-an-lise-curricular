import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  BellRing,
  CheckCircle2,
  CircleAlert,
  FileText,
  GraduationCap,
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
    returned,
    pending,
    notEnrolled,
    overdueFollowUps,
    notificationSetupPending,
    reanalysesInProgress,
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
    prisma.curricularAnalysis.count({
      where: {
        ...periodWhere,
        enrollmentStatus: { in: ["ENROLLED", "NOT_ENROLLED"] },
      },
    }),
    prisma.curricularAnalysis.count({
      where: {
        ...periodWhere,
        enrollmentStatus: "PENDING",
        status: "COMPLETED",
      },
    }),
    prisma.curricularAnalysis.count({
      where: { ...periodWhere, enrollmentStatus: "NOT_ENROLLED" },
    }),
    countStaleEnrollmentCases(periodWhere),
    prisma.user.count({
      where: {
        isActive: true,
        role: { in: ["ADMIN", "ANALYST"] },
        followUpPreferencesConfirmedAt: null,
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
  ]);
  const periodByUser = new Map(
    periodByUserRows.map((item) => [item.createdById, item._count._all]),
  );
  const completedByUser = new Map(
    completedByUserRows.map((item) => [item.createdById, item._count._all]),
  );
  /** Conversão comercial: das análises efetivamente concluídas, quantas viraram matrícula. */
  const conversion = completed ? Math.round((enrolled / completed) * 100) : 0;
  const completionRate = total ? Math.round((completed / total) * 100) : 0;
  const responseRate = completed ? Math.round((returned / completed) * 100) : 0;
  const funnel = [
    {
      label: "Concluídas",
      value: completed,
      color: "bg-cyan-500",
      href: "/analyses?status=COMPLETED",
    },
    {
      label: "Matriculadas",
      value: enrolled,
      color: "bg-emerald-500",
      href: "/analyses",
    },
    {
      label: "Em aberto",
      value: notEnrolled,
      color: "bg-amber-500",
      href: "/analyses?enrollment=NOT_ENROLLED",
    },
  ];
  const exportQuery = `${fromParam ? `?from=${encodeURIComponent(fromParam)}` : ""}${toParam ? `${fromParam ? "&" : "?"}to=${encodeURIComponent(toParam)}` : ""}`;

  return (
    <>
      <PageHeader
        eyebrow="Gestão"
        title="Gestão à vista"
        description="Acompanhe o funil de análises e a produtividade da operação em tempo real."
      />
      <section className="relative overflow-hidden rounded-2xl border border-brand-cyan/30 bg-[radial-gradient(circle_at_18%_0%,rgba(6,147,227,0.45),transparent_42%),linear-gradient(135deg,#00284d,#071426)] text-white shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-brand-cyan/15 blur-3xl" />
        <div className="relative flex flex-col gap-5 px-6 py-7 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">
              Painel executivo
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Funil de análises curriculares
            </h2>
            <p className="mt-1 text-sm text-slate-200">
              Recebimento, conclusão e conversão de matrícula em uma leitura.
            </p>
          </div>
          <div className="flex flex-col items-center gap-2 sm:flex-row">
            <DashboardRing
              value={completed}
              total={total}
              label="entregues"
              detail={`${completed} de ${total} análises concluídas`}
            />
            <Link
              href="/reports"
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-white/20"
            >
              Ver meus relatórios
            </Link>
          </div>
        </div>
      </section>
      <div className="mt-4">
        <DateRangeFilter />
      </div>

      <section
        className="mt-5 grid gap-3 rounded-2xl bg-brand-navy p-3 shadow-xl md:grid-cols-2 xl:grid-cols-4"
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
      <PoloReportCard
        className="mt-6 shadow-sm"
        description="Atendimentos por polo no período. Abra a lista ou exporte o CSV."
        rows={byPolo}
        exportQuery={exportQuery}
      />
    </>
  );
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

function JourneyCard({
  title,
  value,
  detail,
  icon: Icon,
  href,
  tone,
}: {
  title: string;
  value: number;
  detail: string;
  icon: typeof FileText;
  href: string;
  tone: "sky" | "cyan" | "emerald";
}) {
  const tones = {
    sky: "border-t-sky-400",
    cyan: "border-t-brand-cyan",
    emerald: "border-t-status-success",
  };
  return (
    <Link
      href={href}
      className="group rounded-xl focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <Card
        className={`h-full border border-white/10 border-t-4 ${tones[tone]} bg-brand-navy text-white shadow-lg transition-all duration-300 group-hover:-translate-y-0.5 group-hover:bg-brand-navy-900`}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base text-cyan-100">{title}</CardTitle>
          <Icon className="size-5" />
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold tracking-tight text-white">
            {value}
          </div>
          <p className="mt-3 text-xs text-slate-300">{detail}</p>
          <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-cyan-200">
            Ver análises <ArrowUpRight className="size-3.5" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
function KpiStrip({
  title,
  value,
  label,
  color,
  href,
}: {
  title: string;
  value: string | number;
  label: string;
  color: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-xl border-l-4 ${color} bg-card p-4 shadow-sm transition-shadow hover:shadow-md`}
    >
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </Link>
  );
}
function Index({
  label,
  value,
  note,
  percent,
}: {
  label: string;
  value: string | number;
  note: string;
  percent: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-cyan-100">{label}</span>
        <span className="text-lg font-semibold">{value}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-slate-200">{note}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
        <div
          className="h-full rounded-full bg-cyan-300 transition-all duration-700 motion-reduce:transition-none"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </div>
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
