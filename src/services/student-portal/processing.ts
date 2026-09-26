import { presentAcademicSnapshot } from "@/services/academic-documents/presentation";
import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/session";
import { parsePdf } from "@/services/pdf/parser";
import type { AcademicGridSnapshot } from "@/domain/academic-analysis/types";
import { extractAcademicDocument } from "@/services/academic-documents/adapters";
import { autoMapHistorySnapshot } from "@/services/academic-analysis/history-mapping";
import {
  classifyAcademicDocument,
  sourcePriority,
} from "@/services/academic-documents/classifier";
import { getStorage } from "@/services/storage/storage";
import { retentionDeadline } from "@/features/analyses/create-analysis";
import { getSystemSettings } from "@/repositories/settings-repository";
import { getActiveRuleSet } from "@/repositories/rules-repository";
import { DEFAULT_RULES } from "@/domain/curricular-analysis/rules/types";
import {
  academicFingerprint,
  canonicalRgm,
  canonicalCourse,
  contentFingerprint,
  sha256,
} from "./fingerprints";
import { lockEnrollment, publishVersion } from "./versions";
import { requireEnrollment } from "./access";
import { PortalInputError } from "./enrollments";
import { notifyAcademicUpdate } from "./notifications";
import { recordAudit } from "@/services/audit-log/audit-log";
import { logger } from "@/lib/logger";

export const STALE_JOB_MS = 5 * 60 * 1000; // longer than the route's 120-second lifetime

export function isProcessingFresh(
  job: { status: string; updatedAt: Date } | null,
) {
  return Boolean(
    job?.status === "PROCESSING" &&
    job.updatedAt.getTime() > Date.now() - STALE_JOB_MS,
  );
}

export async function claimUpload(
  user: SessionUser,
  enrollmentId: string,
  bytes: Buffer,
  filename: string,
) {
  await requireEnrollment(user, enrollmentId);
  const sourceFileHash = sha256(bytes);
  return prisma.$transaction(async (tx) => {
    await lockEnrollment(tx, enrollmentId);
    await tx.academicAnalysisSource.updateMany({
      where: {
        enrollmentId,
        status: "PROCESSING",
        updatedAt: { lt: new Date(Date.now() - STALE_JOB_MS) },
      },
      data: {
        status: "FAILED",
        errorMessage:
          "O processamento foi interrompido. Envie o documento novamente para tentar outra vez.",
      },
    });
    const previous = await tx.academicAnalysisSource.findUnique({
      where: { enrollmentId_sourceFileHash: { enrollmentId, sourceFileHash } },
    });
    const lastRequest = await tx.academicRequest.findFirst({
      where: { sourceDocument: { enrollmentId } },
      orderBy: { createdAt: "desc" },
    });
    const previousRequest = previous
      ? await tx.academicRequest.findFirst({
          where: { sourceDocumentId: previous.id },
          orderBy: { attempt: "desc" },
        })
      : null;
    if (
      previousRequest &&
      ["REJECTED", "WAITING_NEW_DOCUMENT"].includes(previousRequest.status)
    )
      throw new PortalInputError(
        "Este documento foi recusado. Envie um novo PDF válido.",
      );
    if (previous?.status === "COMPLETED") {
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "ANALYSIS_REUSED",
          entityType: "StudentEnrollment",
          entityId: enrollmentId,
          metadata: { level: "FILE" },
        },
      });
      return { source: previous, run: false, duplicate: true };
    }
    const processing = await tx.academicAnalysisSource.findFirst({
      where: { enrollmentId, status: "PROCESSING" },
    });
    if (processing) return { source: processing, run: false, duplicate: false };
    const data = {
      status: "PROCESSING",
      stage: "Processando documento",
      actorUserId: user.id,
      actorRole: user.role,
      errorMessage: null,
      documentType: "UNKNOWN_ACADEMIC_DOCUMENT" as const,
      reused: false,
    };
    const source = previous
      ? await tx.academicAnalysisSource.update({
          where: { id: previous.id },
          data: { ...data, attempts: { increment: 1 } },
        })
      : await tx.academicAnalysisSource.create({
          data: { ...data, enrollmentId, sourceFileHash, filename },
        });
    await tx.academicRequest.updateMany({
      where: {
        sourceDocument: { enrollmentId, status: "FAILED" },
        status: "PROCESSING",
      },
      data: {
        status: "FAILED",
        result:
          "Processamento interrompido. Envie novamente para tentar outra vez.",
      },
    });
    if (previous)
      await tx.academicRequest.updateMany({
        where: {
          sourceDocumentId: source.id,
          attempt: { lt: source.attempts },
          status: "PROCESSING",
        },
        data: {
          status: "FAILED",
          result: "Tentativa interrompida; novo processamento iniciado.",
        },
      });
    await tx.academicRequest.create({
      data: {
        sourceDocumentId: source.id,
        attempt: source.attempts,
        status: "PROCESSING",
        actorUserId: user.id,
        actorRole: user.role,
        previousRequestId:
          lastRequest &&
          ["REJECTED", "WAITING_NEW_DOCUMENT", "FAILED"].includes(
            lastRequest.status,
          )
            ? lastRequest.id
            : undefined,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: user.role === "STUDENT" ? "STUDENT_UPLOAD" : "TUTOR_UPLOAD",
        entityType: "StudentEnrollment",
        entityId: enrollmentId,
      },
    });
    return { source, run: true, duplicate: false };
  });
}

/** Uses the existing local extractor and deterministic academic engine; no AI calls. */
export async function processUpload(
  sourceId: string,
  attempt: number,
  bytes: Buffer,
) {
  const source = await prisma.academicAnalysisSource.findUniqueOrThrow({
    where: { id: sourceId },
    include: {
      enrollment: {
        include: { currentVersion: { include: { preferredSource: true } } },
      },
    },
  });
  if (source.status !== "PROCESSING" || source.attempts !== attempt) return;
  let savedKey: string | null = null;
  let committed = false;
  try {
    const settings = await getSystemSettings();
    const local = await parsePdf(bytes, { maxPages: settings.maxPdfPages });
    if (local.pageCount > settings.maxPdfPages)
      throw new PortalInputError("O PDF excede o limite de páginas permitido.");
    const fullText = local.textByPage.join("\n");
    const documentType = classifyAcademicDocument(local);
    const normalizedContentHash = contentFingerprint(fullText);

    await prisma.academicAnalysisSource.updateMany({
      where: { id: sourceId, attempts: attempt, status: "PROCESSING" },
      data: {
        normalizedContentHash,
        documentType,
        parserName:
          documentType === "CURRICULAR_EXTRACT"
            ? "CurricularExtractAdapter / pdfjs-table"
            : documentType === "UNKNOWN_ACADEMIC_DOCUMENT"
              ? null
              : "AcademicHistoryParser / coordinates-v1",
        stage: "Identificando alterações",
        storageKey: savedKey,
        deleteAfter: retentionDeadline(settings.retentionPolicy),
        deletedAt:
          settings.retentionPolicy === "DELETE_AFTER_PROCESSING"
            ? new Date()
            : null,
      },
    });
    const sameContent = normalizedContentHash
      ? await prisma.academicAnalysisSource.findFirst({
          where: {
            enrollmentId: source.enrollmentId,
            normalizedContentHash,
            documentType,
            requests: {
              none: { status: { in: ["REJECTED", "WAITING_NEW_DOCUMENT"] } },
            },
            status: "COMPLETED",
            versionId: { not: null },
            id: { not: sourceId },
          },
        })
      : null;
    if (sameContent && documentType !== "UNKNOWN_ACADEMIC_DOCUMENT") {
      await prisma.$transaction(async (tx) => {
        await lockEnrollment(tx, source.enrollmentId);
        const updated = await tx.academicAnalysisSource.updateMany({
          where: { id: sourceId, attempts: attempt, status: "PROCESSING" },
          data: {
            status: "COMPLETED",
            stage: "Concluído",
            versionId: sameContent.versionId,
            parsedSnapshot: sameContent.parsedSnapshot ?? undefined,
            validationResult: sameContent.validationResult,
            reused: true,
          },
        });
        if (!updated.count) throw new Error("STALE_JOB");
        await tx.academicRequest.updateMany({
          where: { sourceDocumentId: sourceId, attempt, status: "PROCESSING" },
          data: {
            status: "NO_CHANGES",
            result: "Nenhuma mudança acadêmica identificada.",
          },
        });
        await tx.auditLog.create({
          data: {
            userId: source.actorUserId,
            action: "ANALYSIS_REUSED",
            entityType: "StudentEnrollment",
            entityId: source.enrollmentId,
            metadata: { level: "CONTENT" },
          },
        });
      });
      committed = true;
      return;
    }
    if (settings.retentionPolicy !== "DELETE_AFTER_PROCESSING")
      savedKey = (
        await getStorage().save(bytes, {
          prefix: `academic/${source.enrollmentId}`,
          extension: "pdf",
        })
      ).key;
    await prisma.academicAnalysisSource.updateMany({
      where: { id: sourceId, attempts: attempt, status: "PROCESSING" },
      data: { storageKey: savedKey },
    });
    const snapshot = (
      await autoMapHistorySnapshot(
        extractAcademicDocument(
          local,
          source.filename,
          source.enrollment.currentVersion
            ? presentAcademicSnapshot(source.enrollment.currentVersion)
            : undefined,
        ),
        { allowAI: true },
      )
    ).snapshot;
    if (!snapshot.rgm || canonicalRgm(snapshot.rgm) !== source.enrollment.rgm)
      throw new PortalInputError(
        "O RGM do documento não corresponde à sua matrícula. Confira o documento enviado.",
      );
    if (
      source.enrollment.courseName &&
      canonicalCourse(snapshot.courseName) !==
        canonicalCourse(source.enrollment.courseName)
    )
      throw new PortalInputError(
        "O curso do documento não corresponde à matrícula. Peça à equipe acadêmica para conferir.",
      );
    const rules = await getActiveRuleSet().catch(() => null);
    snapshot.projectionRules = rules?.rules ?? DEFAULT_RULES;
    snapshot.projectionRulesVersion = rules?.version ?? "padrão";
    const result = await prisma.$transaction(async (tx) => {
      await lockEnrollment(tx, source.enrollmentId);
      const job = await tx.academicAnalysisSource.findUniqueOrThrow({
        where: { id: sourceId },
      });
      if (job.status !== "PROCESSING" || job.attempts !== attempt)
        throw new Error("STALE_JOB");
      const enrollment = await tx.studentEnrollment.findUniqueOrThrow({
        where: { id: source.enrollmentId },
        include: { currentVersion: { include: { preferredSource: true } } },
      });
      // Snapshot dedup is checked before a review is created.
      const sameSnapshot = Boolean(
        enrollment.currentVersion &&
        academicFingerprint(
          enrollment.currentVersion.snapshot as unknown as AcademicGridSnapshot,
        ) === academicFingerprint(snapshot),
      );
      let versionId = enrollment.currentVersionId;
      if (!sameSnapshot) {
        const review = await tx.academicGridReview.create({
          data: {
            enrollmentId: enrollment.id,
            createdById: source.actorUserId,
            studentName: snapshot.studentName,
            rgm: snapshot.rgm,
            courseName: snapshot.courseName,
            currentPeriod: snapshot.result.currentPeriod,
            currentPeriodConfirmed: snapshot.result.currentPeriodConfirmed,
            currentPeriodRaw: snapshot.result.currentPeriod?.toString(),
            sourceFilename: source.filename,
            sourceSha256: source.sourceFileHash,
            sourcePageCount: local.pageCount,
            status: snapshot.result.status,
            snapshot: snapshot as unknown as Prisma.InputJsonValue,
          },
        });
        const published = await publishVersion(tx, {
          enrollmentId: enrollment.id,
          reviewId: review.id,
          snapshot,
          actorUserId: source.actorUserId,
          actorRole: source.actorRole,
          origin: `${source.actorRole === "STUDENT" ? "STUDENT" : source.actorRole === "ADMIN" ? "ADMIN" : "TUTOR"}_UPLOAD`,
        });
        versionId = published.version.id;
      } else {
        await tx.auditLog.create({
          data: {
            userId: source.actorUserId,
            action: "ANALYSIS_REUSED",
            entityType: "StudentEnrollment",
            entityId: enrollment.id,
            metadata: { level: "SNAPSHOT" },
          },
        });
      }
      if (
        versionId &&
        (!sameSnapshot ||
          !enrollment.currentVersion?.preferredSource ||
          sourcePriority[documentType] >
            sourcePriority[
              enrollment.currentVersion.preferredSource.documentType
            ])
      ) {
        await tx.academicAnalysisVersion.update({
          where: { id: versionId },
          data: { preferredSourceId: sourceId },
        });
      }
      await tx.academicRequest.updateMany({
        where: { sourceDocumentId: sourceId, attempt, status: "PROCESSING" },
        data: {
          status: sameSnapshot
            ? "NO_CHANGES"
            : snapshot.result.status === "MANUAL_REVIEW_REQUIRED"
              ? "UNDER_REVIEW"
              : "COMPLETED",
          result: sameSnapshot
            ? "Nenhuma mudança acadêmica identificada."
            : snapshot.mappingRequired
              ? "Mapeamento curricular necessário. Dados do histórico disponíveis para conferência."
              : "Análise atualizada.",
          createdVersion: !sameSnapshot,
        },
      });
      if (!enrollment.courseName)
        await tx.studentEnrollment.update({
          where: { id: enrollment.id },
          data: { courseName: snapshot.courseName },
        });
      await tx.academicAnalysisSource.update({
        where: { id: sourceId },
        data: {
          status: "COMPLETED",
          parsedSnapshot: snapshot as unknown as Prisma.InputJsonValue,
          validationResult: snapshot.mappingRequired
            ? "MAPEAMENTO CURRICULAR NECESSÁRIO"
            : "Identidade e dados acadêmicos conferidos",
          stage: "Concluído",
          versionId,
          storageKey: savedKey,
          deleteAfter: retentionDeadline(settings.retentionPolicy),
          deletedAt:
            settings.retentionPolicy === "DELETE_AFTER_PROCESSING"
              ? new Date()
              : null,
          reused: sameSnapshot,
        },
      });
      return { reused: sameSnapshot };
    });
    committed = true;
    if (!result.reused)
      await notifyAcademicUpdate(source.enrollmentId, source.actorUserId);
  } catch (error) {
    // Keep the uploaded original available to the responsible tutor even after validation failure.
    if (savedKey && !committed) {
      const persisted = await prisma.academicAnalysisSource.findUnique({
        where: { id: sourceId },
        select: { storageKey: true },
      });
      if (persisted?.storageKey !== savedKey)
        await getStorage()
          .delete(savedKey)
          .catch(() => undefined);
    }
    const message =
      error instanceof PortalInputError
        ? error.message
        : "Não conseguimos processar o novo documento. Verifique se o PDF está íntegro, completo e contém texto selecionável. Sua última análise continua disponível.";
    await prisma.academicAnalysisSource.updateMany({
      where: { id: sourceId, status: "PROCESSING", attempts: attempt },
      data: { status: "FAILED", errorMessage: message },
    });
    await prisma.academicRequest.updateMany({
      where: { sourceDocumentId: sourceId, attempt, status: "PROCESSING" },
      data: { status: "FAILED", result: message },
    });
    logger.warn("portal.processing_failed", {
      sourceId,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    await recordAudit({
      userId: source.actorUserId,
      action: "ANALYSIS_FAILED",
      entityType: "StudentEnrollment",
      entityId: source.enrollmentId,
    }).catch(() => undefined);
  }
}
