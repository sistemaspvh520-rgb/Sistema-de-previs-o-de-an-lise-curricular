import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { getAcademicGridReview, findPreviousAcademicGridReview } from "@/repositories/academic-analysis-repository";
import type { AcademicGridSnapshot } from "@/domain/academic-analysis/types";
import { AcademicGridWorkspace } from "@/features/academic-analysis/workspace";
import { getAcademicCalendar } from "@/repositories/academic-calendar-repository";
import { zonedDateParts } from "@/lib/time";
import { estimateGraduation } from "@/domain/academic-analysis/graduation-forecast";
import { getActiveRuleSet } from "@/repositories/rules-repository";
import { DEFAULT_RULES } from "@/domain/curricular-analysis/rules/types";

export const metadata: Metadata = { title: "Resultado da análise acadêmica" };
export const dynamic = "force-dynamic";

export default async function AcademicGridReviewPage({ params }: PageProps<"/academic-analysis/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const review = await getAcademicGridReview(id);
  if (!review || (user.role !== "ADMIN" && review.createdById !== user.id)) notFound();
  const snapshot = review.snapshot as unknown as AcademicGridSnapshot;
  const currentRuleSet = snapshot.projectionRules ? null : await getActiveRuleSet().catch(() => null);
  const projectionRules = snapshot.projectionRules ?? currentRuleSet?.rules ?? DEFAULT_RULES;
  const projectionRulesVersion = snapshot.projectionRulesVersion ?? currentRuleSet?.version ?? "padrão";
  const forecastWithoutCalendar = estimateGraduation({ disciplines: snapshot.disciplines, currentPeriod: review.currentPeriod, rules: projectionRules, extractionWarnings: snapshot.extractionWarnings });
  const analysisDateParts = zonedDateParts(review.createdAt);
  const analysisDate = `${analysisDateParts.year}-${String(analysisDateParts.month).padStart(2, "0")}-${String(analysisDateParts.day).padStart(2, "0")}`;
  const analysisYear = analysisDateParts.year;
  const forecastHorizon = analysisYear + Math.ceil((forecastWithoutCalendar?.semestersMax ?? 0) / 2) + 2;
  const [previousRecord, calendarTerms] = await Promise.all([
    findPreviousAcademicGridReview(review.id, review.rgm),
    getAcademicCalendar(Math.max(zonedDateParts().year + 10, forecastHorizon)),
  ]);
  const previousSnapshot = previousRecord?.snapshot as unknown as AcademicGridSnapshot | undefined;
  return <AcademicGridWorkspace review={{
    id: review.id,
    studentName: review.studentName,
    rgm: review.rgm,
    courseName: review.courseName,
    currentPeriod: review.currentPeriod,
    currentPeriodRaw: review.currentPeriodRaw,
    currentPeriodConfirmed: review.currentPeriodConfirmed,
    sourceFilename: review.sourceFilename,
    sourceSha256: review.sourceSha256,
    sourcePageCount: review.sourcePageCount,
    createdAt: review.createdAt.toISOString(),
    analysisDate,
    createdByName: review.createdBy.name,
    snapshot,
    proceedConfirmed: snapshot.proceedConfirmed === true || review.corrections.some((correction) => correction.field === "proceedConfirmed" && correction.newValue === true),
    previous: previousRecord && previousSnapshot ? {
      id: previousRecord.id,
      previousPending: previousSnapshot.result.previousPending,
    } : null,
    corrections: review.corrections.map((correction) => ({
      id: correction.id,
      field: correction.field,
      disciplineIndex: correction.disciplineIndex,
      previousValue: correction.previousValue,
      newValue: correction.newValue,
      reason: correction.reason,
      createdAt: correction.createdAt.toISOString(),
      user: correction.user,
    })),
  }} calendarTerms={calendarTerms} rules={projectionRules} rulesVersion={projectionRulesVersion} isAdmin={user.role === "ADMIN"} />;
}
