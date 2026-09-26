import "server-only";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";
import { ForbiddenError } from "@/lib/session";
import { can } from "@/lib/rbac";
import type { AcademicGridSnapshot } from "@/domain/academic-analysis/types";
import { canonicalRgm, canonicalText, canonicalCourse } from "./fingerprints";
import { lockEnrollment, publishVersion } from "./versions";
import { enrollmentScope } from "./access";

import { PortalInputError } from "./input-error";
export { PortalInputError } from "./input-error";

/** Exact RGM only. Legacy records are linked within the responsible tutor's scope. */
export async function ensureEnrollment(
  user: SessionUser,
  input: { rgm: string; name: string; courseName?: string | null },
) {
  if (user.role === "STUDENT") throw new ForbiddenError();
  enrollmentScope(user);
  const rgm = canonicalRgm(input.rgm);
  if (!rgm || rgm.length > 40)
    throw new PortalInputError("Informe um RGM válido.");
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`student-rgm:${rgm}`}, 0))::text`;
      const existing = await tx.studentEnrollment.findUnique({
        where: { rgm },
      });
      if (existing) {
        if (!can(user.role, "academic:all") && existing.ownerId !== user.id)
          throw new PortalInputError(
            "Este RGM já possui cadastro com outro responsável. Solicite ajuda à administração.",
          );
        if (
          input.courseName &&
          existing.courseName &&
          canonicalCourse(input.courseName) !==
            canonicalCourse(existing.courseName)
        )
          throw new PortalInputError(
            "O curso do extrato não corresponde ao cadastro. Solicite a conferência da equipe acadêmica.",
          );
        return existing;
      }
      const legacy = await tx.academicGridReview.findMany({
        where: { rgm, enrollmentId: null },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: { createdBy: { select: { role: true } } },
      });
      if (
        !can(user.role, "academic:all") &&
        legacy.some((item) => item.createdById !== user.id)
      )
        throw new PortalInputError(
          "Há análises deste RGM com outro responsável. A administração precisa conferir o vínculo.",
        );
      const courses = new Set(
        [
          ...legacy.map((item) => canonicalCourse(item.courseName)),
          canonicalCourse(input.courseName),
        ].filter(Boolean),
      );
      const names = new Set(
        [
          ...legacy.map((item) => canonicalText(item.studentName)),
          canonicalText(input.name),
        ].filter(Boolean),
      );
      if (courses.size > 1 || names.size > 1)
        throw new PortalInputError(
          "Há dados divergentes para este RGM. Confira nome e curso nas análises existentes antes de continuar.",
        );
      const enrollment = await tx.studentEnrollment.create({
        data: {
          rgm,
          name: input.name,
          courseName: input.courseName || legacy.at(-1)?.courseName,
          ownerId: user.id,
        },
      });
      await lockEnrollment(tx, enrollment.id);
      for (const review of legacy) {
        await tx.academicGridReview.update({
          where: { id: review.id },
          data: { enrollmentId: enrollment.id },
        });
        const published = await publishVersion(tx, {
          enrollmentId: enrollment.id,
          reviewId: review.id,
          snapshot: review.snapshot as unknown as AcademicGridSnapshot,
          actorUserId: review.createdById,
          actorRole: review.createdBy.role,
          origin: "LEGACY_IMPORT",
          createdAt: review.createdAt,
        });
        await tx.academicAnalysisSource.upsert({
          where: {
            enrollmentId_sourceFileHash: {
              enrollmentId: enrollment.id,
              sourceFileHash: review.sourceSha256,
            },
          },
          create: {
            enrollmentId: enrollment.id,
            sourceFileHash: review.sourceSha256,
            filename: review.sourceFilename,
            actorUserId: review.createdById,
            actorRole: review.createdBy.role,
            versionId: published.version.id,
            status: "COMPLETED",
            stage: "Concluído",
            reused: published.reused,
            createdAt: review.createdAt,
          },
          update: {},
        });
      }
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "STUDENT_LINKED",
          entityType: "StudentEnrollment",
          entityId: enrollment.id,
          metadata: { linkedReviews: legacy.length },
        },
      });
      return enrollment;
    },
    { timeout: 30_000 },
  );
}
