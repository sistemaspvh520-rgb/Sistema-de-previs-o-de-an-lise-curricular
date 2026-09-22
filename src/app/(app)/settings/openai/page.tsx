import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/session";
import { PageHeader } from "@/components/layout/page-header";
import { getOpenAIIntegrationView } from "@/features/integrations/openai/actions";
import { OpenAIIntegrationPanel } from "@/features/integrations/openai/integration-panel";
import { getMonthlyAiUsageSummary } from "@/repositories/ai-usage-repository";
import { AiUsageMonthCards } from "@/features/settings/ai-usage-month";

export const metadata: Metadata = { title: "Integração OpenAI" };
export const dynamic = "force-dynamic";

export default async function OpenAISettingsPage() {
  await requirePagePermission("integration:manage");
  const [view, usage] = await Promise.all([getOpenAIIntegrationView(), getMonthlyAiUsageSummary()]);

  return (
    <>
      <PageHeader
        eyebrow="Configurações · Integrações"
        title="OpenAI"
        description="Conexão, modelos usados nas análises e consumo do mês."
      />
      <OpenAIIntegrationPanel key={view.updatedAt} view={view} />
      <div className="mt-6"><AiUsageMonthCards summary={usage} /></div>
    </>
  );
}
