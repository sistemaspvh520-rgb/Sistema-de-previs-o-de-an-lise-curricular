import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/session";
import { rateLimit } from "@/services/rate-limit/rate-limit";
import { getOpenAIClient } from "@/services/openai/client-factory";
import { mapOpenAIError, OpenAIIntegrationError } from "@/services/openai/errors";
import { recordUsage } from "@/services/openai/usage";
import { reviewAmbiguousAcademicRows } from "@/services/academic-analysis/ai-review";

export const runtime = "nodejs";

const requestSchema = z.object({
  rows: z.array(z.object({
    rowRef: z.string().regex(/^\d{1,3}-\d{1,4}$/),
    code: z.string().max(40).nullable(),
    name: z.string().min(1).max(180),
    rawPeriod: z.string().max(40),
    period: z.number().int().min(1).max(20).nullable(),
    status: z.string().max(40),
  })).min(1).max(12),
  warnings: z.array(z.string().max(220)).max(12),
}).refine((data) => new Set(data.rows.map((row) => row.rowRef)).size === data.rows.length, "As linhas não podem ter referências repetidas.");

export async function POST(request: Request) {
  let userId: string;
  try {
    userId = (await requirePermission("analysis:review")).id;
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return NextResponse.json({ error: name === "UnauthorizedError" ? "Faça login para continuar." : "Você não tem permissão para revisar análises acadêmicas." }, { status: name === "UnauthorizedError" ? 401 : 403 });
  }

  const limit = rateLimit(`academic-row-ai-review:${userId}`, { capacity: 4, refillPerMinute: 3 });
  if (!limit.allowed) return NextResponse.json({ error: `Limite de revisões atingido. Tente novamente em ${limit.retryAfterSeconds}s.` }, { status: 429 });

  try {
    const body = requestSchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "Não foi possível validar as linhas para revisão." }, { status: 400 });
    const { client, config } = await getOpenAIClient({ timeoutMs: 45_000, maxRetries: 0 });
    const result = await reviewAmbiguousAcademicRows({ client, model: config.extractionModel, ...body.data });
    await recordUsage({ operation: "DOCUMENT_EXTRACTION", model: config.extractionModel, ...result.usage });
    if (!result.reviews) return NextResponse.json({ error: result.error, usage: result.usage }, { status: 422 });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof OpenAIIntegrationError) return NextResponse.json({ error: error.message }, { status: 503 });
    const mapped = mapOpenAIError(error);
    if (mapped instanceof OpenAIIntegrationError && mapped.code !== "UNKNOWN") return NextResponse.json({ error: mapped.message }, { status: mapped.status === 429 ? 429 : 502 });
    logger.warn("academic_analysis.ai_review.failed", { userId, errorName: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Não foi possível priorizar a revisão. Confira as linhas diretamente no PDF." }, { status: 502 });
  }
}
