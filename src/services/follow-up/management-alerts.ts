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
    // Rede de segurança: o filtro por dias úteis é feito em JS (não dá pra empurrar pro SQL),
    // mas nada impede que essa consulta cresça sem limite com o histórico da instituição.
    orderBy: { completedAt: "desc" },
    take: 5000,
  });
  return candidates
    .filter(
      (item) =>
        businessDaysSince(item.enrollmentReanalysisAt ?? item.completedAt) > 2,
    )
    .sort((a, b) => {
      const aDate = a.enrollmentReanalysisAt ?? a.completedAt;
      const bDate = b.enrollmentReanalysisAt ?? b.completedAt;
      return (aDate?.getTime() ?? 0) - (bDate?.getTime() ?? 0);
    })
    .slice(0, take);
}

export async function countStaleEnrollmentCases(
  where: Prisma.CurricularAnalysisWhereInput,
) {
  return (await listStaleEnrollmentCases(where, Number.MAX_SAFE_INTEGER))
    .length;
}
