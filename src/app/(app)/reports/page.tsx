import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenCheck, CalendarDays, CheckCircle2, FileText } from "lucide-react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalysisStatusBadge } from "@/components/shared/status-badge";
import { formatDateTime, pluralize } from "@/lib/utils";

export const metadata: Metadata = { title: "Meus relatórios" };
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await requireUser();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [total, thisMonth, completed, courses, recent] = await Promise.all([
    prisma.curricularAnalysis.count({ where: { createdById: user.id } }),
    prisma.curricularAnalysis.count({ where: { createdById: user.id, createdAt: { gte: monthStart } } }),
    prisma.curricularAnalysis.count({ where: { createdById: user.id, status: "COMPLETED" } }),
    prisma.curricularAnalysis.groupBy({ by: ["courseName"], where: { createdById: user.id, courseName: { not: null } }, _count: { _all: true }, orderBy: { _count: { courseName: "desc" } }, take: 5 }),
    prisma.curricularAnalysis.findMany({ where: { createdById: user.id }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, courseName: true, status: true, createdAt: true } }),
  ]);
  const cards = [
    { label: "Minhas análises", value: total, icon: FileText, hint: "Desde o início", href: "/analyses" },
    { label: "Neste mês", value: thisMonth, icon: CalendarDays, hint: "Análises iniciadas", href: "/analyses" },
    { label: "Prontas", value: completed, icon: CheckCircle2, hint: "Resultados entregues", href: "/analyses?status=COMPLETED" },
  ];

  return <>
    <PageHeader eyebrow="Acompanhamento pessoal" title="Meus relatórios" description="Acompanhe seu volume de análises, os cursos mais frequentes e seus últimos resultados." />
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map((card) => { const Icon = card.icon; return <Link key={card.label} href={card.href} className="group rounded-xl focus:outline-none focus:ring-2 focus:ring-ring"><Card className="h-full shadow-sm transition-all group-hover:-translate-y-0.5 group-hover:shadow-md"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle><Icon className="size-4 text-brand-cyan-700" /></CardHeader><CardContent><div className="text-2xl font-semibold">{card.value}</div><p className="mt-1 text-xs text-muted-foreground">{card.hint}</p></CardContent></Card></Link>; })}
    </div>
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <Card className="shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><BookOpenCheck className="size-4 text-brand-cyan-700" /> Cursos mais analisados</CardTitle></CardHeader><CardContent>{courses.length === 0 ? <p className="text-sm text-muted-foreground">Suas análises ainda não possuem um curso identificado.</p> : <ol className="space-y-3">{courses.map((course, index) => <li key={course.courseName} className="flex items-center gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm font-medium">{course.courseName}</span><span className="text-sm text-muted-foreground">{pluralize(course._count._all, "análise")}</span></li>)}</ol>}</CardContent></Card>
      <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Últimas análises</CardTitle></CardHeader><CardContent className="p-0">{recent.length === 0 ? <p className="px-6 pb-6 text-sm text-muted-foreground">Você ainda não iniciou nenhuma análise.</p> : <ul className="divide-y">{recent.map((analysis) => <li key={analysis.id}><Link href={`/analyses/${analysis.id}`} className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/60"><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{analysis.courseName ?? "Curso não identificado"}</div><div className="text-xs text-muted-foreground">{formatDateTime(analysis.createdAt)}</div></div><AnalysisStatusBadge status={analysis.status} /></Link></li>)}</ul>}</CardContent></Card>
    </div>
  </>;
}
