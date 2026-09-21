import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "@/features/account/change-password-form";
import { ROLE_LABELS } from "@/lib/rbac";

export const metadata: Metadata = { title: "Minha conta" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader eyebrow="Configurações" title="Minha conta" description={`${user.name} · ${user.email} · ${ROLE_LABELS[user.role]}`} />
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
