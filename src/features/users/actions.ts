"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hash } from "@node-rs/argon2";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { recordAudit } from "@/services/audit-log/audit-log";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";
import { logger } from "@/lib/logger";

const roleSchema = z.enum(["ADMIN", "ANALYST", "VIEWER"]);

const createSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(120),
  email: z.string().trim().email("E-mail inválido.").transform((v) => v.toLowerCase()),
  password: z.string().min(8, "A senha deve ter ao menos 8 caracteres.").max(200),
  role: roleSchema,
});

export async function createUserAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const admin = await requirePermission("users:manage");
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");

    const exists = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (exists) return fail("Já existe um usuário com este e-mail.");

    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        role: parsed.data.role,
        passwordHash: await hash(parsed.data.password),
      },
    });
    await recordAudit({ userId: admin.id, action: "user.create", entityType: "User", entityId: user.id, metadata: { email: user.email, role: user.role } });
    revalidatePath("/settings/users");
    return ok({ id: user.id }, "Usuário criado.");
  } catch (err) {
    logger.error("createUserAction", { err: String(err) });
    return toActionError(err);
  }
}

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  role: roleSchema,
  isActive: z.boolean(),
});

export async function updateUserAction(input: unknown): Promise<ActionResult> {
  try {
    const admin = await requirePermission("users:manage");
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");

    if (parsed.data.id === admin.id && (parsed.data.role !== "ADMIN" || !parsed.data.isActive)) {
      return fail("Você não pode remover o próprio acesso de administrador.");
    }
    const before = await prisma.user.findUnique({ where: { id: parsed.data.id } });
    if (!before) return fail("Usuário não encontrado.");

    await prisma.user.update({
      where: { id: parsed.data.id },
      data: { name: parsed.data.name, role: parsed.data.role, isActive: parsed.data.isActive },
    });
    await recordAudit({
      userId: admin.id,
      action: "user.update",
      entityType: "User",
      entityId: parsed.data.id,
      metadata: { before: { name: before.name, role: before.role, isActive: before.isActive }, after: { name: parsed.data.name, role: parsed.data.role, isActive: parsed.data.isActive } },
    });
    revalidatePath("/settings/users");
    return ok(undefined, "Usuário atualizado.");
  } catch (err) {
    logger.error("updateUserAction", { err: String(err) });
    return toActionError(err);
  }
}

const resetSchema = z.object({ id: z.string().uuid(), password: z.string().min(8).max(200) });

export async function resetPasswordAction(input: unknown): Promise<ActionResult> {
  try {
    const admin = await requirePermission("users:manage");
    const parsed = resetSchema.safeParse(input);
    if (!parsed.success) return fail("A senha deve ter ao menos 8 caracteres.");
    await prisma.user.update({ where: { id: parsed.data.id }, data: { passwordHash: await hash(parsed.data.password) } });
    await recordAudit({ userId: admin.id, action: "user.password_reset", entityType: "User", entityId: parsed.data.id });
    revalidatePath("/settings/users");
    return ok(undefined, "Senha redefinida.");
  } catch (err) {
    logger.error("resetPasswordAction", { err: String(err) });
    return toActionError(err);
  }
}
