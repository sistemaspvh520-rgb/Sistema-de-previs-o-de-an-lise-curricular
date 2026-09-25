import "server-only";
import { prisma } from "@/lib/prisma";

export async function listAcademicGridReviews(userId: string, isAdmin: boolean, take = 50) {
  return prisma.academicGridReview.findMany({
    where: isAdmin ? {} : { createdById: userId },
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
  });
}

export async function getAcademicGridReview(id: string) {
  return prisma.academicGridReview.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true } },
      corrections: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } },
    },
  });
}

export async function findPreviousAcademicGridReview(id: string, rgm: string | null) {
  if (!rgm) return null;
  return prisma.academicGridReview.findFirst({
    where: { rgm, id: { not: id } },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, snapshot: true, studentName: true, courseName: true, currentPeriod: true },
  });
}
