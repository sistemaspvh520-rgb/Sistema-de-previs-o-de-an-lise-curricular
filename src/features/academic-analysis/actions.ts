"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { academicGridCompletionBlockers, analyzeAcademicGrid, normalizeAcademicStatus, parseAcademicPeriod } from "@/domain/academic-analysis/analyze";
import type { AcademicDiscipline, AcademicGridSnapshot } from "@/domain/academic-analysis/types";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { recordAudit } from "@/services/audit-log/audit-log";
import { logger } from "@/lib/logger";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";
import { lockEnrollment, publishVersion } from "@/services/student-portal/versions";
import { notifyAcademicUpdate } from "@/services/student-portal/notifications";
import { Prisma } from "@/generated/prisma/client";
import { autoMapHistorySnapshot, type HistoryMappingMethod } from "@/services/academic-analysis/history-mapping";

const idSchema = z.string().uuid();
const changeSchema = z.object({
  reviewId: idSchema,
  disciplineIndex: z.number().int().nonnegative().optional(),
  field: z.enum(["currentPeriod", "studentName", "rgm", "courseName", "code", "name", "rawPeriod", "period", "originalStatus", "workload", "inMainCurriculum"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  reason: z.string().trim().max(300).optional(),
});

async function authorizedReview(reviewId: string, userId: string, isAdmin: boolean) {
  const review = await prisma.academicGridReview.findUnique({ where: { id: reviewId }, include: { enrollment: true } });
  if (!review || (!isAdmin && review.createdById !== userId && review.enrollment?.ownerId !== userId)) throw new Error("Análise acadêmica não encontrada.");
  return review;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function persistCorrection(input: {
  reviewId: string;
  userId: string;
  disciplineIndex: number | null;
  field: string;
  previousValue: unknown;
  newValue: unknown;
  reason?: string;
  snapshot: AcademicGridSnapshot;
  currentPeriod: number | null;
  expectedUpdatedAt: Date;
}) {
  const result = analyzeAcademicGrid({ disciplines: input.snapshot.disciplines, currentPeriod: input.currentPeriod, currentPeriodConfirmed: input.currentPeriod !== null });
  input.snapshot.result = result;
  if (input.snapshot.documentType && input.snapshot.documentType !== "CURRICULAR_EXTRACT") {
    input.snapshot.mappingRequired = input.snapshot.disciplines.some(row => row.inMainCurriculum && row.period === null) || input.currentPeriod === null;
    if (!input.snapshot.mappingRequired) input.snapshot.extractionWarnings = input.snapshot.extractionWarnings.filter(w => !w.startsWith("MAPEAMENTO CURRICULAR NECESSÁRIO"));
  }
  if (input.disciplineIndex !== null && input.field === "period") input.snapshot.disciplines[input.disciplineIndex].curricularPeriodProvenance = { source: "TUTOR_CONFIRMED", confirmed: input.snapshot.disciplines[input.disciplineIndex].period !== null };
  input.snapshot.manuallyEdited = true;
  const linked = await prisma.academicGridReview.findUniqueOrThrow({ where: { id: input.reviewId }, select: { enrollmentId: true } });
  let published = false;
  await prisma.$transaction(async (tx) => {
    if (linked.enrollmentId) {
      await lockEnrollment(tx, linked.enrollmentId);
      const enrollment = await tx.studentEnrollment.findUniqueOrThrow({ where: { id: linked.enrollmentId }, include: { currentVersion: true } });
      if (enrollment.currentVersion?.reviewId !== input.reviewId) throw new Error("Esta análise foi atualizada por outra alteração. Abra a análise atual para corrigir.");
      if (await tx.academicAnalysisSource.count({ where: { enrollmentId: linked.enrollmentId, status: "PROCESSING" } })) throw new Error("Esta análise foi atualizada por outra alteração. Aguarde o extrato em processamento.");
    }
    const updated = await tx.academicGridReview.updateMany({
      where: { id: input.reviewId, updatedAt: input.expectedUpdatedAt },
      data: {
        snapshot: jsonValue(input.snapshot),
        currentPeriod: input.currentPeriod,
        currentPeriodRaw: input.currentPeriod?.toString() ?? null,
        currentPeriodConfirmed: input.currentPeriod !== null,
        completedAt: null,
        studentName: input.snapshot.studentName,
        rgm: input.snapshot.rgm,
        courseName: input.snapshot.courseName,
        status: result.status,
      },
    });
    if (updated.count !== 1) throw new Error("Esta análise foi atualizada por outra alteração. Recarregue a página antes de salvar novamente.");
    await tx.academicGridCorrection.create({
      data: {
        reviewId: input.reviewId,
        userId: input.userId,
        disciplineIndex: input.disciplineIndex,
        field: input.field,
        previousValue: input.previousValue === null || input.previousValue === undefined ? Prisma.JsonNull : jsonValue(input.previousValue),
        newValue: input.newValue === null || input.newValue === undefined ? Prisma.JsonNull : jsonValue(input.newValue),
        reason: input.reason || null,
      },
    });
    if (linked.enrollmentId && result.status !== "MANUAL_REVIEW_REQUIRED") {
      const actor = await tx.user.findUniqueOrThrow({ where: { id: input.userId }, select: { role: true } });
      const publication = await publishVersion(tx, { enrollmentId: linked.enrollmentId, reviewId: input.reviewId, snapshot: input.snapshot, actorUserId: input.userId, actorRole: actor.role, origin: "TUTOR_MANUAL_CORRECTION" });
      published = !publication.reused;
    }
  });
  if (linked.enrollmentId && published) await notifyAcademicUpdate(linked.enrollmentId, input.userId);
  revalidatePath("/portal");
  revalidatePath("/academic-analysis/students");
  try {
    await recordAudit({ userId: input.userId, action: "academic_grid.corrected", entityType: "AcademicGridReview", entityId: input.reviewId, metadata: { field: input.field, disciplineIndex: input.disciplineIndex, reason: input.reason ?? null } });
  } catch (error) {
    // A correção e seu histórico específico já foram gravados na transação acima.
    // Uma falha no log geral não deve fazer a interface apresentar uma gravação concluída como falha.
    logger.warn("academic_analysis.correction_audit_log.failed", { reviewId: input.reviewId, errorName: error instanceof Error ? error.name : "unknown" });
  }
  revalidatePath("/academic-analysis");
  revalidatePath(`/academic-analysis/${input.reviewId}`);
}

export async function updateAcademicGridFieldAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("academic:manage");
    const parsed = changeSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    const data = parsed.data;
    const review = await authorizedReview(data.reviewId, user.id, user.role === "ADMIN");
    if (review.enrollmentId && ["rgm", "courseName", "studentName"].includes(data.field)) return fail("A identidade está vinculada à matrícula e não pode ser alterada nesta análise.");
    const snapshot = review.snapshot as unknown as AcademicGridSnapshot;
    let previousValue: unknown;
    let newValue: unknown = data.value;
    let currentPeriod = review.currentPeriod;
    if (data.field === "currentPeriod") {
      const value = data.value === null || data.value === "" ? null : Number(data.value);
      if (value !== null && (!Number.isInteger(value) || value < 1 || value > 20)) return fail("Informe um período entre 1 e 20.");
      previousValue = currentPeriod;
      currentPeriod = value;
      newValue = value;
    } else if (["studentName", "rgm", "courseName"].includes(data.field)) {
      const key = data.field as "studentName" | "rgm" | "courseName";
      previousValue = snapshot[key];
      snapshot[key] = data.value === null ? null : String(data.value).trim() || null;
      newValue = snapshot[key];
    } else {
      if (data.disciplineIndex === undefined || !snapshot.disciplines[data.disciplineIndex]) return fail("Disciplina não encontrada.");
      const discipline = snapshot.disciplines[data.disciplineIndex];
      const field = data.field as keyof AcademicDiscipline;
      previousValue = discipline[field];
      if (data.field === "period") {
        const period = data.value === null || data.value === "" ? null : Number(data.value);
        if (period !== null && (!Number.isInteger(period) || period < 1 || period > 20)) return fail("Informe um período entre 1 e 20.");
        discipline.period = period;
        discipline.rawPeriod = period === null ? "" : String(period);
      } else if (data.field === "workload") {
        const workload = data.value === null || data.value === "" ? null : Number(data.value);
        if (workload !== null && (!Number.isInteger(workload) || workload < 0 || workload > 2000)) return fail("Carga horária inválida.");
        discipline.workload = workload;
      } else if (data.field === "originalStatus") {
        discipline.grade = null;
        discipline.originalStatus = String(data.value ?? "");
        discipline.normalizedStatus = normalizeAcademicStatus(discipline.originalStatus);
      } else if (data.field === "rawPeriod") {
        if (/\b\d{4}\s*\/\s*\d/.test(String(data.value ?? ""))) return fail("Informe o período curricular (1 a 20), não o semestre letivo como 2026/2.");
        discipline.rawPeriod = String(data.value ?? "");
        discipline.period = parseAcademicPeriod(discipline.rawPeriod);
      } else if (data.field === "inMainCurriculum") {
        discipline.inMainCurriculum = data.value === true || data.value === "true";
      } else if (data.field === "code") discipline.code = data.value === null ? null : String(data.value);
      else if (data.field === "name") discipline.name = String(data.value ?? "").trim();
      discipline.manualEdited = true;
      newValue = discipline[field];
    }
    await persistCorrection({ reviewId: review.id, userId: user.id, disciplineIndex: data.disciplineIndex ?? null, field: data.field, previousValue, newValue, reason: data.reason, snapshot, currentPeriod, expectedUpdatedAt: review.updatedAt });
    return ok(undefined, "Dado atualizado e cálculos recalculados.");
  } catch (error) {
    logger.warn("academic_analysis.field_update.failed", { errorName: error instanceof Error ? error.name : "unknown", errorCode: error && typeof error === "object" && "code" in error ? String(error.code) : undefined });
    if (error instanceof Error && error.message.startsWith("Esta análise foi atualizada por outra alteração")) return fail(error.message);
    return toActionError(error, "Não foi possível salvar esta alteração. Confira sua conexão e tente novamente.");
  }
}

/** Identifica automaticamente os períodos curriculares de um histórico já salvo (estrutura do documento + IA). */
export async function autoMapAcademicGridAction(reviewIdInput: unknown): Promise<ActionResult<{ mappedRows: number; method: HistoryMappingMethod; snapshot: AcademicGridSnapshot; currentPeriod: number | null }>> {
  try {
    const user = await requirePermission("academic:manage");
    const reviewId = idSchema.parse(reviewIdInput);
    const review = await authorizedReview(reviewId, user.id, user.role === "ADMIN");
    const snapshot = review.snapshot as unknown as AcademicGridSnapshot;
    snapshot.result = { ...snapshot.result, currentPeriod: review.currentPeriod, currentPeriodConfirmed: review.currentPeriodConfirmed };
    const mapped = await autoMapHistorySnapshot(snapshot, { allowAI: true });
    if (mapped.method === "NONE") return fail("Não foi possível identificar os períodos com segurança. Confira as disciplinas manualmente.");
    await persistCorrection({ reviewId, userId: user.id, disciplineIndex: null, field: "autoMapping", previousValue: null, newValue: { method: mapped.method, mappedRows: mapped.mappedRows }, snapshot: mapped.snapshot, currentPeriod: mapped.snapshot.result.currentPeriod, expectedUpdatedAt: review.updatedAt, reason: mapped.method === "AI" ? "Períodos identificados com apoio de IA" : "Períodos identificados pela estrutura do histórico" });
    return ok({ mappedRows: mapped.mappedRows, method: mapped.method, snapshot: mapped.snapshot, currentPeriod: mapped.snapshot.result.currentPeriod }, `${mapped.mappedRows} disciplina(s) mapeadas automaticamente. Previsão recalculada.`);
  } catch (error) {
    logger.warn("academic_analysis.auto_mapping.failed", { errorName: error instanceof Error ? error.name : "unknown" });
    if (error instanceof Error && error.message.startsWith("Esta análise foi atualizada por outra alteração")) return fail(error.message);
    return toActionError<{ mappedRows: number; method: HistoryMappingMethod; snapshot: AcademicGridSnapshot; currentPeriod: number | null }>(error, "Não foi possível mapear automaticamente. Tente novamente.");
  }
}

export async function addAcademicDisciplineAction(reviewIdInput: unknown): Promise<ActionResult<{ disciplineIndex: number; discipline: AcademicDiscipline }>> {
  try {
    const user = await requirePermission("academic:manage");
    const reviewId = idSchema.parse(reviewIdInput);
    const review = await authorizedReview(reviewId, user.id, user.role === "ADMIN");
    const snapshot = review.snapshot as unknown as AcademicGridSnapshot;
    const discipline: AcademicDiscipline = { code: null, name: "", rawPeriod: "", period: null, originalStatus: "A CURSAR", normalizedStatus: "A CURSAR", workload: null, inMainCurriculum: true, sourcePage: 0, sourceRow: snapshot.disciplines.length + 1, manualEdited: true };
    const index = snapshot.disciplines.push(discipline) - 1;
    await persistCorrection({ reviewId, userId: user.id, disciplineIndex: index, field: "discipline", previousValue: null, newValue: discipline, snapshot, currentPeriod: review.currentPeriod, expectedUpdatedAt: review.updatedAt, reason: "Disciplina adicionada manualmente" });
    return ok({ disciplineIndex: index, discipline }, "Disciplina adicionada. Preencha os dados da linha.");
  } catch (error) {
    logger.warn("academic_analysis.discipline_add.failed", { errorName: error instanceof Error ? error.name : "unknown", errorCode: error && typeof error === "object" && "code" in error ? String(error.code) : undefined });
    if (error instanceof Error && error.message.startsWith("Esta análise foi atualizada por outra alteração")) return fail(error.message);
    return toActionError<{ disciplineIndex: number; discipline: AcademicDiscipline }>(error, "Não foi possível adicionar a disciplina. Confira sua conexão e tente novamente.");
  }
}

export async function completeAcademicGridReviewAction(reviewIdInput: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("academic:manage");
    const reviewId = idSchema.parse(reviewIdInput);
    const review = await authorizedReview(reviewId, user.id, user.role === "ADMIN");
    if (review.completedAt) return ok(undefined, "Esta análise já foi concluída.");

    const snapshot = review.snapshot as unknown as AcademicGridSnapshot;
    const blockers = academicGridCompletionBlockers({
      disciplines: snapshot.disciplines,
      currentPeriod: review.currentPeriod,
      currentPeriodConfirmed: review.currentPeriodConfirmed,
      sourceDisciplineCount: snapshot.sourceDisciplineCount,
      sourceParsedDisciplineCount: snapshot.sourceParsedDisciplineCount,
    });
    if (blockers.length) return fail(blockers[0]);
    const result = analyzeAcademicGrid({ disciplines: snapshot.disciplines, currentPeriod: review.currentPeriod, currentPeriodConfirmed: true });
    if (result.status === "MANUAL_REVIEW_REQUIRED") return fail(result.warnings[0] ?? "Resolva as pendências de conferência antes de concluir.");

    const completedAt = new Date();
    const updated = await prisma.academicGridReview.updateMany({
      where: { id: reviewId, updatedAt: review.updatedAt, completedAt: null },
      data: { completedAt },
    });
    if (updated.count !== 1) return fail("Esta análise foi atualizada em outra sessão. Recarregue a página e tente novamente.");

    try {
      await recordAudit({
        userId: user.id,
        action: "academic_grid.completed",
        entityType: "AcademicGridReview",
        entityId: reviewId,
        metadata: { disciplineCount: snapshot.disciplines.length, currentPeriod: review.currentPeriod },
      });
    } catch (error) {
      // A conclusão já foi gravada; uma falha no log geral não pode impedir o retorno de sucesso.
      logger.warn("academic_analysis.completion_audit_log.failed", { reviewId, errorName: error instanceof Error ? error.name : "unknown" });
    }
    revalidatePath("/academic-analysis");
    revalidatePath(`/academic-analysis/${reviewId}`);
    return ok(undefined, "Análise concluída e registrada.");
  } catch (error) {
    logger.warn("academic_analysis.completion.failed", { errorName: error instanceof Error ? error.name : "unknown", errorCode: error && typeof error === "object" && "code" in error ? String(error.code) : undefined });
    if (error instanceof Error && error.message.startsWith("Esta análise foi atualizada em outra sessão")) return fail(error.message);
    return toActionError(error, "Não foi possível concluir a análise. Confira sua conexão e tente novamente.");
  }
}

/** Exclui uma análise acadêmica definitivamente; autorização validada no servidor. */
export async function deleteAcademicGridReviewAction(input: unknown): Promise<ActionResult> {
  try {
    const admin = await requirePermission("analysis:delete");
    const parsed = z.object({ reviewId: idSchema }).safeParse(input);
    if (!parsed.success) return fail("Análise inválida.");

    const review = await prisma.academicGridReview.findUnique({
      where: { id: parsed.data.reviewId },
      select: { id: true, enrollmentId: true, studentName: true, rgm: true, courseName: true, sourceFilename: true },
    });
    if (!review) return fail("Análise acadêmica não encontrada.");
    if (review.enrollmentId) return fail("Esta análise compõe o histórico do aluno e não pode ser excluída por esta ação.");

    await prisma.$transaction(async (tx) => {
      await tx.academicGridReview.delete({ where: { id: review.id } });
      await tx.auditLog.create({
        data: {
          userId: admin.id,
          action: "academic_grid.delete",
          entityType: "AcademicGridReview",
          entityId: review.id,
          metadata: {
            studentName: review.studentName,
            rgm: review.rgm,
            courseName: review.courseName,
            sourceFilename: review.sourceFilename,
          },
        },
      });
    });

    revalidatePath("/academic-analysis");
    revalidatePath(`/academic-analysis/${review.id}`);
    return ok(undefined, "Análise acadêmica excluída definitivamente.");
  } catch (error) { return toActionError(error); }
}
