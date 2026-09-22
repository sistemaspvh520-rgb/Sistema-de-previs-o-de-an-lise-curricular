import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/session";
import { getSystemSettings } from "@/repositories/settings-repository";
import { getActiveRuleSet } from "@/repositories/rules-repository";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GeneralSettingsForm } from "@/features/settings/general-form";
import { RulesSummary } from "@/features/settings/rules-summary";
import { POLOS } from "@/domain/polos";
import { COURSE_FORMATS } from "@/domain/course-formats";
import { APP_TIME_ZONE } from "@/lib/time";

export const metadata: Metadata = { title: "Configurações gerais" };
export const dynamic = "force-dynamic";

export default async function GeneralSettingsPage() {
  await requirePagePermission("privacy:manage");
  const [settings, ruleSet] = await Promise.all([getSystemSettings(), getActiveRuleSet()]);

  return (
    <>
      <PageHeader eyebrow="Configurações" title="Geral" description="Identificação da instituição, limites de upload e parâmetros fixos do atendimento." />
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
        <div className="grid gap-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Regras acadêmicas em vigor</CardTitle>
              <CardDescription>Aplicadas em toda previsão e gravadas em cada análise.</CardDescription>
            </CardHeader>
            <CardContent><RulesSummary rules={ruleSet.rules} version={ruleSet.version} /></CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Polos e formatos</CardTitle>
              <CardDescription>Opções oferecidas no envio de uma nova análise.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Polos ({POLOS.length})</div>
                <ul className="divide-y">{POLOS.map((p) => <li key={p.code} className="flex justify-between gap-3 py-1.5"><span className="min-w-0 truncate">{p.name}</span><span className="shrink-0 font-mono text-xs text-muted-foreground">{p.code}</span></li>)}</ul>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Formatos de curso</div>
                <div className="flex flex-wrap gap-2">{COURSE_FORMATS.map((f) => <span key={f.code} className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs">{f.label}</span>)}</div>
              </div>
              <p className="text-xs text-muted-foreground">Fuso horário do sistema: {APP_TIME_ZONE}. Para incluir um polo ou formato, solicite à equipe técnica.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
