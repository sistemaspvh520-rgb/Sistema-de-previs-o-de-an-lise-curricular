"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAnalysisAccess } from "@/lib/analysis-access";
import { requirePermission, requireUser } from "@/lib/session";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";
import { recordAudit } from "@/services/audit-log/audit-log";
import { getStorage } from "@/services/storage/storage";
import { logger } from "@/lib/logger";

const requestSchema = z.object({
  analysisId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

const decisionSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().max(500).optional(),
});

function invalidate(analysisId?: string) {
  revalidatePath("/analyses");
  revalidatePath("/dashboard");
  revalidatePath("/management");
  revalidatePath("/settings/maintenance");
  if (analysisId) revalidatePath(`/analyses/${analysisId}`);
}

/** O autor pede a exclusão; a remoção definitiva continua exclusiva do administrador. */
export async function requestAnalysisDeletionAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (user.role === "ADMIN") return fail("Administradores podem excluir a análise diretamente.");
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success) return fail("Dados inválidos para a solicitação.");
    const analysis = await requireAnalysisAccess(parsed.data.analysisId, user);
    const existing = await prisma.analysisDeletionRequest.findFirst({
      where: { analysisId: analysis.id, requestedById: user.id, status: "PENDING" },
      select: { id: true },
    });
    if (existing) return fail("Já existe uma solicitação de exclusão aguardando decisão.");

    await prisma.analysisDeletionRequest.create({
      data: { analysisId: analysis.id, requestedById: user.id, reason: parsed.data.reason || null },
    });
    await recordAudit({ userId: user.id, action: "analysis.deletion_requested", entityType: "CurricularAnalysis", entityId: analysis.id, metadata: { reason: parsed.data.reason || null } });
    invalidate(analysis.id);
    return ok(undefined, "Solicitação enviada aos administradores.");
  } catch (err) {
    logger.error("requestAnalysisDeletionAction", { err: String(err) });
    return toActionError(err);
  }
}

/** Admin aprova e exclui ou rejeita, mantendo um registro auditável da decisão. */
export async function decideAnalysisDeletionRequestAction(input: unknown): Promise<ActionResult> {
  try {
    const admin = await requirePermission("analysis:delete");
    const parsed = decisionSchema.safeParse(input);
    if (!parsed.success) return fail("Dados inválidos para a decisão.");
    const request = await prisma.analysisDeletionRequest.findUnique({
      where: { id: parsed.data.requestId },
      include: { analysis: { include: { document: { select: { storageKey: true, deletedAt: true, originalName: true } } } }, requestedBy: { select: { name: true } } },
    });
    if (!request) return fail("Solicitação não encontrada.");
    if (request.status !== "PENDING") return fail("Esta solicitação já foi decidida.");

    if (parsed.data.decision === "REJECT") {
      await prisma.analysisDeletionRequest.update({
        where: { id: request.id },
        data: { status: "REJECTED", reviewedById: admin.id, reviewedAt: new Date(), decisionNote: parsed.data.note || null },
      });
      await recordAudit({ userId: admin.id, action: "analysis.deletion_rejected", entityType: "CurricularAnalysis", entityId: request.analysisId, metadata: { requestId: request.id, requestedBy: request.requestedBy.name, note: parsed.data.note || null } });
      invalidate(request.analysisId);
      return ok(undefined, "Solicitação recusada. A análise foi mantida.");
    }

    const document = request.analysis.document;
    await prisma.$transaction(async (tx) => {
      await tx.analysisDeletionRequest.update({
        where: { id: request.id },
        data: { status: "APPROVED", reviewedById: admin.id, reviewedAt: new Date(), decisionNote: parsed.data.note || null },
      });
      await tx.curricularAnalysis.delete({ where: { id: request.analysisId } });
    });
    if (document && !document.deletedAt) {
      await getStorage().delete(document.storageKey).catch((err) => logger.warn("analysis.requested_file_delete_failed", { key: document.storageKey, err: String(err) }));
    }
    await recordAudit({ userId: admin.id, action: "analysis.deletion_approved.tracked", entityType: "CurricularAnalysis", entityId: request.analysisId, metadata: { requestId: request.id, requestedBy: request.requestedBy.name, courseName: request.analysis.courseName, originalName: document?.originalName ?? null, note: parsed.data.note || null } });
    invalidate();
    return ok(undefined, "Solicitação aprovada e análise excluída definitivamente.");
  } catch (err) {
    logger.error("decideAnalysisDeletionRequestAction", { err: String(err) });
    return toActionError(err);
  }
}
