import "server-only";
import { recordAudit } from "@/services/audit-log/audit-log";
import { createHash, randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { prisma } from "@/lib/prisma";
import { appUrl, sendMail } from "@/services/email/mailer";
import { inviteEmail, resetEmail } from "@/services/email/templates";
import { getSystemSettings } from "@/repositories/settings-repository";
import type { PasswordTokenPurpose } from "@/generated/prisma/enums";

export const INVITE_VALID_DAYS = 7;
export const RESET_VALID_MINUTES = 60;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Cria um token de uso único e devolve o valor em claro (vai apenas no link). Invalida tokens anteriores da mesma finalidade. */
export async function issuePasswordToken(userId: string, purpose: PasswordTokenPurpose, createdById: string | null): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const ttlMs = purpose === "INVITE" ? INVITE_VALID_DAYS * 24 * 60 * 60 * 1000 : RESET_VALID_MINUTES * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { isActive: true } });
    if (!user.isActive) throw new Error("ACCOUNT_DISABLED");
    await tx.passwordToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } });
    await tx.passwordToken.create({ data: { userId, purpose, tokenHash: hashToken(token), expiresAt, createdById } });
  });
  return { token, expiresAt };
}

/** Envia o convite (link para definir a senha) e registra inviteSentAt. */
export async function sendInvite(userId: string, createdBy: { id: string; name: string }): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const { token } = await issuePasswordToken(user.id, "INVITE", createdBy.id);
  const settings = await getSystemSettings();
  await sendMail({
    to: user.email,
    kind: "INVITE",
    actorUserId: createdBy.id,
    targetUserId: user.id,
    content: inviteEmail({ name: user.name, login: user.email, url: appUrl(`${user.role === "STUDENT" ? "/portal/definir-senha" : "/definir-senha"}?token=${token}`), invitedBy: createdBy.name, validDays: INVITE_VALID_DAYS, institution: settings.institutionName }),
  });
  await prisma.user.update({ where: { id: user.id }, data: { inviteSentAt: new Date() } });
}

/** Envia o link de redefinição. Não revela se o e-mail existe (o chamador decide a resposta ao usuário). */
export async function sendReset(userId: string, actorId: string | null): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const { token } = await issuePasswordToken(user.id, "RESET", actorId);
  await recordAudit({ userId: actorId, action: "PASSWORD_RESET_REQUESTED", entityType: "User", entityId: user.id });
  const settings = await getSystemSettings();
  await sendMail({
    to: user.email,
    kind: "RESET",
    actorUserId: actorId,
    targetUserId: user.id,
    content: resetEmail({ name: user.name, login: user.email, url: appUrl(`${user.role === "STUDENT" ? "/portal/definir-senha" : "/definir-senha"}?token=${token}`), validMinutes: RESET_VALID_MINUTES, institution: settings.institutionName }),
  });
}

export type TokenCheck = { ok: true; userId: string; name: string; email: string; purpose: PasswordTokenPurpose } | { ok: false; reason: "INVALID" | "EXPIRED" | "USED" };

export async function checkPasswordToken(token: string): Promise<TokenCheck> {
  if (!token || token.length < 20) return { ok: false, reason: "INVALID" };
  const row = await prisma.passwordToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { select: { id: true, name: true, email: true, isActive: true } } } });
  if (!row || !row.user.isActive) return { ok: false, reason: "INVALID" };
  if (row.usedAt) return { ok: false, reason: "USED" };
  if (row.expiresAt < new Date()) return { ok: false, reason: "EXPIRED" };
  return { ok: true, userId: row.user.id, name: row.user.name, email: row.user.email, purpose: row.purpose };
}

/** Consome o token e define a senha definitiva (limpa a temporária e a obrigatoriedade de troca). */
export async function consumePasswordToken(token: string, newPassword: string): Promise<TokenCheck> {
  const check = await checkPasswordToken(token);
  if (!check.ok) return check;
  const passwordHash = await hash(newPassword);
  await prisma.$transaction(async (tx) => {
    // Lock the account so blocking and password activation cannot race.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${check.userId}::uuid FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: check.userId } });
    if (!user.isActive) throw new Error("TOKEN_INVALID");
    const updated = await tx.passwordToken.updateMany({ where: { tokenHash: hashToken(token), usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (updated.count !== 1) throw new Error("TOKEN_RACE");
    await tx.user.update({ where: { id: check.userId }, data: {
      passwordHash, mustChangePassword: false, sessionVersion: { increment: 1 },
      initialPasswordEncrypted: null, initialPasswordIv: null, initialPasswordAuthTag: null,
      initialPasswordKeyVersion: null, initialPasswordSetAt: null,
    } });
    await tx.passwordToken.updateMany({ where: { userId: check.userId, usedAt: null }, data: { usedAt: new Date() } });
    await tx.auditLog.create({ data: { userId: check.userId, action: user.role === "STUDENT" && check.purpose === "INVITE" ? "ACCESS_ACTIVATED" : "user.password_reset_by_link", entityType: "User", entityId: check.userId } });
  });
  return check;
}
