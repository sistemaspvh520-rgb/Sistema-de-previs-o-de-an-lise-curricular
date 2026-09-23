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
      label: createdAt ? "No período" : "Neste mês",
      value: createdAt ? inPeriod : month,
      icon: FileText,
      hint: "Análises iniciadas",
      href: "/analyses",
    },
    {
      label: "Prontas",
      value: completed,
      icon: CheckCircle2,
      hint: "Resultados concluídos",
      href: "/analyses?status=COMPLETED",
    },
    {
      label: "Retornos a tratar",
      value: pendingEnrollment,
      icon: UserRoundX,
      hint: "Com retorno vencido e pendente",
      href: "/analyses?followUp=due",
      alert: pendingEnrollment > 0,
    },
    {
      label: "Matrículas",
      value: `${enrolled} · ${conversion}%`,
      icon: CalendarDays,
      hint: "Confirmadas entre as análises prontas",
      href: "/analyses",
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow="Acompanhamento pessoal"
        title="Meus relatórios"
        description="Acompanhe volume, conversão e oportunidades de retorno em um único lugar."
      />
      <DateRangeFilter />
      <section
        className="mt-4 rounded-2xl border border-brand-navy/10 bg-gradient-to-br from-brand-navy-50 via-brand-bg to-brand-cyan-50/50 p-3 sm:p-4"
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
                    "h-full border-l-4 shadow-sm transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-md",
                    card.alert
                      ? "border-l-status-warning border-status-warning/50 bg-status-warning-bg"
                      : "border-l-brand-cyan-700 bg-card",
                  )}
                >
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div className="space-y-1">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
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
                        card.alert
                          ? "text-status-warning"
                          : "text-brand-cyan-700",
                      )}
                    />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">{card.value}</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {card.hint}
                    </p>
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
          className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-status-warning/40 bg-status-warning-bg px-4 py-3 text-sm transition-colors hover:bg-status-warning-bg/70 focus:outline-none focus:ring-2 focus:ring-ring"
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
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-brand-navy/10 bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Últimas análises</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recent.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                Você ainda não iniciou nenhuma análise.
              </p>
            ) : (
              <ul className="divide-y">
                {recent.map((analysis) => (
                  <li key={analysis.id}>
                    <Link
                      href={`/analyses/${analysis.id}`}
                      className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/60"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
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
        <Card className="border-brand-navy/10 bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Conversão por curso</CardTitle>
            <p className="text-xs text-muted-foreground">
              Matrículas confirmadas entre as análises concluídas no período.
            </p>
          </CardHeader>
          <CardContent>
            {conversionByCourse.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ainda não há resultados de matrícula suficientes para comparar
                cursos.
              </p>
            ) : (
              <div className="space-y-4">
                {conversionByCourse.map((course) => {
                  const rate = Math.round(
                    (course.enrolled / course.completed) * 100,
                  );
                  return (
                    <div key={course.name}>
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="truncate font-medium">
                          {course.name}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {course.enrolled}/{course.completed} · {rate}%
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-status-success"
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
      <Card className="mt-6 overflow-hidden border-status-warning/25 bg-status-warning-bg/35 shadow-sm">
        <CardHeader>
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
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Nenhuma oportunidade de follow-up no período selecionado.
            </p>
          ) : (
            <div className="divide-y">
              {followUps.map((analysis) => (
                <Link
                  key={analysis.id}
                  href={`/analyses/${analysis.id}`}
                  className="grid gap-1 px-6 py-3 text-sm transition-colors hover:bg-muted/60 sm:grid-cols-[1fr_1fr_auto] sm:items-center sm:gap-4"
                >
                  <div className="font-medium">
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
        className="mt-6 shadow-sm"
        title="Minhas análises por polo"
        description="Clique no polo para abrir a lista ou exporte o relatório em CSV."
        rows={byPolo}
        exportQuery={`${typeof params.from === "string" ? `?from=${encodeURIComponent(params.from)}` : ""}${typeof params.to === "string" ? `${typeof params.from === "string" ? "&" : "?"}to=${encodeURIComponent(params.to)}` : ""}`}
      />
    </>
  );
}
