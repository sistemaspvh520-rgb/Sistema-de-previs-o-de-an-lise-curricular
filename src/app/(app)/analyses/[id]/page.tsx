import type { Metadata } from "next";
import Link from "next/link";
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
import { formatPolo } from "@/domain/polos";
import { formatCourseFormat } from "@/domain/course-formats";
import { getAcademicCalendar } from "@/repositories/academic-calendar-repository";
import { zonedDateParts } from "@/lib/time";

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
  const latestProjectionYear = Math.max(0, ...detail.projections.map((projection) => Number(projection.term.slice(0, 4)) || 0));
  const calendarTerms = await getAcademicCalendar(Math.max(zonedDateParts().year + 10, latestProjectionYear));
  const vm = buildAnalysisViewModel(detail, calendarTerms);
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
        title={vm.studentName ?? vm.courseName ?? "Análise curricular"}
        description={
          <>
            {vm.studentName && vm.courseName && <span className="block font-medium text-foreground">{vm.courseName}{vm.courseFormat ? ` · ${formatCourseFormat(vm.courseFormat)}` : ""}</span>}
            {vm.poloCode && <span className="block">Polo {formatPolo(vm.poloCode, vm.poloName)}</span>}
            {vm.reanalysisOf && <span className="block text-status-warning">Reanálise de <Link href={`/analyses/${vm.reanalysisOf.id}`} className="underline">{vm.reanalysisOf.courseName ?? "análise"} de {formatDateTime(vm.reanalysisOf.createdAt)}</Link></span>}
            {vm.reanalyses.length > 0 && <span className="block text-status-warning">Reanalisada em <Link href={`/analyses/${vm.reanalyses[0].id}`} className="underline">{formatDateTime(vm.reanalyses[0].createdAt)}</Link></span>}
            {vm.document?.originalName && <span className="break-all">{vm.document.originalName}</span>}
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
          perms={{ create: can(user.role, "analysis:create"), review: can(user.role, "analysis:review"), diagnostics: can(user.role, "analysis:review"), delete: can(user.role, "analysis:delete"), requestDelete: user.role !== "ADMIN" }}
        />
      )}
    </>
  );
}
