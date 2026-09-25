import { PortalAuthShell } from "@/features/student-portal/auth-shell";
import { LoginForm } from "@/features/auth/login-form";
export default async function StudentLoginPage({ searchParams }: { searchParams: Promise<{ senha?: string }> }) {
  const { senha } = await searchParams;
  return (
    <PortalAuthShell
      title="Acompanhe sua jornada."
      description="Entre para consultar sua análise acadêmica e acompanhar os próximos passos do seu curso."
    >
      {senha === "ok" && <p role="status" className="mb-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Senha atualizada. Entre com sua nova senha.</p>}
      <LoginForm portal callbackUrl="/portal" />
    </PortalAuthShell>
  );
}
