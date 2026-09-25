import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";
import { checkPasswordToken } from "@/features/users/password-tokens";
import { SetPasswordForm } from "@/features/auth/set-password-form";

export const metadata: Metadata = { title: "Definir senha" };
export const dynamic = "force-dynamic";

export default async function SetPasswordPage({ searchParams }: PageProps<"/definir-senha">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const check = await checkPasswordToken(token);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-navy px-4">
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center text-white"><BrandLogo maxWidthClassName="max-w-[300px]" /></div>
        <div className="rounded-2xl border border-white/10 bg-card p-8 shadow-2xl shadow-black/30">
          {check.ok ? (
            <>
              <h1 className="text-xl font-semibold tracking-tight">{check.purpose === "INVITE" ? `Bem-vindo(a), ${check.name.split(" ")[0]}!` : "Criar nova senha"}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {check.purpose === "INVITE" ? "Defina a senha da sua conta para começar a usar o sistema." : "Escolha uma nova senha para a sua conta."} Login: <span className="font-mono">{check.email}</span>
              </p>
              <div className="mt-6"><SetPasswordForm token={token} /></div>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold tracking-tight">Link inválido</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {{ INVALID: "Este link não é válido.", EXPIRED: "Este link expirou.", USED: "Este link já foi utilizado." }[check.reason]} Peça um novo convite ao administrador ou use “Esqueci minha senha”.
              </p>
              <div className="mt-6 flex gap-3 text-sm">
                <Link href="/esqueci-senha" className="text-brand-cyan-700 underline">Esqueci minha senha</Link>
                <Link href="/login" className="text-muted-foreground underline">Ir para o login</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
