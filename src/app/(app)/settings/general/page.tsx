import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/session";
import { getSystemSettings } from "@/repositories/settings-repository";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GeneralSettingsForm } from "@/features/settings/general-form";

export const metadata: Metadata = { title: "Configurações gerais" };
export const dynamic = "force-dynamic";

export default async function GeneralSettingsPage() {
  await requirePagePermission("privacy:manage");
  const settings = await getSystemSettings();

  return (
    <>
      <PageHeader eyebrow="Configurações" title="Geral" description="Defina a identificação exibida no sistema e os limites aplicados no envio de documentos." />
      <div className="max-w-5xl">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Instituição e limites</CardTitle>
            <CardDescription>As alterações são aplicadas no servidor no próximo envio de PDF.</CardDescription>
          </CardHeader>
          <CardContent>
            <GeneralSettingsForm initial={settings} readOnly={false} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
