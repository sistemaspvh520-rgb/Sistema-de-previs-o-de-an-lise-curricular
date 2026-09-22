import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { requirePagePermission } from "@/lib/session";
import { listAnalyses } from "@/repositories/analysis-repository";
import { ATTENTION_REASONS } from "@/domain/curricular-analysis/status-groups";
import { formatCourseFormat } from "@/domain/course-formats";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { AnalysisStatusBadge } from "@/components/shared/status-badge";
import { formatDateTime, ordinal, pluralize } from "@/lib/utils";

export const metadata: Metadata = { title: "Revisões" };
export const dynamic = "force-dynamic";

/**
 * Mesmo conjunto do card/filtro "Precisam de atenção" (ingresso pendente, falha na IA, não concluída),
 * apresentado pelo motivo — e não pela confiabilidade — para a lista e a Gestão contarem a mesma coisa.
 */
export default async function ReviewsPage() {
  const user = await requirePagePermission("analysis:review");
  const { items } = await listAnalyses({ statusGroup: "ATTENTION", pageSize: 50, createdById: user.role === "ADMIN" ? undefined : user.id });

  return (
    <>
      <PageHeader title="Revisões" description="Análises que precisam de uma ação humana para serem concluídas." />
      {items.length === 0 ? (
        <Card className="p-10 text-center shadow-sm">
          <ClipboardCheck className="mx-auto size-8 text-status-success" />
          <p className="mt-3 text-sm text-muted-foreground">Nenhuma análise precisa de atenção. Todas foram entregues automaticamente.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((a) => {
            const reason = ATTENTION_REASONS[a.status];
            return (
              <Link key={a.id} href={`/analyses/${a.id}`} className="block">
                <Card className="flex flex-col gap-3 p-4 shadow-sm transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="break-words font-medium [overflow-wrap:anywhere]">{a.studentName ?? a.courseName ?? a.document?.originalName ?? "Análise"}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.studentName && <>{a.courseName ?? "Curso não identificado"}{a.courseFormat ? ` · ${formatCourseFormat(a.courseFormat)}` : ""}{a.poloCode ? ` · Polo ${a.poloCode}` : ""} · </>}Ingresso {ordinal(a.entryPeriod)} · {pluralize(a._count.subjects, "disciplina")} · {a.createdBy.name} · {formatDateTime(a.createdAt)}
                    </div>
                    {reason && (
                      <div className="mt-1.5 text-sm">
                        <span className="font-medium text-status-warning">{reason.title}</span>
                        <span className="text-muted-foreground"> — {reason.action}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {a.reviewItemsCount > 0 && <span className="text-xs text-muted-foreground">{pluralize(a.reviewItemsCount, "observação", "observações")}</span>}
                    <AnalysisStatusBadge status={a.status} />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
