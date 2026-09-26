"use server";

import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn, signOut } from "@/lib/auth";

const schema = z.object({
  email: z.string().trim().min(1, "Informe seu e-mail ou RGM.").max(254),
  password: z.string().min(1, "Informe a senha."),
  callbackUrl: z.string().optional(),
  portal: z.literal("student").optional(),
});

export type LoginState = { error?: string } | undefined;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    callbackUrl: formData.get("callbackUrl") ?? undefined,
    portal: formData.get("portal") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const safeCallback =
    parsed.data.callbackUrl && parsed.data.callbackUrl.startsWith("/") && !parsed.data.callbackUrl.startsWith("//") && !parsed.data.callbackUrl.includes("\\") ? parsed.data.callbackUrl : undefined;
  const redirectTo = parsed.data.portal
    ? safeCallback?.startsWith("/portal") ? safeCallback : "/portal"
    : (safeCallback ?? "/analyses/new");
  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      // Portal do aluno: `authorize` só aceita contas de aluno quando esta marca é enviada.
      ...(parsed.data.portal ? { portal: parsed.data.portal } : {}),
      redirectTo,
    });
    return undefined;
  } catch (err) {
    if (err instanceof AuthError) {
      return {
        error: parsed.data.portal
          ? "E-mail, RGM ou senha inválidos. Este acesso é exclusivo para alunos."
          : "E-mail, RGM ou senha inválidos.",
      };
    }
    throw err;
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function portalLogoutAction() {
  await signOut({ redirectTo: "/portal/login" });
}
