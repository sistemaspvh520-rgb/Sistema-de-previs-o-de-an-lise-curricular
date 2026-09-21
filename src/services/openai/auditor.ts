import "server-only";
import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { curriculumAuditSchema, type CurriculumAudit } from "@/services/openai/schemas";
import { AUDITOR_PROMPT_VERSION, AUDITOR_SYSTEM_PROMPT } from "@/services/openai/prompts";
import { mapOpenAIError, OpenAIIntegrationError, OPENAI_ERROR_MESSAGES } from "@/services/openai/errors";
import { redactPersonalData } from "@/services/pdf/redaction";
import type { LocalExtraction } from "@/services/pdf/parser";
import type { SubjectRow, CurriculumTotals, SimulationResult, DocumentClaimInput } from "@/domain/curricular-analysis/types";
import { logger } from "@/lib/logger";

export interface AuditorInput {
  model: string;
  privacyMode: "PDF_FILE" | "REDACTED_TEXT";
  documentBytes: Buffer;
  filename: string;
  localExtraction: LocalExtraction | null;
  subjects: SubjectRow[];
  totals: CurriculumTotals;
  entryPeriod: number | null;
  simulation: SimulationResult | null;
  claims: DocumentClaimInput[];
}

export interface AuditorOutput {
  data: CurriculumAudit;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  durationMs: number;
  promptVersion: string;
  model: string;
}

function summarize(input: AuditorInput): string {
  const rows = input.subjects.map((s) =>
    [s.id, s.sourcePage, s.sourceRow, s.period, s.workload, JSON.stringify(s.name), JSON.stringify(s.usedSubject), s.status, s.readability].join(" | "),
  );
  const semesters =
    input.simulation?.semesters.map(
      (s) =>
        `${s.term} · ${s.isAdditional ? "adicional" : `${s.periodNumber}º período`} · regulares ${s.regularSubjectsToTake} · adaptações ${s.subjectsFromBacklog} · carga ${s.semesterLoad}/${s.maximumCapacity} · backlog restante ${s.remainingBacklog}`,
    ) ?? [];
  const claims = input.claims.map((c) => `${c.type} = ${c.value ?? "?"} (p.${c.sourcePage}) "${c.rawText ?? ""}"`);
  return [
    "## LINHAS NORMALIZADAS (rowHash | página | linha | período | C.H. | disciplina | disciplina utilizada | status | legibilidade)",
    ...rows,
    "",
    "## TOTAIS CALCULADOS PELO MOTOR",
    `total=${input.totals.total} dispensadas=${input.totals.exempted} pendentes=${input.totals.pending} revisar=${input.totals.review}`,
    `períodos=${input.totals.periods.join(",")} ingresso=${input.entryPeriod ?? "não confirmado"}`,
    "",
    "## DISTRIBUIÇÃO SEMESTRAL",
    ...(semesters.length ? semesters : ["(não calculada)"]),
    "",
    "## AFIRMAÇÕES DO DOCUMENTO",
    ...(claims.length ? claims : ["(nenhuma)"]),
  ].join("\n");
}

/**
 * A auditoria já recebe as linhas normalizadas pelo motor. Para reduzir custo,
 * envia do PDF somente as páginas que sustentam essas linhas/afirmações e limita
 * a evidência textual a um tamanho seguro. Dados pessoais continuam mascarados.
 */
function compactDocumentEvidence(input: AuditorInput): string | null {
  if (!input.localExtraction) return null;
  const relevantPages = new Set([
    ...input.subjects.map((subject) => subject.sourcePage),
    ...input.claims.map((claim) => claim.sourcePage),
  ]);
  const pages = input.localExtraction.pages.filter((page) => relevantPages.has(page.page));
  const source = pages.length ? pages : input.localExtraction.pages.slice(0, 2);
  const evidence = source.map((page) => `=== PÁGINA ${page.page} ===\n${page.lines.map((line) => line.text).join("\n")}`).join("\n\n");
  return redactPersonalData(evidence).slice(0, 9_000);
}

/**
 * OpenAICurriculumAuditor — segunda conferência. Só aponta problemas; nunca altera dados.
 */
export async function auditCurriculum(client: OpenAI, input: AuditorInput): Promise<AuditorOutput> {
  const started = Date.now();
  const format = zodTextFormat(curriculumAuditSchema, "curriculum_audit");
  const content: OpenAI.Responses.ResponseInputContent[] = [
    { type: "input_text", text: "Audite os dados abaixo comparando com o documento.\n\n" + summarize(input) },
  ];
  if (input.privacyMode === "PDF_FILE") {
    content.push({
      type: "input_file",
      filename: input.filename,
      file_data: `data:application/pdf;base64,${input.documentBytes.toString("base64")}`,
    });
  } else {
    const evidence = compactDocumentEvidence(input);
    if (evidence) content.push({ type: "input_text", text: "## EVIDÊNCIAS RELEVANTES DO DOCUMENTO (dados pessoais mascarados)\n" + evidence });
  }

  try {
    const response = await client.responses.parse({
      model: input.model,
      instructions: AUDITOR_SYSTEM_PROMPT,
      input: [{ role: "user", content }],
      text: { format },
      // A auditoria só retorna apontamentos curtos; não reservar 8k tokens para isso.
      max_output_tokens: 1_500,
    });
    const parsed = response.output_parsed;
    if (!parsed) throw new OpenAIIntegrationError("INVALID_STRUCTURED_OUTPUT", OPENAI_ERROR_MESSAGES.INVALID_STRUCTURED_OUTPUT);
    const data = curriculumAuditSchema.parse(parsed);
    const usage = response.usage;
    const out: AuditorOutput = {
      data,
      usage: { inputTokens: usage?.input_tokens ?? 0, outputTokens: usage?.output_tokens ?? 0, totalTokens: usage?.total_tokens ?? 0 },
      durationMs: Date.now() - started,
      promptVersion: AUDITOR_PROMPT_VERSION,
      model: input.model,
    };
    logger.info("openai.auditor.ok", { model: input.model, status: data.status, issues: data.issues.length, durationMs: out.durationMs });
    return out;
  } catch (err) {
    const mapped = mapOpenAIError(err);
    logger.warn("openai.auditor.failed", { model: input.model, code: mapped.code });
    throw mapped;
  }
}
