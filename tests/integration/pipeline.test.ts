/**
 * Integração: pipeline completo contra o PostgreSQL real (docker compose) com o SDK OpenAI mockado.
 * Pulado automaticamente se o banco não estiver acessível.
 */
import { readFileSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

loadEnv({ path: path.resolve(process.cwd(), ".env"), override: true });
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), "analise-storage-"));

const fixture = readFileSync(path.join(__dirname, "../fixtures/sample-analise.pdf"));

const extractorResult = {
  document: { course: "DIREITO - EAD", matrix: "2024.1", campus: null, modality: null, candidateLabel: null, detectedEntryPeriod: null, detectedEntryPeriodEvidence: null },
  subjects: [] as Array<Record<string, unknown>>,
  documentClaims: [{ type: "PENDING_TOTAL", value: 20, sourcePage: 2, rawText: "O aluno possui 20 disciplinas para adaptar." }],
  ambiguities: [],
};
// 28 linhas: 8 dispensadas, 20 pendentes (bate com a claim)
const rowsP1 = [
  ["LINGUA PORTUGUESA", 80, 1, "LINGUA PORTUGUESA"], ["MATEMATICA BASICA", 80, 1, "-"], ["INTRODUCAO AO DIREITO", 80, 1, "INTRODUCAO AO ESTUDO DO DIREITO"],
  ["SOCIOLOGIA", 40, 1, "-"], ["FILOSOFIA", 40, 1, "FILOSOFIA GERAL"], ["DIREITO CIVIL I", 80, 2, "-"], ["DIREITO PENAL I", 80, 2, "-"],
  ["ACOMPANHAMENTO DE CARREIRA", 0, 2, "CONTABILIDADE BASICA"], ["ETICA PROFISSIONAL", 40, 2, "CONTABILIDADE BASICA"], ["DIREITO CONSTITUCIONAL I", 80, 2, "-"],
  ["DIREITO CIVIL II", 80, 3, "-"], ["DIREITO PENAL II", 80, 3, "-"], ["DIREITO ADMINISTRATIVO", 80, 3, "-"], ["ECONOMIA", 40, 3, "ECONOMIA POLITICA"],
] as const;
const rowsP2 = [
  ["DIREITO CIVIL III", 80, 4, "-"], ["DIREITO PENAL III", 80, 4, "-"], ["DIREITO PROCESSUAL CIVIL I", 80, 4, "-"], ["DIREITO DO TRABALHO I", 80, 4, "DIREITO DO TRABALHO"],
  ["DIREITO EMPRESARIAL I", 80, 4, "DIREITO COMERCIAL"], ["DIREITO TRIBUTARIO I", 80, 4, "-"], ["PRATICA JURIDICA I", 40, 4, "-"],
  ["DIREITO CIVIL IV", 80, 5, "-"], ["DIREITO PROCESSUAL PENAL I", 80, 5, "-"], ["DIREITO PROCESSUAL CIVIL II", 80, 5, "-"], ["DIREITO DO TRABALHO II", 80, 5, "-"],
  ["DIREITO EMPRESARIAL II", 80, 5, "-"], ["DIREITO AMBIENTAL", 40, 5, "-"], ["PRATICA JURIDICA II", 40, 5, "-"],
] as const;
[...rowsP1.map((r, i) => [1, i + 1, r] as const), ...rowsP2.map((r, i) => [2, i + 1, r] as const)].forEach(([page, row, r]) => {
  extractorResult.subjects.push({ code: null, name: r[0], workload: r[1], period: r[2], usedSubject: r[3] === "-" ? null : r[3], sourcePage: page, sourceRow: row, readability: "CLEAR", note: null });
});

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/services/openai/client-factory", () => ({
  getOpenAIClient: async () => ({ client: {}, config: { extractionModel: "gpt-5.5", auditModel: "gpt-5.4-mini", futureExplanationModel: null } }),
}));
vi.mock("@/services/openai/extractor", () => ({
  extractCurriculum: async () => ({ data: extractorResult, usage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 }, durationMs: 5, promptVersion: "1.0.0", model: "gpt-5.5" }),
}));
vi.mock("@/services/openai/auditor", () => ({
  auditCurriculum: async () => ({
    data: { status: "REVIEW", issues: [{ code: "WRONG_WORKLOAD", severity: "INFO", subjectRowHash: null, sourcePage: 1, message: "Observação de teste." }] },
    usage: { inputTokens: 800, outputTokens: 100, totalTokens: 900 },
    durationMs: 5,
    promptVersion: "1.0.0",
    model: "gpt-5.4-mini",
  }),
}));

let dbOk = false;
let prismaMod: typeof import("@/lib/prisma");
let userId = "";
const created: string[] = [];

beforeAll(async () => {
  try {
    prismaMod = await import("@/lib/prisma");
    await prismaMod.prisma.$queryRaw`SELECT 1`;
    const admin = await prismaMod.prisma.user.findFirst({ where: { role: "ADMIN" } });
    if (!admin) throw new Error("seed ausente");
    userId = admin.id;
    dbOk = true;
  } catch {
    dbOk = false;
  }
});

afterAll(async () => {
  if (!dbOk) return;
  // KEEP_TEST_DATA=1 preserva a análise para inspeção manual na UI
  if (!process.env.KEEP_TEST_DATA) await prismaMod.prisma.curricularAnalysis.deleteMany({ where: { id: { in: created } } });
  await prismaMod.prisma.$disconnect();
});

describe("pipeline (integração)", () => {
  it("upload → parsing → extração → cálculo → auditoria → WAITING_REVIEW por ingresso não confirmado; confirmação recalcula", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { createAnalysisFromUpload } = await import("@/features/analyses/create-analysis");
    const { runAnalysisPipeline, recalculateAnalysis } = await import("@/services/pipeline/runner");
    const { prisma } = prismaMod;

    const { id } = await createAnalysisFromUpload({ userId, bytes: fixture, originalName: "sample.pdf", startTerm: "2026.2", force: true });
    created.push(id);
    // mesmo SHA-256 sem force → detecção de duplicado apontando para uma análise existente
    await expect(createAnalysisFromUpload({ userId, bytes: fixture, originalName: "sample.pdf", startTerm: "2026.2" })).rejects.toMatchObject({ name: "DuplicateDocumentError" });
    await runAnalysisPipeline(id);

    let a = await prisma.curricularAnalysis.findUniqueOrThrow({ where: { id }, include: { subjects: true, warnings: true, projections: true, claims: true, usages: true, reviews: true } });
    expect(a.status).toBe("WAITING_REVIEW");
    expect(a.subjects).toHaveLength(28);
    expect(a.subjects.filter((s) => s.status === "EXEMPTED")).toHaveLength(8);
    expect(a.subjects.filter((s) => s.status === "PENDING")).toHaveLength(20);
    expect(a.courseName).toBe("DIREITO - EAD");
    expect(a.entryPeriod).toBeNull();
    expect(a.warnings.map((w) => w.code)).toContain("ENTRY_PERIOD_REQUIRED");
    expect(a.claims.find((c) => c.type === "PENDING_TOTAL")?.matches).toBe(true);
    expect(a.projections).toHaveLength(0);
    expect(a.usages.map((u) => u.operation).sort()).toEqual(["AUDIT", "CURRICULUM_EXTRACTION"]);
    expect(a.reviews[0]?.status).toBe("REVIEW");
    expect(a.warnings.some((w) => w.source === "AUDITOR")).toBe(true);
    expect(a.reliability).toBe("REVIEW_REQUIRED");
    // bbox associado pelo parser local
    expect(a.subjects.filter((s) => s.bbox !== null).length).toBeGreaterThan(20);

    // confirmação do período de ingresso (4º) → recálculo
    await prisma.curricularAnalysis.update({ where: { id }, data: { entryPeriod: 4, entryPeriodSource: "USER" } });
    await recalculateAnalysis(id);
    const b = await prisma.curricularAnalysis.findUniqueOrThrow({ where: { id }, include: { subjects: true, warnings: true, projections: { include: { subjects: true }, orderBy: { index: "asc" } }, claims: true, usages: true, reviews: true } });
    a = b;
    // backlog: pendentes dos períodos 1-3 = 2+3+3 = 8; 4º período: 7 disciplinas, 2 dispensadas → 5 regulares, cap 10, backlog cap 5
    expect(a.projections).toHaveLength(2);
    expect(a.projections[0].term).toBe("2026.2");
    expect(a.projections[0].regularSubjectsToTake).toBe(5);
    expect(a.projections[0].maximumCapacity).toBe(10);
    expect(a.projections[0].subjectsFromBacklog).toBe(5);
    expect(a.projections[0].remainingBacklog).toBe(3);
    expect(a.projections[1].term).toBe("2027.1");
    expect(a.projections[1].subjectsFromBacklog).toBe(3);
    expect(a.projections[1].remainingBacklog).toBe(0);
    expect(a.projectionIncomplete).toBe(false);
    expect(a.warnings.map((w) => w.code)).not.toContain("ENTRY_PERIOD_REQUIRED");
    // nenhuma disciplina programada duas vezes
    const ids = b.projections.flatMap((p) => p.subjects.map((s) => s.subjectId));
    expect(new Set(ids).size).toBe(ids.length);
    // a auditoria permanece registrada como recomendação, mas uma análise com
    // ingresso informado é concluída automaticamente.
    expect(a.reliability).toBe("REVIEW_RECOMMENDED");
    expect(a.status).toBe("COMPLETED");
  }, 60_000);
});
