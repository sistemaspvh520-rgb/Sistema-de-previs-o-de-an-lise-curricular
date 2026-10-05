import { describe, expect, it } from "vitest";
import { getAutoPerformanceIntegrations, getDefaultIntegrations } from "@sentry/nextjs";
import { sentryOptions, withoutOpenAIIntegration } from "@/lib/observability/sentry-options";

describe("Sentry × OpenAI", () => {
  // O Sentry.init entrega ao callback `integrations` as padrão + as automáticas (onde está a OpenAI).
  const defaults = () => [...getDefaultIntegrations({}), ...getAutoPerformanceIntegrations()];
  const names = (list: Array<{ name: string }>) => list.map((integration) => integration.name);

  it("o Sentry liga a integração OpenAI por padrão (se o nome mudar, o filtro precisa acompanhar)", () => {
    expect(names(defaults())).toContain("OpenAI");
  });

  it("remove só a integração OpenAI, que lê a resposta antes do responses.parse()", () => {
    const all = defaults();
    const kept = withoutOpenAIIntegration(all);
    expect(names(kept)).not.toContain("OpenAI");
    expect(kept).toHaveLength(all.length - 1);
    expect(sentryOptions.integrations).toBe(withoutOpenAIIntegration);
  });
});
