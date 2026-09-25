import "server-only";
import type { SessionUser } from "@/lib/session";
import { ForbiddenError } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { enrollmentScope } from "@/services/student-portal/access";
import { lockEnrollment } from "@/services/student-portal/versions";
import { PortalInputError } from "@/services/student-portal/enrollments";
import type { AcademicGridSnapshot } from "@/domain/academic-analysis/types";
export async function reviewAcademicRequest(
  user: SessionUser,
  id: string,
  action: "CONCLUDE" | "REJECT" | "REVIEW",
  reason?: string,
) {
  if (!["ADMIN", "ANALYST"].includes(user.role)) throw new ForbiddenError();
  const request = await prisma.academicRequest.findFirst({
    where: { id, sourceDocument: { enrollment: enrollmentScope(user) } },
    include: { sourceDocument: true },
  });
  if (!request) throw new ForbiddenError();
  return prisma.$transaction(async (tx) => {
    await lockEnrollment(tx, request.sourceDocument.enrollmentId);
    if (
      await tx.academicAnalysisSource.count({
        where: {
          enrollmentId: request.sourceDocument.enrollmentId,
          status: "PROCESSING",
        },
      })
    )
      throw new PortalInputError(
        "Aguarde o processamento desta matrícula terminar.",
      );
    const fresh = await tx.academicRequest.findUniqueOrThrow({
      where: { id },
      include: {
        sourceDocument: {
          include: { enrollment: { include: { currentVersion: true } } },
        },
      },
    });
    if (
      fresh.status === "PROCESSING" ||
      fresh.sourceDocument.status === "PROCESSING"
    )
      throw new PortalInputError("Aguarde o processamento terminar.");
    if (["REJECTED", "WAITING_NEW_DOCUMENT"].includes(fresh.status))
      throw new PortalInputError(
        "Esta tentativa foi encerrada. É necessário enviar um novo PDF.",
      );
    const source = fresh.sourceDocument;
    const current = source.enrollment.currentVersion;
    if (
      action === "CONCLUDE" &&
      (source.status !== "COMPLETED" ||
        !current ||
        (current.snapshot as unknown as AcademicGridSnapshot).result.status ===
          "MANUAL_REVIEW_REQUIRED")
    )
      throw new PortalInputError(
        "Confira a extração e confirme o mapeamento curricular antes de concluir.",
      );
    if (
      action === "REJECT" &&
      fresh.createdVersion &&
      current?.id === source.versionId
    ) {
      await tx.studentEnrollment.update({
        where: { id: source.enrollmentId },
        data: { currentVersionId: current.previousVersionId },
      });
    }
    if (action === "REJECT") {
      const alternatives = await tx.academicAnalysisSource.findMany({
        where: {
          versionId: source.versionId ?? "00000000-0000-0000-0000-000000000000",
          id: { not: source.id },
          status: "COMPLETED",
          requests: {
            none: { status: { in: ["REJECTED", "WAITING_NEW_DOCUMENT"] } },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      });
      await tx.academicAnalysisVersion.updateMany({
        where: { preferredSourceId: source.id },
        data: { preferredSourceId: alternatives[0]?.id ?? null },
      });
    }
    const result =
      action === "REJECT"
        ? `Precisamos que você envie outro documento. ${reason?.trim() || "Envie um novo PDF válido."}`
        : action === "CONCLUDE"
          ? "Conferência concluída pela equipe acadêmica."
          : "A equipe acadêmica está conferindo os dados.";
    await tx.academicRequest.update({
      where: { id },
      data: {
        status:
          action === "REJECT"
            ? "WAITING_NEW_DOCUMENT"
            : action === "CONCLUDE"
              ? "COMPLETED"
              : "UNDER_REVIEW",
        result,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: `ACADEMIC_REQUEST_${action}`,
        entityType: "AcademicRequest",
        entityId: id,
        metadata: { actorRole: user.role, result },
      },
    });
  });
}
