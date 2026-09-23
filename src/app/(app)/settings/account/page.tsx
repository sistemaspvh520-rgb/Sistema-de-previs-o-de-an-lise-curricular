import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChangePasswordForm } from "@/features/account/change-password-form";
import { NotificationPreferences } from "@/features/account/notification-preferences";
import { ROLE_LABELS } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getSystemSettings } from "@/repositories/settings-repository";

export const metadata: Metadata = { title: "Minha conta" };
export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: PageProps<"/settings/account">) {
  const user = await requireUser();
  const params = await searchParams;
  const first = params.first === "1" || user.mustChangePassword;
  const notificationsRequired = params.notifications === "required";
  const [preferences, settings] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        followUpEmailEnabled: true,
        followUpPushEnabled: true,
        followUpRepeatBusinessDays: true,
        followUpBusinessStartHour: true,
        followUpBusinessEndHour: true,
        followUpCadence: true,
        followUpPreferencesConfirmedAt: true,
      },
    }),
    getSystemSettings(),
  ]);
  return (
    <>
      <PageHeader
        eyebrow="Configurações"
        title="Minha conta"
        description={`${user.name} · ${user.email} · ${ROLE_LABELS[user.role]}`}
      />
      {first && (
        <div className="mb-6 rounded-xl border border-status-warning/30 bg-status-warning-bg p-4 text-sm text-status-warning">
          <div className="font-semibold">Primeiro acesso</div>
          Defina agora a sua senha definitiva. Até isso acontecer, o restante do
          sistema fica bloqueado e a senha temporária permanece visível ao
          administrador.
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Alterar senha</CardTitle>
            <CardDescription>
              A alteração é registrada na auditoria. Sessões ativas continuam
              válidas até expirarem.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">
              Notificações de matrícula
            </CardTitle>
            <CardDescription>
              Defina seus canais, seu expediente e a frequência dos avisos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NotificationPreferences
              initialEmail={preferences.followUpEmailEnabled}
              initialPush={preferences.followUpPushEnabled}
              initialRepeatDays={preferences.followUpRepeatBusinessDays}
              initialStartHour={preferences.followUpBusinessStartHour}
              initialEndHour={preferences.followUpBusinessEndHour}
              initialCadence={
                preferences.followUpCadence ?? settings.followUpDefaultCadence
              }
              required={
                notificationsRequired ||
                !preferences.followUpPreferencesConfirmedAt
              }
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
