"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { academicDisciplineNeedsReview, academicGridHasUnresolvedRowCount, analyzeAcademicGrid, normalizeAcademicStatus, parseAcademicPeriod } from "@/domain/academic-analysis/analyze";
import type { AcademicDiscipline, AcademicGridSnapshot } from "@/domain/academic-analysis/types";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { recordAudit } from "@/services/audit-log/audit-log";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";
import { Prisma } from "@/generated/prisma/client";

const idSchema = z.string().uuid();
const changeSchema = z.object({
  reviewId: idSchema,
  disciplineIndex: z.number().int().nonnegative().optional(),
  field: z.enum(["currentPeriod", "studentName", "rgm", "courseName", "code", "name", "rawPeriod", "period", "originalStatus", "workload", "inMainCurriculum"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  reason: z.string().trim().max(300).optional(),
});

async function authorizedReview(reviewId: string, userId: string, isAdmin: boolean) {
  const review = await prisma.academicGridReview.findUnique({ where: { id: reviewId } });
  if (!review || (!isAdmin && review.createdById !== userId)) throw new Error("Análise acadêmica não encontrada.");
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
  input.snapshot.manuallyEdited = true;
  if (input.disciplineIndex !== null || input.field === "currentPeriod" || input.field === "discipline") {
    input.snapshot.proceedConfirmed = false;
  }
  await prisma.$transaction(async (tx) => {
    const updated = await tx.academicGridReview.updateMany({
      where: { id: input.reviewId, updatedAt: input.expectedUpdatedAt },
      data: {
        snapshot: jsonValue(input.snapshot),
        currentPeriod: input.currentPeriod,
        currentPeriodRaw: input.currentPeriod?.toString() ?? null,
        currentPeriodConfirmed: input.currentPeriod !== null,
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
  });
  await recordAudit({ userId: input.userId, action: "academic_grid.corrected", entityType: "AcademicGridReview", entityId: input.reviewId, metadata: { field: input.field, disciplineIndex: input.disciplineIndex, reason: input.reason ?? null } });
  revalidatePath("/academic-analysis");
  revalidatePath(`/academic-analysis/${input.reviewId}`);
}

export async function updateAcademicGridFieldAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("analysis:review");
    const parsed = changeSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    const data = parsed.data;
    const review = await authorizedReview(data.reviewId, user.id, user.role === "ADMIN");
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
        discipline.originalStatus = String(data.value ?? "");
        discipline.normalizedStatus = normalizeAcademicStatus(discipline.originalStatus);
      } else if (data.field === "rawPeriod") {
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
  } catch (error) { return toActionError(error); }
}

export async function addAcademicDisciplineAction(reviewIdInput: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("analysis:review");
    const reviewId = idSchema.parse(reviewIdInput);
    const review = await authorizedReview(reviewId, user.id, user.role === "ADMIN");
    const snapshot = review.snapshot as unknown as AcademicGridSnapshot;
    const discipline: AcademicDiscipline = { code: null, name: "", rawPeriod: "", period: null, originalStatus: "A CURSAR", normalizedStatus: "A CURSAR", workload: null, inMainCurriculum: true, sourcePage: 0, sourceRow: snapshot.disciplines.length + 1, manualEdited: true };
    const index = snapshot.disciplines.push(discipline) - 1;
    await persistCorrection({ reviewId, userId: user.id, disciplineIndex: index, field: "discipline", previousValue: null, newValue: discipline, snapshot, currentPeriod: review.currentPeriod, expectedUpdatedAt: review.updatedAt, reason: "Disciplina adicionada manualmente" });
    return ok(undefined, "Disciplina adicionada. Preencha os dados da linha.");
  } catch (error) { return toActionError(error); }
}

export async function confirmAcademicGridProceedAction(reviewIdInput: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("analysis:review");
    const reviewId = idSchema.parse(reviewIdInput);
    const review = await authorizedReview(reviewId, user.id, user.role === "ADMIN");
    const snapshot = review.snapshot as unknown as AcademicGridSnapshot;
    if (snapshot.proceedConfirmed) return ok(undefined, "Prosseguimento já confirmado.");
    if (review.currentPeriod === null || !review.currentPeriodConfirmed) {
      return fail("Confirme o período atual do aluno antes de prosseguir.");
    }

    const currentPeriodRows = snapshot.disciplines.filter((discipline) =>
      discipline.inMainCurriculum && discipline.period === review.currentPeriod,
    );
    if (currentPeriodRows.length === 0) {
      return fail("Nenhum componente da grade principal foi identificado no período atual. Revise o extrato antes de prosseguir.");
    }

    const incomplete = snapshot.disciplines.filter(academicDisciplineNeedsReview);
    if (incomplete.length > 0) {
      return fail(`Revise nome, período e situação de ${incomplete.length} componente(s) da grade antes de prosseguir. Todas as disciplinas precisam entrar corretamente nos cálculos.`);
    }
    if (academicGridHasUnresolvedRowCount(snapshot.disciplines, snapshot.sourceDisciplineCount, snapshot.sourceParsedDisciplineCount)) {
      return fail(`O PDF contém ${snapshot.sourceDisciplineCount} linhas acadêmicas e a grade tem ${snapshot.disciplines.length}. Inclua ou confira as linhas faltantes antes de prosseguir.`);
    }

    const currentResult = analyzeAcademicGrid({ disciplines: snapshot.disciplines, currentPeriod: review.currentPeriod, currentPeriodConfirmed: true });
    if (currentResult.status === "MANUAL_REVIEW_REQUIRED") {
      return fail(currentResult.warnings[0] ?? "A análise ainda precisa de revisão manual antes de projetar a conclusão.");
    }

    snapshot.proceedConfirmed = true;
    await prisma.$transaction(async (tx) => {
      const updated = await tx.academicGridReview.updateMany({
        where: { id: reviewId, updatedAt: review.updatedAt },
        data: { snapshot: jsonValue(snapshot) },
      });
      if (updated.count !== 1) throw new Error("Esta análise foi atualizada por outra alteração. Recarregue a página antes de confirmar.");
      await tx.academicGridCorrection.create({
        data: {
          reviewId,
          userId: user.id,
          disciplineIndex: null,
          field: "proceedConfirmed",
          previousValue: jsonValue(false),
          newValue: jsonValue(true),
          reason: `Tutor confirmou a conferência do PDF completo e a inclusão de todos os componentes da grade principal (${snapshot.disciplines.length} linha(s) identificada(s)). ${snapshot.extractionWarnings.length} aviso(s) de extração reconhecido(s).`,
        },
      });
    });
    await recordAudit({
      userId: user.id,
      action: "academic_grid.proceed_confirmed",
      entityType: "AcademicGridReview",
      entityId: reviewId,
      metadata: { disciplines: snapshot.disciplines.length, acknowledgedExtractionWarnings: snapshot.extractionWarnings.length },
    });
    revalidatePath("/academic-analysis");
    revalidatePath(`/academic-analysis/${reviewId}`);
    return ok(undefined, "Análise confirmada. Todos os componentes da grade seguem incluídos nos cálculos.");
  } catch (error) { return toActionError(error); }
}

/** Exclui uma análise acadêmica definitivamente; autorização validada no servidor. */
export async function deleteAcademicGridReviewAction(input: unknown): Promise<ActionResult> {
  try {
    const admin = await requirePermission("analysis:delete");
    const parsed = z.object({ reviewId: idSchema }).safeParse(input);
    if (!parsed.success) return fail("Análise inválida.");

    const review = await prisma.academicGridReview.findUnique({
      where: { id: parsed.data.reviewId },
      select: { id: true, studentName: true, rgm: true, courseName: true, sourceFilename: true },
    });
    if (!review) return fail("Análise acadêmica não encontrada.");

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
