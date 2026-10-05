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
  it("leitura completa do PDF não gera aviso de IA; leitura incompleta pede revisão e mostra a causa da IA", async () => {
    const { publishMessage } = await import("@/services/commercial-grades/publish");
    expect(publishMessage({ source: "LOCAL", aiNote: null, complete: true }, false)).toBe("Grade lida do PDF e disponibilizada para o time comercial; confira os dados antes do envio.");
    expect(publishMessage({ source: "LOCAL", aiNote: null, complete: true }, true)).toMatch(/^Grade atualizada a partir do PDF/);
    expect(publishMessage({ source: "LOCAL", aiNote: null, complete: false }, false)).toMatch(/não trouxe todos os dados.*revise/);
    expect(publishMessage({ source: "LOCAL", aiNote: "tempo esgotado", complete: false }, false)).toContain("(IA indisponível: tempo esgotado)");
    expect(publishMessage({ source: "AI", aiNote: null, complete: true }, false)).toMatch(/completada pela IA/);
  });
});
