import type { Metadata } from "next";
import { Clock3, GraduationCap, MapPin } from "lucide-react";
import { requirePagePermission } from "@/lib/session";
import { getSystemSettings } from "@/repositories/settings-repository";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GeneralSettingsForm } from "@/features/settings/general-form";
import { POLOS } from "@/domain/polos";
import { COURSE_FORMATS } from "@/domain/course-formats";
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
            <CardTitle className="text-base">Escopo do atendimento</CardTitle>
            <CardDescription>Informações mantidas pela equipe técnica e usadas no envio das análises.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex gap-3"><MapPin className="mt-0.5 size-4 shrink-0 text-brand-cyan-700" /><div><p className="font-medium">{POLOS.length} polos disponíveis</p><p className="text-xs text-muted-foreground">Selecione o polo ao iniciar uma análise.</p></div></div>
            <div className="flex gap-3"><GraduationCap className="mt-0.5 size-4 shrink-0 text-brand-cyan-700" /><div><p className="font-medium">Formatos de curso</p><div className="mt-1 flex flex-wrap gap-1.5">{COURSE_FORMATS.map((format) => <span key={format.code} className="rounded-full bg-muted px-2 py-0.5 text-xs">{format.label}</span>)}</div></div></div>
            <div className="flex gap-3"><Clock3 className="mt-0.5 size-4 shrink-0 text-brand-cyan-700" /><div><p className="font-medium">Fuso do sistema</p><p className="text-xs text-muted-foreground">{APP_TIME_ZONE}</p></div></div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
