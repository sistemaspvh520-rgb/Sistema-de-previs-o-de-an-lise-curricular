import "server-only";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { OpenAISecretService } from "@/services/openai/credentials";
import { OpenAIIntegrationError, OPENAI_ERROR_MESSAGES } from "@/services/openai/errors";
import { isAiEnabled } from "@/repositories/settings-repository";

/**
 * fetch que lê a resposta inteira antes de entregá-la ao SDK. Na Vercel o fetch global é
 * instrumentado (Next.js/Sentry) e o corpo da resposta podia ser lido duas vezes, gerando
 * "TypeError: Body is unusable: Body has already been read". Nenhum recurso usa streaming.
 */
const bufferedFetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const res = await fetch(input, { ...init, cache: "no-store" });
  const body = res.status === 204 || res.status === 205 || res.status === 304 ? null : await res.arrayBuffer();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}) as typeof fetch;

export interface OpenAIRuntimeConfig {
  extractionModel: string;
  auditModel: string;
  futureExplanationModel: string | null;
}

/** Cria um cliente temporário a partir de uma chave em memória (usado no teste de conexão). */
export function createEphemeralClient(apiKey: string, opts?: { timeoutMs?: number }): OpenAI {
  return new OpenAI({ apiKey, timeout: opts?.timeoutMs ?? 30_000, maxRetries: 0, fetch: bufferedFetch });
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
    fetch: bufferedFetch,
  });
  return { client, config: integration };
}
