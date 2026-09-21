import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { APIError, APIConnectionTimeoutError } from "openai";
import { testOpenAIConnection } from "@/services/openai/test-connection";

function fakeClient(opts: { retrieve?: () => Promise<unknown>; create?: () => Promise<unknown> }): OpenAI {
  return {
    models: { retrieve: opts.retrieve ?? (async () => ({ id: "gpt-5.5" })) },
    responses: { create: opts.create ?? (async () => ({ usage: { input_tokens: 5, output_tokens: 1, total_tokens: 6 } })) },
  } as unknown as OpenAI;
}

const VALID = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789";

describe("testOpenAIConnection", () => {
  it("chave válida: retrieve + create reais → ok com usage", async () => {
    const retrieve = vi.fn(async () => ({ id: "gpt-5.5" }));
    const create = vi.fn(async () => ({ usage: { input_tokens: 5, output_tokens: 1, total_tokens: 6 } }));
    const r = await testOpenAIConnection(VALID, "gpt-5.5", () => fakeClient({ retrieve, create }));
    expect(r.ok).toBe(true);
    expect(r.usage.totalTokens).toBe(6);
    expect(retrieve).toHaveBeenCalledWith("gpt-5.5");
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("estrutura inválida não chama a API", async () => {
    const factory = vi.fn();
    await expect(testOpenAIConnection("abc", "gpt-5.5", factory)).rejects.toMatchObject({ code: "INVALID_API_KEY" });
    expect(factory).not.toHaveBeenCalled();
  });
  it("chave inválida (401)", async () => {
    const err = new APIError(401, { error: { message: "Incorrect API key" } }, "Incorrect API key", new Headers());
    await expect(testOpenAIConnection(VALID, "gpt-5.5", () => fakeClient({ retrieve: async () => { throw err; } }))).rejects.toMatchObject({ code: "INVALID_API_KEY" });
  });
  it("chave revogada (401 na geração)", async () => {
    const err = new APIError(401, {}, "revoked", new Headers());
    await expect(testOpenAIConnection(VALID, "gpt-5.5", () => fakeClient({ create: async () => { throw err; } }))).rejects.toMatchObject({ code: "INVALID_API_KEY" });
  });
  it("sem acesso (403)", async () => {
    const err = new APIError(403, {}, "forbidden", new Headers());
    await expect(testOpenAIConnection(VALID, "gpt-5.5", () => fakeClient({ retrieve: async () => { throw err; } }))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("timeout", async () => {
    await expect(testOpenAIConnection(VALID, "gpt-5.5", () => fakeClient({ create: async () => { throw new APIConnectionTimeoutError({ message: "t" }); } }))).rejects.toMatchObject({ code: "TIMEOUT" });
  });
  it("rate limit (429)", async () => {
    const err = new APIError(429, {}, "rate limit", new Headers());
    await expect(testOpenAIConnection(VALID, "gpt-5.5", () => fakeClient({ create: async () => { throw err; } }))).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
  it("falha 5xx", async () => {
    const err = new APIError(500, {}, "boom", new Headers());
    await expect(testOpenAIConnection(VALID, "gpt-5.5", () => fakeClient({ create: async () => { throw err; } }))).rejects.toMatchObject({ code: "SERVER_ERROR" });
  });
  it("erro nunca contém a chave", async () => {
    const err = new APIError(401, {}, "bad", new Headers());
    try {
      await testOpenAIConnection(VALID, "gpt-5.5", () => fakeClient({ retrieve: async () => { throw err; } }));
    } catch (e) {
      expect(String((e as Error).message)).not.toContain(VALID);
    }
  });
});
