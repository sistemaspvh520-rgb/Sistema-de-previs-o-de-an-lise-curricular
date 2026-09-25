import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";

vi.mock("server-only", () => ({}));

import { extractCalendarEvidence, readCalendarBoundaries, type CalendarEvidenceLine } from "@/services/academic-calendar/calendar-reader";
import type { ParsedPage, TextLine } from "@/services/pdf/parser";

function pdfLine(parts: Array<{ x: number; text: string }>): TextLine {
  const positioned = parts.map((part) => ({ ...part, w: Math.max(5, part.text.length * 5) }));
  return { x: 0, y: 100, w: 500, h: 10, text: positioned.map((part) => part.text).join("\t"), parts: positioned };
}

function clientFor(output: unknown): OpenAI {
  return {
    responses: {
      parse: vi.fn().mockResolvedValue({ output_parsed: output, usage: { input_tokens: 120, output_tokens: 90, total_tokens: 210 } }),
    },
  } as unknown as OpenAI;
}

const evidence: CalendarEvidenceLine[] = [
  { month: 1, day: 26, text: "Início do período letivo 2027.1" },
  { month: 6, day: 30, text: "Término do semestre letivo" },
  { month: 8, day: 3, text: "Início do período letivo 2027.2" },
  { month: 12, day: 19, text: "Término do semestre letivo" },
];

describe("AI academic-calendar extraction safeguards", () => {
  it("extracts event day from the PDF date column, not from the model", () => {
    const page: ParsedPage = { page: 1, width: 600, height: 800, lines: [
      pdfLine([{ x: 10, text: "JANEIRO" }]),
      pdfLine([{ x: 185, text: "26" }, { x: 238, text: "Inicio do periodo Letivo 2027.1" }]),
      pdfLine([{ x: 10, text: "JUNHO" }]),
      pdfLine([{ x: 185, text: "30" }, { x: 238, text: "Término do semestre letivo" }]),
    ] };
    expect(extractCalendarEvidence([page], 2027)).toEqual([
      { month: 1, day: 26, text: "26\tInicio do periodo Letivo 2027.1" },
      { month: 6, day: 30, text: "30\tTérmino do semestre letivo" },
    ]);
  });

  it("accepts only dates grounded in exact extracted boundary lines", async () => {
    const client = clientFor({ year: 2027, terms: [
      { semester: 1, start: { day: 26, month: 1, evidence: evidence[0].text }, end: { day: 30, month: 6, evidence: evidence[1].text } },
      { semester: 2, start: { day: 3, month: 8, evidence: evidence[2].text }, end: { day: 19, month: 12, evidence: evidence[3].text } },
    ] });
    const result = await readCalendarBoundaries({ client, model: "test-model", targetYear: 2027, evidence });
    if (!result.terms) throw new Error(result.error);
    expect(result.terms.map(({ term, startsOn, endsOn }) => ({ term, startsOn, endsOn }))).toEqual([
      { term: "2027.1", startsOn: "2027-01-26", endsOn: "2027-06-30" },
      { term: "2027.2", startsOn: "2027-08-03", endsOn: "2027-12-19" },
    ]);
    expect(result.usage.totalTokens).toBe(210);
  });

  it("returns a rejected date with usage for accurate token accounting", async () => {
    const client = clientFor({ year: 2027, terms: [
      { semester: 1, start: { day: 26, month: 1, evidence: evidence[0].text }, end: { day: 30, month: 6, evidence: "Aulas encerradas dia 30 de junho" } },
      { semester: 2, start: { day: 3, month: 8, evidence: evidence[2].text }, end: { day: 19, month: 12, evidence: evidence[3].text } },
    ] });
    await expect(readCalendarBoundaries({ client, model: "test-model", targetYear: 2027, evidence })).resolves.toMatchObject({ terms: null, error: expect.stringContaining("não confirmam início e término"), usage: { totalTokens: 210 } });
  });

  it("rejects a date that conflicts with the day parsed from its exact source row", async () => {
    const client = clientFor({ year: 2027, terms: [
      { semester: 1, start: { day: 27, month: 1, evidence: evidence[0].text }, end: { day: 30, month: 6, evidence: evidence[1].text } },
      { semester: 2, start: { day: 3, month: 8, evidence: evidence[2].text }, end: { day: 19, month: 12, evidence: evidence[3].text } },
    ] });
    await expect(readCalendarBoundaries({ client, model: "test-model", targetYear: 2027, evidence })).resolves.toMatchObject({ terms: null, error: expect.stringContaining("não confirmam início e término"), usage: { totalTokens: 210 } });
  });
});
