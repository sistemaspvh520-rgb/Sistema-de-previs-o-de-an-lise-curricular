"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { recordAudit } from "@/services/audit-log/audit-log";
import { getStorage } from "@/services/storage/storage";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";
import { logger } from "@/lib/logger";
import type { Prisma } from "@/generated/prisma/client";

const CONFIRM_WORD = "LIMPAR";

const baseSchema = z.object({
  confirm: z.string(),
  /** null = tudo; N = somente registros com mais de N dias */
  olderThanDays: z.union([z.null(), z.coerce.number().int().min(1).max(3650)]),
});

function cutoff(days: number | null): Date | undefined {
  return days === null ? undefined : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** Remove registros de auditoria (tudo ou mais antigos que N dias). A própria limpeza fica registrada. */
export async function purgeAuditLogsAction(input: unknown): Promise<ActionResult<{ deleted: number }>> {
  try {
    const admin = await requirePermission("privacy:manage");
    const parsed = baseSchema.safeParse(input);
    if (!parsed.success || parsed.data.confirm !== CONFIRM_WORD) return fail(`Digite ${CONFIRM_WORD} para confirmar.`);
    const before = cutoff(parsed.data.olderThanDays);
    const { count } = await prisma.auditLog.deleteMany({ where: before ? { createdAt: { lt: before } } : {} });
    await recordAudit({ userId: admin.id, action: "maintenance.audit_purged", entityType: "AuditLog", metadata: { deleted: count, olderThanDays: parsed.data.olderThanDays } });
    revalidatePath("/settings/maintenance");
    revalidatePath("/settings/audit");
    return ok({ deleted: count }, `${count} registro(s) de auditoria removido(s).`);
  } catch (err) {
    logger.error("purgeAuditLogsAction", { err: String(err) });
    return toActionError(err);
  }
}

/** Remove o histórico de uso/custo da OpenAI. */
export async function purgeAiUsageAction(input: unknown): Promise<ActionResult<{ deleted: number }>> {
  try {
    const admin = await requirePermission("privacy:manage");
    const parsed = baseSchema.safeParse(input);
    if (!parsed.success || parsed.data.confirm !== CONFIRM_WORD) return fail(`Digite ${CONFIRM_WORD} para confirmar.`);
    const before = cutoff(parsed.data.olderThanDays);
    const { count } = await prisma.aIUsage.deleteMany({ where: before ? { createdAt: { lt: before } } : {} });
    await recordAudit({ userId: admin.id, action: "maintenance.ai_usage_purged", entityType: "AIUsage", metadata: { deleted: count, olderThanDays: parsed.data.olderThanDays } });
    revalidatePath("/settings/maintenance");
    revalidatePath("/settings/usage");
    return ok({ deleted: count }, `${count} registro(s) de uso de IA removido(s).`);
  } catch (err) {
    logger.error("purgeAiUsageAction", { err: String(err) });
    return toActionError(err);
  }
}

const analysesSchema = baseSchema.extend({
  onlyStatus: z.enum(["ALL", "COMPLETED", "FAILED"]).default("ALL"),
});

/** Exclui análises (e tudo ligado a elas: disciplinas, projeções, correções, alertas, IA, arquivo). */
export async function purgeAnalysesAction(input: unknown): Promise<ActionResult<{ deleted: number; filesDeleted: number }>> {
  try {
    const admin = await requirePermission("privacy:manage");
    const parsed = analysesSchema.safeParse(input);
    if (!parsed.success || parsed.data.confirm !== CONFIRM_WORD) return fail(`Digite ${CONFIRM_WORD} para confirmar.`);
    const before = cutoff(parsed.data.olderThanDays);
    const where: Prisma.CurricularAnalysisWhereInput = {};
    if (before) where.createdAt = { lt: before };
    if (parsed.data.onlyStatus === "COMPLETED") where.status = "COMPLETED";
    if (parsed.data.onlyStatus === "FAILED") where.status = { in: ["FAILED", "AI_ERROR"] };
    const targets = await prisma.curricularAnalysis.findMany({ where, select: { id: true, document: { select: { storageKey: true, deletedAt: true } } } });
    const { count } = await prisma.curricularAnalysis.deleteMany({ where: { id: { in: targets.map((t) => t.id) } } });
    const storage = getStorage();
    let filesDeleted = 0;
    for (const t of targets) {
      if (t.document && !t.document.deletedAt) {
        try {
          await storage.delete(t.document.storageKey);
          filesDeleted++;
        } catch (err) {
          logger.warn("maintenance.file_delete_failed", { key: t.document.storageKey, err: String(err) });
        }
      }
    }
    await recordAudit({ userId: admin.id, action: "maintenance.analyses_purged", entityType: "CurricularAnalysis", metadata: { deleted: count, filesDeleted, olderThanDays: parsed.data.olderThanDays, onlyStatus: parsed.data.onlyStatus } });
    revalidatePath("/settings/maintenance");
    revalidatePath("/analyses");
    revalidatePath("/dashboard");
    return ok({ deleted: count, filesDeleted }, `${count} análise(s) excluída(s) (${filesDeleted} arquivo(s) removido(s)).`);
  } catch (err) {
    logger.error("purgeAnalysesAction", { err: String(err) });
    return toActionError(err);
  }
}

/** Exclui uma única análise (permissão analysis:delete). */
export async function deleteAnalysisAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("analysis:delete");
    const parsed = z.object({ analysisId: z.string().uuid() }).safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    const a = await prisma.curricularAnalysis.findUnique({ where: { id: parsed.data.analysisId }, include: { document: { select: { storageKey: true, deletedAt: true, originalName: true } } } });
    if (!a) return fail("Análise não encontrada.");
    await prisma.curricularAnalysis.delete({ where: { id: a.id } });
    if (a.document && !a.document.deletedAt) {
      await getStorage().delete(a.document.storageKey).catch((err) => logger.warn("analysis.file_delete_failed", { err: String(err) }));
    }
    await recordAudit({ userId: user.id, action: "analysis.delete.tracked", entityType: "CurricularAnalysis", entityId: a.id, metadata: { courseName: a.courseName, originalName: a.document?.originalName ?? null } });
    revalidatePath("/analyses");
    revalidatePath("/dashboard");
    revalidatePath("/management");
    return ok(undefined, "Análise excluída definitivamente.");
  } catch (err) {
    logger.error("deleteAnalysisAction", { err: String(err) });
    return toActionError(err);
  }
}
