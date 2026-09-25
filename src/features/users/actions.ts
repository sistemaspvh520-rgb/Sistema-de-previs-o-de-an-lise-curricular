"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hash } from "@node-rs/argon2";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { recordAudit } from "@/services/audit-log/audit-log";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";
import { rateLimit } from "@/services/rate-limit/rate-limit";
import { logger } from "@/lib/logger";
import { assignTemporaryPassword, readTemporaryPassword } from "@/features/users/initial-password";
import { sendInvite, sendReset } from "@/features/users/password-tokens";
import { isEmailConfigured } from "@/services/email/mailer";
import { issueImpersonationToken } from "@/features/users/impersonation";
import { signIn, unstable_update } from "@/lib/auth";

const roleSchema = z.enum(["ADMIN", "ANALYST", "VIEWER"]);

const createSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(120),
  email: z.string().trim().email("E-mail inválido.").transform((v) => v.toLowerCase()),
  role: roleSchema,
});

/** Cria o usuário com senha temporária gerada automaticamente (troca obrigatória no primeiro acesso). */
export async function createUserAction(input: unknown): Promise<ActionResult<{ id: string; temporaryPassword: string; inviteSent: boolean; inviteError: string | null }>> {
  try {
    const admin = await requirePermission("users:manage");
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");

    const exists = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (exists) return fail("Já existe um usuário com este e-mail.");

    const user = await prisma.user.create({
      data: { name: parsed.data.name, email: parsed.data.email, role: parsed.data.role, passwordHash: await hash(crypto.randomUUID()) },
    });
    const temporaryPassword = await assignTemporaryPassword(user.id);
    await recordAudit({ userId: admin.id, action: "user.create", entityType: "User", entityId: user.id, metadata: { email: user.email, role: user.role } });
    let inviteSent = false;
    let inviteError: string | null = null;
    if (isEmailConfigured()) {
      try {
        await sendInvite(user.id, { id: admin.id, name: admin.name });
        inviteSent = true;
      } catch (err) {
        inviteError = "Não foi possível enviar o convite por e-mail. Repasse a senha temporária ou tente reenviar.";
        logger.warn("createUserAction.invite_failed", { err: String(err) });
      }
    } else {
      inviteError = "Envio de e-mail não configurado — repasse a senha temporária.";
    }
    revalidatePath("/settings/users");
    return ok({ id: user.id, temporaryPassword, inviteSent, inviteError }, inviteSent ? "Usuário criado e convite enviado." : "Usuário criado com senha temporária.");
  } catch (err) {
    logger.error("createUserAction", { err: String(err) });
    return toActionError(err);
  }
}

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email("E-mail inválido.").transform((v) => v.toLowerCase()),
  role: roleSchema,
  isActive: z.boolean(),
});

export async function updateUserAction(input: unknown): Promise<ActionResult> {
  try {
    const admin = await requirePermission("users:manage");
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");

    if (parsed.data.id === admin.id && (parsed.data.role !== "ADMIN" || !parsed.data.isActive)) {
      return fail("Você não pode remover o próprio acesso de administrador.");
    }
    const before = await prisma.user.findUnique({ where: { id: parsed.data.id } });
    if (!before) return fail("Usuário não encontrado.");
    if (before.role === "STUDENT") return fail("Gerencie este acesso na área Alunos da Análise Acadêmica.");
    if (parsed.data.email !== before.email) {
      const taken = await prisma.user.findUnique({ where: { email: parsed.data.email } });
      if (taken) return fail("Já existe um usuário com este e-mail.");
    }

    await prisma.user.update({
      where: { id: parsed.data.id },
      data: { name: parsed.data.name, email: parsed.data.email, role: parsed.data.role, isActive: parsed.data.isActive },
    });
    await recordAudit({
      userId: admin.id,
      action: "user.update",
      entityType: "User",
      entityId: parsed.data.id,
      metadata: { before: { name: before.name, email: before.email, role: before.role, isActive: before.isActive }, after: { name: parsed.data.name, email: parsed.data.email, role: parsed.data.role, isActive: parsed.data.isActive } },
    });
    if (parsed.data.id === admin.id) await unstable_update({}); // atualiza nome/e-mail na própria sessão
    revalidatePath("/settings/users");
    return ok(undefined, "Usuário atualizado.");
  } catch (err) {
    logger.error("updateUserAction", { err: String(err) });
    return toActionError(err);
  }
}

const resetSchema = z.object({ id: z.string().uuid() });

/** Gera nova senha temporária (a definitiva atual é invalidada) e obriga a troca no próximo acesso. */
export async function resetPasswordAction(input: unknown): Promise<ActionResult<{ temporaryPassword: string }>> {
  try {
    const admin = await requirePermission("users:manage");
    const parsed = resetSchema.safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    const temporaryPassword = await assignTemporaryPassword(parsed.data.id);
    await recordAudit({ userId: admin.id, action: "user.password_reset", entityType: "User", entityId: parsed.data.id });
    revalidatePath("/settings/users");
    return ok({ temporaryPassword }, "Senha temporária gerada.");
  } catch (err) {
    logger.error("resetPasswordAction", { err: String(err) });
    return toActionError(err);
  }
}

/** ADMIN consulta a senha temporária de um usuário que ainda não fez o primeiro acesso (auditado). */
export async function revealInitialPasswordAction(input: unknown): Promise<ActionResult<{ temporaryPassword: string | null }>> {
  try {
    const admin = await requirePermission("users:manage");
    const parsed = resetSchema.safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    const temporaryPassword = await readTemporaryPassword(parsed.data.id);
    await recordAudit({ userId: admin.id, action: "user.initial_password_viewed", entityType: "User", entityId: parsed.data.id, metadata: { available: temporaryPassword !== null } });
    return ok({ temporaryPassword });
  } catch (err) {
    logger.error("revealInitialPasswordAction", { err: String(err) });
    return toActionError(err);
  }
}

/** Reenvia o convite (link para definir a senha) — útil após corrigir o e-mail. */
export async function resendInviteAction(input: unknown): Promise<ActionResult> {
  try {
    const admin = await requirePermission("users:manage");
    const parsed = resetSchema.safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    if (!isEmailConfigured()) return fail("Envio de e-mail não configurado (EMAIL_USER / EMAIL_APP_PASSWORD).");
    const limit = rateLimit(`invite:${admin.id}`, { capacity: 20, refillPerMinute: 10 });
    if (!limit.allowed) return fail(`Muitos envios. Aguarde ${limit.retryAfterSeconds}s.`);
    await sendInvite(parsed.data.id, { id: admin.id, name: admin.name });
    revalidatePath("/settings/users");
    return ok(undefined, "Convite enviado por e-mail.");
  } catch (err) {
    logger.error("resendInviteAction", { err: String(err) });
    return fail("Não foi possível enviar o e-mail. Verifique a configuração de envio.");
  }
}

/** Envia ao usuário um link para redefinir a própria senha (1 h). */
export async function sendResetLinkAction(input: unknown): Promise<ActionResult> {
  try {
    const admin = await requirePermission("users:manage");
    const parsed = resetSchema.safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    if (!isEmailConfigured()) return fail("Envio de e-mail não configurado (EMAIL_USER / EMAIL_APP_PASSWORD).");
    const limit = rateLimit(`reset-link:${admin.id}`, { capacity: 20, refillPerMinute: 10 });
    if (!limit.allowed) return fail(`Muitos envios. Aguarde ${limit.retryAfterSeconds}s.`);
    await sendReset(parsed.data.id, admin.id);
    await recordAudit({ userId: admin.id, action: "user.reset_link_sent", entityType: "User", entityId: parsed.data.id });
    return ok(undefined, "Link de redefinição enviado por e-mail (válido por 60 minutos).");
  } catch (err) {
    logger.error("sendResetLinkAction", { err: String(err) });
    return fail("Não foi possível enviar o e-mail. Verifique a configuração de envio.");
  }
}

/** "Acessar como": o ADMIN entra na conta do usuário (sessão trocada; registrado na auditoria, sem aviso ao usuário). */
export async function impersonateUserAction(input: unknown): Promise<ActionResult> {
  const admin = await requirePermission("users:manage");
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) return fail("Dados inválidos.");
  if (parsed.data.id === admin.id) return fail("Você já está na sua própria conta.");
  const target = await prisma.user.findUnique({ where: { id: parsed.data.id }, select: { isActive: true } });
  if (!target?.isActive) return fail("Usuário inativo.");
  const token = await issueImpersonationToken(admin.id, parsed.data.id);
  // signIn redireciona (lança NEXT_REDIRECT); não capturar.
  await signIn("credentials", { impersonationToken: token, redirectTo: "/dashboard" });
  return ok(undefined);
}

/**
 * Exclusão definitiva da conta. Análises e correções feitas pela pessoa são transferidas ao admin que exclui
 * (dados institucionais não se perdem); tokens, sessões e senha temporária são removidos em cascata.
 */
export async function deleteUserAction(input: unknown): Promise<ActionResult<{ reassignedAnalyses: number }>> {
  try {
    const admin = await requirePermission("users:manage");
    const parsed = resetSchema.safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    if (parsed.data.id === admin.id) return fail("Você não pode excluir a própria conta.");
    const target = await prisma.user.findUnique({ where: { id: parsed.data.id } });
    if (!target) return fail("Usuário não encontrado.");
    if (target.role === "STUDENT") return fail("Desative o acesso na área Alunos para preservar o histórico acadêmico.");
    if (target.role === "ADMIN") {
      const admins = await prisma.user.count({ where: { role: "ADMIN", isActive: true, id: { not: target.id } } });
      if (admins === 0) return fail("Não é possível excluir o único administrador ativo.");
    }
    const result = await prisma.$transaction(async (tx) => {
      const analyses = await tx.curricularAnalysis.updateMany({ where: { createdById: target.id }, data: { createdById: admin.id } });
      await tx.manualCorrection.updateMany({ where: { userId: target.id }, data: { userId: admin.id } });
      await tx.user.delete({ where: { id: target.id } });
      return { reassignedAnalyses: analyses.count };
    });
    await recordAudit({ userId: admin.id, action: "user.delete", entityType: "User", entityId: target.id, metadata: { email: target.email, name: target.name, role: target.role, reassignedAnalyses: result.reassignedAnalyses } });
    revalidatePath("/settings/users");
    return ok(result, result.reassignedAnalyses ? `Conta excluída. ${result.reassignedAnalyses} análise(s) transferida(s) para você.` : "Conta excluída definitivamente.");
  } catch (err) {
    logger.error("deleteUserAction", { err: String(err) });
    return toActionError(err);
  }
}
