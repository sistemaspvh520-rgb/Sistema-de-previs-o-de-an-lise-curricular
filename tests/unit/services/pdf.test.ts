import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parsePdf, countPdfPages } from "@/services/pdf/parser";
import { validatePdfBytes, PdfValidationError } from "@/services/pdf/validate";
import { redactPersonalData } from "@/services/pdf/redaction";

const fixture = readFileSync(path.join(__dirname, "../../fixtures/sample-analise.pdf"));

describe("validação de PDF", () => {
  it("aceita PDF válido", async () => {
    await expect(validatePdfBytes(fixture, { maxBytes: 1024 * 1024 })).resolves.toEqual({ ok: true, mimeType: "application/pdf" });
  });
  it("rejeita vazio, grande demais e não-PDF", async () => {
    await expect(validatePdfBytes(Buffer.alloc(0), { maxBytes: 100 })).rejects.toBeInstanceOf(PdfValidationError);
    await expect(validatePdfBytes(fixture, { maxBytes: 10 })).rejects.toMatchObject({ code: "TOO_LARGE" });
    await expect(validatePdfBytes(Buffer.from("PK\x03\x04 fake zip"), { maxBytes: 1000 })).rejects.toMatchObject({ code: "NOT_PDF" });
    const png = Buffer.concat([Buffer.from("%PDF-"), Buffer.from([0x89, 0x50, 0x4e, 0x47])]);
    await expect(validatePdfBytes(png, { maxBytes: 1000 })).resolves.toBeTruthy(); // header manda; file-type não detecta como outro tipo
  });
});

describe("parser pdf.js", () => {
  it("conta páginas e extrai linhas com posições", async () => {
    expect(await countPdfPages(fixture)).toBe(2);
    const parsed = await parsePdf(fixture);
    expect(parsed.pageCount).toBe(2);
    expect(parsed.pages).toHaveLength(2);
    const p1 = parsed.pages[0];
    expect(p1.width).toBeGreaterThan(500);
    const header = p1.lines.find((l) => l.text.includes("DISCIPLINA"));
    expect(header).toBeDefined();
    expect(header!.text).toContain("\t");
    const row = p1.lines.find((l) => l.text.startsWith("ACOMPANHAMENTO DE CARREIRA"));
    expect(row).toBeDefined();
    expect(row!.text.split("\t")).toEqual(["ACOMPANHAMENTO DE CARREIRA", "0", "2", "CONTABILIDADE BASICA"]);
    expect(row!.y).toBeGreaterThan(0);
    expect(parsed.textByPage[1]).toContain("20 disciplinas para adaptar");
  });
});

describe("redação LGPD", () => {
  it("mascara CPF, RG, telefone, e-mail e CEP", () => {
    const out = redactPersonalData("CPF 123.456.789-09 RG 12.345.678-9 tel (11) 91234-5678 mail a@b.com cep 01234-567");
    expect(out).toContain("[CPF]");
    expect(out).toContain("[RG]");
    expect(out).toContain("[TEL]");
    expect(out).toContain("[EMAIL]");
    expect(out).toContain("[CEP]");
    expect(out).not.toContain("123.456.789-09");
  });
});
