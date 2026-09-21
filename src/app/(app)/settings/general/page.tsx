import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/session";
import { getSystemSettings } from "@/repositories/settings-repository";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GeneralSettingsForm } from "@/features/settings/general-form";
import { ENGINE_VERSION } from "@/domain/curricular-analysis/version";
import { EXTRACTOR_PROMPT_VERSION, AUDITOR_PROMPT_VERSION } from "@/services/openai/prompts";

export const metadata: Metadata = { title: "Configurações gerais" };
export const dynamic = "force-dynamic";

export default async function GeneralSettingsPage() {
  await requirePagePermission("privacy:manage");
  const settings = await getSystemSettings();

  return (
    <>
      <PageHeader eyebrow="Configurações" title="Geral" description="Identificação da instituição e limites de upload." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Instituição e limites</CardTitle>
            <CardDescription>Estes limites são aplicados no servidor durante o upload.</CardDescription>
          </CardHeader>
          <CardContent>
            <GeneralSettingsForm initial={settings} readOnly={false} />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Versões</CardTitle>
            <CardDescription>Gravadas em cada análise para rastreabilidade.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Motor acadêmico</dt><dd className="font-mono">{ENGINE_VERSION}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Prompt do extractor</dt><dd className="font-mono">{EXTRACTOR_PROMPT_VERSION}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Prompt do auditor</dt><dd className="font-mono">{AUDITOR_PROMPT_VERSION}</dd></div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
