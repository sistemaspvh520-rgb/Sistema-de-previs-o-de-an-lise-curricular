import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/session";
import { ForbiddenError } from "@/lib/session";
import { can } from "@/lib/rbac";
import { getStorage } from "@/services/storage/storage";
import { logger } from "@/lib/logger";
import { lockEnrollment } from "./versions";

export class DeletionBlockedError extends Error {}

/**
 * Remove uma versão do histórico do aluno mantendo a cadeia íntegra: as versões
 * seguintes passam a apontar para a anterior e, se ela era a atual, a anterior
 * volta a ser a atual. Caller holds the enrollment row lock.
 */
async function removeVersion(tx: Prisma.TransactionClient, versionId: string) {
  const version = await tx.academicAnalysisVersion.findUnique({ where: { id: versionId } });
  if (!version) return null;
  await tx.academicAnalysisVersion.updateMany({ where: { previousVersionId: version.id }, data: { previousVersionId: version.previousVersionId } });
  await tx.studentEnrollment.updateMany({ where: { currentVersionId: version.id }, data: { currentVersionId: version.previousVersionId } });
  await tx.academicAnalysisSource.updateMany({ where: { versionId: version.id }, data: { versionId: null } });
  await tx.academicAnalysisVersion.delete({ where: { id: version.id } });
  const stillUsed = await tx.academicAnalysisVersion.count({ where: { reviewId: version.reviewId } });
  if (!stillUsed) await tx.academicGridReview.delete({ where: { id: version.reviewId } });
  return version.reviewId;
}

function assertOwner(user: SessionUser, ownerId: string) {
  if (!can(user.role, "students:manage")) throw new ForbiddenError();
  if (user.role !== "ADMIN" && ownerId !== user.id) throw new ForbiddenError("Você só pode excluir itens dos seus alunos.");
}

async function removeStoredFiles(keys: Array<string | null>) {
  for (const key of keys) {
    if (!key) continue;
    try {
      await getStorage().delete(key);
    } catch (error) {
      logger.warn("academic.delete.storage_failed", { errorName: error instanceof Error ? error.name : "unknown" });
    }
  }
}

/** Exclui uma solicitação: o documento enviado, todas as tentativas e a versão da análise que ele gerou. */
export async function deleteAcademicRequest(user: SessionUser, requestId: string) {
  const request = await prisma.academicRequest.findUnique({
    where: { id: requestId },
    include: { sourceDocument: { include: { enrollment: { select: { id: true, ownerId: true, name: true } } } } },
  });
  if (!request) throw new DeletionBlockedError("Solicitação não encontrada.");
  const source = request.sourceDocument;
  assertOwner(user, source.enrollment.ownerId);
  if (source.status === "PROCESSING") throw new DeletionBlockedError("Este documento ainda está em processamento. Aguarde a conclusão para excluir.");
  await prisma.$transaction(async (tx) => {
    await lockEnrollment(tx, source.enrollmentId);
    if (source.versionId) await removeVersion(tx, source.versionId);
    await tx.academicAnalysisSource.delete({ where: { id: source.id } });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "academic_request.delete",
        entityType: "StudentEnrollment",
        entityId: source.enrollmentId,
        metadata: { protocol: request.protocol, filename: source.filename, removedVersion: Boolean(source.versionId) },
      },
    });
  });
  await removeStoredFiles([source.storageKey]);
  return { enrollmentId: source.enrollmentId, protocol: request.protocol };
}

/**
 * Exclui uma análise acadêmica. Se ela compõe o histórico de um aluno, remove também
 * as versões publicadas a partir dela e os documentos que as geraram.
 */
export async function deleteAcademicGridReview(user: SessionUser, reviewId: string) {
  const review = await prisma.academicGridReview.findUnique({
    where: { id: reviewId },
    select: { id: true, createdById: true, enrollmentId: true, studentName: true, rgm: true, sourceFilename: true, enrollment: { select: { ownerId: true } } },
  });
  if (!review) throw new DeletionBlockedError("Análise acadêmica não encontrada.");
  if (!can(user.role, "academic:manage")) throw new ForbiddenError();
  if (user.role !== "ADMIN" && review.createdById !== user.id && review.enrollment?.ownerId !== user.id)
    throw new ForbiddenError("Você só pode excluir análises dos seus alunos.");
  const storageKeys: Array<string | null> = [];
  await prisma.$transaction(async (tx) => {
    if (review.enrollmentId) {
      await lockEnrollment(tx, review.enrollmentId);
      if (await tx.academicAnalysisSource.count({ where: { enrollmentId: review.enrollmentId, status: "PROCESSING" } }))
        throw new DeletionBlockedError("Há um documento deste aluno em processamento. Aguarde a conclusão para excluir.");
      const versions = await tx.academicAnalysisVersion.findMany({ where: { reviewId }, select: { id: true } });
      const sources = await tx.academicAnalysisSource.findMany({ where: { versionId: { in: versions.map((v) => v.id) } }, select: { id: true, storageKey: true } });
      for (const version of versions) await removeVersion(tx, version.id);
      for (const source of sources) {
        storageKeys.push(source.storageKey);
        await tx.academicAnalysisSource.delete({ where: { id: source.id } });
      }
    }
    if (await tx.academicGridReview.count({ where: { id: reviewId } })) await tx.academicGridReview.delete({ where: { id: reviewId } });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "academic_grid.delete",
        entityType: "AcademicGridReview",
        entityId: reviewId,
        metadata: { studentName: review.studentName, rgm: review.rgm, sourceFilename: review.sourceFilename, linkedToStudent: Boolean(review.enrollmentId) },
      },
    });
  });
  await removeStoredFiles(storageKeys);
  return { enrollmentId: review.enrollmentId };
}
