import { describe, expect, it } from "vitest";
import { auditCurriculumLocally } from "@/services/pipeline/local-audit";
import type { SubjectRow } from "@/domain/curricular-analysis/types";
import type { LocalExtraction } from "@/services/pdf/parser";

const subject = (over: Partial<SubjectRow> & Pick<SubjectRow, "id" | "name">): SubjectRow => ({ workload: 40, period: 1, usedSubject: null, status: "PENDING", readability: "CLEAR", sourcePage: 1, sourceRow: 1, sortIndex: 0, ...over });
const row = (over: Record<string, unknown>) => ({ page: 1, rowIndex: 1, code: null, name: "X", workload: 40, period: 1, usedSubject: null, bbox: { x: 0, y: 0, w: 1, h: 1 }, pageBreakDuplicate: false, ...over });
const local = (rows: unknown[], text = ""): LocalExtraction => ({ pageCount: 1, pages: [], textByPage: [text], parserVersion: "t", table: { rows, headers: {}, freeText: {} } } as unknown as LocalExtraction);

describe("auditCurriculumLocally", () => {
  it("OK quando a análise bate com a tabela, o texto e os totais declarados", () => {
    const out = auditCurriculumLocally({
      subjects: [subject({ id: "a", name: "ÁLGEBRA LINEAR" })],
      manualIds: new Set(),
      local: local([row({ name: "ÁLGEBRA LINEAR" })], "Álgebra Linear 40h"),
      claimMismatches: [],
    });
    expect(out).toEqual({ status: "OK", issues: [] });
  });

  it("aponta linha ausente, período, carga horária e status divergentes da tabela do PDF", () => {
    const out = auditCurriculumLocally({
      subjects: [subject({ id: "a", name: "CÁLCULO", period: 2, workload: 60, status: "EXEMPTED", usedSubject: "CALCULO" })],
      manualIds: new Set(),
      local: local([row({ name: "CÁLCULO", period: 1, workload: 80, usedSubject: null }), row({ rowIndex: 2, name: "FÍSICA" })], "cálculo física"),
      claimMismatches: [],
    });
    const codes = out.issues.map((i) => i.code).sort();
    expect(out.status).toBe("REVIEW");
    expect(codes).toEqual(["POSSIBLE_MISSING_ROW", "WRONG_PERIOD", "WRONG_STATUS", "WRONG_WORKLOAD"]);
    expect(out.issues.find((i) => i.code === "WRONG_PERIOD")?.subjectRowHash).toBe("a");
  });

  it("ignora linhas corrigidas manualmente, detecta duplicadas e total declarado divergente", () => {
    const out = auditCurriculumLocally({
      subjects: [
        subject({ id: "m", name: "CORRIGIDA À MÃO", period: 3 }),
        subject({ id: "d1", name: "REDES", sourceRow: 2 }),
        subject({ id: "d2", name: "Redes", sourceRow: 3, sourcePage: 2 }),
      ],
      manualIds: new Set(["m"]),
      local: local([row({ rowIndex: 2, name: "REDES" }), row({ rowIndex: 3, page: 2, name: "REDES" })], "redes"),
      claimMismatches: [{ type: "PENDING_TOTAL", value: 27, calculatedValue: 0, sourcePage: 1 }],
    });
    expect(out.issues.map((i) => i.code).sort()).toEqual(expect.arrayContaining(["POSSIBLE_DUPLICATE_ROW", "TOTAL_MISMATCH"]));
    expect(out.issues.some((i) => i.subjectRowHash === "m")).toBe(false);
    expect(out.issues.find((i) => i.code === "TOTAL_MISMATCH")?.message).toContain("27");
  });
});
