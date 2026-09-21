import type { Metadata } from "next";
import { BrandLogo } from "@/components/shared/brand-logo";
import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const callbackUrl = typeof params.callbackUrl === "string" ? params.callbackUrl : undefined;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-navy px-4">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 size-[520px] rounded-full bg-brand-cyan/20 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 size-[520px] rounded-full bg-brand-gold/15 blur-3xl" />
      </div>
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center text-white">
          <BrandLogo />
        </div>
        <div className="rounded-2xl border border-white/10 bg-card p-8 shadow-2xl shadow-black/30">
          <h1 className="text-xl font-semibold tracking-tight">Entrar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acesse com sua conta institucional para analisar documentos.
          </p>
          <div className="mt-6">
            <LoginForm callbackUrl={callbackUrl} />
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-white/60">
          Sistema interno · Universidade Cruzeiro do Sul Virtual
        </p>
      </div>
    </main>
  );
}
