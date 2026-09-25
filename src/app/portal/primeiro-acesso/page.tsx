import Link from "next/link";
import { PortalAuthShell } from "@/features/student-portal/auth-shell";
export default function StudentFirstAccessPage() {
  return (
    <PortalAuthShell
      title="Seu primeiro acesso"
      description="Seu acesso é autorizado pela equipe acadêmica. Abra o convite recebido por e-mail e defina sua senha."
    >
      <p className="text-sm leading-6 text-slate-600">
        Ainda não recebeu o convite? Procure seu tutor para conferir seu RGM e
        e-mail e solicitar o link de ativação.
      </p>
      <Link
        href="/portal/login"
        className="mt-6 block rounded-xl bg-[#003B71] p-3 text-center font-semibold text-white"
      >
        Voltar para entrar
      </Link>
    </PortalAuthShell>
  );
}
