import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { assignHistoryPeriodsWithAI } from "@/services/academic-analysis/ai-period-mapping";
import type OpenAI from "openai";

function client(assignments: Array<{ ref: number; period: number }>) {
  return {
    responses: {
      parse: vi.fn(async () => ({ output_parsed: { assignments }, usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } })),
    },
  } as unknown as OpenAI;
}

const rows = ["A", "B", "C", "D"].map((name) => ({ name, academicTerm: "2025/1", status: "APROVADO" }));

describe("mapeamento de períodos com IA", () => {
  it("aceita períodos crescentes que cobrem todas as linhas", async () => {
    const result = await assignHistoryPeriodsWithAI({ client: client([{ ref: 0, period: 1 }, { ref: 1, period: 1 }, { ref: 2, period: 2 }, { ref: 3, period: 2 }]), model: "m", rows, courseName: null });
    expect(result.periods).toEqual([1, 1, 2, 2]);
    expect(result.usage.totalTokens).toBe(15);
  });

  it("rejeita respostas incompletas, fora de ordem ou com saltos", async () => {
    for (const assignments of [
      [{ ref: 0, period: 1 }, { ref: 1, period: 1 }],
      [{ ref: 0, period: 1 }, { ref: 1, period: 2 }, { ref: 2, period: 1 }, { ref: 3, period: 2 }],
      [{ ref: 0, period: 1 }, { ref: 1, period: 1 }, { ref: 2, period: 4 }, { ref: 3, period: 4 }],
    ])
      expect((await assignHistoryPeriodsWithAI({ client: client(assignments), model: "m", rows, courseName: null })).periods).toBeNull();
  });
});
