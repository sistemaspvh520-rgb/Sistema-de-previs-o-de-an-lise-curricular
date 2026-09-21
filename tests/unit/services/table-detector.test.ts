import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parsePdf, extractHeaderFields } from "@/services/pdf/parser";
import { detectTables, effectiveRows, mergeContinuation, tableToText } from "@/services/pdf/table-detector";
import { crossCheckWithLocalTable, readHeaderMetadata } from "@/services/pipeline/cross-check";
import { redactPersonalData } from "@/services/pdf/redaction";

const synthetic = readFileSync(path.join(__dirname, "../../fixtures/sample-analise.pdf"));
const realPath = path.join(process.cwd(), "samples/analise-real-01.pdf");

describe("table-detector (fixture sintética)", () => {
  it("reconstrói as 28 linhas com C.H., série e disciplina utilizada", async () => {
    const local = await parsePdf(synthetic);
    const rows = effectiveRows(local.table!);
    expect(rows).toHaveLength(28);
    const r = rows.find((x) => x.name === "ACOMPANHAMENTO DE CARREIRA")!;
    expect(r.workload).toBe(0);
    expect(r.period).toBe(2);
    expect(r.usedSubject).toBe("CONTABILIDADE BASICA");
    expect(rows.filter((x) => x.usedSubject === null)).toHaveLength(20);
    expect(tableToText(local.table!)).toContain("[p1 l8]");
    expect(local.headerFields?.curso).toContain("DIREITO - EAD");
  });
});

describe("mergeContinuation", () => {
  it("remove a sobreposição repetida na quebra de página", () => {
    expect(mergeContinuation("TEORIA DOS GRAFOS", "GRAFOS")).toBe("TEORIA DOS GRAFOS");
    expect(mergeContinuation("AVALIAÇÃO EM CIÊNCIA DA", "CIÊNCIA DA COMPUTAÇÃO I")).toBe("AVALIAÇÃO EM CIÊNCIA DA COMPUTAÇÃO I");
    expect(mergeContinuation("COMPUTABILIDADE E COMPLEXIDADE", "E COMPLEXIDADE DE ALGORITMOS")).toBe("COMPUTABILIDADE E COMPLEXIDADE DE ALGORITMOS");
  });
});

describe("extractHeaderFields / readHeaderMetadata", () => {
  it("lê Curso, Série (ingresso) e Grade", () => {
    const f = extractHeaderFields(["Campus: CRUZEIRO - GRADUAÇÃO EAD", "Curso: CIÊNCIA DA COMPUTAÇÃO (BACHARELADO)", "Série: 4", "Período: EAD", "Grade: 20221/2023-2"]);
    const m = readHeaderMetadata({ pageCount: 1, pages: [], textByPage: [], parserVersion: "x", headerFields: f });
    expect(m.entryPeriod).toBe(4);
    expect(m.course).toBe("CIÊNCIA DA COMPUTAÇÃO (BACHARELADO)");
    expect(m.matrix).toBe("20221/2023-2");
    expect(m.modality).toBe("EAD");
  });
  it("mascara o CPF presente na URL do rodapé", () => {
    expect(redactPersonalData("...jsf?inicio=1&codigoEmpresa=12&cpfCandidato=1729124402&nrInscricao=2")).toContain("cpfCandidato=[CPF]");
  });
});

describe("table-detector (PDF real em samples/, pulado se ausente)", () => {
  it("reconstrói 74 linhas lógicas, resolve quebras de página e lê o cabeçalho", async (ctx) => {
    if (!existsSync(realPath)) return ctx.skip();
    const local = await parsePdf(readFileSync(realPath));
    const rows = effectiveRows(local.table!);
    expect(rows).toHaveLength(74);
    expect(local.table!.rows.length - rows.length).toBe(1); // repetição do código 3710 na quebra de página
    expect(rows.find((r) => r.code === "3710")?.name).toBe("COMPUTABILIDADE E COMPLEXIDADE DE ALGORITMOS");
    expect(rows.find((r) => r.code === "11319")?.name).toBe("AVALIAÇÃO INTEGRADA DE COMPETÊNCIAS EM CIÊNCIA DA COMPUTAÇÃO I");
    expect(rows.find((r) => r.code === "11330")?.name).toBe("TEORIA DOS GRAFOS");
    expect(rows.every((r) => r.code && r.period && r.workload !== null)).toBe(true);
    const byPeriod = rows.reduce<Record<number, number>>((a, r) => ((a[r.period!] = (a[r.period!] ?? 0) + 1), a), {});
    expect(byPeriod).toEqual({ 1: 11, 2: 9, 3: 9, 4: 9, 5: 9, 6: 9, 7: 9, 8: 9 });
    expect(rows.filter((r) => r.usedSubject).length).toBe(26);
    const meta = readHeaderMetadata(local);
    expect(meta.entryPeriod).toBe(4);
    expect(meta.course).toContain("CIÊNCIA DA COMPUTAÇÃO");
    // cruzamento: extração idêntica não gera alertas; uma linha a menos gera alertas
    const asExtracted = rows.map((r, i) => ({ rowHash: `h${i}`, code: r.code, name: r.name, workload: r.workload!, period: r.period!, usedSubject: r.usedSubject, status: "PENDING" as const, readability: "CLEAR" as const, sourcePage: r.page, sourceRow: r.rowIndex, bbox: null, note: null, sortIndex: i }));
    expect(crossCheckWithLocalTable(local, asExtracted)).toEqual([]);
    const missing = crossCheckWithLocalTable(local, asExtracted.slice(1));
    expect(missing.map((w) => w.code)).toEqual(["LOCAL_ROW_COUNT_MISMATCH", "LOCAL_ROW_NOT_EXTRACTED"]);
  });
});
