"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { requireAnalysisAccess } from "@/lib/analysis-access";
import { recordAudit } from "@/services/audit-log/audit-log";
import { runAnalysisPipeline, recalculateAnalysis } from "@/services/pipeline/runner";
import { parseSteps } from "@/services/pipeline/steps";
import { isValidTerm } from "@/domain/curricular-analysis/simulation/terms";
import { classifySubject } from "@/domain/curricular-analysis/engine/classify";
import { rateLimit } from "@/services/rate-limit/rate-limit";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";
import { logger } from "@/lib/logger";
import type { Prisma } from "@/generated/prisma/client";

const idSchema = z.string().uuid();

const PROCESSING: string[] = ["UPLOADED", "PARSING", "AI_EXTRACTION", "NORMALIZING", "CALCULATING", "VALIDATING", "AI_AUDIT"];

/** TENTAR NOVAMENTE — retoma o pipeline da etapa que falhou. */
export async function retryAnalysisAction(analysisId: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("analysis:create");
    const id = idSchema.parse(analysisId);
    const a = await requireAnalysisAccess(id, user);
    if (PROCESSING.includes(a.status)) return fail("A análise já está em processamento.");
    await prisma.curricularAnalysis.update({ where: { id }, data: { status: "PARSING", errorCode: null, errorMessage: null } });
    await recordAudit({ userId: user.id, action: "analysis.retry", entityType: "CurricularAnalysis", entityId: id, metadata: { previousStatus: a.status, errorCode: a.errorCode } });
    after(() => runAnalysisPipeline(id).catch((e) => logger.error("pipeline.unhandled", { analysisId: id, err: String(e) })));
    revalidatePath(`/analyses/${id}`);
    return ok(undefined, "Reprocessamento iniciado.");
  } catch (err) {
    return toActionError(err);
  }
}

/** REAUDITAR COM OPENAI — reexecuta somente a auditoria e a validação final. */
export async function reauditAnalysisAction(analysisId: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("analysis:review");
    const id = idSchema.parse(analysisId);
    const limit = rateLimit(`reaudit:${user.id}`, { capacity: 5, refillPerMinute: 5 });
    if (!limit.allowed) return fail(`Aguarde ${limit.retryAfterSeconds}s para reauditar novamente.`);
    const a = await requireAnalysisAccess(id, user);
    if (PROCESSING.includes(a.status)) return fail("A análise já está em processamento.");
    const steps = parseSteps(a.processingSteps);
    for (const s of steps) if (["AUDITING", "VALIDATING", "FINALIZING"].includes(s.key)) s.status = "pending";
    await prisma.curricularAnalysis.update({ where: { id }, data: { status: "AI_AUDIT", processingSteps: steps as unknown as Prisma.InputJsonValue } });
    await recordAudit({ userId: user.id, action: "analysis.reaudit", entityType: "CurricularAnalysis", entityId: id });
    after(() => runAnalysisPipeline(id).catch((e) => logger.error("pipeline.unhandled", { analysisId: id, err: String(e) })));
    revalidatePath(`/analyses/${id}`);
    return ok(undefined, "Nova auditoria iniciada.");
  } catch (err) {
    return toActionError(err);
  }
}

const entrySchema = z.object({ analysisId: idSchema, entryPeriod: z.coerce.number().int().min(1).max(20), reason: z.string().max(500).optional() });

/** Confirmação manual do período de ingresso (§16) → recálculo completo. */
export async function confirmEntryPeriodAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("analysis:review");
    const parsed = entrySchema.safeParse(input);
    if (!parsed.success) return fail("Período inválido.");
    const { analysisId, entryPeriod, reason } = parsed.data;
    const a = await requireAnalysisAccess(analysisId, user);
    if (PROCESSING.includes(a.status)) return fail("Aguarde o processamento terminar.");
    await prisma.$transaction([
      prisma.curricularAnalysis.update({ where: { id: analysisId }, data: { entryPeriod, entryPeriodSource: "USER" } }),
      prisma.manualCorrection.create({
        data: { analysisId, userId: user.id, field: "entryPeriod", previousValue: a.entryPeriod?.toString() ?? null, newValue: String(entryPeriod), reason: reason || null },
      }),
    ]);
    await recalculateAnalysis(analysisId);
    await recordAudit({ userId: user.id, action: "analysis.entry_period_confirmed", entityType: "CurricularAnalysis", entityId: analysisId, metadata: { entryPeriod } });
    revalidatePath(`/analyses/${analysisId}`);
    return ok(undefined, "Período de ingresso confirmado. Previsão recalculada.");
  } catch (err) {
    logger.error("confirmEntryPeriodAction", { err: String(err) });
    return toActionError(err);
  }
}

const termSchema = z.object({ analysisId: idSchema, startTerm: z.string().refine(isValidTerm, "Use o formato AAAA.1 ou AAAA.2.") });

export async function updateStartTermAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("analysis:review");
    const parsed = termSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Termo inválido.");
    const a = await requireAnalysisAccess(parsed.data.analysisId, user);
    if (PROCESSING.includes(a.status)) return fail("Aguarde o processamento terminar.");
    await prisma.$transaction([
      prisma.curricularAnalysis.update({ where: { id: a.id }, data: { startTerm: parsed.data.startTerm, entryTerm: parsed.data.startTerm } }),
      prisma.manualCorrection.create({ data: { analysisId: a.id, userId: user.id, field: "entryTerm", previousValue: a.entryTerm, newValue: parsed.data.startTerm } }),
    ]);
    await recalculateAnalysis(a.id);
    revalidatePath(`/analyses/${a.id}`);
    return ok(undefined, "Semestre de ingresso atualizado. Previsão recalculada.");
  } catch (err) {
    return toActionError(err);
  }
}

const subjectSchema = z.object({
  analysisId: idSchema,
  subjectId: idSchema,
  name: z.string().trim().min(1).max(200),
  workload: z.coerce.number().int().min(0).max(2000),
  period: z.coerce.number().int().min(1).max(20),
  usedSubject: z.string().trim().max(200).nullable(),
  status: z.enum(["EXEMPTED", "PENDING", "REVIEW"]),
  reason: z.string().trim().max(500).optional(),
});

/** Correção humana (§42) → histórico imutável (§43) → recálculo. */
export async function updateSubjectAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("analysis:review");
    const parsed = subjectSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    const d = parsed.data;
    const a = await requireAnalysisAccess(d.analysisId, user);
    if (PROCESSING.includes(a.status)) return fail("Aguarde o processamento terminar.");
    const before = await prisma.analyzedSubject.findFirstOrThrow({ where: { id: d.subjectId, analysisId: d.analysisId } });

    const name = d.name.toUpperCase();
    const usedSubject = d.usedSubject && d.usedSubject.length ? d.usedSubject.toUpperCase() : null;
    const changes: Array<{ field: string; previousValue: string | null; newValue: string | null }> = [];
    const push = (field: string, prev: unknown, next: unknown) => {
      const p = prev === null || prev === undefined ? null : String(prev);
      const n = next === null || next === undefined ? null : String(next);
      if (p !== n) changes.push({ field, previousValue: p, newValue: n });
    };
    push("name", before.name, name);
    push("workload", before.workload, d.workload);
    push("period", before.period, d.period);
    push("usedSubject", before.usedSubject, usedSubject);
    push("status", before.status, d.status);
    if (changes.length === 0) return fail("Nenhuma alteração detectada.");

    await prisma.$transaction(async (tx) => {
      await tx.analyzedSubject.update({
        where: { id: d.subjectId },
        data: {
          name,
          workload: d.workload,
          period: d.period,
          usedSubject,
          status: d.status,
          origin: "USER",
          // decisão humana torna a linha legível/definida
          readability: d.status === "REVIEW" ? before.readability : "CLEAR",
        },
      });
      await tx.manualCorrection.createMany({
        data: changes.map((c) => ({ analysisId: d.analysisId, subjectId: d.subjectId, userId: user.id, field: c.field, previousValue: c.previousValue, newValue: c.newValue, reason: d.reason || null })),
      });
      // alertas ligados à linha (leitura duvidosa) são considerados resolvidos pela decisão humana
      if (d.status !== "REVIEW") {
        await tx.analysisWarning.updateMany({
          where: { analysisId: d.analysisId, subjectId: d.subjectId, resolvedAt: null, code: { in: ["UNCLEAR_ROW", "UNREADABLE_ROW"] } },
          data: { resolvedAt: new Date(), resolvedById: user.id },
        });
      }
    });
    await recalculateAnalysis(d.analysisId);
    await recordAudit({ userId: user.id, action: "analysis.subject_corrected", entityType: "AnalyzedSubject", entityId: d.subjectId, metadata: { analysisId: d.analysisId, changes } });
    revalidatePath(`/analyses/${d.analysisId}`);
    return ok(undefined, "Disciplina atualizada. Motor recalculado.");
  } catch (err) {
    logger.error("updateSubjectAction", { err: String(err) });
    return toActionError(err);
  }
}

/** Sugestão automática de status com base na Disciplina Utilizada (para a UI de edição). */
export async function suggestStatusAction(usedSubject: string | null): Promise<"EXEMPTED" | "PENDING"> {
  return classifySubject({ usedSubject }) === "EXEMPTED" ? "EXEMPTED" : "PENDING";
}

const warningSchema = z.object({ analysisId: idSchema, warningId: idSchema });

export async function resolveWarningAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("analysis:review");
    const parsed = warningSchema.safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    await requireAnalysisAccess(parsed.data.analysisId, user);
    await prisma.analysisWarning.update({ where: { id: parsed.data.warningId, analysisId: parsed.data.analysisId }, data: { resolvedAt: new Date(), resolvedById: user.id } });
    await recordAudit({ userId: user.id, action: "analysis.warning_resolved", entityType: "AnalysisWarning", entityId: parsed.data.warningId, metadata: { analysisId: parsed.data.analysisId } });
    // reavalia status/contagem
    await recalculateAnalysis(parsed.data.analysisId);
    revalidatePath(`/analyses/${parsed.data.analysisId}`);
    return ok(undefined, "Item marcado como resolvido.");
  } catch (err) {
    return toActionError(err);
  }
}

/** CONCLUIR — decisão humana de encerrar a análise mesmo com itens de revisão restantes. */
export async function completeAnalysisAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("analysis:complete");
    const parsed = z.object({ analysisId: idSchema, note: z.string().max(500).optional() }).safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    const a = await requireAnalysisAccess(parsed.data.analysisId, user);
    if (a.status !== "WAITING_REVIEW") return fail("Somente análises aguardando revisão podem ser concluídas manualmente.");
    if (a.entryPeriod === null) return fail("Confirme o período de ingresso antes de concluir.");
    await prisma.$transaction([
      prisma.curricularAnalysis.update({ where: { id: a.id }, data: { status: "COMPLETED", completedAt: new Date() } }),
      prisma.manualCorrection.create({ data: { analysisId: a.id, userId: user.id, field: "status", previousValue: "WAITING_REVIEW", newValue: "COMPLETED", reason: parsed.data.note || "Concluída após revisão humana." } }),
    ]);
    await recordAudit({ userId: user.id, action: "analysis.completed", entityType: "CurricularAnalysis", entityId: a.id });
    revalidatePath(`/analyses/${a.id}`);
    return ok(undefined, "Análise concluída.");
  } catch (err) {
    return toActionError(err);
  }
}

/** Reabre para revisão. */
export async function reopenAnalysisAction(analysisId: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("analysis:review");
    const id = idSchema.parse(analysisId);
    const a = await requireAnalysisAccess(id, user);
    if (a.status !== "COMPLETED") return fail("Somente análises concluídas podem ser reabertas.");
    await prisma.$transaction([
      prisma.curricularAnalysis.update({ where: { id }, data: { status: "WAITING_REVIEW", completedAt: null } }),
      prisma.manualCorrection.create({ data: { analysisId: id, userId: user.id, field: "status", previousValue: "COMPLETED", newValue: "WAITING_REVIEW" } }),
    ]);
    await recordAudit({ userId: user.id, action: "analysis.reopened", entityType: "CurricularAnalysis", entityId: id });
    revalidatePath(`/analyses/${id}`);
    return ok(undefined, "Análise reaberta para revisão.");
  } catch (err) {
    return toActionError(err);
  }
}
