import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/session";
import { getActiveRuleSet } from "@/repositories/rules-repository";
import { PageHeader } from "@/components/layout/page-header";
import { RulesForm } from "@/features/rules/rules-form";

export const metadata: Metadata = { title: "Regras acadêmicas" };
export const dynamic = "force-dynamic";

export default async function RulesPage() {
  await requirePagePermission("rules:manage");
  const active = await getActiveRuleSet();

  return (
    <>
      <PageHeader eyebrow="Configurações" title="Regras Acadêmicas" description={`Ajuste somente o que muda a previsão. A versão ${active.version} está em uso nas novas análises.`} />
      <div className="max-w-5xl"><RulesForm initial={active.rules} version={active.version} /></div>
    </>
  );
}
