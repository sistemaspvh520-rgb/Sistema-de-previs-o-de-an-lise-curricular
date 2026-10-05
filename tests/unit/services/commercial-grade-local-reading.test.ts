import { beforeEach, describe, expect, it, vi } from "vitest";

// Função simples (não vi.fn): o Vitest marca como falha um vi.fn que lança, mesmo quando o código sob teste trata o erro.
let parseImpl: () => Promise<{ textByPage: string[] }> = async () => ({ textByPage: [] });
vi.mock("@/services/pdf/parser", () => ({ parsePdf: () => parseImpl() }));
// IA desligada: a leitura cai no modo local, como em produção sem a chave geral.
vi.mock("@/services/openai/client-factory", () => ({ getOpenAIClient: async () => { throw new Error("A IA está desativada."); } }));

const pdfText = (text: string) => { parseImpl = async () => ({ textByPage: [text] }); };

describe("leitura local da grade comercial (IA desligada)", () => {
  beforeEach(() => { parseImpl = async () => ({ textByPage: [] }); });

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
});
