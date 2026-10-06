import { describe, expect, it } from "vitest";
import { BadRequestError } from "openai";
import { supportsReasoningEffort, withLowEffort } from "@/services/openai/economy";

describe("economia nas chamadas à OpenAI", () => {
  it("só pede raciocínio baixo a modelos de raciocínio que aceitam o parâmetro", () => {
    expect(supportsReasoningEffort("gpt-5.6-sol")).toBe(true);
    expect(supportsReasoningEffort("gpt-5.4-mini")).toBe(true);
    expect(supportsReasoningEffort("o4-mini")).toBe(true);
    expect(supportsReasoningEffort("gpt-5.5-pro")).toBe(false);
    expect(supportsReasoningEffort("gpt-4.1")).toBe(false);
  });

  it("envia reasoning.effort = low e, se o modelo recusar, refaz uma vez sem o parâmetro", async () => {
    const seen: unknown[] = [];
    const result = await withLowEffort("gpt-5.6-sol", async (effort) => {
      seen.push(effort);
      if (effort.reasoning) throw new BadRequestError(400, { message: "Unsupported parameter: 'reasoning.effort'" }, "Unsupported parameter: 'reasoning.effort'", new Headers());
      return "ok";
    });
    expect(result).toBe("ok");
    expect(seen).toEqual([{ reasoning: { effort: "low" } }, {}]);
  });

  it("não engole outros erros nem repete a chamada", async () => {
    let calls = 0;
    await expect(withLowEffort("gpt-5.6-sol", async () => { calls++; throw new Error("rede"); })).rejects.toThrow("rede");
    expect(calls).toBe(1);
  });

  it("modelo sem raciocínio é chamado sem o parâmetro", async () => {
    const seen: unknown[] = [];
    await withLowEffort("gpt-4.1", async (effort) => { seen.push(effort); return null; });
    expect(seen).toEqual([{}]);
  });
});
