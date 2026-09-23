import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  AnalysisStatus,
  EnrollmentStatus,
  Prisma,
} from "@/generated/prisma/client";
import {
  ATTENTION_STATUSES,
  PROCESSING_STATUSES,
} from "@/domain/curricular-analysis/status-groups";

export interface ListFilters {
  status?: AnalysisStatus | "ALL";
  q?: string;
  page?: number;
  pageSize?: number;
  createdById?: string;
  statusGroup?: "PROCESSING" | "ATTENTION";
  poloCode?: string;
  /** Somente entregues há mais de 24h sem retorno de matrícula. */
  followUpDue?: boolean;
  /** Reanálises declaradas que aguardam o novo resultado. */
  reanalysisInProgress?: boolean;
  enrollmentStatus?: EnrollmentStatus;
}

export async function listAnalyses(filters: ListFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(50, Math.max(5, filters.pageSize ?? 20));
  const where: Prisma.CurricularAnalysisWhereInput = {};
  if (filters.status && filters.status !== "ALL") where.status = filters.status;
  if (filters.statusGroup === "PROCESSING") {
    where.status = { in: [...PROCESSING_STATUSES] };
  }
  if (filters.statusGroup === "ATTENTION") {
    where.status = { in: [...ATTENTION_STATUSES] };
  }
  if (filters.createdById) where.createdById = filters.createdById;
  if (filters.poloCode) where.poloCode = filters.poloCode;
  if (filters.followUpDue)
    Object.assign(where, {
      status: "COMPLETED",
      enrollmentStatus: "PENDING",
      followUpDueAt: { lte: new Date() },
    });
  if (filters.reanalysisInProgress)
    Object.assign(where, {
      status: "COMPLETED",
      enrollmentStatus: "PENDING",
      enrollmentReanalysisAt: { not: null },
    });
  if (filters.enrollmentStatus)
    where.enrollmentStatus = filters.enrollmentStatus;
  if (filters.q) {
    where.OR = [
      { studentName: { contains: filters.q, mode: "insensitive" } },
      { courseName: { contains: filters.q, mode: "insensitive" } },
      { candidateLabel: { contains: filters.q, mode: "insensitive" } },
      {
        document: {
          originalName: { contains: filters.q, mode: "insensitive" },
        },
      },
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
        studentName: true,
        poloCode: true,
        poloName: true,
        courseFormat: true,
        enrollmentStatus: true,
        followUpDueAt: true,
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
  const now = new Date();
  return {
    items: items.map((analysis) => ({
      ...analysis,
      followUpIsDue:
        analysis.status === "COMPLETED" &&
        analysis.enrollmentStatus === "PENDING" &&
        analysis.followUpDueAt !== null &&
        analysis.followUpDueAt <= now,
    })),
    total,
    page,
    pageSize,
  };
}

export async function getAnalysisDetail(id: string) {
  return prisma.curricularAnalysis.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      enrollmentUpdatedBy: { select: { name: true } },
      reanalysisOf: { select: { id: true, createdAt: true, courseName: true } },
      reanalyses: {
        select: { id: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
      document: true,
      ruleSetVersion: { include: { rules: true } },
      subjects: { orderBy: { sortIndex: "asc" } },
      projections: {
        orderBy: { index: "asc" },
        include: { subjects: { orderBy: { order: "asc" } } },
      },
      claims: { orderBy: { sourcePage: "asc" } },
      warnings: {
        orderBy: [{ severity: "asc" }, { createdAt: "asc" }],
        include: { resolvedBy: { select: { name: true } } },
      },
      corrections: {
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { name: true } },
          subject: { select: { name: true } },
        },
      },
      reviews: { orderBy: { createdAt: "desc" }, take: 1 },
      extractions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          model: true,
          promptVersion: true,
          privacyMode: true,
          durationMs: true,
          status: true,
          createdAt: true,
        },
      },
      usages: { orderBy: { createdAt: "asc" } },
    },
  });
}

export type AnalysisDetail = NonNullable<
  Awaited<ReturnType<typeof getAnalysisDetail>>
>;

export interface ReportFilters {
  createdById?: string;
  poloCode?: string;
  from?: Date;
  to?: Date;
}

/** Contagem de análises por polo (total e no período), para os relatórios. */
export async function countAnalysesByPolo(
  filters: ReportFilters & { monthStart: Date },
) {
  const where: Prisma.CurricularAnalysisWhereInput = {
    poloCode: { not: null },
  };
  if (filters.createdById) where.createdById = filters.createdById;
  const [total, month, completed] = await Promise.all([
    prisma.curricularAnalysis.groupBy({
      by: ["poloCode", "poloName"],
      where,
      _count: { _all: true },
    }),
    prisma.curricularAnalysis.groupBy({
      by: ["poloCode"],
      where: { ...where, createdAt: { gte: filters.monthStart } },
      _count: { _all: true },
    }),
    prisma.curricularAnalysis.groupBy({
      by: ["poloCode"],
      where: { ...where, status: "COMPLETED" },
      _count: { _all: true },
    }),
  ]);
  const monthBy = new Map(month.map((m) => [m.poloCode, m._count._all]));
  const completedBy = new Map(
    completed.map((m) => [m.poloCode, m._count._all]),
  );
  return total
    .map((row) => ({
      code: row.poloCode as string,
      name: row.poloName ?? "Polo não cadastrado",
      total: row._count._all,
      month: monthBy.get(row.poloCode) ?? 0,
      completed: completedBy.get(row.poloCode) ?? 0,
    }))
    .sort((a, b) => b.total - a.total || a.code.localeCompare(b.code));
}

/** Linhas do relatório exportável (CSV): uma por análise, com totais e previsão. */
export async function listAnalysesForReport(filters: ReportFilters) {
  const where: Prisma.CurricularAnalysisWhereInput = {};
  if (filters.createdById) where.createdById = filters.createdById;
  if (filters.poloCode) where.poloCode = filters.poloCode;
  if (filters.from || filters.to)
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  return prisma.curricularAnalysis.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 5000,
    select: {
      id: true,
      createdAt: true,
      completedAt: true,
      status: true,
      enrollmentStatus: true,
      enrollmentUpdatedAt: true,
      studentName: true,
      poloCode: true,
      poloName: true,
      courseFormat: true,
      courseName: true,
      entryPeriod: true,
      entryTerm: true,
      startTerm: true,
      reliability: true,
      reviewItemsCount: true,
      createdBy: { select: { name: true } },
      document: { select: { originalName: true } },
      projections: {
        orderBy: { index: "desc" },
        take: 1,
        select: { term: true },
      },
      _count: { select: { subjects: true } },
      subjects: { select: { status: true } },
    },
  });
}
