import "server-only";
import type OpenAI from "openai";
import { createEphemeralClient } from "@/services/openai/client-factory";
import { mapOpenAIError, OpenAIIntegrationError, OPENAI_ERROR_MESSAGES } from "@/services/openai/errors";
import { isStructurallyValidApiKey } from "@/services/openai/credentials";
import { CONNECTION_TEST_PROMPT } from "@/services/openai/prompts";
import { logger } from "@/lib/logger";

export interface ConnectionTestResult {
  ok: true;
  model: string;
  durationMs: number;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
}

/**
 * Executa uma validação REAL da credencial:
 *  1. estrutura básica;
 *  2. models.retrieve(model) — confirma acesso ao modelo;
 *  3. responses.create mínimo — confirma que a chave consegue gerar.
 * Lança OpenAIIntegrationError em qualquer falha. Nunca inclui a chave em erros/logs.
 */
export async function testOpenAIConnection(
  apiKey: string,
  model: string,
  clientFactory: (key: string) => OpenAI = (k) => createEphemeralClient(k),
): Promise<ConnectionTestResult> {
  if (!isStructurallyValidApiKey(apiKey)) {
    throw new OpenAIIntegrationError("INVALID_API_KEY", "Formato de API Key inválido. Esperado algo como sk-...");
  }
  const client = clientFactory(apiKey.trim());
  const started = Date.now();
  try {
    await client.models.retrieve(model);
    const response = await client.responses.create({
      model,
      input: CONNECTION_TEST_PROMPT,
      max_output_tokens: 16,
    });
    const usage = response.usage;
    const result: ConnectionTestResult = {
      ok: true,
      model,
      durationMs: Date.now() - started,
      usage: {
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      },
    };
    logger.info("openai.connection_test.ok", { model, durationMs: result.durationMs });
    return result;
  } catch (err) {
    const mapped = mapOpenAIError(err);
    logger.warn("openai.connection_test.failed", { model, code: mapped.code, status: mapped.status });
    throw mapped;
  }
}

/** Verifica se um modelo existe para a chave atual. */
export async function checkModelAvailable(client: OpenAI, model: string): Promise<void> {
  try {
    await client.models.retrieve(model);
  } catch (err) {
    const mapped = mapOpenAIError(err);
    if (mapped.code === "UNKNOWN" || mapped.code === "MODEL_NOT_FOUND") {
      throw new OpenAIIntegrationError("MODEL_NOT_FOUND", OPENAI_ERROR_MESSAGES.MODEL_NOT_FOUND, mapped.status);
    }
    throw mapped;
  }
}
