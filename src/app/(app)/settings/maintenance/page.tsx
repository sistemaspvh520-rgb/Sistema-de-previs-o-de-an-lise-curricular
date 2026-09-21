import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PurgeCard } from "@/features/maintenance/purge-card";
import { purgeAiUsageAction, purgeAnalysesAction, purgeAuditLogsAction } from "@/features/maintenance/actions";
import { DeletionRequestActions } from "@/features/analyses/components/deletion-request-actions";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Manutenção de dados" };
export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  await requirePagePermission("privacy:manage");
  const [audit, usage, analyses, deletionRequests] = await Promise.all([
    prisma.auditLog.count(),
    prisma.aIUsage.count(),
    prisma.curricularAnalysis.count(),
    prisma.analysisDeletionRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { analysis: { select: { id: true, courseName: true, document: { select: { originalName: true } } } }, requestedBy: { select: { name: true, email: true } } },
    }),
  ]);

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
      <Card className="mt-6 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Solicitações de exclusão</CardTitle>
          <CardDescription>Pedidos feitos pelos responsáveis pelas análises. A aprovação remove a análise e o PDF definitivamente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {deletionRequests.length === 0 ? (
            <p className="rounded-lg bg-status-success-bg p-4 text-sm text-status-success">Não há solicitações de exclusão aguardando decisão.</p>
          ) : deletionRequests.map((request) => (
            <div key={request.id} className="grid gap-3 rounded-xl border p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <div className="truncate font-medium">{request.analysis.courseName ?? request.analysis.document?.originalName ?? "Análise sem título"}</div>
                <p className="mt-1 text-sm text-muted-foreground">Solicitada por {request.requestedBy.name} · {formatDateTime(request.createdAt)}</p>
                {request.reason && <p className="mt-2 break-words text-sm text-muted-foreground">Motivo: {request.reason}</p>}
              </div>
              <DeletionRequestActions requestId={request.id} />
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
