/**
 * Integração (Postgres real): senha temporária, tokens de convite/redefinição e impersonação.
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { verify } from "@node-rs/argon2";

loadEnv({ path: path.resolve(process.cwd(), ".env"), override: true });
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

let dbOk = false;
let prismaMod: typeof import("@/lib/prisma");
const created: string[] = [];

beforeAll(async () => {
  try {
    prismaMod = await import("@/lib/prisma");
    await prismaMod.prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }
});
afterAll(async () => {
  if (!dbOk) return;
  await prismaMod.prisma.user.deleteMany({ where: { id: { in: created } } });
  await prismaMod.prisma.$disconnect();
});

async function makeUser(role: "ADMIN" | "ANALYST" = "ANALYST") {
  const u = await prismaMod.prisma.user.create({ data: { email: `t-${Date.now()}-${Math.random().toString(36).slice(2)}@cruzeirodosul.edu.br`, name: "Teste Conta", role, passwordHash: "x" } });
  created.push(u.id);
  return u;
}

describe("senha temporária", () => {
  it("atribui, revela (cifrada no banco) e limpa ao definir a própria senha", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { assignTemporaryPassword, readTemporaryPassword, clearTemporaryPassword } = await import("@/features/users/initial-password");
    const u = await makeUser();
    const temp = await assignTemporaryPassword(u.id);
    expect(temp).toMatch(/^CZS-[A-Za-z0-9]{12}$/);
    const row = await prismaMod.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.mustChangePassword).toBe(true);
    expect(row.initialPasswordEncrypted).not.toContain(temp);
    expect(await verify(row.passwordHash, temp)).toBe(true);
    expect(await readTemporaryPassword(u.id)).toBe(temp);
    await clearTemporaryPassword(u.id, "hash-definitivo");
    const after = await prismaMod.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.mustChangePassword).toBe(false);
    expect(after.initialPasswordEncrypted).toBeNull();
    expect(await readTemporaryPassword(u.id)).toBeNull();
  });
});

describe("tokens de senha", () => {
  it("convite: emite, valida, consome uma única vez e define a senha", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { issuePasswordToken, checkPasswordToken, consumePasswordToken } = await import("@/features/users/password-tokens");
    const u = await makeUser();
    const { token } = await issuePasswordToken(u.id, "INVITE", null);
    expect((await checkPasswordToken(token)).ok).toBe(true);
    expect((await checkPasswordToken("token-invalido-xxxxxxxxxxxx")).ok).toBe(false);
    const used = await consumePasswordToken(token, "SenhaForte123456");
    expect(used.ok).toBe(true);
    const row = await prismaMod.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(await verify(row.passwordHash, "SenhaForte123456")).toBe(true);
    expect(row.mustChangePassword).toBe(false);
    const again = await consumePasswordToken(token, "OutraSenha1234567");
    expect(again).toMatchObject({ ok: false, reason: "USED" });
  });
  it("token expirado é rejeitado e novo token invalida o anterior", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { issuePasswordToken, checkPasswordToken } = await import("@/features/users/password-tokens");
    const u = await makeUser();
    const { token: first } = await issuePasswordToken(u.id, "RESET", null);
    const { token: second } = await issuePasswordToken(u.id, "RESET", null);
    expect(await checkPasswordToken(first)).toMatchObject({ ok: false, reason: "USED" });
    expect((await checkPasswordToken(second)).ok).toBe(true);
    await prismaMod.prisma.passwordToken.updateMany({ where: { userId: u.id, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await checkPasswordToken(second)).toMatchObject({ ok: false, reason: "EXPIRED" });
  });
});

describe("impersonação", () => {
  it("token de uso único válido só para ADMIN ativo e alvo ativo", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { issueImpersonationToken, consumeImpersonationToken } = await import("@/features/users/impersonation");
    const admin = await makeUser("ADMIN");
    const target = await makeUser("ANALYST");
    const token = await issueImpersonationToken(admin.id, target.id);
    const result = await consumeImpersonationToken(token);
    expect(result?.target.id).toBe(target.id);
    expect(result?.admin.id).toBe(admin.id);
    expect(await consumeImpersonationToken(token)).toBeNull(); // uso único
    const analyst = await makeUser("ANALYST");
    const bad = await issueImpersonationToken(analyst.id, target.id);
    expect(await consumeImpersonationToken(bad)).toBeNull(); // emissor não é ADMIN
  });
});

describe("exclusão definitiva de conta", () => {
  it("transfere análises/correções ao admin e remove o usuário", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { prisma } = prismaMod;
    const admin = await makeUser("ADMIN");
    const victim = await makeUser("ANALYST");
    const rs = await prisma.ruleSetVersion.findFirstOrThrow({ where: { isActive: true } });
    const a = await prisma.curricularAnalysis.create({ data: { createdById: victim.id, startTerm: "2026.1", ruleSetVersionId: rs.id, engineVersion: "1.0.0" } });
    await prisma.manualCorrection.create({ data: { analysisId: a.id, userId: victim.id, field: "status", previousValue: "A", newValue: "B" } });
    // mesma transação usada pela action
    const result = await prisma.$transaction(async (tx) => {
      const analyses = await tx.curricularAnalysis.updateMany({ where: { createdById: victim.id }, data: { createdById: admin.id } });
      await tx.manualCorrection.updateMany({ where: { userId: victim.id }, data: { userId: admin.id } });
      await tx.user.delete({ where: { id: victim.id } });
      return analyses.count;
    });
    expect(result).toBe(1);
    expect(await prisma.user.findUnique({ where: { id: victim.id } })).toBeNull();
    const kept = await prisma.curricularAnalysis.findUniqueOrThrow({ where: { id: a.id }, include: { corrections: true } });
    expect(kept.createdById).toBe(admin.id);
    expect(kept.corrections[0].userId).toBe(admin.id);
    await prisma.curricularAnalysis.delete({ where: { id: a.id } });
    created.splice(created.indexOf(victim.id), 1);
  });
});
