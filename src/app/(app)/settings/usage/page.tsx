import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, ChartNoAxesCombined, CircleDollarSign, Cpu, ExternalLink, Users } from "lucide-react";
import { requirePagePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getSystemSettings } from "@/repositories/settings-repository";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyBRL, formatCurrencyUSD, formatDateTime, formatNumber, pluralize } from "@/lib/utils";
import { UsagePeriodFilter } from "@/features/settings/usage-period-filter";
import { UsageBudgetForm } from "@/features/settings/usage-budget-form";

export const metadata: Metadata = { title: "Uso de IA" };
export const dynamic = "force-dynamic";

const OP_LABEL: Record<string, string> = {
  DOCUMENT_EXTRACTION: "Extração do documento",
  CURRICULUM_EXTRACTION: "Extração da grade",
  AUDIT: "Auditoria",
  FINAL_EXPLANATION: "Explicação",
  CONNECTION_TEST: "Teste de conexão",
};
const CREDIT_ACTIONS = ["settings.usage_budget.update", "settings.usage_credit.added"];

function periodBounds(raw: string | string[] | undefined) {
  const now = new Date();
  const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const candidate = typeof raw === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : fallback;
  const [year, month] = candidate.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { period: candidate, start, end };
}

export default async function UsagePage({ searchParams }: PageProps<"/settings/usage">) {
  await requirePagePermission("usage:read");
  const { period, start, end } = periodBounds((await searchParams).period);
  const where = { createdAt: { gte: start, lt: end } };

  const [settings, selected, all, byModel, byOperation, recent, usageByAnalysis, creditHistory, allCreditHistory] = await Promise.all([
    getSystemSettings(),
    prisma.aIUsage.aggregate({ _sum: { estimatedCost: true, totalTokens: true }, _count: true, where }),
    prisma.aIUsage.aggregate({ _sum: { estimatedCost: true, totalTokens: true }, _count: true }),
    prisma.aIUsage.groupBy({ by: ["model"], _sum: { estimatedCost: true, totalTokens: true, inputTokens: true, outputTokens: true }, _count: true, where, orderBy: { _sum: { estimatedCost: "desc" } } }),
    prisma.aIUsage.groupBy({ by: ["operation"], _sum: { estimatedCost: true, totalTokens: true }, _count: true, where, orderBy: { _sum: { estimatedCost: "desc" } } }),
    prisma.aIUsage.findMany({ where, orderBy: { createdAt: "desc" }, take: 40, include: { analysis: { select: { id: true, courseName: true } } } }),
    prisma.aIUsage.groupBy({ by: ["analysisId"], where: { ...where, analysisId: { not: null } }, _sum: { estimatedCost: true, totalTokens: true }, _count: true }),
    prisma.auditLog.findMany({ where: { action: { in: CREDIT_ACTIONS }, createdAt: { gte: start, lt: end } }, orderBy: { createdAt: "desc" }, take: 5000, select: { id: true, createdAt: true, metadata: true, user: { select: { name: true } } } }),
    prisma.auditLog.findMany({ where: { action: { in: CREDIT_ACTIONS } }, orderBy: { createdAt: "desc" }, take: 5000, select: { metadata: true } }),
  ]);

  const analysisIds = usageByAnalysis.flatMap((item) => item.analysisId ? [item.analysisId] : []);
  const analyses = analysisIds.length ? await prisma.curricularAnalysis.findMany({ where: { id: { in: analysisIds } }, select: { id: true, createdBy: { select: { id: true, name: true } } } }) : [];
  const ownerByAnalysis = new Map(analyses.map((analysis) => [analysis.id, analysis.createdBy]));
  const consumers = new Map<string, { name: string; calls: number; tokens: number; cost: number }>();
  for (const item of usageByAnalysis) {
    if (!item.analysisId) continue;
    const owner = ownerByAnalysis.get(item.analysisId);
    if (!owner) continue;
    const current = consumers.get(owner.id) ?? { name: owner.name, calls: 0, tokens: 0, cost: 0 };
    current.calls += item._count;
    current.tokens += item._sum.totalTokens ?? 0;
    current.cost += Number(item._sum.estimatedCost ?? 0);
    consumers.set(owner.id, current);
  }

  const topConsumers = [...consumers.values()].sort((a, b) => b.cost - a.cost || b.tokens - a.tokens).slice(0, 5);
  const costUsd = Number(selected._sum.estimatedCost ?? 0);
  const costBrl = costUsd * settings.usdBrlReferenceRate;
  const creditHistoryWithValues = creditHistory.map((entry) => ({ ...entry, values: creditValues(entry.metadata) }));
  const totalAddedUsd = allCreditHistory.reduce((total, entry) => total + (creditValues(entry.metadata).creditUsd ?? 0), 0);
  const totalSpentUsd = Number(all._sum.estimatedCost ?? 0);
  const availableCreditUsd = totalAddedUsd - totalSpentUsd;
  const addedCreditUsd = creditHistoryWithValues.reduce((total, entry) => total + (entry.values.creditUsd ?? 0), 0);
  const addedCreditBrl = creditHistoryWithValues.reduce((total, entry) => total + (entry.values.creditUsd !== null && entry.values.brlRate !== null ? entry.values.creditUsd * entry.values.brlRate : 0), 0);

  return (
    <>
      <PageHeader eyebrow="Configurações" title="Uso de IA" description="Acompanhe custos estimados, consumo da equipe e orçamento operacional por mês." />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <UsagePeriodFilter period={period} />
        <p className="text-xs text-muted-foreground">Os custos locais são estimativas; a fatura oficial permanece no painel da OpenAI.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={CircleDollarSign} label="Consumo estimado no período" value={formatCurrencyUSD(costUsd)} hint={`${formatCurrencyBRL(costBrl)} · cotação atual R$ ${settings.usdBrlReferenceRate.toFixed(2)}`} />
        <Stat icon={Banknote} label="Créditos adicionados no período" value={formatCurrencyUSD(addedCreditUsd)} hint={`${formatCurrencyBRL(addedCreditBrl)} · ${pluralize(creditHistoryWithValues.length, "lançamento")}`} />
        <Stat icon={ChartNoAxesCombined} label="Saldo estimado de créditos" value={formatCurrencyUSD(availableCreditUsd)} hint={`${formatCurrencyBRL(availableCreditUsd * settings.usdBrlReferenceRate)} · total adicionado: ${formatCurrencyUSD(totalAddedUsd)}`} />
        <Stat icon={Cpu} label="Consumo" value={formatNumber(selected._sum.totalTokens ?? 0)} hint={pluralize(selected._count, "chamada")} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="shadow-sm xl:col-span-3">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="size-4 text-brand-cyan-700" /> Quem mais consumiu</CardTitle><CardDescription>Consumo atribuído à pessoa que criou cada análise no período selecionado.</CardDescription></CardHeader>
          <CardContent>{topConsumers.length === 0 ? <p className="rounded-lg bg-muted/60 p-4 text-sm text-muted-foreground">Ainda não há consumo atribuído a usuários neste período.</p> : <ol className="space-y-3">{topConsumers.map((consumer, index) => <li key={consumer.name} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3"><span className="flex size-7 items-center justify-center rounded-full bg-brand-cyan-50 text-xs font-semibold text-brand-navy">{index + 1}</span><div className="min-w-0"><p className="truncate font-medium">{consumer.name}</p><p className="text-xs text-muted-foreground">{pluralize(consumer.calls, "chamada")} · {formatNumber(consumer.tokens)} tokens</p></div><div className="text-right"><p className="font-medium">{formatCurrencyUSD(consumer.cost)}</p><p className="text-xs text-muted-foreground">{formatCurrencyBRL(consumer.cost * settings.usdBrlReferenceRate)}</p></div></li>)}</ol>}</CardContent>
        </Card>
        <Card className="shadow-sm xl:col-span-2">
          <CardHeader><CardTitle className="text-base">Adicionar créditos</CardTitle><CardDescription>Registro interno de valores adicionados; não substitui a fatura da OpenAI.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <UsageBudgetForm brlRate={settings.usdBrlReferenceRate} />
            <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">O saldo de créditos da conta não é exposto à aplicação pela chave de projeto. Consulte o faturamento oficial para conferir créditos e cobranças.<Link href="https://platform.openai.com/settings/organization/billing/overview" target="_blank" className="mt-2 inline-flex items-center gap-1 font-medium text-brand-cyan-700 hover:underline">Abrir faturamento da OpenAI <ExternalLink className="size-3.5" /></Link></div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <UsageBreakdown title="Por modelo" headers={["Modelo", "Chamadas", "Entrada", "Saída", "Custo"]} empty="Sem uso registrado." rows={byModel.map((item) => [item.model, formatNumber(item._count), formatNumber(item._sum.inputTokens ?? 0), formatNumber(item._sum.outputTokens ?? 0), `${formatCurrencyUSD(Number(item._sum.estimatedCost ?? 0))} · ${formatCurrencyBRL(Number(item._sum.estimatedCost ?? 0) * settings.usdBrlReferenceRate)}`])} />
        <UsageBreakdown title="Por operação" headers={["Operação", "Chamadas", "Tokens", "Custo"]} empty="Sem uso registrado." rows={byOperation.map((item) => [OP_LABEL[item.operation] ?? item.operation, formatNumber(item._count), formatNumber(item._sum.totalTokens ?? 0), `${formatCurrencyUSD(Number(item._sum.estimatedCost ?? 0))} · ${formatCurrencyBRL(Number(item._sum.estimatedCost ?? 0) * settings.usdBrlReferenceRate)}`])} />
      </div>

      <Card className="mt-6 overflow-hidden shadow-sm">
        <CardHeader><CardTitle className="text-base">Histórico de créditos adicionados</CardTitle><CardDescription>Lançamentos em {period}; altere o mês no filtro acima para consultar outro período.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 border-y bg-muted/30 py-4 sm:grid-cols-3">
          <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total adicionado no período</p><p className="mt-1 text-xl font-semibold">{formatCurrencyUSD(addedCreditUsd)}</p></div>
          <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Equivalente em reais</p><p className="mt-1 text-xl font-semibold">{formatCurrencyBRL(addedCreditBrl)}</p></div>
          <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lançamentos</p><p className="mt-1 text-xl font-semibold">{pluralize(creditHistoryWithValues.length, "registro")}</p></div>
        </CardContent>
        <CardContent className="max-h-72 overflow-y-auto p-0"><Table><TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--border)]"><TableRow><TableHead>Data/hora</TableHead><TableHead>Responsável</TableHead><TableHead>Crédito adicionado</TableHead><TableHead className="text-right">Cotação (R$/US$)</TableHead></TableRow></TableHeader><TableBody>
          {creditHistory.length === 0 && <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">Nenhum crédito foi adicionado neste período.</TableCell></TableRow>}
          {creditHistoryWithValues.map((entry) => <TableRow key={entry.id}><TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(entry.createdAt)}</TableCell><TableCell>{entry.user?.name ?? "Sistema"}</TableCell><TableCell>{entry.values.creditUsd === null ? "—" : formatCurrencyUSD(entry.values.creditUsd)}</TableCell><TableCell className="text-right">{entry.values.brlRate === null ? "—" : formatBRLRate(entry.values.brlRate)}</TableCell></TableRow>)}
        </TableBody></Table></CardContent>
      </Card>

      <Card className="mt-6 overflow-hidden shadow-sm">
        <CardHeader><CardTitle className="text-base">Chamadas recentes</CardTitle><CardDescription>{period}</CardDescription></CardHeader>
        <CardContent className="max-h-[min(48vh,34rem)] overflow-y-auto p-0">
          <Table><TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--border)]"><TableRow><TableHead>Data/hora</TableHead><TableHead>Operação</TableHead><TableHead>Modelo</TableHead><TableHead>Análise</TableHead><TableHead>Tokens</TableHead><TableHead className="text-right">Custo</TableHead></TableRow></TableHeader><TableBody>
            {recent.length === 0 && <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">Nenhuma chamada neste período.</TableCell></TableRow>}
            {recent.map((usage) => <TableRow key={usage.id}><TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(usage.createdAt)}</TableCell><TableCell><Badge variant="secondary">{OP_LABEL[usage.operation] ?? usage.operation}</Badge></TableCell><TableCell className="font-mono text-xs">{usage.model}</TableCell><TableCell>{usage.analysis ? <Link className="text-brand-cyan-700 underline" href={`/analyses/${usage.analysis.id}`}>{usage.analysis.courseName ?? usage.analysis.id.slice(0, 8)}</Link> : "—"}</TableCell><TableCell>{formatNumber(usage.totalTokens)}</TableCell><TableCell className="text-right whitespace-nowrap"><div>{formatCurrencyUSD(Number(usage.estimatedCost))}</div><div className="text-xs text-muted-foreground">{formatCurrencyBRL(Number(usage.estimatedCost) * settings.usdBrlReferenceRate)}</div></TableCell></TableRow>)}
          </TableBody></Table>
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">Histórico total registrado: {formatCurrencyUSD(Number(all._sum.estimatedCost ?? 0))} · {formatCurrencyBRL(Number(all._sum.estimatedCost ?? 0) * settings.usdBrlReferenceRate)} · {pluralize(all._count, "chamada")}.</p>
    </>
  );
}

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Cpu; label: string; value: string; hint: string }) {
  return <Card className="shadow-sm"><CardContent><div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground"><span>{label}</span><Icon className="size-4 text-brand-cyan-700" /></div><div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div><p className="mt-1 text-xs text-muted-foreground">{hint}</p></CardContent></Card>;
}

function UsageBreakdown({ title, headers, rows, empty }: { title: string; headers: string[]; rows: string[][]; empty: string }) {
  return <Card className="overflow-hidden shadow-sm"><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent className="max-h-72 overflow-y-auto p-0"><Table><TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--border)]"><TableRow>{headers.map((header, index) => <TableHead key={header} className={index === headers.length - 1 ? "text-right" : undefined}>{header}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.length === 0 ? <TableRow><TableCell colSpan={headers.length} className="py-6 text-center text-sm text-muted-foreground">{empty}</TableCell></TableRow> : rows.map((row, rowIndex) => <TableRow key={`${row[0]}-${rowIndex}`}>{row.map((cell, index) => <TableCell key={index} className={index === row.length - 1 ? "text-right whitespace-nowrap" : undefined}>{cell}</TableCell>)}</TableRow>)}</TableBody></Table></CardContent></Card>;
}

function creditValues(metadata: unknown) {
  const data = metadata && typeof metadata === "object" ? metadata as Record<string, unknown> : {};
  // Registros anteriores armazenavam os valores diretamente; os novos ficam em "current".
  const current = data.current && typeof data.current === "object" ? data.current as Record<string, unknown> : data;
  const toNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
  return { creditUsd: toNumber(current.creditUsd ?? current.aiMonthlyBudgetUsd), brlRate: toNumber(current.usdBrlReferenceRate) };
}

function formatBRLRate(value: number) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(value);
}
