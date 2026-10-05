import { describe, expect, it } from "vitest";
import { APIError } from "openai";
import { formatIntegrationError, mapOpenAIError } from "@/services/openai/errors";

describe("mapOpenAIError", () => {
  it("expõe a causa técnica quando o erro é inesperado", () => {
    const err = new APIError(400, { message: "Unsupported parameter: 'foo'", type: "invalid_request_error", param: "foo" }, undefined, new Headers());
    const mapped = mapOpenAIError(err);
    expect(mapped.code).toBe("UNKNOWN");
    expect(formatIntegrationError(mapped)).toContain("Unsupported parameter");
  });

  it("mascara chaves na causa técnica", () => {
    const mapped = mapOpenAIError(new Error("falhou com sk-abcdefghijkl1234"));
    expect(formatIntegrationError(mapped)).not.toContain("abcdefghijkl1234");
  });

  it("não confunde qualquer menção a 'model' com modelo inexistente", () => {
    const err = new APIError(400, { message: "Invalid value for model output format", type: "invalid_request_error" }, undefined, new Headers());
    expect(mapOpenAIError(err).code).toBe("UNKNOWN");
  });

  it("reconhece modelo inexistente", () => {
    const err = new APIError(404, { message: "The model `x` does not exist", code: "model_not_found" }, undefined, new Headers());
    expect(mapOpenAIError(err).code).toBe("MODEL_NOT_FOUND");
  });
});
