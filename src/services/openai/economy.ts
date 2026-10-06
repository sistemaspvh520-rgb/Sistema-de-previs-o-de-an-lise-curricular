import { APIError } from "openai";

/**
 * Economia nas chamadas à OpenAI. Modelos de raciocínio (gpt-5*, o*) gastam tokens "pensando" antes de responder e
 * esse gasto entra no limite de saída: com o esforço padrão, respostas curtas (JSON de poucas linhas) saem caras e
 * podem vir cortadas. Para extração/conferência estruturada, esforço "low" basta.
 */

/** Modelos de raciocínio aceitam esforço "low"; os "-pro" só aceitam o padrão. */
export function supportsReasoningEffort(model: string): boolean {
  return /^(gpt-5|o\d)/i.test(model) && !/-pro\b/i.test(model);
}

/** A OpenAI recusou o parâmetro de raciocínio (modelo sem suporte). */
export function rejectsReasoningEffort(error: unknown): boolean {
  return error instanceof APIError && error.status === 400 && /reasoning/i.test(`${error.param ?? ""} ${error.message}`);
}

type LowEffort = { reasoning?: { effort: "low" } };

/**
 * Executa a chamada com esforço de raciocínio baixo quando o modelo aceita; se a OpenAI recusar o parâmetro, refaz
 * uma única vez sem ele. Uso: `withLowEffort(model, (effort) => client.responses.parse({ ...params, ...effort }))`.
 */
export async function withLowEffort<T>(model: string, call: (effort: LowEffort) => Promise<T>): Promise<T> {
  if (!supportsReasoningEffort(model)) return call({});
  try {
    return await call({ reasoning: { effort: "low" } });
  } catch (error) {
    if (rejectsReasoningEffort(error)) return call({});
    throw error;
  }
}
