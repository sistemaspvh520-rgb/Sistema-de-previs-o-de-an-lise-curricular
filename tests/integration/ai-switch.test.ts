/**
 * Integração: a chave geral "Usar IA" (SystemSetting aiEnabled) bloqueia o cliente OpenAI.
 * Pulado automaticamente se o banco não estiver acessível.
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: path.resolve(process.cwd(), ".env"), override: true });

let dbOk = false;
let prismaMod: typeof import("@/lib/prisma");
let previous: unknown = undefined;

beforeAll(async () => {
  try {
    prismaMod = await import("@/lib/prisma");
    await prismaMod.prisma.$queryRaw`SELECT 1`;
    previous = (await prismaMod.prisma.systemSetting.findUnique({ where: { key: "aiEnabled" } }))?.value;
    dbOk = true;
  } catch {
    dbOk = false;
  }
});

afterAll(async () => {
  if (!dbOk) return;
  const { prisma } = prismaMod;
  if (previous === undefined) await prisma.systemSetting.deleteMany({ where: { key: "aiEnabled" } });
  else await prisma.systemSetting.update({ where: { key: "aiEnabled" }, data: { value: previous as boolean } });
  await prisma.$disconnect();
});

describe("chave geral da IA", () => {
  it("padrão é desligada; desligada, getOpenAIClient falha com AI_DISABLED antes de tocar na chave", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { setSystemSetting, isAiEnabled, getSystemSettings } = await import("@/repositories/settings-repository");
    const { getOpenAIClient } = await import("@/services/openai/client-factory");

    await prismaMod.prisma.systemSetting.deleteMany({ where: { key: "aiEnabled" } });
    expect(await isAiEnabled()).toBe(false);
    await expect(getOpenAIClient()).rejects.toMatchObject({ code: "AI_DISABLED" });

    await setSystemSetting("aiEnabled", true);
    expect(await isAiEnabled()).toBe(true);
    expect((await getSystemSettings()).aiEnabled).toBe(true);

    await setSystemSetting("aiEnabled", false);
    expect(await isAiEnabled()).toBe(false);
  });
});
