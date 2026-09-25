import "server-only";
import type { Prisma, Role } from "@/generated/prisma/client";
import type { AcademicGridSnapshot } from "@/domain/academic-analysis/types";
import { academicDiff, academicFingerprint } from "./fingerprints";

export async function lockEnrollment(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "StudentEnrollment" WHERE id = ${id}::uuid FOR UPDATE`;
}

/** Caller holds the enrollment row lock. History never mutates with the tutor workspace. */
export async function publishVersion(
  tx: Prisma.TransactionClient,
  input: {
    enrollmentId: string;
    reviewId: string;
    snapshot: AcademicGridSnapshot;
    actorUserId: string;
    actorRole: Role;
    origin: string;
    createdAt?: Date;
  },
) {
  const enrollment = await tx.studentEnrollment.findUniqueOrThrow({
    where: { id: input.enrollmentId },
    include: { currentVersion: true },
  });
  const previous = enrollment.currentVersion;
  const hash = academicFingerprint(input.snapshot);
  if (
    previous &&
    academicFingerprint(
      previous.snapshot as unknown as AcademicGridSnapshot,
    ) === hash
  )
    return { version: previous, reused: true };
  const latest = await tx.academicAnalysisVersion.aggregate({
    where: { enrollmentId: input.enrollmentId },
    _max: { version: true },
  });
  const version = await tx.academicAnalysisVersion.create({
    data: {
      enrollmentId: input.enrollmentId,
      reviewId: input.reviewId,
      preferredSourceId:
        input.origin === "TUTOR_MANUAL_CORRECTION"
          ? previous?.preferredSourceId
          : undefined,
      version: (latest._max.version ?? 0) + 1,
      previousVersionId: previous?.id,
      academicSnapshotHash: hash,
      snapshot: input.snapshot as unknown as Prisma.InputJsonValue,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      origin: input.origin,
      changeSummary: academicDiff(
        previous?.snapshot as unknown as AcademicGridSnapshot | null,
        input.snapshot,
      ),
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    },
  });
  await tx.studentEnrollment.update({
    where: { id: enrollment.id },
    data: { currentVersionId: version.id },
  });
  await tx.auditLog.create({
    data: {
      userId: input.actorUserId,
      action: previous ? "ANALYSIS_UPDATED" : "ANALYSIS_CREATED",
      entityType: "StudentEnrollment",
      entityId: enrollment.id,
      metadata: { version: version.version, origin: input.origin },
    },
  });
  return { version, reused: false };
}
