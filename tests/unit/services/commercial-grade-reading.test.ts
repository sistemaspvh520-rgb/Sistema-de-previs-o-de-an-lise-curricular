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
