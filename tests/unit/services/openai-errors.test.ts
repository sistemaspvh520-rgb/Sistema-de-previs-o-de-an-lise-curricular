import { describe, expect, it } from "vitest";
import { APIConnectionError, APIConnectionTimeoutError, APIError } from "openai";
import { mapOpenAIError, OPENAI_ERROR_MESSAGES } from "@/services/openai/errors";

function apiError(status: number, message = "x", extra: Record<string, unknown> = {}) {
  return new APIError(status, { error: { message, ...extra } }, message, new Headers());
}

describe("mapOpenAIError", () => {
  it("401 → INVALID_API_KEY (inválida/revogada)", () => {
    expect(mapOpenAIError(apiError(401, "Incorrect API key provided")).code).toBe("INVALID_API_KEY");
  });
  it("403 → FORBIDDEN (sem acesso)", () => expect(mapOpenAIError(apiError(403)).code).toBe("FORBIDDEN"));
  it("404 modelo → MODEL_NOT_FOUND", () => expect(mapOpenAIError(apiError(404, "The model `x` does not exist")).code).toBe("MODEL_NOT_FOUND"));
  it("429 → RATE_LIMITED ou INSUFFICIENT_QUOTA", () => {
    expect(mapOpenAIError(apiError(429, "Rate limit reached")).code).toBe("RATE_LIMITED");
    expect(mapOpenAIError(apiError(429, "You exceeded your current quota", { code: "insufficient_quota" })).code).toBe("INSUFFICIENT_QUOTA");
  });
  it("5xx → SERVER_ERROR", () => expect(mapOpenAIError(apiError(503)).code).toBe("SERVER_ERROR"));
  it("timeout e conexão", () => {
    expect(mapOpenAIError(new APIConnectionTimeoutError({ message: "t" })).code).toBe("TIMEOUT");
    expect(mapOpenAIError(new APIConnectionError({ message: "c" })).code).toBe("CONNECTION_ERROR");
  });
  it("ZodError → INVALID_STRUCTURED_OUTPUT", () => {
    const zodLike = Object.assign(new Error("invalid"), { name: "ZodError" });
    expect(mapOpenAIError(zodLike).code).toBe("INVALID_STRUCTURED_OUTPUT");
  });
  it("mensagens amigáveis nunca contêm chave", () => {
    for (const m of Object.values(OPENAI_ERROR_MESSAGES)) expect(m).not.toMatch(/sk-/);
  });
});
