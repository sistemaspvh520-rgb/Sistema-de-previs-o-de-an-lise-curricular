import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const IMPERSONATION_TTL_MS = 60_000;

function hashToken(t: string): string {
  return createHash("sha256").update(t).digest("hex");
}

/** Emite um token de uso único (60 s) para o admin entrar como outro usuário. */
export async function issueImpersonationToken(adminId: string, targetUserId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.impersonationToken.create({ data: { tokenHash: hashToken(token), adminId, targetUserId, expiresAt: new Date(Date.now() + IMPERSONATION_TTL_MS) } });
  return token;
}

/** Consome o token; devolve o usuário-alvo e o admin, ou null se inválido/expirado/usado. */
export async function consumeImpersonationToken(token: string): Promise<{ target: { id: string; email: string; name: string; role: "ADMIN" | "ACADEMIC_COORDINATOR" | "TUTOR" | "ANALYST" | "VIEWER"; sessionVersion: number; isActive: boolean }; admin: { id: string; name: string; role: string; isActive: boolean } } | null> {
  if (!token || token.length < 20) return null;
  const row = await prisma.impersonationToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { target: true, admin: true } });
  if (!row || row.usedAt || row.expiresAt < new Date()) return null;
  const updated = await prisma.impersonationToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (updated.count !== 1) return null;
  if (row.target.role === "STUDENT") return null;
  if (!row.admin.isActive || row.admin.role !== "ADMIN" || !row.target.isActive) return null;
  return { target: { id: row.target.id, email: row.target.email, name: row.target.name, role: row.target.role, sessionVersion: row.target.sessionVersion, isActive: row.target.isActive }, admin: { id: row.admin.id, name: row.admin.name, role: row.admin.role, isActive: row.admin.isActive } };
}
