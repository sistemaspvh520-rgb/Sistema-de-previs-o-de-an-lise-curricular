import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { getAnalysisDetail } from "@/repositories/analysis-repository";
import { buildAnalysisViewModel } from "@/features/analyses/view-model";
import { PageHeader } from "@/components/layout/page-header";
import { AnalysisStatusBadge } from "@/components/shared/status-badge";
import { ProcessingPanel } from "@/features/analyses/components/processing-panel";
import { AnalysisView } from "@/features/analyses/components/analysis-view";
import { formatDateTime } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { suggestMatrix } from "@/features/analyses/suggest-matrix";

export const metadata: Metadata = { title: "Análise" };
export const dynamic = "force-dynamic";
// server actions desta rota (reprocessar, reauditar) podem esperar a OpenAI
export const maxDuration = 300;

export default async function AnalysisPage({ params }: PageProps<"/analyses/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const detail = await getAnalysisDetail(id);
  if (!detail) notFound();
  if (user.role !== "ADMIN" && detail.createdById !== user.id) notFound();
  const vm = buildAnalysisViewModel(detail);
  const matrixRows = await prisma.curriculumMatrix.findMany({ where: { isActive: true }, include: { course: true }, orderBy: [{ course: { name: "asc" } }, { year: "desc" }] });
  const matrices = matrixRows.map((m) => ({ id: m.id, label: m.label, course: m.course.name, year: m.year, version: m.version }));
  const suggestedMatrixId = suggestMatrix(matrices, { courseName: vm.courseName, matrixLabel: vm.matrixLabel });
  const failed = vm.status === "FAILED" || vm.status === "AI_ERROR";
  const hasData = vm.subjects.length > 0;

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            Análise curricular <AnalysisStatusBadge status={vm.status} />
          </span>
        }
        title={vm.courseName ?? vm.document?.originalName ?? "Análise"}
        description={
          <>
            {vm.document?.originalName}
            {vm.candidateLabel ? ` · ${vm.candidateLabel}` : ""} · enviado por {vm.createdBy.name} em {formatDateTime(vm.createdAt)}
          </>
        }
      />
      {(vm.isProcessing || failed) && (
        <div className="mb-6 max-w-2xl">
          <ProcessingPanel
            analysisId={vm.id}
            initialSteps={vm.steps}
            initialStatus={vm.status}
            errorCode={vm.errorCode}
            errorMessage={vm.errorMessage}
            canRetry={can(user.role, "analysis:create")}
          />
        </div>
      )}
      {!vm.isProcessing && (!failed || hasData) && (
        <AnalysisView
          vm={vm}
          perms={{ review: can(user.role, "analysis:review"), complete: !failed && can(user.role, "analysis:complete"), rules: can(user.role, "rules:manage"), diagnostics: can(user.role, "analysis:review"), delete: can(user.role, "analysis:delete"), requestDelete: user.role !== "ADMIN" }}
          matrices={matrices}
          suggestedMatrixId={suggestedMatrixId}
        />
      )}
    </>
  );
}
