import "server-only";
import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { curriculumExtractionSchema, type CurriculumExtraction } from "@/services/openai/schemas";
import { EXTRACTOR_PROMPT_VERSION, EXTRACTOR_SYSTEM_PROMPT } from "@/services/openai/prompts";
import { mapOpenAIError, OpenAIIntegrationError, OPENAI_ERROR_MESSAGES } from "@/services/openai/errors";
import { redactPersonalData } from "@/services/pdf/redaction";
import type { LocalExtraction } from "@/services/pdf/parser";
import { tableToText } from "@/services/pdf/table-detector";
import { logger } from "@/lib/logger";

export interface ExtractorInput {
  model: string;
  privacyMode: "PDF_FILE" | "REDACTED_TEXT";
  documentBytes: Buffer;
  filename: string;
  localExtraction: LocalExtraction | null;
}

export interface ExtractorOutput {
  data: CurriculumExtraction;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  durationMs: number;
  promptVersion: string;
  model: string;
}

export function buildTextHints(local: LocalExtraction | null, redact: boolean): string {
  if (!local) return "";
  const parts: string[] = [];
  if (local.table && local.table.rows.length) {
    const free = Object.entries(local.table.freeText)
      .filter(([, lines]) => lines.length)
      .map(([page, lines]) => `--- texto fora da tabela · página ${page} ---\n${lines.join("\n")}`)
      .join("\n");
    parts.push("## LINHAS DA TABELA RECONSTRUÍDAS LOCALMENTE (referência: [pPÁGINA lLINHA])\n" + tableToText(local.table));
    parts.push("## TEXTO FORA DA TABELA\n" + free);
  } else {
    for (const page of local.pages) {
      parts.push(`=== PÁGINA ${page.page} ===\n${page.lines.map((l) => l.text).join("\n")}`);
    }
  }
  const text = parts.join("\n\n");
  return redact ? redactPersonalData(text) : text;
}

/**
 * OpenAICurriculumExtractor — interpreta o documento e devolve Structured Output.
 * Não faz cálculo algum; a saída é validada com Zod antes de seguir para o motor.
 */
export async function extractCurriculum(client: OpenAI, input: ExtractorInput): Promise<ExtractorOutput> {
  const started = Date.now();
  const format = zodTextFormat(curriculumExtractionSchema, "curriculum_extraction");

  const userContent: OpenAI.Responses.ResponseInputContent[] = [];
  if (input.privacyMode === "PDF_FILE") {
    userContent.push({
      type: "input_text",
      text:
        "Extraia a tabela de análise curricular do PDF anexo seguindo rigorosamente as instruções. " +
        "Abaixo, como apoio, a tabela reconstruída localmente (use sourcePage/sourceRow iguais à referência [pX lY] e não omita nenhuma linha):\n\n" +
        buildTextHints(input.localExtraction, true),
    });
    userContent.push({
      type: "input_file",
      filename: input.filename,
      file_data: `data:application/pdf;base64,${input.documentBytes.toString("base64")}`,
    });
  } else {
    userContent.push({
      type: "input_text",
      text:
        "Extraia a tabela de análise curricular a partir do TEXTO abaixo (dados pessoais já mascarados). " +
        "Cada linha do texto corresponde a uma linha visual do PDF; colunas são separadas por tabulação.\n\n" +
        buildTextHints(input.localExtraction, true),
    });
  }

  try {
    const response = await client.responses.parse({
      model: input.model,
      instructions: EXTRACTOR_SYSTEM_PROMPT,
      input: [{ role: "user", content: userContent }],
      text: { format },
      // Uma grade de até 20 períodos cabe com folga neste limite; evitar margem de
      // saída excessiva reduz o custo em documentos grandes.
      max_output_tokens: 12_000,
    });
    const parsed = response.output_parsed;
    if (!parsed) {
      throw new OpenAIIntegrationError("INVALID_STRUCTURED_OUTPUT", OPENAI_ERROR_MESSAGES.INVALID_STRUCTURED_OUTPUT);
    }
    const data = curriculumExtractionSchema.parse(parsed);
    const usage = response.usage;
    const out: ExtractorOutput = {
      data,
      usage: {
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      },
      durationMs: Date.now() - started,
      promptVersion: EXTRACTOR_PROMPT_VERSION,
      model: input.model,
    };
    logger.info("openai.extractor.ok", { model: input.model, subjects: data.subjects.length, durationMs: out.durationMs, tokens: out.usage.totalTokens });
    return out;
  } catch (err) {
    const mapped = mapOpenAIError(err);
    logger.warn("openai.extractor.failed", { model: input.model, code: mapped.code });
    throw mapped;
  }
}
