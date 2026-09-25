import Link from "next/link";
import { PortalAuthShell } from "@/features/student-portal/auth-shell";
import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";
export default function StudentRecoveryPage() {
  return (
    <PortalAuthShell
      title="Recuperar acesso"
      description="Informe o e-mail cadastrado pela equipe acadêmica para receber as instruções de recuperação."
    >
      <ForgotPasswordForm />
      <Link
        href="/portal/login"
        className="mt-6 block text-center text-sm text-[#003B71] underline"
      >
        Voltar para entrar
      </Link>
    </PortalAuthShell>
  );
}
