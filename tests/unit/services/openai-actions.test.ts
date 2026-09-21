/**
 * Testa as server actions da integração OpenAI com Prisma e SDK mockados:
 * conectar, trocar chave (válida/inválida), desconectar, RBAC e ausência da chave nas respostas.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state: { integration: Record<string, unknown>; user: { id: string; role: string } | null; audits: unknown[]; usages: unknown[] } = {
  integration: {},
  user: null,
  audits: [],
  usages: [],
};

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({
  auth: async () => (state.user ? { user: { id: state.user.id, role: state.user.role, email: "u@x", name: "U" } } : null),
}));
vi.mock("@/lib/prisma", () => {
  const upsert = async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
    if (!state.integration.id) state.integration = { status: "DISCONNECTED", extractionModel: "gpt-5.5", auditModel: "gpt-5.4-mini", updatedAt: new Date(), ...create };
    else Object.assign(state.integration, update);
    return { ...state.integration };
  };
  const update = async ({ data }: { data: Record<string, unknown> }) => {
    Object.assign(state.integration, data);
    return { ...state.integration };
  };
  return {
    prisma: {
      openAIIntegration: {
        upsert,
        update,
        updateMany: update,
        findUnique: async () => ({ ...state.integration }),
        findUniqueOrThrow: async () => ({ ...state.integration }),
      },
      auditLog: { create: async ({ data }: { data: unknown }) => state.audits.push(data) },
      aIUsage: { create: async ({ data }: { data: unknown }) => state.usages.push(data) },
    },
  };
});

const connection = { shouldFail: false };
vi.mock("@/services/openai/test-connection", async () => {
  const { OpenAIIntegrationError } = await import("@/services/openai/errors");
  return {
    testOpenAIConnection: async (apiKey: string, model: string) => {
      if (connection.shouldFail || !apiKey.startsWith("sk-")) throw new OpenAIIntegrationError("INVALID_API_KEY", "A API Key é inválida ou foi revogada.");
      return { ok: true, model, durationMs: 10, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
    },
    checkModelAvailable: async () => undefined,
  };
});

import { connectOpenAIAction, disconnectOpenAIAction, getOpenAIIntegrationView, replaceOpenAIKeyAction } from "@/features/integrations/openai/actions";
import { OpenAISecretService } from "@/services/openai/credentials";
import { resetRateLimits } from "@/services/rate-limit/rate-limit";

const KEY_A = "sk-proj-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1234";
const KEY_B = "sk-proj-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB5678";

beforeEach(() => {
  state.integration = { id: "default", status: "DISCONNECTED", extractionModel: "gpt-5.5", auditModel: "gpt-5.4-mini", updatedAt: new Date() };
  state.user = { id: "11111111-1111-4111-8111-111111111111", role: "ADMIN" };
  state.audits = [];
  state.usages = [];
  connection.shouldFail = false;
  resetRateLimits();
});

describe("connectOpenAIAction", () => {
  it("valida de verdade e persiste cifrado; nunca devolve a chave", async () => {
    const res = await connectOpenAIAction({ apiKey: KEY_A, projectLabel: "P", serviceAccountLabel: "SA" });
    expect(res.ok).toBe(true);
    expect(JSON.stringify(res)).not.toContain(KEY_A);
    expect(res.ok && res.data.apiKeyLastFour).toBe("1234");
    expect(state.integration.status).toBe("CONNECTED");
    expect(state.integration.encryptedApiKey).not.toContain("sk-");
    expect(await OpenAISecretService.getApiKeyForServer()).toBe(KEY_A);
    expect(state.audits.some((a) => (a as { action: string }).action === "openai.connect")).toBe(true);
    const view = await getOpenAIIntegrationView();
    expect(JSON.stringify(view)).not.toContain(KEY_A);
    expect(view.apiKeyLastFour).toBe("1234");
  });
  it("chave inválida não é persistida", async () => {
    const res = await connectOpenAIAction({ apiKey: "sk-proj-INVALIDINVALIDINVALIDINVALIDINVALID", projectLabel: "", serviceAccountLabel: "" });
    connection.shouldFail = true;
    expect(res.ok).toBe(true); // mock aceita qualquer sk-; força falha no próximo
    state.integration = { id: "default", status: "DISCONNECTED", extractionModel: "gpt-5.5", auditModel: "gpt-5.4-mini", updatedAt: new Date() };
    const res2 = await connectOpenAIAction({ apiKey: KEY_B });
    expect(res2.ok).toBe(false);
    expect(state.integration.status).toBe("DISCONNECTED");
    expect(state.integration.encryptedApiKey).toBeUndefined();
  });
  it("ANALISTA não pode acessar credencial/configuração", async () => {
    state.user = { id: "22222222-2222-4222-8222-222222222222", role: "ANALYST" };
    const res = await connectOpenAIAction({ apiKey: KEY_A });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/permissão/);
    await expect(getOpenAIIntegrationView()).rejects.toThrow(/permissão/);
  });
});

describe("replaceOpenAIKeyAction", () => {
  it("troca por chave válida", async () => {
    await connectOpenAIAction({ apiKey: KEY_A });
    const res = await replaceOpenAIKeyAction({ apiKey: KEY_B });
    expect(res.ok).toBe(true);
    expect(await OpenAISecretService.getApiKeyForServer()).toBe(KEY_B);
    expect(state.integration.apiKeyLastFour).toBe("5678");
  });
  it("chave inválida mantém a anterior ativa", async () => {
    await connectOpenAIAction({ apiKey: KEY_A });
    connection.shouldFail = true;
    const res = await replaceOpenAIKeyAction({ apiKey: KEY_B });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/anterior foi mantida/);
    expect(state.integration.status).toBe("CONNECTED");
    expect(await OpenAISecretService.getApiKeyForServer()).toBe(KEY_A);
  });
});

describe("disconnectOpenAIAction", () => {
  it("remove a chave e registra auditoria", async () => {
    await connectOpenAIAction({ apiKey: KEY_A });
    const res = await disconnectOpenAIAction();
    expect(res.ok).toBe(true);
    expect(state.integration.status).toBe("DISCONNECTED");
    expect(state.integration.encryptedApiKey).toBeNull();
    await expect(OpenAISecretService.getApiKeyForServer()).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    expect(state.audits.some((a) => (a as { action: string }).action === "openai.disconnect")).toBe(true);
  });
});
