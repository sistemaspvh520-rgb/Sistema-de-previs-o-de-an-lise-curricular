/**
 * Preços estimados por 1M de tokens (USD). Tabela editável — usada apenas para ESTIMATIVA de custo.
 * Atualize conforme a tabela oficial da OpenAI.
 */
export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

const PRICING: Record<string, ModelPricing> = {
  // Preço promocional atual do GPT-5.6 Sol (confira a vigência no painel da OpenAI).
  "gpt-5.6-sol": { inputPerMillion: 2, outputPerMillion: 10 },
  "gpt-5.5": { inputPerMillion: 2.5, outputPerMillion: 15 },
  "gpt-5.5-pro": { inputPerMillion: 15, outputPerMillion: 120 },
  "gpt-5.4": { inputPerMillion: 2.5, outputPerMillion: 15 },
  "gpt-5.4-mini": { inputPerMillion: 0.5, outputPerMillion: 3 },
  "gpt-5.4-nano": { inputPerMillion: 0.1, outputPerMillion: 0.6 },
  "gpt-5.2": { inputPerMillion: 1.75, outputPerMillion: 14 },
  "gpt-5.1": { inputPerMillion: 1.25, outputPerMillion: 10 },
  "gpt-5": { inputPerMillion: 1.25, outputPerMillion: 10 },
  "gpt-5-mini": { inputPerMillion: 0.25, outputPerMillion: 2 },
  "gpt-5-nano": { inputPerMillion: 0.05, outputPerMillion: 0.4 },
};

const FALLBACK: ModelPricing = { inputPerMillion: 2.5, outputPerMillion: 10 };

export function getModelPricing(model: string): ModelPricing {
  if (PRICING[model]) return PRICING[model];
  // tenta prefixo (ex.: gpt-5.4-mini-2026-03-17)
  const key = Object.keys(PRICING)
    .sort((a, b) => b.length - a.length)
    .find((k) => model.startsWith(k));
  return key ? PRICING[key] : FALLBACK;
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = getModelPricing(model);
  return (inputTokens / 1_000_000) * p.inputPerMillion + (outputTokens / 1_000_000) * p.outputPerMillion;
}

/** Modelos sugeridos no seletor (o admin pode digitar outro; será validado na OpenAI). */
export const SUGGESTED_MODELS = [
  "gpt-5.6-sol",
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-5.2",
  "gpt-5.1",
  "gpt-5",
  "gpt-5-mini",
];
