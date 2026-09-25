import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export interface CommercialInsightScope {
  from?: Date;
  to?: Date;
}

function whereFor(scope: CommercialInsightScope): Prisma.CurricularAnalysisWhereInput {
  return {
    ...(scope.from || scope.to ? { createdAt: { ...(scope.from ? { gte: scope.from } : {}), ...(scope.to ? { lte: scope.to } : {}) } } : {}),
  };
}

/** Métricas comerciais que não se repetem no resumo operacional da Gestão. */
export async function getCommercialInsights(scope: CommercialInsightScope) {
  const where = whereFor(scope);
  const completedWhere = { ...where, status: "COMPLETED" as const };
  const [timings, candidates] = await Promise.all([
    prisma.curricularAnalysis.findMany({ where: { ...where, completedAt: { not: null } }, orderBy: { completedAt: "desc" }, take: 5000, select: { createdAt: true, completedAt: true } }),
    prisma.curricularAnalysis.findMany({
      where: { ...completedWhere, enrollmentStatus: "PENDING" },
      orderBy: { completedAt: "asc" },
      take: 50,
      select: { id: true, studentName: true, courseName: true, poloName: true, completedAt: true, subjects: { select: { status: true } } },
    }),
  ]);
  const averageProcessingMinutes = timings.length
    ? Math.round(timings.reduce((sum, row) => sum + ((row.completedAt?.getTime() ?? row.createdAt.getTime()) - row.createdAt.getTime()) / 60_000, 0) / timings.length)
    : null;
  const highValueLeads = candidates.map((row) => {
    const totalSubjects = row.subjects.length;
    const exempted = row.subjects.filter((s) => s.status === "EXEMPTED").length;
    return { ...row, exempted, exemptedPercentage: totalSubjects ? Math.round((exempted / totalSubjects) * 100) : 0 };
  }).filter((row) => row.exemptedPercentage >= 50);
  return {
    averageProcessingMinutes,
    highValueLeads,
  };
}
