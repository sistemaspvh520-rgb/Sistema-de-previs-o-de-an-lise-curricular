import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { requirePagePermission } from "@/lib/session";
import { listAnalyses } from "@/repositories/analysis-repository";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { ReliabilityBadge } from "@/components/shared/status-badge";
import { formatDateTime, ordinal, pluralize } from "@/lib/utils";

export const metadata: Metadata = { title: "Revisões" };
export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const user = await requirePagePermission("analysis:review");
  const { items } = await listAnalyses({ status: "WAITING_REVIEW", pageSize: 50, createdById: user.role === "ADMIN" ? undefined : user.id });

  return (
    <>
      <PageHeader title="Exceções" description="Somente análises que não puderam ser finalizadas automaticamente por falta de uma informação essencial." />
      {items.length === 0 ? (
        <Card className="p-10 text-center shadow-sm">
          <ClipboardCheck className="mx-auto size-8 text-status-success" />
          <p className="mt-3 text-sm text-muted-foreground">Nenhuma exceção pendente. As análises foram entregues automaticamente.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((a) => (
            <Link key={a.id} href={`/analyses/${a.id}`} className="block">
              <Card className="flex flex-col gap-2 p-4 shadow-sm transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium">{a.courseName ?? a.document?.originalName ?? "Análise"}</div>
                  <div className="text-xs text-muted-foreground">
                    Ingresso {ordinal(a.entryPeriod)} · {a._count.subjects} disciplinas · {a.createdBy.name} · {formatDateTime(a.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-status-warning">{pluralize(a.reviewItemsCount, "observação registrada", "observações registradas")}</span>
                  <ReliabilityBadge level={a.reliability} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
