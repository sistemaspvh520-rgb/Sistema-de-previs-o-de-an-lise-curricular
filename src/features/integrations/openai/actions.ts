"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { recordAudit } from "@/services/audit-log/audit-log";
import { OpenAISecretService } from "@/services/openai/credentials";
import { getOpenAIClient } from "@/services/openai/client-factory";
import { checkModelAvailable, testOpenAIConnection } from "@/services/openai/test-connection";
import { mapOpenAIError, OpenAIIntegrationError } from "@/services/openai/errors";
import { recordUsage } from "@/services/openai/usage";
import { rateLimit } from "@/services/rate-limit/rate-limit";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";
import { logger } from "@/lib/logger";

/** Estado público da integração — NUNCA inclui a chave. */
export interface OpenAIIntegrationView {
  status: "DISCONNECTED" | "CONNECTED" | "ERROR";
  apiKeyLastFour: string | null;
  extractionModel: string;
  auditModel: string;
  futureExplanationModel: string | null;
  projectLabel: string | null;
  serviceAccountLabel: string | null;
  lastTestedAt: string | null;
  lastConnectionStatus: string | null;
  lastErrorCode: string | null;
  updatedAt: string;
}

export async function getOpenAIIntegrationView(): Promise<OpenAIIntegrationView> {
  await requirePermission("integration:manage");
  const i = await prisma.openAIIntegration.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
  return {
    status: i.status,
    apiKeyLastFour: i.apiKeyLastFour,
    extractionModel: i.extractionModel,
    auditModel: i.auditModel,
    futureExplanationModel: i.futureExplanationModel,
    projectLabel: i.projectLabel,
    serviceAccountLabel: i.serviceAccountLabel,
    lastTestedAt: i.lastTestedAt?.toISOString() ?? null,
    lastConnectionStatus: i.lastConnectionStatus,
    lastErrorCode: i.lastErrorCode,
    updatedAt: i.updatedAt.toISOString(),
  };
}

const connectSchema = z.object({
  apiKey: z.string().trim().min(20, "Informe a API Key do projeto.").max(400),
  projectLabel: z.string().trim().max(120).optional(),
  serviceAccountLabel: z.string().trim().max(120).optional(),
});

function limitOrFail(userId: string) {
  const r = rateLimit(`openai-test:${userId}`, { capacity: 3, refillPerMinute: 3 });
  if (!r.allowed) return fail(`Muitas tentativas. Aguarde ${r.retryAfterSeconds}s e tente novamente.`);
  return null;
}

/** CONECTAR OPENAI — valida de verdade, só persiste se funcionar. */
export async function connectOpenAIAction(input: unknown): Promise<ActionResult<{ apiKeyLastFour: string }>> {
  try {
    const user = await requirePermission("integration:manage");
    const limited = limitOrFail(user.id);
    if (limited) return limited as ActionResult<{ apiKeyLastFour: string }>;

    const parsed = connectSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");

    const integration = await prisma.openAIIntegration.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
    const test = await testOpenAIConnection(parsed.data.apiKey, integration.extractionModel);

    await OpenAISecretService.saveApiKey(parsed.data.apiKey, user.id, {
      projectLabel: parsed.data.projectLabel || undefined,
      serviceAccountLabel: parsed.data.serviceAccountLabel || undefined,
    });
    await recordUsage({ operation: "CONNECTION_TEST", model: test.model, ...test.usage });
    await recordAudit({ userId: user.id, action: "openai.connect", entityType: "OpenAIIntegration", entityId: "default", metadata: { model: test.model, durationMs: test.durationMs } });
    revalidatePath("/settings/openai");
    revalidatePath("/dashboard");
    return ok({ apiKeyLastFour: parsed.data.apiKey.trim().slice(-4) }, "Conexão estabelecida.");
  } catch (err) {
    if (err instanceof OpenAIIntegrationError) {
      await prisma.openAIIntegration.updateMany({ where: { id: "default" }, data: { lastErrorCode: err.code } }).catch(() => undefined);
      return fail(err.message);
    }
    logger.error("connectOpenAIAction", { err: String(err) });
    return toActionError(err);
  }
}

/** ATUALIZAR API KEY — se a nova falhar, a anterior permanece intacta. */
export async function replaceOpenAIKeyAction(input: unknown): Promise<ActionResult<{ apiKeyLastFour: string }>> {
  try {
    const user = await requirePermission("integration:manage");
    const limited = limitOrFail(user.id);
    if (limited) return limited as ActionResult<{ apiKeyLastFour: string }>;

    const parsed = connectSchema.pick({ apiKey: true }).safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");

    const integration = await prisma.openAIIntegration.findUniqueOrThrow({ where: { id: "default" } });
    const test = await testOpenAIConnection(parsed.data.apiKey, integration.extractionModel);

    await OpenAISecretService.replaceApiKey(parsed.data.apiKey, user.id);
    await recordUsage({ operation: "CONNECTION_TEST", model: test.model, ...test.usage });
    await recordAudit({ userId: user.id, action: "openai.key_rotated", entityType: "OpenAIIntegration", entityId: "default", metadata: { previousLastFour: integration.apiKeyLastFour } });
    revalidatePath("/settings/openai");
    return ok({ apiKeyLastFour: parsed.data.apiKey.trim().slice(-4) }, "API Key atualizada.");
  } catch (err) {
    if (err instanceof OpenAIIntegrationError) {
      return fail(`${err.message} A chave anterior foi mantida.`);
    }
    logger.error("replaceOpenAIKeyAction", { err: String(err) });
    return toActionError(err);
  }
}

/** TESTAR CONEXÃO com a chave já armazenada. */
export async function testStoredOpenAIConnectionAction(): Promise<ActionResult<{ durationMs: number }>> {
  try {
    const user = await requirePermission("integration:manage");
    const limited = limitOrFail(user.id);
    if (limited) return limited as ActionResult<{ durationMs: number }>;

    const apiKey = await OpenAISecretService.getApiKeyForServer();
    const integration = await prisma.openAIIntegration.findUniqueOrThrow({ where: { id: "default" } });
    try {
      const test = await testOpenAIConnection(apiKey, integration.extractionModel);
      await prisma.openAIIntegration.update({
        where: { id: "default" },
        data: { status: "CONNECTED", lastTestedAt: new Date(), lastConnectionStatus: "OK", lastErrorCode: null },
      });
      await recordUsage({ operation: "CONNECTION_TEST", model: test.model, ...test.usage });
      await recordAudit({ userId: user.id, action: "openai.test", entityType: "OpenAIIntegration", entityId: "default", metadata: { ok: true, durationMs: test.durationMs } });
      revalidatePath("/settings/openai");
      return ok({ durationMs: test.durationMs }, "Conexão operacional.");
    } catch (err) {
      const mapped = mapOpenAIError(err);
      await prisma.openAIIntegration.update({
        where: { id: "default" },
        data: { status: "ERROR", lastTestedAt: new Date(), lastConnectionStatus: "FAILED", lastErrorCode: mapped.code },
      });
      await recordAudit({ userId: user.id, action: "openai.test", entityType: "OpenAIIntegration", entityId: "default", metadata: { ok: false, code: mapped.code } });
      revalidatePath("/settings/openai");
      return fail(mapped.message);
    }
  } catch (err) {
    if (err instanceof OpenAIIntegrationError) return fail(err.message);
    logger.error("testStoredOpenAIConnectionAction", { err: String(err) });
    return toActionError(err);
  }
}

/** DESCONECTAR — remove a chave do sistema (não revoga na OpenAI). */
export async function disconnectOpenAIAction(): Promise<ActionResult> {
  try {
    const user = await requirePermission("integration:manage");
    const before = await prisma.openAIIntegration.findUnique({ where: { id: "default" } });
    await OpenAISecretService.deleteApiKey(user.id);
    await recordAudit({ userId: user.id, action: "openai.disconnect", entityType: "OpenAIIntegration", entityId: "default", metadata: { previousLastFour: before?.apiKeyLastFour ?? null } });
    revalidatePath("/settings/openai");
    revalidatePath("/dashboard");
    return ok(undefined, "OpenAI desconectada. Lembre-se de revogar a chave no painel da OpenAI se necessário.");
  } catch (err) {
    logger.error("disconnectOpenAIAction", { err: String(err) });
    return toActionError(err);
  }
}

const modelsSchema = z.object({
  extractionModel: z.string().trim().min(2).max(80),
  auditModel: z.string().trim().min(2).max(80),
  futureExplanationModel: z.string().trim().max(80).optional().or(z.literal("")),
  projectLabel: z.string().trim().max(120).optional().or(z.literal("")),
  serviceAccountLabel: z.string().trim().max(120).optional().or(z.literal("")),
});

/** Atualiza modelos/labels. Modelos são validados na OpenAI antes de salvar (quando conectado). */
export async function updateOpenAIModelsAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("integration:manage");
    const parsed = modelsSchema.safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");

    const integration = await prisma.openAIIntegration.findUniqueOrThrow({ where: { id: "default" } });
    if (integration.status !== "DISCONNECTED") {
      const { client } = await getOpenAIClient({ timeoutMs: 20_000, maxRetries: 0 });
      const toCheck = new Set([parsed.data.extractionModel, parsed.data.auditModel]);
      if (parsed.data.futureExplanationModel) toCheck.add(parsed.data.futureExplanationModel);
      for (const m of toCheck) {
        try {
          await checkModelAvailable(client, m);
        } catch (err) {
          const mapped = mapOpenAIError(err);
          return fail(`Modelo "${m}": ${mapped.message}`);
        }
      }
    }

    await prisma.openAIIntegration.update({
      where: { id: "default" },
      data: {
        extractionModel: parsed.data.extractionModel,
        auditModel: parsed.data.auditModel,
        futureExplanationModel: parsed.data.futureExplanationModel || null,
        projectLabel: parsed.data.projectLabel || null,
        serviceAccountLabel: parsed.data.serviceAccountLabel || null,
        updatedById: user.id,
      },
    });
    await recordAudit({
      userId: user.id,
      action: "openai.models_updated",
      entityType: "OpenAIIntegration",
      entityId: "default",
      metadata: { before: { extractionModel: integration.extractionModel, auditModel: integration.auditModel }, after: { extractionModel: parsed.data.extractionModel, auditModel: parsed.data.auditModel } },
    });
    revalidatePath("/settings/openai");
    revalidatePath("/dashboard");
    return ok(undefined, "Configurações de modelo salvas.");
  } catch (err) {
    if (err instanceof OpenAIIntegrationError) return fail(err.message);
    logger.error("updateOpenAIModelsAction", { err: String(err) });
    return toActionError(err);
  }
}
