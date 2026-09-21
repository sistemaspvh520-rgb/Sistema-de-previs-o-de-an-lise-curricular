"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit } from "@/services/rate-limit/rate-limit";
import { isEmailConfigured } from "@/services/email/mailer";
import { consumePasswordToken, sendReset } from "@/features/users/password-tokens";
import { logger } from "@/lib/logger";
import { fail, ok, type ActionResult } from "@/lib/action-result";

const setSchema = z
  .object({
    token: z.string().min(20),
    password: z.string().min(12, "A senha deve ter ao menos 12 caracteres.").max(200),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "A confirmação não confere.", path: ["confirm"] });

/** Página pública /definir-senha: consome o token e grava a senha definitiva. */
export async function setPasswordWithTokenAction(input: unknown): Promise<ActionResult<{ email: string }>> {
  const parsed = setSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const ip = getClientIp(await headers());
  const limit = rateLimit(`set-password:${ip}`, { capacity: 10, refillPerMinute: 5 });
  if (!limit.allowed) return fail(`Muitas tentativas. Aguarde ${limit.retryAfterSeconds}s.`);
  try {
    const result = await consumePasswordToken(parsed.data.token, parsed.data.password);
    if (!result.ok) {
      const msg = { INVALID: "Link inválido.", EXPIRED: "Este link expirou. Peça um novo ao administrador ou use “Esqueci minha senha”.", USED: "Este link já foi utilizado." }[result.reason];
      return fail(msg);
    }
    return ok({ email: result.email }, "Senha definida. Você já pode entrar.");
  } catch (err) {
    logger.error("setPasswordWithTokenAction", { err: String(err) });
    return fail("Não foi possível definir a senha. Tente novamente.");
  }
}

const forgotSchema = z.object({ email: z.string().trim().email().transform((v) => v.toLowerCase()) });

/** Página pública /esqueci-senha: resposta sempre genérica para não revelar contas. */
export async function requestPasswordResetAction(input: unknown): Promise<ActionResult> {
  const generic = ok(undefined, "Se este e-mail estiver cadastrado, você receberá um link de redefinição em instantes.");
  const parsed = forgotSchema.safeParse(input);
  if (!parsed.success) return fail("Informe um e-mail válido.");
  const ip = getClientIp(await headers());
  const byIp = rateLimit(`forgot:ip:${ip}`, { capacity: 3, refillPerMinute: 0.2 });
  const byEmail = rateLimit(`forgot:email:${parsed.data.email}`, { capacity: 3, refillPerMinute: 0.2 });
  if (!byIp.allowed || !byEmail.allowed) return generic;
  if (!isEmailConfigured()) return fail("O envio de e-mail não está configurado. Procure um administrador para redefinir sua senha.");
  try {
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true, isActive: true } });
    if (user?.isActive) await sendReset(user.id, null);
  } catch (err) {
    logger.error("requestPasswordResetAction", { err: String(err) });
  }
  return generic;
}
