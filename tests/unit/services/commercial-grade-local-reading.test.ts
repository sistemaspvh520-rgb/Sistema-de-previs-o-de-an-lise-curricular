import { beforeEach, describe, expect, it, vi } from "vitest";
import { OPENAI_ERROR_MESSAGES, OpenAIIntegrationError } from "@/services/openai/errors";
import type { ParsedPage, TextLine } from "@/services/pdf/parser";

/** Páginas da matriz do SIAA já endireitadas pelo parser (série 8 com estágio e TCC + resumo). */
function siaaPages(opts: { internship: string; withInternship?: boolean }): ParsedPage[] {
  const line = (y: number, parts: Array<[number, string]>): TextLine => ({ x: parts[0][0], y, w: 700, h: 8, text: parts.map((p) => p[1]).join("\t"), parts: parts.map(([x, text]) => ({ x, w: text.length * 4.5, text })) });
  const row = (y: number, code: string, workload: string, type: string) => line(y, [[13, code], [265, "-"], [339, workload], [615, type]]);
  return [
    { page: 1, width: 745, height: 595, lines: [
      line(579, [[5, "GRADUAÇÃO EAD (UCS/UNC/UNF)"]]),
      line(559, [[254, "Matriz Curricular - 91 - NUTRIÇÃO (BACHARELADO) (4.0)"]]),
      line(421, [[5, "Série: 8"], [79, "Seq.: 20252"]]),
      line(397, [[43, "Descrição"], [327, "H. Relogio"]]),
      ...(opts.withInternship === false ? [] : [line(377, [[48, "ESTÁGIO CURRICULAR SUPERVISIONADO"]]), row(373, "12999", "214", "Estágio"), line(367, [[48, "EM NUTRIÇÃO CLÍNICA"]])]),
      line(357, [[48, "TRABALHO DE CONCLUSÃO DE CURSO EM"]]),
      row(353, "14265", "40", "TCC"),
      line(347, [[48, "NUTRIÇÃO: PRODUÇÃO"]]),
    ] },
    { page: 2, width: 745, height: 595, lines: [
      line(534, [[21, "Estágio Curricular Supervisionado"], [279, "-"], [517, opts.internship]]),
      line(438, [[21, "Total em Horas Relógio"], [393, "3200"]]),
    ] },
  ];
}

// Função simples (não vi.fn): o Vitest marca como falha um vi.fn que lança, mesmo quando o código sob teste trata o erro.
let parseImpl: () => Promise<{ textByPage: string[]; pages?: ParsedPage[] }> = async () => ({ textByPage: [] });
vi.mock("@/services/pdf/parser", () => ({ parsePdf: () => parseImpl() }));
// Cliente de IA controlado pelo teste; por padrão, IA desligada (modo local), como em produção sem a chave geral.
const calls: number[] = [];
const inputs: unknown[] = [];
let aiBehavior: (maxOutputTokens: number) => Promise<unknown> = async () => { throw new OpenAIIntegrationError("AI_DISABLED", OPENAI_ERROR_MESSAGES.AI_DISABLED); };
vi.mock("@/services/openai/usage", () => ({ recordUsage: async () => undefined }));
vi.mock("@/services/openai/client-factory", () => ({
  getOpenAIClient: async () => ({
    config: { extractionModel: "modelo-teste" },
    client: { responses: { parse: async (args: { max_output_tokens: number; input: unknown }) => { calls.push(args.max_output_tokens); inputs.push(args.input); return aiBehavior(args.max_output_tokens); } } },
  }),
}));

const pdfText = (text: string) => { parseImpl = async () => ({ textByPage: [text] }); };

describe("leitura da grade comercial (PDF + IA)", () => {
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

  it("IA desligada não é falha: segue com o PDF, sem aviso de IA indisponível e sem repetir", async () => {
    pdfText("Matriz Curricular - 20251 - CST EM ESTÉTICA E COSMÉTICA");
    const { readCommercialGrade } = await import("@/services/commercial-grades/reader");
    const reading = await readCommercialGrade(Buffer.from("x"), "a.pdf");
    expect(reading.source).toBe("LOCAL");
    expect(reading.aiNote).toBeNull();
    expect(reading.complete).toBe(false);
    expect(calls).toEqual([4_000]);
  });

  it("IA desligada: matriz do SIAA lida por inteiro no PDF", async () => {
    parseImpl = async () => ({ textByPage: ["x"], pages: siaaPages({ internship: "640" }) });
    const { readCommercialGrade } = await import("@/services/commercial-grades/reader");
    const reading = await readCommercialGrade(Buffer.from("x"), "NUTRIÇÃO.PDF");
    expect(reading).toMatchObject({ source: "LOCAL", aiNote: null, complete: true, courseName: "NUTRIÇÃO (BACHARELADO)", modality: "EAD", curriculumTerm: "2025.2", degree: "Bacharelado", knowledgeArea: "Saúde", durationSemesters: 8, totalInternshipHours: 640, totalCourseHours: 3200, hasTcc: true });
    expect(reading.whatsappSummary).toContain("- 8º sem.: ESTÁGIO CURRICULAR SUPERVISIONADO EM NUTRIÇÃO CLÍNICA (214h)");
    expect(reading.whatsappSummary).toContain("Ao todo, a matriz prevê 640 horas de estágio durante o curso.");
  });

  const nutritionAi = { courseName: "NUTRIÇÃO (BACHARELADO)", modality: "EAD", curriculumTerm: "2025.2", hasTcc: true, totalInternshipHours: 640, totalCourseHours: 3200, internships: [{ semester: 8, name: "Estágio Curricular Supervisionado em Nutrição Clínica", workload: 214 }], degree: "Bacharelado", knowledgeArea: "Saúde", durationSemesters: 8, tracks: [] };

  it("opção 'sem IA': lê só o PDF e não chama a OpenAI nem com a IA ligada", async () => {
    parseImpl = async () => ({ textByPage: ["x"], pages: siaaPages({ internship: "640" }) });
    aiBehavior = async () => ({ status: "completed", output_parsed: nutritionAi });
    const { readCommercialGrade } = await import("@/services/commercial-grades/reader");
    const reading = await readCommercialGrade(Buffer.from("x"), "NUTRIÇÃO.PDF", { useAi: false });
    expect(calls).toEqual([]);
    expect(reading).toMatchObject({ source: "LOCAL", aiNote: null, complete: true, totalCourseHours: 3200, totalInternshipHours: 640, durationSemesters: 8 });
  });

  it("IA ligada: lê a grade e, quando bate com as colunas do PDF, fica conferida", async () => {
    parseImpl = async () => ({ textByPage: ["x"], pages: siaaPages({ internship: "640" }) });
    aiBehavior = async () => ({ status: "completed", output_parsed: nutritionAi });
    const { readCommercialGrade } = await import("@/services/commercial-grades/reader");
    const reading = await readCommercialGrade(Buffer.from("x"), "NUTRIÇÃO.PDF");
    expect(calls).toEqual([4_000]);
    expect(reading).toMatchObject({ source: "AI", checkedWithPdf: true, complete: true, totalInternshipHours: 640, totalCourseHours: 3200, durationSemesters: 8, hasTcc: true });
    expect(reading.divergences).toBeUndefined();
  });

  it("IA ligada: se a IA divergir do PDF, vale o PDF e cada divergência é apontada", async () => {
    parseImpl = async () => ({ textByPage: ["x"], pages: siaaPages({ internship: "640" }) });
    aiBehavior = async () => ({ status: "completed", output_parsed: { ...nutritionAi, totalCourseHours: 669, hasTcc: false, internships: [], totalInternshipHours: 0 } });
    const { readCommercialGrade } = await import("@/services/commercial-grades/reader");
    const reading = await readCommercialGrade(Buffer.from("x"), "NUTRIÇÃO.PDF");
    expect(reading).toMatchObject({ source: "LOCAL", totalCourseHours: 3200, totalInternshipHours: 640, hasTcc: true });
    expect(reading.divergences).toEqual([
      "carga horária total (PDF: 3.200h; IA: 669h)",
      "horas de estágio (PDF: 640h; IA: 0h)",
      "semestres de estágio (PDF: 8º; IA: nenhum)",
      "TCC (PDF: sim; IA: não)",
    ]);
    expect(reading.whatsappSummary).not.toMatch(/669/);
  });

  it("informa que não há estágio quando o resumo do PDF declara estágio zerado", async () => {
    parseImpl = async () => ({ textByPage: ["x"], pages: siaaPages({ internship: "-", withInternship: false }) });
    const { readCommercialGrade } = await import("@/services/commercial-grades/reader");
    const reading = await readCommercialGrade(Buffer.from("x"), "a.pdf");
    expect(reading.totalInternshipHours).toBe(0);
    expect(reading.whatsappSummary).toMatch(/não possui estágio obrigatório/);
  });

  it("repete com mais espaço de saída quando a resposta da IA vem cortada e usa o resultado da IA", async () => {
    pdfText("Matriz Curricular - 20251 - CST EM ESTÉTICA E COSMÉTICA");
    const ai = { courseName: "CST em Estética e Cosmética", modality: "EAD", curriculumTerm: "2025.1", hasTcc: true, totalInternshipHours: 160, totalCourseHours: 1680, internships: [{ semester: 3, name: "Estágio em Estética I", workload: 80 }], degree: "Tecnólogo", knowledgeArea: "Saúde", durationSemesters: 4, tracks: [] };
    aiBehavior = async (max) => (max === 4_000 ? { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output_parsed: null } : { status: "completed", output_parsed: ai });
    const { readCommercialGrade } = await import("@/services/commercial-grades/reader");
    const reading = await readCommercialGrade(Buffer.from("x"), "a.pdf");
    expect(calls).toEqual([4_000, 12_000]);
    expect(reading).toMatchObject({ source: "AI", totalCourseHours: 1680, totalInternshipHours: 160, curriculumTerm: "2025.1" });
    expect(reading.whatsappSummary).toContain("3º sem.: Estágio em Estética I (80h)");
    expect(reading.whatsappSummary).not.toMatch(/não possui estágio/);
  });

  it("não repete a chamada quando a falha é de rede/inesperada e mostra a causa", async () => {
    pdfText("Matriz Curricular - 20251 - CST EM ESTÉTICA E COSMÉTICA");
    aiBehavior = async () => { throw new TypeError("Body is unusable: Body has already been read"); };
    const { readCommercialGrade } = await import("@/services/commercial-grades/reader");
    const reading = await readCommercialGrade(Buffer.from("x"), "a.pdf");
    expect(calls).toEqual([4_000]);
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
