import "server-only";
import { prisma } from "@/lib/prisma";
import { businessDaysSince } from "@/lib/time";
import type { Prisma } from "@/generated/prisma/client";

/** Casos sem matrícula por mais de dois dias úteis; reanálises continuam visíveis. */
export async function listStaleEnrollmentCases(
  where: Prisma.CurricularAnalysisWhereInput,
  take = 6,
) {
  const candidates = await prisma.curricularAnalysis.findMany({
    where: {
      ...where,
      status: "COMPLETED",
      enrollmentStatus: { not: "ENROLLED" },
    },
    select: {
      id: true,
      studentName: true,
      courseName: true,
      poloName: true,
      completedAt: true,
      enrollmentReanalysisAt: true,
      enrollmentStatus: true,
    },
  });
  return candidates
    .filter(
      (item) =>
        businessDaysSince(item.enrollmentReanalysisAt ?? item.completedAt) > 2,
    )
    .sort(
      (a, b) =>
        (a.enrollmentReanalysisAt ?? a.completedAt)?.getTime()! -
        (b.enrollmentReanalysisAt ?? b.completedAt)?.getTime()!,
    )
    .slice(0, take);
}

export async function countStaleEnrollmentCases(
  where: Prisma.CurricularAnalysisWhereInput,
) {
  return (await listStaleEnrollmentCases(where, Number.MAX_SAFE_INTEGER))
    .length;
}
