import "server-only";
import { prisma } from "@/lib/prisma";
import type { AnalysisStatus, Prisma } from "@/generated/prisma/client";

export interface ListFilters {
  status?: AnalysisStatus | "ALL";
  q?: string;
  page?: number;
  pageSize?: number;
  createdById?: string;
  statusGroup?: "PROCESSING" | "ATTENTION";
}

export async function listAnalyses(filters: ListFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(50, Math.max(5, filters.pageSize ?? 20));
  const where: Prisma.CurricularAnalysisWhereInput = {};
  if (filters.status && filters.status !== "ALL") where.status = filters.status;
  if (filters.statusGroup === "PROCESSING") {
    where.status = { in: ["UPLOADED", "PARSING", "AI_EXTRACTION", "NORMALIZING", "CALCULATING", "VALIDATING", "AI_AUDIT"] };
  }
  if (filters.statusGroup === "ATTENTION") {
    where.status = { in: ["WAITING_REVIEW", "FAILED", "AI_ERROR"] };
  }
  if (filters.createdById) where.createdById = filters.createdById;
  if (filters.q) {
    where.OR = [
      { courseName: { contains: filters.q, mode: "insensitive" } },
      { candidateLabel: { contains: filters.q, mode: "insensitive" } },
      { document: { originalName: { contains: filters.q, mode: "insensitive" } } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.curricularAnalysis.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        status: true,
        courseName: true,
        candidateLabel: true,
        entryPeriod: true,
        reliability: true,
        reviewItemsCount: true,
        createdAt: true,
        completedAt: true,
        createdBy: { select: { name: true } },
        document: { select: { originalName: true, pageCount: true } },
        _count: { select: { subjects: true } },
      },
    }),
    prisma.curricularAnalysis.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getAnalysisDetail(id: string) {
  return prisma.curricularAnalysis.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      document: true,
      ruleSetVersion: { include: { rules: true } },
      subjects: { orderBy: { sortIndex: "asc" } },
      projections: { orderBy: { index: "asc" }, include: { subjects: { orderBy: { order: "asc" } } } },
      claims: { orderBy: { sourcePage: "asc" } },
      warnings: { orderBy: [{ severity: "asc" }, { createdAt: "asc" }], include: { resolvedBy: { select: { name: true } } } },
      corrections: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } }, subject: { select: { name: true } } } },
      reviews: { orderBy: { createdAt: "desc" }, take: 1 },
      extractions: { orderBy: { createdAt: "desc" }, take: 1, select: { model: true, promptVersion: true, privacyMode: true, durationMs: true, status: true, createdAt: true } },
      usages: { orderBy: { createdAt: "asc" } },
      curriculumMatrix: { include: { course: true } },
    },
  });
}

export type AnalysisDetail = NonNullable<Awaited<ReturnType<typeof getAnalysisDetail>>>;
