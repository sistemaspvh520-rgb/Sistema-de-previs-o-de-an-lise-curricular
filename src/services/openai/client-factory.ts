import "server-only";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { OpenAISecretService } from "@/services/openai/credentials";

export interface OpenAIRuntimeConfig {
  extractionModel: string;
  auditModel: string;
  futureExplanationModel: string | null;
}

/** Cria um cliente temporário a partir de uma chave em memória (usado no teste de conexão). */
export function createEphemeralClient(apiKey: string, opts?: { timeoutMs?: number }): OpenAI {
  return new OpenAI({ apiKey, timeout: opts?.timeoutMs ?? 30_000, maxRetries: 0 });
}

/**
 * OpenAIClientFactory.getOpenAIClient()
 * Descriptografa a chave apenas em memória e instancia o SDK oficial.
 * O plaintext nunca é persistido nem logado.
 */
export async function getOpenAIClient(opts?: { timeoutMs?: number; maxRetries?: number }): Promise<{
  client: OpenAI;
  config: OpenAIRuntimeConfig;
}> {
  const apiKey = await OpenAISecretService.getApiKeyForServer();
  const integration = await prisma.openAIIntegration.findUniqueOrThrow({
    where: { id: "default" },
    select: { extractionModel: true, auditModel: true, futureExplanationModel: true },
  });
  const client = new OpenAI({
    apiKey,
    timeout: opts?.timeoutMs ?? 120_000,
    maxRetries: opts?.maxRetries ?? 2,
  });
  return { client, config: integration };
}
