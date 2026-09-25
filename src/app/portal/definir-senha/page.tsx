import Link from "next/link";
import { PortalAuthShell } from "@/features/student-portal/auth-shell";
import { SetPasswordForm } from "@/features/auth/set-password-form";
import { checkPasswordToken } from "@/features/users/password-tokens";
export const dynamic = "force-dynamic";
export default async function StudentSetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const check = token ? await checkPasswordToken(token) : null;
  return (
    <PortalAuthShell
      title="Defina sua senha"
      description="Escolha uma senha para acessar seu Portal Acadêmico."
    >
      {check?.ok && token ? (
        <SetPasswordForm token={token} loginUrl="/portal/login" />
      ) : (
        <div role="alert">
          <p className="text-sm">
            Este link está inválido, expirou ou já foi utilizado. Solicite um
            novo link à equipe acadêmica.
          </p>
          <Link
            href="/portal/recuperar"
            className="mt-4 block text-sm underline"
          >
            Recuperar acesso
          </Link>
        </div>
      )}
    </PortalAuthShell>
  );
}
