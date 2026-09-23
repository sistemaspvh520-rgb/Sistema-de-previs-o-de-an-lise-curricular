import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  FileText,
  UserRoundX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalysisStatusBadge } from "@/components/shared/status-badge";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { formatDateTime } from "@/lib/utils";
import { startOfCurrentMonth } from "@/lib/time";
import { countAnalysesByPolo } from "@/repositories/analysis-repository";
import { PoloReportCard } from "@/features/analyses/components/polo-report";
import { countDueFollowUps } from "@/services/follow-up/follow-up";
import { countStaleEnrollmentCases } from "@/services/follow-up/management-alerts";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Meus relatórios" };
export const dynamic = "force-dynamic";

function dateRange(params: {
  from?: string | string[];
  to?: string | string[];
}): Prisma.DateTimeFilter | undefined {
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
  return from || to
    ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }
    : undefined;
}

export default async function ReportsPage({
  searchParams,
}: PageProps<"/reports">) {
  const user = await requireUser();
  const params = await searchParams;
  const createdAt = dateRange(params);
  const base: Prisma.CurricularAnalysisWhereInput = {
    createdById: user.id,
    ...(createdAt ? { createdAt } : {}),
  };
  const monthStart = startOfCurrentMonth();
  const [
    inPeriod,
    month,
    completed,
    enrolled,
    pendingEnrollment,
    reanalysesInProgress,
    staleEnrollment,
    courseOutcomes,
    recent,
    followUps,
    byPolo,
  ] = await Promise.all([
    prisma.curricularAnalysis.count({ where: base }),
    prisma.curricularAnalysis.count({
      where: { createdById: user.id, createdAt: { gte: monthStart } },
    }),
    prisma.curricularAnalysis.count({
      where: { ...base, status: "COMPLETED" },
    }),
    prisma.curricularAnalysis.count({
      where: { ...base, enrollmentStatus: "ENROLLED" },
    }),
    countDueFollowUps(user.id),
    prisma.curricularAnalysis.count({
      where: {
        ...base,
        status: "COMPLETED",
        enrollmentStatus: "PENDING",
        enrollmentReanalysisAt: { not: null },
      },
    }),
    countStaleEnrollmentCases(base),
    prisma.curricularAnalysis.groupBy({
      by: ["courseName", "enrollmentStatus"],
      where: { ...base, courseName: { not: null }, status: "COMPLETED" },
      _count: { _all: true },
    }),
    prisma.curricularAnalysis.findMany({
      where: base,
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        courseName: true,
        studentName: true,
        poloCode: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.curricularAnalysis.findMany({
      where: { ...base, enrollmentStatus: "NOT_ENROLLED" },
      orderBy: { enrollmentUpdatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        studentName: true,
        courseName: true,
        poloName: true,
        enrollmentNote: true,
        enrollmentUpdatedAt: true,
      },
    }),
    countAnalysesByPolo({ createdById: user.id, monthStart }),
  ]);
  const conversion = completed ? Math.round((enrolled / completed) * 100) : 0;
  const conversionByCourse = Object.values(
    courseOutcomes.reduce<
      Record<string, { name: string; completed: number; enrolled: number }>
    >((acc, row) => {
      if (!row.courseName) return acc;
      const current = acc[row.courseName] ?? {
        name: row.courseName,
        completed: 0,
        enrolled: 0,
      };
      current.completed += row._count._all;
      if (row.enrollmentStatus === "ENROLLED")
        current.enrolled += row._count._all;
      acc[row.courseName] = current;
      return acc;
    }, {}),
  )
    .filter((course) => course.completed > 0)
    .sort((a, b) => b.completed - a.completed)
    .slice(0, 5);
  const cards = [
    {
      label: "Entradas",
      value: inPeriod,
      icon: FileText,
      hint: "Recebidas no período",
      href: "/analyses",
      tone: "cyan",
    },
    {
      label: "Matrículas",
      value: `${enrolled} · ${conversion}%`,
      icon: CalendarDays,
      hint: "Conversão das entradas",
      href: "/analyses",
      tone: "emerald",
    },
    {
      label: "Em reanálise",
      value: reanalysesInProgress,
      icon: UserRoundX,
      hint: "Nova confirmação em andamento",
      href: "/analyses?followUp=due",
      alert: false,
      tone: "gold",
    },
    {
      label: "+2 dias úteis",
      value: staleEnrollment,
      icon: AlertTriangle,
      hint: "Sem matrícula, inclusive reanálises",
      href: "/analyses?followUp=due",
      alert: staleEnrollment > 0,
      tone: "danger",
    },
  ];
  return (
    <>
      <div className="-mt-2">
        <PageHeader
          eyebrow="Acompanhamento pessoal"
          title="Meus relatórios"
          description="Acompanhe volume, conversão e oportunidades de retorno em um único lugar."
        />
      </div>
      <section className="relative overflow-hidden rounded-2xl border border-brand-cyan/30 bg-[linear-gradient(110deg,#00284d,#071426)] px-5 py-4 text-white shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">
              Painel pessoal
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">
              Carteira comercial do período
            </h2>
            <p className="mt-1 text-sm text-slate-200">
              Entradas, matrículas, reanálises e casos que precisam de ação.
            </p>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
            {inPeriod} entrada(s)
          </span>
        </div>
      </section>
      <div className="mt-3">
        <DateRangeFilter />
      </div>
      <section
        className="mt-3 rounded-2xl border border-brand-navy bg-brand-navy p-3 shadow-xl sm:p-4"
        aria-label="Resumo operacional"
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.label}
                href={card.href}
                className="group rounded-xl focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <Card
                  className={cn(
                    "h-full border border-white/10 bg-white/7 text-white shadow-lg transition-all duration-300 group-hover:-translate-y-0.5 group-hover:bg-white/12",
                    card.tone === "cyan" && "border-t-4 border-t-brand-cyan",
                    card.tone === "emerald" &&
                      "border-t-4 border-t-status-success",
                    card.tone === "gold" && "border-t-4 border-t-brand-gold",
                    card.tone === "danger" &&
                      "border-t-4 border-t-status-danger",
                  )}
                >
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div className="space-y-1">
                      <CardTitle className="text-sm font-medium text-cyan-100">
                        {card.label}
                      </CardTitle>
                      {card.alert && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-status-warning px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          <AlertTriangle className="size-3" /> Ação necessária
                        </span>
                      )}
                    </div>
                    <Icon
                      className={cn(
                        "size-4",
                        card.alert ? "text-status-warning" : "text-brand-cyan",
                      )}
                    />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{card.value}</div>
                    <p className="mt-1 text-xs text-slate-300">{card.hint}</p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
      {pendingEnrollment > 0 && (
        <Link
          href="/analyses?followUp=due"
          className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-status-warning/40 bg-[linear-gradient(100deg,#fff8e8,#fffdf8)] px-4 py-3 text-sm shadow-sm transition-all hover:-translate-y-px hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <span className="flex items-center gap-2 font-medium text-foreground">
            <AlertTriangle className="size-4 text-status-warning" />
            {pendingEnrollment === 1
              ? "Há 1 retorno aguardando confirmação obrigatória."
              : `Há ${pendingEnrollment} retornos aguardando confirmação obrigatória.`}
          </span>
          <span className="shrink-0 font-semibold text-status-warning">
            Resolver agora →
          </span>
        </Link>
      )}
      <div className="mt-6 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,45,75,0.08)] [--card-spacing:0px]">
          <CardHeader className="border-b border-sky-100 bg-[linear-gradient(120deg,#003b71,#075a9c_58%,#0a8fd4)] px-5 py-4">
            <CardTitle className="text-base text-white">
              Últimas análises
            </CardTitle>
            <p className="text-xs text-cyan-100">
              Acesse rapidamente os atendimentos mais recentes.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {recent.length === 0 ? (
              <p className="px-6 py-6 text-sm text-muted-foreground">
                Você ainda não iniciou nenhuma análise.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recent.map((analysis) => (
                  <li key={analysis.id}>
                    <Link
                      href={`/analyses/${analysis.id}`}
                      className="group flex items-center gap-3 border-l-4 border-transparent px-5 py-3.5 transition-all hover:border-brand-cyan hover:bg-sky-50/75"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-800">
                          {analysis.studentName ?? "Aluno não identificado"}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {analysis.courseName ?? "Curso não identificado"}
                          {analysis.poloCode
                            ? ` · Polo ${analysis.poloCode}`
                            : ""}{" "}
                          · {formatDateTime(analysis.createdAt)}
                        </div>
                      </div>
                      <AnalysisStatusBadge status={analysis.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-emerald-200 bg-white shadow-[0_10px_30px_rgba(15,75,55,0.08)] [--card-spacing:0px]">
          <CardHeader className="border-b border-emerald-100 bg-[linear-gradient(120deg,#087c4b,#13a56b_62%,#25bb87)] px-5 py-4">
            <CardTitle className="text-base text-white">
              Conversão por curso
            </CardTitle>
            <p className="text-xs text-white/80">
              Matrículas confirmadas entre as análises concluídas no período.
            </p>
          </CardHeader>
          <CardContent className="p-4">
            {conversionByCourse.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">
                Ainda não há resultados de matrícula suficientes para comparar
                cursos.
              </p>
            ) : (
              <div className="space-y-3">
                {conversionByCourse.map((course) => {
                  const rate = Math.round(
                    (course.enrolled / course.completed) * 100,
                  );
                  return (
                    <div
                      key={course.name}
                      className="rounded-xl border border-emerald-100 bg-emerald-50/55 p-3"
                    >
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="truncate font-semibold text-slate-800">
                          {course.name}
                        </span>
                        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-emerald-700 shadow-sm">
                          {course.enrolled}/{course.completed} · {rate}%
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-100">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,#0b9b60,#38d69a)] transition-all duration-700 motion-reduce:transition-none"
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Card className="mt-5 overflow-hidden border-amber-200 bg-white shadow-[0_10px_30px_rgba(120,75,10,0.07)] [--card-spacing:0px]">
        <CardHeader className="border-b border-amber-100 bg-[linear-gradient(110deg,#fff4d8,#fffdf8)] px-5 py-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRoundX className="size-4 text-status-warning" /> Oportunidades
            de follow-up
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Análises marcadas como não matriculadas para novo contato comercial.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {followUps.length === 0 ? (
            <p className="px-6 py-6 text-sm text-muted-foreground">
              Nenhuma oportunidade de follow-up no período selecionado.
            </p>
          ) : (
            <div className="divide-y divide-amber-100">
              {followUps.map((analysis) => (
                <Link
                  key={analysis.id}
                  href={`/analyses/${analysis.id}`}
                  className="grid gap-1 border-l-4 border-transparent px-5 py-3.5 text-sm transition-all hover:border-status-warning hover:bg-amber-50/70 sm:grid-cols-[1fr_1fr_auto] sm:items-center sm:gap-4"
                >
                  <div className="font-medium text-slate-800">
                    {analysis.studentName ?? "Aluno não identificado"}
                  </div>
                  <div className="text-muted-foreground">
                    {analysis.courseName ?? "Curso não identificado"}
                    {analysis.poloName ? ` · ${analysis.poloName}` : ""}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {analysis.enrollmentUpdatedAt
                      ? formatDateTime(analysis.enrollmentUpdatedAt)
                      : "Sem data"}
                  </div>
                  {analysis.enrollmentNote && (
                    <div className="sm:col-span-3 text-xs text-muted-foreground">
                      {analysis.enrollmentNote}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <PoloReportCard
        className="mt-5 overflow-hidden border-sky-200 bg-white shadow-[0_10px_30px_rgba(15,45,75,0.07)] [--card-spacing:0px]"
        title="Minhas análises por polo"
        description="Clique no polo para abrir a lista ou exporte o relatório em CSV."
        rows={byPolo}
        exportQuery={`${typeof params.from === "string" ? `?from=${encodeURIComponent(params.from)}` : ""}${typeof params.to === "string" ? `${typeof params.from === "string" ? "&" : "?"}to=${encodeURIComponent(params.to)}` : ""}`}
      />
    </>
  );
}
