import { describe, expect, it } from "vitest";
import { cleanReadingText, safeReadingInt, sanitizeReading, type CommercialGradeReading } from "@/services/commercial-grades/reader";

const base: CommercialGradeReading = {
  courseName: "CST em Est\u0000etica", modality: "EAD", curriculumTerm: "2018/2", hasTcc: false,
  totalInternshipHours: 160, totalCourseHours: 3_000_000_000, degree: null, knowledgeArea: null, durationSemesters: 2.5,
  courseTracks: [{ name: "Trilha\u0000", decisionSemester: null, decisionEvidence: null, internships: [{ semester: 2, name: "Est\u0000ágio", workload: null }] }],
  internshipInfo: "- 2º sem.: Estágio\u0000", whatsappSummary: "Resumo\u0000", source: "LOCAL",
};

describe("leitura de grade comercial: valores aceitos pelo banco", () => {
  it("remove NUL/controles e mantém quebras de linha", () => {
    expect(cleanReadingText("a\u0000b\u0007c\nd")).toBe("abc\nd");
    expect(cleanReadingText("  \u0000 ")).toBeNull();
  });
  it("descarta inteiros fora de faixa ou decimais", () => {
    expect(safeReadingInt(3_000_000_000)).toBeNull();
    expect(safeReadingInt(2.5)).toBeNull();
    expect(safeReadingInt(NaN)).toBeNull();
    expect(safeReadingInt(3240)).toBe(3240);
  });
  it("sanitiza a leitura inteira, inclusive trilhas em JSON", () => {
    const clean = sanitizeReading(base);
    expect(JSON.stringify(clean)).not.toContain("\\u0000");
    expect(clean.totalCourseHours).toBeNull();
    expect(clean.durationSemesters).toBeNull();
    expect(clean.totalInternshipHours).toBe(160);
    expect(clean.courseTracks[0].internships[0]).toEqual({ semester: 2, name: "Estágio", workload: null });
  });
});

describe("mensagem ao publicar a grade", () => {
  it("diz quem leu a grade e quando há algo para conferir", async () => {
    const { publishMessage } = await import("@/services/commercial-grades/publish");
    expect(publishMessage({ source: "AI", aiNote: null, complete: true, checkedWithPdf: true }, false)).toEqual({ warning: false, message: "Grade disponibilizada: lida pela IA e conferida com o PDF." });
    expect(publishMessage({ source: "AI", aiNote: null, complete: true }, true)).toEqual({ warning: false, message: "Grade atualizada: lida pela IA; confira os dados antes do envio." });
    expect(publishMessage({ source: "LOCAL", aiNote: null, complete: true }, false)).toEqual({ warning: false, message: "Grade disponibilizada: lida do PDF; confira os dados antes do envio." });
    expect(publishMessage({ source: "LOCAL", aiNote: "sem crédito", complete: true }, false)).toEqual({ warning: true, message: "Grade disponibilizada: lida do PDF (IA indisponível: sem crédito); confira os dados antes do envio." });
    expect(publishMessage({ source: "LOCAL", aiNote: null, complete: false }, false).message).toMatch(/não trouxe todos os dados.*revise/);
    const divergent = publishMessage({ source: "LOCAL", aiNote: null, complete: true, divergences: ["TCC (PDF: não; IA: sim)"] }, false);
    expect(divergent.warning).toBe(true);
    expect(divergent.message).toContain("divergiram em: TCC (PDF: não; IA: sim). Mantivemos o que está no PDF");
  });
});

describe("texto enviado à IA", () => {
  it("compacta espaços e repete os cabeçalhos de coluna uma vez só, sem perder linhas de disciplina", async () => {
    const { compactMatrixText } = await import("@/services/commercial-grades/reader");
    const text = ["Série: 1\tSeq.: 20252", "Cod. Disc.\tHora Aula", "Teoria", "886\tLÍNGUA   BRASILEIRA\t40", "", "Série: 2\tSeq.: 20252", "Cod. Disc.\tHora Aula", "Teoria", "PLANO DE ACOMPANHAMENTO DE", "14028\t-\t10", "PLANO DE ACOMPANHAMENTO DE"].join("\n");
    expect(compactMatrixText(text).split("\n")).toEqual(["Série: 1\tSeq.: 20252", "Cod. Disc.\tHora Aula", "Teoria", "886\tLÍNGUA BRASILEIRA\t40", "Série: 2\tSeq.: 20252", "PLANO DE ACOMPANHAMENTO DE", "14028\t-\t10", "PLANO DE ACOMPANHAMENTO DE"]);
  });
});
