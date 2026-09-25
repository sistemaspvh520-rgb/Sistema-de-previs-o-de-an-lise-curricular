"use server";

import { z } from "zod";
import { hash, verify } from "@node-rs/argon2";
import { prisma } from "@/lib/prisma";
import { getSessionUser, UnauthorizedError } from "@/lib/session";
import { signOut } from "@/lib/auth";
import { clearTemporaryPassword } from "@/features/users/initial-password";
import { recordAudit } from "@/services/audit-log/audit-log";
import { rateLimit } from "@/services/rate-limit/rate-limit";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual."),
    newPassword: z.string().min(12, "A nova senha deve ter ao menos 12 caracteres.").max(200),
    confirm: z.string(),
  })
  .refine((d) => d.newPassword === d.confirm, { message: "A confirmação não confere.", path: ["confirm"] })
  .refine((d) => d.newPassword !== d.currentPassword, { message: "A nova senha deve ser diferente da atual.", path: ["newPassword"] });

/** Troca da própria senha (qualquer perfil autenticado). */
export async function changeOwnPasswordAction(input: unknown): Promise<ActionResult<{ loginUrl: string }>> {
  try {
    const user = await getSessionUser({ allowStudent: true });
    if (!user) throw new UnauthorizedError();
    const limit = rateLimit(`pwchange:${user.id}`, { capacity: 5, refillPerMinute: 5 });
    if (!limit.allowed) return fail(`Muitas tentativas. Aguarde ${limit.retryAfterSeconds}s.`);
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");

    const record = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verify(record.passwordHash, parsed.data.currentPassword))) return fail("Senha atual incorreta.");

    await clearTemporaryPassword(user.id, await hash(parsed.data.newPassword));
    await recordAudit({ userId: user.id, action: "user.password_changed", entityType: "User", entityId: user.id, metadata: { firstAccess: record.mustChangePassword } });
    await signOut({ redirect: false });
    return ok({ loginUrl: user.role === "STUDENT" ? "/portal/login?senha=ok" : "/login?senha=ok" }, "Senha alterada. Entre novamente com sua nova senha.");
  } catch (err) {
    return toActionError(err);
  }
}
