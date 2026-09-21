import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  OpenAIError,
} from "openai";
import {
  OPENAI_ERROR_MESSAGES,
  type OpenAIErrorCode,
} from "@/services/openai/error-messages";

export { OPENAI_ERROR_MESSAGES, type OpenAIErrorCode };

export class OpenAIIntegrationError extends Error {
  readonly code: OpenAIErrorCode;
  readonly status?: number;
  constructor(code: OpenAIErrorCode, message: string, status?: number) {
    super(message);
    this.name = "OpenAIIntegrationError";
    this.code = code;
    this.status = status;
  }
}

/** Converte qualquer erro do SDK em OpenAIIntegrationError com código e mensagem amigável. */
export function mapOpenAIError(err: unknown): OpenAIIntegrationError {
  if (err instanceof OpenAIIntegrationError) return err;

  if (err instanceof APIConnectionTimeoutError) {
    return new OpenAIIntegrationError("TIMEOUT", OPENAI_ERROR_MESSAGES.TIMEOUT);
  }
  if (err instanceof APIConnectionError) {
    return new OpenAIIntegrationError(
      "CONNECTION_ERROR",
      OPENAI_ERROR_MESSAGES.CONNECTION_ERROR,
    );
  }
  if (err instanceof APIError) {
    const status = err.status;
    const code = (err as { code?: string | null }).code ?? "";
    const type = (err as { type?: string | null }).type ?? "";
    const msg = (err.message ?? "").toLowerCase();

    if (status === 401)
      return new OpenAIIntegrationError(
        "INVALID_API_KEY",
        OPENAI_ERROR_MESSAGES.INVALID_API_KEY,
        401,
      );
    if (status === 403)
      return new OpenAIIntegrationError(
        "FORBIDDEN",
        OPENAI_ERROR_MESSAGES.FORBIDDEN,
        403,
      );
    if (
      status === 404 ||
      code === "model_not_found" ||
      msg.includes("does not exist") ||
      msg.includes("model")
    ) {
      if (
        status === 404 ||
        code === "model_not_found" ||
        msg.includes("model")
      ) {
        return new OpenAIIntegrationError(
          "MODEL_NOT_FOUND",
          OPENAI_ERROR_MESSAGES.MODEL_NOT_FOUND,
          status,
        );
      }
    }
    if (status === 429) {
      if (
        code === "insufficient_quota" ||
        type === "insufficient_quota" ||
        msg.includes("quota") ||
        msg.includes("billing")
      ) {
        return new OpenAIIntegrationError(
          "INSUFFICIENT_QUOTA",
          OPENAI_ERROR_MESSAGES.INSUFFICIENT_QUOTA,
          429,
        );
      }
      return new OpenAIIntegrationError(
        "RATE_LIMITED",
        OPENAI_ERROR_MESSAGES.RATE_LIMITED,
        429,
      );
    }
    if (
      status === 400 &&
      (msg.includes("file") || msg.includes("pdf") || code === "invalid_file")
    ) {
      return new OpenAIIntegrationError(
        "FILE_REJECTED",
        OPENAI_ERROR_MESSAGES.FILE_REJECTED,
        400,
      );
    }
    if (status && status >= 500)
      return new OpenAIIntegrationError(
        "SERVER_ERROR",
        OPENAI_ERROR_MESSAGES.SERVER_ERROR,
        status,
      );
    return new OpenAIIntegrationError(
      "UNKNOWN",
      OPENAI_ERROR_MESSAGES.UNKNOWN,
      status,
    );
  }
  if (err instanceof OpenAIError) {
    return new OpenAIIntegrationError("UNKNOWN", OPENAI_ERROR_MESSAGES.UNKNOWN);
  }
  if (
    err &&
    typeof err === "object" &&
    "name" in err &&
    (err as { name: string }).name === "ZodError"
  ) {
    return new OpenAIIntegrationError(
      "INVALID_STRUCTURED_OUTPUT",
      OPENAI_ERROR_MESSAGES.INVALID_STRUCTURED_OUTPUT,
    );
  }
  if (err instanceof Error && /abort|timeout/i.test(err.message)) {
    return new OpenAIIntegrationError("TIMEOUT", OPENAI_ERROR_MESSAGES.TIMEOUT);
  }
  return new OpenAIIntegrationError("UNKNOWN", OPENAI_ERROR_MESSAGES.UNKNOWN);
}
