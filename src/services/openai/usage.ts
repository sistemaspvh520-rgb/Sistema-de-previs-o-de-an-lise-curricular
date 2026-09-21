import "server-only";
import { prisma } from "@/lib/prisma";
import { estimateCost } from "@/services/openai/pricing";
import type { AIOperation } from "@/generated/prisma/enums";

export interface UsageInput {
  analysisId?: string | null;
  operation: AIOperation;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
}

export async function recordUsage(u: UsageInput) {
  const total = u.totalTokens ?? u.inputTokens + u.outputTokens;
  await prisma.aIUsage.create({
    data: {
      analysisId: u.analysisId ?? null,
      operation: u.operation,
      model: u.model,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      totalTokens: total,
      estimatedCost: estimateCost(u.model, u.inputTokens, u.outputTokens),
    },
  });
}
