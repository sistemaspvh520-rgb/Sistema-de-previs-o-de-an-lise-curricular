import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { PurgeCard } from "@/features/maintenance/purge-card";
import { purgeAiUsageAction, purgeAnalysesAction, purgeAuditLogsAction } from "@/features/maintenance/actions";

export const metadata: Metadata = { title: "Manutenção de dados" };
export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  await requirePagePermission("privacy:manage");
  const [audit, usage, analyses] = await Promise.all([prisma.auditLog.count(), prisma.aIUsage.count(), prisma.curricularAnalysis.count()]);

  return (
    <>
      <PageHeader eyebrow="Configurações" title="Manutenção de dados" description="Limpeza definitiva de históricos. Cada limpeza gera um único registro de auditoria com o resumo do que foi removido." />
      <div className="grid gap-6 lg:grid-cols-3">
        <PurgeCard title="Histórico de auditoria" description="Logins, alterações, acessos de suporte e eventos do sistema." count={audit} countLabel="registros" action={purgeAuditLogsAction} />
        <PurgeCard title="Uso de IA" description="Chamadas à OpenAI, tokens e custo estimado." count={usage} countLabel="chamadas" action={purgeAiUsageAction} />
        <PurgeCard
          title="Análises curriculares"
          description="Remove análises com disciplinas, previsões, correções, alertas, extrações da IA e o PDF armazenado."
          count={analyses}
          countLabel="análises"
          action={purgeAnalysesAction}
          extra={{ label: "Somente", options: [{ value: "ALL", label: "Todas" }, { value: "COMPLETED", label: "Concluídas" }, { value: "FAILED", label: "Com falha" }] }}
        />
      </div>
    </>
  );
}
