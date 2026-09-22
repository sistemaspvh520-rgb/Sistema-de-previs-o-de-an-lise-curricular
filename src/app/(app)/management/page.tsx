import type { Metadata } from "next";
import Link from "next/link";
import { Activity, AlertTriangle, BookOpenCheck, CheckCircle2, CircleAlert, Clock3, Cpu, Trash2, Users } from "lucide-react";
import { requirePagePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getSystemSettings } from "@/repositories/settings-repository";
import { parseSteps } from "@/services/pipeline/steps";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalysisStatusBadge } from "@/components/shared/status-badge";
import { formatCurrencyBRL, formatCurrencyUSD, formatDateTime, formatNumber, pluralize } from "@/lib/utils";

export const metadata: Metadata = { title: "Gestão" };
export const dynamic = "force-dynamic";

const IN_PROGRESS = ["UPLOADED", "PARSING", "AI_EXTRACTION", "NORMALIZING", "CALCULATING", "VALIDATING", "AI_AUDIT"] as const;
const NEEDS_ATTENTION = ["WAITING_REVIEW", "FAILED", "AI_ERROR"] as const;
const EXPECTED_CALLS_PER_ANALYSIS = 2;

export default async function ManagementPage() {
  await requirePagePermission("audit:read");
  const settings = await getSystemSettings();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [ready, inProgress, attention, activeUsers, courses, users, totalsByUser, completedByUser, monthByUser, deletedByUser, analyses, monthUsage, usageByAnalysis] = await Promise.all([
    prisma.curricularAnalysis.count({ where: { status: "COMPLETED" } }),
    prisma.curricularAnalysis.count({ where: { status: { in: [...IN_PROGRESS] } } }),
    prisma.curricularAnalysis.count({ where: { status: { in: [...NEEDS_ATTENTION] } } }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.curricularAnalysis.groupBy({ by: ["courseName"], where: { courseName: { not: null } }, _count: { _all: true }, orderBy: { _count: { courseName: "desc" } }, take: 5 }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, take: 20, select: { id: true, name: true, role: true, lastLoginAt: true, analyses: { select: { courseName: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 } } }),
    prisma.curricularAnalysis.groupBy({ by: ["createdById"], _count: { _all: true } }),
    prisma.curricularAnalysis.groupBy({ by: ["createdById"], where: { status: "COMPLETED" }, _count: { _all: true } }),
    prisma.curricularAnalysis.groupBy({ by: ["createdById"], where: { createdAt: { gte: monthStart } }, _count: { _all: true } }),
    prisma.auditLog.groupBy({ by: ["userId"], where: { action: { in: ["analysis.delete.tracked", "analysis.deletion_approved.tracked"] } }, _count: { _all: true } }),
    prisma.curricularAnalysis.findMany({ orderBy: { updatedAt: "desc" }, take: 15, include: { createdBy: { select: { name: true } }, document: { select: { originalName: true } } } }),
    prisma.aIUsage.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { totalTokens: true, estimatedCost: true }, _count: true }),
    prisma.aIUsage.groupBy({ by: ["analysisId"], where: { createdAt: { gte: monthStart }, analysisId: { not: null } }, _sum: { totalTokens: true, estimatedCost: true }, _count: true }),
  ]);

  const usageAnalysisIds = usageByAnalysis.flatMap((item) => item.analysisId ? [item.analysisId] : []);
  const usageAnalyses = usageAnalysisIds.length ? await prisma.curricularAnalysis.findMany({ where: { id: { in: usageAnalysisIds } }, select: { id: true, createdBy: { select: { id: true, name: true } } } }) : [];
  const ownerByAnalysis = new Map(usageAnalyses.map((analysis) => [analysis.id, analysis.createdBy]));
  const consumers = new Map<string, { name: string; calls: number; tokens: number; cost: number; analyses: Set<string> }>();
  for (const usage of usageByAnalysis) {
    if (!usage.analysisId) continue;
    const owner = ownerByAnalysis.get(usage.analysisId);
    if (!owner) continue;
    const current = consumers.get(owner.id) ?? { name: owner.name, calls: 0, tokens: 0, cost: 0, analyses: new Set<string>() };
    current.calls += usage._count;
    current.tokens += usage._sum.totalTokens ?? 0;
    current.cost += Number(usage._sum.estimatedCost ?? 0);
    current.analyses.add(usage.analysisId);
    consumers.set(owner.id, current);
  }
  const allConsumers = [...consumers.values()].map((consumer) => ({ ...consumer, repeatedCalls: Math.max(0, consumer.calls - consumer.analyses.size * EXPECTED_CALLS_PER_ANALYSIS) })).sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);
  const topConsumers = allConsumers.slice(0, 5);
  const repetitionAlerts = allConsumers.filter((consumer) => consumer.repeatedCalls > 0).slice(0, 5);
  const monthCostUsd = Number(monthUsage._sum.estimatedCost ?? 0);
  const remainingBudgetUsd = settings.aiMonthlyBudgetUsd > 0 ? Math.max(0, settings.aiMonthlyBudgetUsd - monthCostUsd) : null;
  const totalByUser = new Map(totalsByUser.map((item) => [item.createdById, item._count._all]));
  const deliveredByUser = new Map(completedByUser.map((item) => [item.createdById, item._count._all]));
  const monthlyByUser = new Map(monthByUser.map((item) => [item.createdById, item._count._all]));
  const deletedCountByUser = new Map(deletedByUser.flatMap((item) => item.userId ? [[item.userId, item._count._all] as const] : []));
  const deletedSinceTracking = deletedByUser.reduce((total, item) => total + item._count._all, 0);
  const cards = [
    { label: "Entregues", value: ready, icon: CheckCircle2, tone: "text-status-success", hint: "Análises prontas para consulta", href: "/analyses?status=COMPLETED" },
    { label: "Em andamento", value: inProgress, icon: Clock3, tone: "text-brand-cyan-700", hint: "O sistema ainda está trabalhando", href: "/analyses?filter=PROCESSING" },
    { label: "Precisam de atenção", value: attention, icon: CircleAlert, tone: "text-status-danger", hint: "Situações que precisam de intervenção", href: "/analyses?filter=ATTENTION" },
    { label: "Excluídas", value: deletedSinceTracking, icon: Trash2, tone: "text-status-danger", hint: "Registradas a partir desta atualização", href: "#atividade-por-usuario" },
    { label: "Usuários ativos", value: activeUsers, icon: Users, tone: "text-brand-navy", hint: "Com acesso ao sistema", href: "#atividade-por-usuario" },
  ];

  return <>
    <PageHeader eyebrow="Gestão" title="Acompanhamento operacional" description="Situação das análises, atividade da equipe e consumo de IA deste mês." />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{cards.map((card) => { const Icon = card.icon; return <Link key={card.label} href={card.href} className="group rounded-xl focus:outline-none focus:ring-2 focus:ring-ring"><Card className="h-full shadow-sm transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-md"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle><Icon className={`size-4 ${card.tone}`} /></CardHeader><CardContent><div className="text-2xl font-semibold">{card.value}</div><p className="mt-1 text-xs text-muted-foreground">{card.hint}</p></CardContent></Card></Link>; })}</div>
    <div className="mt-6 grid gap-6 xl:grid-cols-5">
      <Card className="shadow-sm xl:col-span-2"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><BookOpenCheck className="size-4 text-brand-cyan-700" /> Cursos mais analisados</CardTitle></CardHeader><CardContent>{courses.length === 0 ? <p className="text-sm text-muted-foreground">Ainda não há cursos identificados.</p> : <ol className="space-y-3">{courses.map((course, index) => <li key={course.courseName} className="flex items-center gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm font-medium">{course.courseName}</span><span className="text-sm font-semibold text-brand-navy">{course._count._all}</span></li>)}</ol>}</CardContent></Card>
      <Card id="atividade-por-usuario" className="overflow-hidden shadow-sm xl:col-span-3"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="size-4 text-brand-cyan-700" /> Atividade por usuário</CardTitle></CardHeader><CardContent className="p-0"><div className="divide-y">{users.map((user) => { const total = totalByUser.get(user.id) ?? 0; const completed = deliveredByUser.get(user.id) ?? 0; const thisMonth = monthlyByUser.get(user.id) ?? 0; const deleted = deletedCountByUser.get(user.id) ?? 0; const latest = user.analyses[0]; return <div key={user.id} className="grid gap-3 px-4 py-4 text-sm sm:grid-cols-[minmax(150px,1.2fr)_auto_auto] sm:items-center sm:px-6 lg:grid-cols-[minmax(150px,1.2fr)_auto_auto_auto_auto_minmax(170px,1fr)]"><div className="min-w-0"><div className="truncate font-medium">{user.name}</div><div className="text-xs text-muted-foreground">{user.role === "ADMIN" ? "Administrador" : user.role === "ANALYST" ? "Analista" : "Visualizador"}</div></div><div className="flex flex-wrap gap-x-3 gap-y-1 text-xs sm:contents"><span className="whitespace-nowrap">{total} análises</span><span className="whitespace-nowrap">{thisMonth} no mês</span><span className="whitespace-nowrap text-status-success">{completed} prontas</span><span className="whitespace-nowrap text-status-danger">{deleted} excluídas</span></div><div className="min-w-0 text-xs text-muted-foreground">{latest ? <><span className="block truncate">{latest.courseName ?? "Curso não identificado"}</span><span>{formatDateTime(latest.createdAt)}</span></> : <>Sem análise · último acesso {formatDateTime(user.lastLoginAt)}</>}</div></div>; })}</div></CardContent></Card>
    </div>
    <div className="mt-6 grid gap-6 xl:grid-cols-5">
      <Card className="shadow-sm xl:col-span-3"><CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0"><CardTitle className="flex items-center gap-2 text-base"><Cpu className="size-4 text-brand-cyan-700" /> Consumo da API no mês</CardTitle><Link href="/settings/usage" className="shrink-0 text-sm text-brand-cyan-700 underline">Ver detalhes e filtrar</Link></CardHeader><CardContent><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><UsageStat label="Custo estimado" value={formatCurrencyUSD(monthCostUsd)} /><UsageStat label="Em reais" value={formatCurrencyBRL(monthCostUsd * settings.usdBrlReferenceRate)} /><UsageStat label="Disponível no orçamento" value={remainingBudgetUsd === null ? "Não definido" : formatCurrencyUSD(remainingBudgetUsd)} /><UsageStat label="Chamadas" value={pluralize(monthUsage._count, "chamada")} /></div><div className="mt-5 border-t pt-4"><p className="mb-3 text-sm font-medium">Quem mais consumiu</p>{topConsumers.length === 0 ? <p className="text-sm text-muted-foreground">Ainda não há consumo atribuído a usuários neste mês.</p> : <ol className="space-y-3">{topConsumers.map((consumer, index) => <li key={consumer.name} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 text-sm"><span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">{index + 1}</span><div className="min-w-0"><p className="truncate font-medium">{consumer.name}</p><p className="text-xs text-muted-foreground">{pluralize(consumer.calls, "chamada")} · {formatNumber(consumer.tokens)} tokens{consumer.repeatedCalls > 0 ? ` · ${pluralize(consumer.repeatedCalls, "chamada adicional")}` : ""}</p></div><span className="whitespace-nowrap font-medium text-brand-navy">{formatCurrencyUSD(consumer.cost)}<span className="block text-xs font-normal text-muted-foreground">{formatCurrencyBRL(consumer.cost * settings.usdBrlReferenceRate)}</span></span></li>)}</ol>}</div></CardContent></Card>
      <Card className="shadow-sm xl:col-span-2"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="size-4 text-status-warning" /> Alertas de repetição</CardTitle></CardHeader><CardContent>{repetitionAlerts.length === 0 ? <div className="rounded-lg bg-status-success/10 p-4 text-sm text-status-success">Nenhum reprocessamento acima do padrão foi identificado neste mês.</div> : <ul className="space-y-3">{repetitionAlerts.map((consumer) => <li key={consumer.name} className="rounded-lg border border-status-warning/30 bg-status-warning/10 p-3 text-sm"><p className="font-medium">{consumer.name}</p><p className="mt-1 text-muted-foreground">{pluralize(consumer.repeatedCalls, "chamada adicional")} além das {consumer.analyses.size * EXPECTED_CALLS_PER_ANALYSIS} esperadas para {pluralize(consumer.analyses.size, "análise")}. Verifique reprocessamentos e novas auditorias.</p></li>)}</ul>}</CardContent></Card>
    </div>
    <Card className="mt-6 overflow-hidden shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Activity className="size-4 text-brand-cyan-700" /> Acompanhamento das análises</CardTitle></CardHeader><CardContent className="p-0"><div className="divide-y">{analyses.map((analysis) => { const steps = parseSteps(analysis.processingSteps); const activeStep = steps.find((step) => step.status === "running" || step.status === "error") ?? steps.filter((step) => step.status === "done").at(-1); const detail = analysis.errorMessage ? analysis.errorMessage : analysis.status === "WAITING_REVIEW" ? "Aguardando a confirmação do ingresso" : analysis.status === "COMPLETED" ? "Entregue automaticamente" : activeStep?.label ?? "Aguardando início"; return <Link key={analysis.id} href={`/analyses/${analysis.id}`} className="grid gap-2 px-4 py-4 text-sm transition-colors hover:bg-muted/60 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-6 sm:px-6 lg:grid-cols-[minmax(220px,1.4fr)_minmax(150px,.85fr)_minmax(180px,1fr)_150px] lg:items-center"><div className="min-w-0"><div className="truncate font-medium">{analysis.courseName ?? analysis.document?.originalName ?? "Análise sem título"}</div><div className="text-xs text-muted-foreground">por {analysis.createdBy.name} · {formatDateTime(analysis.createdAt)}</div></div><div><AnalysisStatusBadge status={analysis.status} /></div><div className={analysis.errorMessage ? "min-w-0 truncate text-status-danger" : "min-w-0 truncate text-muted-foreground"} title={detail}>{detail}</div><div className="text-xs leading-5 text-muted-foreground sm:text-right">Atualizada<br />{formatDateTime(analysis.updatedAt)}</div></Link>; })}</div></CardContent></Card>
  </>;
}

function UsageStat({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>;
}
