import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/session";
import { PageHeader } from "@/components/layout/page-header";
import { getOpenAIIntegrationView } from "@/features/integrations/openai/actions";
import { OpenAIIntegrationPanel } from "@/features/integrations/openai/integration-panel";

export const metadata: Metadata = { title: "Integração OpenAI" };
export const dynamic = "force-dynamic";

export default async function OpenAISettingsPage() {
  await requirePagePermission("integration:manage");
  const view = await getOpenAIIntegrationView();

  return (
    <>
      <PageHeader
        eyebrow="Configurações · Integrações"
        title="OpenAI"
        description="Gerencie somente a conexão e os modelos usados nas análises."
      />
      <OpenAIIntegrationPanel key={view.updatedAt} view={view} />
    </>
  );
}
