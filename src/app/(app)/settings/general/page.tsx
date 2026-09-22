import type { Metadata } from "next";
import { BellRing, Clock3, ShieldCheck } from "lucide-react";
import { requirePagePermission } from "@/lib/session";
import { getSystemSettings } from "@/repositories/settings-repository";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GeneralSettingsForm } from "@/features/settings/general-form";
import { APP_TIME_ZONE } from "@/lib/time";

export const metadata: Metadata = { title: "Configurações gerais" };
export const dynamic = "force-dynamic";

export default async function GeneralSettingsPage() {
  await requirePagePermission("privacy:manage");
  const settings = await getSystemSettings();

  return (
    <>
      <PageHeader eyebrow="Configurações" title="Geral" description="Defina a identificação exibida no sistema e os limites aplicados no envio de documentos." />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Instituição e limites</CardTitle>
            <CardDescription>As alterações são aplicadas no servidor no próximo envio de PDF.</CardDescription>
          </CardHeader>
          <CardContent>
            <GeneralSettingsForm initial={settings} readOnly={false} />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Como as configurações funcionam</CardTitle>
            <CardDescription>Os ajustes desta página valem para novos atendimentos e lembretes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-cyan-700" /><div><p className="font-medium">Escopo editável</p><p className="text-xs text-muted-foreground">Inclua, ajuste ou remova polos e escolha os formatos disponíveis no envio.</p></div></div>
            <div className="flex gap-3"><BellRing className="mt-0.5 size-4 shrink-0 text-brand-cyan-700" /><div><p className="font-medium">Lembretes</p><p className="text-xs text-muted-foreground">O horário e o intervalo padrão ficam aqui; cada usuário ajusta seus canais e limite na própria conta.</p></div></div>
            <div className="flex gap-3"><Clock3 className="mt-0.5 size-4 shrink-0 text-brand-cyan-700" /><div><p className="font-medium">Fuso do sistema</p><p className="text-xs text-muted-foreground">{APP_TIME_ZONE}</p></div></div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
