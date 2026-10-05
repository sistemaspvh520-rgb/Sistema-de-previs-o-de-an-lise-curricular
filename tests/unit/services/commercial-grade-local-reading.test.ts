import { beforeEach, describe, expect, it, vi } from "vitest";
import { OPENAI_ERROR_MESSAGES, OpenAIIntegrationError } from "@/services/openai/errors";

// Função simples (não vi.fn): o Vitest marca como falha um vi.fn que lança, mesmo quando o código sob teste trata o erro.
let parseImpl: () => Promise<{ textByPage: string[] }> = async () => ({ textByPage: [] });
vi.mock("@/services/pdf/parser", () => ({ parsePdf: () => parseImpl() }));
// Cliente de IA controlado pelo teste; por padrão, IA desligada (modo local), como em produção sem a chave geral.
const calls: number[] = [];
const inputs: unknown[] = [];
let aiBehavior: (maxOutputTokens: number) => Promise<unknown> = async () => { throw new OpenAIIntegrationError("AI_DISABLED", OPENAI_ERROR_MESSAGES.AI_DISABLED); };
vi.mock("@/services/openai/client-factory", () => ({
  getOpenAIClient: async () => ({
    config: { extractionModel: "modelo-teste" },
    client: { responses: { parse: async (args: { max_output_tokens: number; input: unknown }) => { calls.push(args.max_output_tokens); inputs.push(args.input); return aiBehavior(args.max_output_tokens); } } },
  }),
}));

const pdfText = (text: string) => { parseImpl = async () => ({ textByPage: [text] }); };

describe("leitura local da grade comercial (IA desligada)", () => {
  beforeEach(() => {
    parseImpl = async () => ({ textByPage: [] });
    calls.length = 0;
    inputs.length = 0;
    aiBehavior = async () => { throw new OpenAIIntegrationError("AI_DISABLED", OPENAI_ERROR_MESSAGES.AI_DISABLED); };
  });

  it("não escreve carga horária absurda quando o texto cola colunas da tabela", async () => {
    pdfText("Matriz Curricular - 20251 - CST EM ESTÉTICA E COSMÉTICA\nGRADUAÇÃO EAD\nTotal em Horas Relógio 1.779.282.528.265.481.200.000.000.000.000\nTCC");
    const { readCommercialGrade } = await import("@/services/commercial-grades/reader");
    const reading = await readCommercialGrade(Buffer.from("x"), "CST EM ESTÉTICA E COSMÉTICA.PDF");
    expect(reading.source).toBe("LOCAL");
    expect(reading.totalCourseHours).toBeNull();
    expect(reading.whatsappSummary).not.toMatch(/Carga horária total/);
    expect(reading.whatsappSummary).not.toMatch(/\d{1,3}(\.\d{3}){4,}/);
  });

  it("não afirma que o curso 'não possui estágio' só porque a leitura local não achou estágios", async () => {
    pdfText("Matriz Curricular - 20251 - CST EM ESTÉTICA E COSMÉTICA\nTotal em Horas Relógio 1.680");
    const { readCommercialGrade } = await import("@/services/commercial-grades/reader");
    const reading = await readCommercialGrade(Buffer.from("x"), "a.pdf");
    expect(reading.whatsappSummary).not.toMatch(/não possui estágio/i);
    expect(reading.whatsappSummary).toContain("Carga horária total: 1.680 horas.");
  });

  it("lê totais em formatos brasileiros e a vigência no formato AAAA.S", async () => {
    pdfText("Matriz Curricular - 20252 - CST EM RADIOLOGIA\nVigência 2025.2\nTotal de horas de Estágio 480\nTotal em Horas Relógio 2.880,00");
    const { readCommercialGrade } = await import("@/services/commercial-grades/reader");
    const reading = await readCommercialGrade(Buffer.from("x"), "a.pdf");
    expect(reading).toMatchObject({ totalInternshipHours: 480, totalCourseHours: 2880, curriculumTerm: "2025.2", knowledgeArea: "Saúde" });
  });

  it("continua publicando (com campos vazios) quando o PDF não pode ser lido localmente", async () => {
    parseImpl = async () => { throw new Error("PDF corrompido"); };
    const { readCommercialGrade } = await import("@/services/commercial-grades/reader");
    const reading = await readCommercialGrade(Buffer.from("x"), "CST EM GESTÃO.PDF");
    expect(reading.courseName).toBe("CST EM GESTÃO");
    expect(reading.totalCourseHours).toBeNull();
  });

  it("informa o motivo quando a IA falha e não repete tentativa inútil (IA desligada)", async () => {
    pdfText("Matriz Curricular - 20251 - CST EM ESTÉTICA E COSMÉTICA");
    const { readCommercialGrade } = await import("@/services/commercial-grades/reader");
    const reading = await readCommercialGrade(Buffer.from("x"), "a.pdf");
    expect(reading.source).toBe("LOCAL");
    expect(reading.aiNote).toMatch(/IA está desativada/);
    expect(calls).toEqual([6_000]);
  });

  it("repete com mais espaço de saída quando a resposta da IA vem cortada e usa o resultado da IA", async () => {
    pdfText("Matriz Curricular - 20251 - CST EM ESTÉTICA E COSMÉTICA");
    const ai = { courseName: "CST em Estética e Cosmética", modality: "EAD", curriculumTerm: "2025.1", hasTcc: true, totalInternshipHours: 160, totalCourseHours: 1680, internships: [{ semester: 3, name: "Estágio em Estética I", workload: 80 }], degree: "Tecnólogo", knowledgeArea: "Saúde", durationSemesters: 4, tracks: [] };
    aiBehavior = async (max) => (max === 6_000 ? { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output_parsed: null } : { status: "completed", output_parsed: ai });
    const { readCommercialGrade } = await import("@/services/commercial-grades/reader");
    const reading = await readCommercialGrade(Buffer.from("x"), "a.pdf");
    expect(calls).toEqual([6_000, 16_000]);
    expect(reading).toMatchObject({ source: "AI", totalCourseHours: 1680, totalInternshipHours: 160, curriculumTerm: "2025.1" });
    expect(reading.whatsappSummary).toContain("3º sem.: Estágio em Estética I (80h)");
    expect(reading.whatsappSummary).not.toMatch(/não possui estágio/);
  });

  it("não repete a chamada quando a falha é de rede/inesperada e mostra a causa", async () => {
    pdfText("Matriz Curricular - 20251 - CST EM ESTÉTICA E COSMÉTICA");
    aiBehavior = async () => { throw new TypeError("Body is unusable: Body has already been read"); };
    const { readCommercialGrade } = await import("@/services/commercial-grades/reader");
    const reading = await readCommercialGrade(Buffer.from("x"), "a.pdf");
    expect(calls).toEqual([6_000]);
    expect(reading.aiNote).toContain("Body is unusable");
  });

  it("envia só o texto extraído quando ele é suficiente e anexa o PDF quando é pouco (PDF escaneado)", async () => {
    const ai = { courseName: "CST", modality: null, curriculumTerm: null, hasTcc: false, totalInternshipHours: null, totalCourseHours: null, internships: [], degree: null, knowledgeArea: null, durationSemesters: null, tracks: [] };
    aiBehavior = async () => ({ status: "completed", output_parsed: ai });
    const { readCommercialGrade } = await import("@/services/commercial-grades/reader");
    const types = (i: unknown) => ((i as { content: { type: string }[] }[])[0].content).map((c) => c.type);

    pdfText("Matriz Curricular - 20251 - CST EM GESTÃO\n" + "Disciplina de teste 80h\n".repeat(120));
    await readCommercialGrade(Buffer.from("x"), "a.pdf");
    expect(types(inputs[0])).toEqual(["input_text"]);

    inputs.length = 0;
    pdfText("Matriz Curricular - 20251 - CST EM GESTÃO");
    await readCommercialGrade(Buffer.from("x"), "a.pdf");
    expect(types(inputs[0])).toEqual(["input_text", "input_file"]);
  });
});
