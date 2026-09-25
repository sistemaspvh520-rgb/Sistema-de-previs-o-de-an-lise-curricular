import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { parsePdf } from "@/services/pdf/parser";
import { classifyAcademicDocument } from "@/services/academic-documents/classifier";
import { extractAcademicHistory } from "@/services/academic-documents/history";
import { academicFingerprint } from "@/services/student-portal/fingerprints";
// Opt-in local acceptance: private documents are never copied into the repository.
const dir = process.env.ACADEMIC_REFERENCE_DIR;
describe.skipIf(!dir)("user-provided history references", () => {
  it("recognizes vector preview, official certification and identical academic state", async () => {
    const simple = await parsePdf(
      fs.readFileSync(`${dir}/Historico_Simples_Conferencia.pdf`),
    );
    const official = await parsePdf(
      fs.readFileSync(`${dir}/Historico_Escolar (1).pdf`),
    );
    expect(classifyAcademicDocument(simple)).toBe("SIMPLE_ACADEMIC_HISTORY");
    expect(classifyAcademicDocument(official)).toBe(
      "OFFICIAL_ACADEMIC_HISTORY",
    );
    const a = extractAcademicHistory(simple, "SIMPLE_ACADEMIC_HISTORY");
    const b = extractAcademicHistory(official, "OFFICIAL_ACADEMIC_HISTORY");
    expect(a.disciplines).toHaveLength(42);
    expect(a.disciplines.every((r) => r.period === null)).toBe(true);
    expect(
      a.disciplines.filter((r) => r.academicTerm === "2026/2").length,
    ).toBeGreaterThan(20);
    expect(a.plannedWorkload).toBe(2000);
    expect(a.integralizedWorkload).toBe(870);
    expect((a.integralizedWorkload! / a.plannedWorkload!) * 100).toBe(43.5);
    expect(academicFingerprint(a)).toBe(academicFingerprint(b));
    expect(a.disciplines.some((r) => /Ensino, Pesquisa/.test(r.name))).toBe(
      false,
    );
  });
});
