import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "@/features/account/change-password-form";
import { ROLE_LABELS } from "@/lib/rbac";

export const metadata: Metadata = { title: "Minha conta" };
export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: PageProps<"/settings/account">) {
  const user = await requireUser();
  const params = await searchParams;
  const first = params.first === "1" || user.mustChangePassword;
  return (
    <>
      <PageHeader eyebrow="Configurações" title="Minha conta" description={`${user.name} · ${user.email} · ${ROLE_LABELS[user.role]}`} />
      {first && (
        <div className="mb-6 rounded-xl border border-status-warning/30 bg-status-warning-bg p-4 text-sm text-status-warning">
          <div className="font-semibold">Primeiro acesso</div>
          Defina agora a sua senha definitiva. Até isso acontecer, o restante do sistema fica bloqueado e a senha temporária permanece visível ao administrador.
        </div>
      )}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Alterar senha</CardTitle>
          <CardDescription>A alteração é registrada na auditoria. Sessões ativas continuam válidas até expirarem.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </>
  );
}
