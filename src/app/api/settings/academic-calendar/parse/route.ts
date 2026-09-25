import { fileTypeFromBuffer } from "file-type";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/session";
import { rateLimit } from "@/services/rate-limit/rate-limit";
import { getOpenAIClient } from "@/services/openai/client-factory";
import { mapOpenAIError, OpenAIIntegrationError } from "@/services/openai/errors";
import { recordUsage } from "@/services/openai/usage";
import { parsePdf } from "@/services/pdf/parser";
import { extractCalendarEvidence, readCalendarBoundaries } from "@/services/academic-calendar/calendar-reader";

export const runtime = "nodejs";
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_PAGES = 12;

export async function POST(request: Request) {
  let userId: string;
  try {
    const user = await requirePermission("privacy:manage");
    userId = user.id;
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return NextResponse.json({ error: name === "UnauthorizedError" ? "Faça login para continuar." : "Você não tem permissão para importar calendários." }, { status: name === "UnauthorizedError" ? 401 : 403 });
  }

  const limit = rateLimit(`academic-calendar-ai:${userId}`, { capacity: 2, refillPerMinute: 2 });
  if (!limit.allowed) return NextResponse.json({ error: `Limite de importações atingido. Tente novamente em ${limit.retryAfterSeconds}s.` }, { status: 429 });

  try {
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > MAX_PDF_BYTES + 1024 * 1024) return NextResponse.json({ error: "O PDF deve ter no máximo 20 MB." }, { status: 413 });

    const form = await request.formData();
    const file = form.get("file");
    const year = Number(form.get("year"));
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Selecione um PDF de calendário." }, { status: 400 });
    if (!Number.isInteger(year) || year < 2026 || year > 2200) return NextResponse.json({ error: "Selecione um ano válido (2026 ou posterior)." }, { status: 400 });
    if (file.size > MAX_PDF_BYTES) return NextResponse.json({ error: "O PDF deve ter no máximo 20 MB." }, { status: 413 });

    const bytes = Buffer.from(await file.arrayBuffer());
    const type = await fileTypeFromBuffer(bytes);
    if (type?.mime !== "application/pdf") return NextResponse.json({ error: "O arquivo não parece ser um PDF válido." }, { status: 415 });

    const local = await parsePdf(bytes, { maxPages: MAX_PAGES });
    if (local.pageCount > MAX_PAGES) return NextResponse.json({ error: `O calendário tem ${local.pageCount} páginas. Use um arquivo com até ${MAX_PAGES} páginas.` }, { status: 422 });
    const evidence = extractCalendarEvidence(local.pages, year);
    if (evidence.length < 4) return NextResponse.json({ error: `Não encontrei no PDF início e término explícitos dos dois semestres de ${year}. Confira se selecionou o ano correto.` }, { status: 422 });

    const { client, config } = await getOpenAIClient({ timeoutMs: 45_000, maxRetries: 0 });
    const result = await readCalendarBoundaries({ client, model: config.extractionModel, targetYear: year, evidence });
    await recordUsage({ operation: "DOCUMENT_EXTRACTION", model: config.extractionModel, ...result.usage });
    if (!result.terms) return NextResponse.json({ error: result.error, usage: result.usage }, { status: 422 });
    return NextResponse.json({ year, terms: result.terms, usage: result.usage, evidenceLines: evidence.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof OpenAIIntegrationError) return NextResponse.json({ error: error.message }, { status: 503 });
    const mapped = mapOpenAIError(error);
    if (mapped instanceof OpenAIIntegrationError && mapped.code !== "UNKNOWN") {
      return NextResponse.json({ error: mapped.message }, { status: mapped.status === 429 ? 429 : 502 });
    }
    logger.warn("academic_calendar.ai_extract.failed", { userId, errorName: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: error instanceof Error && error.message.startsWith("O PDF") ? error.message : "Não foi possível extrair as datas. Confira o PDF e tente novamente." }, { status: 422 });
  }
}
