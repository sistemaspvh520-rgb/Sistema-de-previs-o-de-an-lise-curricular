import "server-only";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { nodeFetch } from "@/services/openai/node-fetch";
import { OpenAISecretService } from "@/services/openai/credentials";
import { OpenAIIntegrationError, OPENAI_ERROR_MESSAGES } from "@/services/openai/errors";
import { isAiEnabled } from "@/repositories/settings-repository";

export interface OpenAIRuntimeConfig {
  extractionModel: string;
  auditModel: string;
  futureExplanationModel: string | null;
}

/** Cria um cliente temporário a partir de uma chave em memória (usado no teste de conexão). */
export function createEphemeralClient(apiKey: string, opts?: { timeoutMs?: number }): OpenAI {
  return new OpenAI({ apiKey, timeout: opts?.timeoutMs ?? 30_000, maxRetries: 0, fetch: nodeFetch });
}

/**
 * OpenAIClientFactory.getOpenAIClient()
 * Descriptografa a chave apenas em memória e instancia o SDK oficial.
 * O plaintext nunca é persistido nem logado.
 */
export async function getOpenAIClient(opts?: { timeoutMs?: number; maxRetries?: number; ignoreAiSwitch?: boolean }): Promise<{
  client: OpenAI;
  config: OpenAIRuntimeConfig;
}> {
  // Chave geral "Usar IA": desligada, nenhum recurso faz chamadas à OpenAI.
  if (!opts?.ignoreAiSwitch && !(await isAiEnabled())) {
    throw new OpenAIIntegrationError("AI_DISABLED", OPENAI_ERROR_MESSAGES.AI_DISABLED);
  }
  const apiKey = await OpenAISecretService.getApiKeyForServer();
  const integration = await prisma.openAIIntegration.findUniqueOrThrow({
    where: { id: "default" },
    select: { extractionModel: true, auditModel: true, futureExplanationModel: true },
  });
  const client = new OpenAI({
    apiKey,
    timeout: opts?.timeoutMs ?? 120_000,
    maxRetries: opts?.maxRetries ?? 2,
    fetch: nodeFetch,
  });
  return { client, config: integration };
}
