import "server-only";
import type { AcademicGridReviewStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type AcademicGridReviewFilters = {
  query?: string;
  responsibleId?: string;
  status?: AcademicGridReviewStatus;
  period?: number;
};

export async function listAcademicGridReviews(userId: string, isAdmin: boolean, filters: AcademicGridReviewFilters = {}, take = 50) {
  const where: Prisma.AcademicGridReviewWhereInput = isAdmin ? {} : { OR: [{ createdById: userId }, { enrollment: { ownerId: userId } }] };
  const query = filters.query?.trim().slice(0, 100);

  if (isAdmin && filters.responsibleId) where.createdById = filters.responsibleId;
  if (filters.status) where.status = filters.status;
  if (filters.period) where.currentPeriod = filters.period;
  if (query) {
    where.AND = [{ OR: [
      { studentName: { contains: query, mode: "insensitive" } },
      { rgm: { contains: query, mode: "insensitive" } },
      { courseName: { contains: query, mode: "insensitive" } },
    ] }];
  }

  const [items, total] = await Promise.all([
    prisma.academicGridReview.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        studentName: true,
        rgm: true,
        courseName: true,
        sourceFilename: true,
        currentPeriod: true,
        status: true,
        snapshot: true,
        createdAt: true,
        createdBy: { select: { name: true } },
      },
    }),
    prisma.academicGridReview.count({ where }),
  ]);

  return { items, total };
}

export async function listAcademicGridReviewOwners() {
  return prisma.user.findMany({
    where: { academicGridReviews: { some: {} } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, isActive: true },
  });
}

export async function getAcademicGridReview(id: string) {
  return prisma.academicGridReview.findUnique({
    where: { id },
    include: { enrollment: true },
  });
}

export async function findPreviousAcademicGridReview(id: string, rgm: string | null, userId: string, isAdmin: boolean) {
  if (!rgm) return null;
  return prisma.academicGridReview.findFirst({
    where: { rgm, id: { not: id }, ...(!isAdmin ? { createdById: userId } : {}) },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, snapshot: true, studentName: true, courseName: true, currentPeriod: true },
  });
}
