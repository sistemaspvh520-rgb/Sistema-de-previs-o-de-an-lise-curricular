import "server-only";
import { prisma } from "@/lib/prisma";
import { getSystemSettings } from "@/repositories/settings-repository";
import { startOfCurrentMonth } from "@/lib/time";

const EXPECTED_CALLS_PER_ANALYSIS = 2;

export interface AiConsumer {
  id: string;
  name: string;
  calls: number;
  tokens: number;
  cost: number;
  analysesCount: number;
  repeatedCalls: number;
}

/** Resumo do consumo da OpenAI no mês corrente (fuso da aplicação), por usuário responsável pela análise. */
export async function getMonthlyAiUsageSummary() {
  const monthStart = startOfCurrentMonth();
  const [settings, monthUsage, usageByAnalysis] = await Promise.all([
    getSystemSettings(),
    prisma.aIUsage.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { totalTokens: true, estimatedCost: true }, _count: true }),
    prisma.aIUsage.groupBy({ by: ["analysisId"], where: { createdAt: { gte: monthStart }, analysisId: { not: null } }, _sum: { totalTokens: true, estimatedCost: true }, _count: true }),
  ]);
  const analysisIds = usageByAnalysis.flatMap((item) => (item.analysisId ? [item.analysisId] : []));
  const owners = analysisIds.length ? await prisma.curricularAnalysis.findMany({ where: { id: { in: analysisIds } }, select: { id: true, createdBy: { select: { id: true, name: true } } } }) : [];
  const ownerByAnalysis = new Map(owners.map((a) => [a.id, a.createdBy]));
  const consumers = new Map<string, AiConsumer & { analyses: Set<string> }>();
  for (const usage of usageByAnalysis) {
    if (!usage.analysisId) continue;
    const owner = ownerByAnalysis.get(usage.analysisId);
    if (!owner) continue;
    const current = consumers.get(owner.id) ?? { id: owner.id, name: owner.name, calls: 0, tokens: 0, cost: 0, analysesCount: 0, repeatedCalls: 0, analyses: new Set<string>() };
    current.calls += usage._count;
    current.tokens += usage._sum.totalTokens ?? 0;
    current.cost += Number(usage._sum.estimatedCost ?? 0);
    current.analyses.add(usage.analysisId);
    consumers.set(owner.id, current);
  }
  const all: AiConsumer[] = [...consumers.values()]
    .map(({ analyses, ...c }) => ({ ...c, analysesCount: analyses.size, repeatedCalls: Math.max(0, c.calls - analyses.size * EXPECTED_CALLS_PER_ANALYSIS) }))
    .sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);
  const monthCostUsd = Number(monthUsage._sum.estimatedCost ?? 0);
  return {
    monthStart,
    monthCostUsd,
    monthCalls: monthUsage._count,
    monthTokens: monthUsage._sum.totalTokens ?? 0,
    usdBrlReferenceRate: settings.usdBrlReferenceRate,
    remainingBudgetUsd: settings.aiMonthlyBudgetUsd > 0 ? Math.max(0, settings.aiMonthlyBudgetUsd - monthCostUsd) : null,
    topConsumers: all.slice(0, 5),
    repetitionAlerts: all.filter((c) => c.repeatedCalls > 0).slice(0, 5),
    expectedCallsPerAnalysis: EXPECTED_CALLS_PER_ANALYSIS,
  };
}

export type MonthlyAiUsageSummary = Awaited<ReturnType<typeof getMonthlyAiUsageSummary>>;
