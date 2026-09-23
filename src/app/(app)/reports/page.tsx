import type { Metadata } from "next";
import Link from "next/link";
import {
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  FileText,
  UserRoundX,
} from "lucide-react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalysisStatusBadge } from "@/components/shared/status-badge";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { formatDateTime, pluralize } from "@/lib/utils";
import { startOfCurrentMonth } from "@/lib/time";
import { countAnalysesByPolo } from "@/repositories/analysis-repository";
import { PoloReportCard } from "@/features/analyses/components/polo-report";
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
    total,
    inPeriod,
    month,
    completed,
    enrolled,
    pendingEnrollment,
    notEnrolled,
    courses,
    recent,
    followUps,
    byPolo,
  ] = await Promise.all([
    prisma.curricularAnalysis.count({ where: { createdById: user.id } }),
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
    prisma.curricularAnalysis.count({
      where: { ...base, status: "COMPLETED", enrollmentStatus: "PENDING" },
    }),
    prisma.curricularAnalysis.count({
      where: { ...base, enrollmentStatus: "NOT_ENROLLED" },
    }),
    prisma.curricularAnalysis.groupBy({
      by: ["courseName"],
      where: { ...base, courseName: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { courseName: "desc" } },
      take: 5,
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
  const cards = [
    {
      label: "Minhas análises",
      value: total,
      icon: FileText,
      hint: "Desde o início",
      href: "/analyses",
    },
    {
      label: createdAt ? "No período" : "Neste mês",
      value: createdAt ? inPeriod : month,
      icon: CalendarDays,
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
      label: "Conversão",
      value: `${conversion}%`,
      icon: UserRoundX,
      hint: `${enrolled} matrícula(s) confirmada(s)`,
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
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              href={card.href}
              className="group rounded-xl focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <Card className="h-full border-l-4 border-l-brand-cyan-700 shadow-sm transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {card.label}
                  </CardTitle>
                  <Icon className="size-4 text-brand-cyan-700" />
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
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.15fr]">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpenCheck className="size-4 text-brand-cyan-700" /> Cursos
              mais analisados
            </CardTitle>
          </CardHeader>
          <CardContent>
            {courses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Não há cursos no período selecionado.
              </p>
            ) : (
              <ol className="space-y-3">
                {courses.map((course, index) => (
                  <li
                    key={course.courseName}
                    className="flex items-center gap-3"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {course.courseName}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {pluralize(course._count._all, "análise")}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-sm">
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
      </div>
      <Card className="mt-6 border-brand-cyan-100 bg-brand-cyan-50/40 shadow-sm">
        <CardContent className="grid gap-4 p-5 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Funil pessoal
            </p>
            <p className="mt-1 text-lg font-semibold">{completed} concluídas</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Aguardando confirmação
            </p>
            <p className="mt-1 text-lg font-semibold text-status-warning">
              {pendingEnrollment}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Conversão em matrícula
            </p>
            <p className="mt-1 text-lg font-semibold text-status-success">
              {enrolled} · {conversion}%
            </p>
          </div>
        </CardContent>
      </Card>
      <Card className="mt-6 overflow-hidden shadow-sm">
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
