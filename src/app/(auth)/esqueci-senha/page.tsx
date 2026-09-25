import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";
import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function ForgotPasswordPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-navy px-4">
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center text-white"><BrandLogo maxWidthClassName="max-w-[300px]" /></div>
        <div className="rounded-2xl border border-white/10 bg-card p-8 shadow-2xl shadow-black/30">
          <h1 className="text-xl font-semibold tracking-tight">Esqueci minha senha</h1>
          <p className="mt-1 text-sm text-muted-foreground">Informe seu e-mail de login. Se ele estiver cadastrado, enviaremos um link para criar uma nova senha.</p>
          <div className="mt-6"><ForgotPasswordForm /></div>
          <p className="mt-6 text-sm"><Link href="/login" className="text-muted-foreground underline">Voltar ao login</Link></p>
        </div>
      </div>
    </main>
  );
}
