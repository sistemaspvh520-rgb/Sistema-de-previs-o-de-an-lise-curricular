import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";

vi.mock("server-only", () => ({}));

import { reviewAmbiguousAcademicRows, type AmbiguousAcademicRow } from "@/services/academic-analysis/ai-review";

const rows: AmbiguousAcademicRow[] = [{ rowRef: "1-3", code: "BIO1", name: "Biologia", rawPeriod: "", period: null, status: "A CURSAR" }];

function clientFor(output: unknown): OpenAI {
  return {
    responses: {
      parse: vi.fn().mockResolvedValue({ output_parsed: output, usage: { input_tokens: 90, output_tokens: 50, total_tokens: 140 } }),
    },
  } as unknown as OpenAI;
}

describe("AI tutor review", () => {
  it("returns guidance only and preserves usage metrics", async () => {
    const result = await reviewAmbiguousAcademicRows({
      client: clientFor({ reviews: [{ rowRef: "1-3", reasonToReview: "O período não foi lido.", tutorCheck: "Compare a coluna S/T no PDF." }] }),
      model: "test-model",
      rows,
      warnings: [],
    });
    expect(result).toMatchObject({ reviews: [{ rowRef: "1-3" }], usage: { totalTokens: 140 } });
  });

  it("rejects references outside the submitted rows without losing token accounting", async () => {
    const result = await reviewAmbiguousAcademicRows({
      client: clientFor({ reviews: [{ rowRef: "2-9", reasonToReview: "Verifique a linha.", tutorCheck: "Compare com o PDF." }] }),
      model: "test-model",
      rows,
      warnings: [],
    });
    expect(result).toMatchObject({ reviews: null, error: expect.stringContaining("referência"), usage: { totalTokens: 140 } });
  });
});
