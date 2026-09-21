"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { requireAnalysisAccess } from "@/lib/analysis-access";
import { recordAudit } from "@/services/audit-log/audit-log";
import { recalculateAnalysis } from "@/services/pipeline/runner";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";

const matrixSchema = z.object({
  courseName: z.string().trim().min(2).max(160),
  modality: z.string().trim().max(60).optional(),
  label: z.string().trim().min(1).max(120),
  year: z.coerce.number().int().min(1990).max(2100),
  version: z.string().trim().min(1).max(40),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
});

export async function createMatrixAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermission("matrix:manage");
    const parsed = matrixSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    const d = parsed.data;
    const modality = d.modality || null;
    const course =
      (await prisma.course.findFirst({ where: { name: d.courseName, modality } })) ??
      (await prisma.course.create({ data: { name: d.courseName, modality } }));
    const exists = await prisma.curriculumMatrix.findFirst({ where: { courseId: course.id, year: d.year, version: d.version } });
    if (exists) return fail("Já existe uma matriz com este ano/versão para o curso.");
    const matrix = await prisma.curriculumMatrix.create({
      data: {
        courseId: course.id,
        label: d.label,
        year: d.year,
        version: d.version,
        validFrom: d.validFrom ? new Date(d.validFrom) : null,
        validTo: d.validTo ? new Date(d.validTo) : null,
      },
    });
    await recordAudit({ userId: user.id, action: "matrix.create", entityType: "CurriculumMatrix", entityId: matrix.id, metadata: { course: course.name, label: d.label } });
    revalidatePath("/matrices");
    return ok({ id: matrix.id }, "Matriz criada. Agora cadastre as disciplinas.");
  } catch (err) {
    return toActionError(err);
  }
}

/**
 * Importação em lote das disciplinas: uma por linha no formato
 *   período | disciplina | carga horária | pré-requisito A; pré-requisito B
 */
const bulkSchema = z.object({ matrixId: z.string().uuid(), text: z.string().max(200_000) });

export async function replaceMatrixSubjectsAction(input: unknown): Promise<ActionResult<{ count: number }>> {
  try {
    const user = await requirePermission("matrix:manage");
    const parsed = bulkSchema.safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    const lines = parsed.data.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rows: Array<{ period: number; name: string; workload: number; prerequisites: string[] }> = [];
    for (const [i, line] of lines.entries()) {
      const parts = line.split("|").map((p) => p.trim());
      if (parts.length < 2) return fail(`Linha ${i + 1}: use "período | disciplina | carga horária | pré-requisitos".`);
      const period = Number(parts[0]);
      if (!Number.isInteger(period) || period < 1) return fail(`Linha ${i + 1}: período inválido "${parts[0]}".`);
      const name = parts[1].toUpperCase();
      if (!name) return fail(`Linha ${i + 1}: disciplina vazia.`);
      const workload = parts[2] ? Number(parts[2].replace(/h$/i, "")) : 0;
      if (!Number.isFinite(workload) || workload < 0) return fail(`Linha ${i + 1}: carga horária inválida "${parts[2]}".`);
      const prerequisites = parts[3] ? parts[3].split(";").map((p) => p.trim().toUpperCase()).filter(Boolean) : [];
      rows.push({ period, name, workload: Math.round(workload), prerequisites });
    }

    await prisma.$transaction(async (tx) => {
      await tx.curriculumPeriod.deleteMany({ where: { matrixId: parsed.data.matrixId } });
      const periods = [...new Set(rows.map((r) => r.period))].sort((a, b) => a - b);
      for (const p of periods) {
        await tx.curriculumPeriod.create({
          data: {
            matrixId: parsed.data.matrixId,
            number: p,
            label: `${p}º período`,
            subjects: { create: rows.filter((r) => r.period === p).map((r, order) => ({ name: r.name, workload: r.workload, prerequisites: r.prerequisites, order })) },
          },
        });
      }
    });
    await recordAudit({ userId: user.id, action: "matrix.subjects_replaced", entityType: "CurriculumMatrix", entityId: parsed.data.matrixId, metadata: { count: rows.length } });
    revalidatePath(`/matrices/${parsed.data.matrixId}`);
    revalidatePath("/matrices");
    return ok({ count: rows.length }, `${rows.length} disciplina(s) cadastrada(s).`);
  } catch (err) {
    return toActionError(err);
  }
}

export async function toggleMatrixActiveAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("matrix:manage");
    const parsed = z.object({ matrixId: z.string().uuid(), isActive: z.boolean() }).safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    await prisma.curriculumMatrix.update({ where: { id: parsed.data.matrixId }, data: { isActive: parsed.data.isActive } });
    await recordAudit({ userId: user.id, action: "matrix.toggle", entityType: "CurriculumMatrix", entityId: parsed.data.matrixId, metadata: { isActive: parsed.data.isActive } });
    revalidatePath("/matrices");
    return ok(undefined, "Matriz atualizada.");
  } catch (err) {
    return toActionError(err);
  }
}

/** Vincula (ou desvincula) uma matriz oficial à análise; a comparação (§57) roda no recálculo. */
export async function linkMatrixToAnalysisAction(input: unknown): Promise<ActionResult<{ warnings: number }>> {
  try {
    const user = await requirePermission("analysis:review");
    const parsed = z.object({ analysisId: z.string().uuid(), matrixId: z.string().uuid().nullable() }).safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    const { analysisId, matrixId } = parsed.data;
    await requireAnalysisAccess(analysisId, user);
    await prisma.curricularAnalysis.update({ where: { id: analysisId }, data: { curriculumMatrixId: matrixId } });
    await recalculateAnalysis(analysisId);
    const count = await prisma.analysisWarning.count({ where: { analysisId, source: "MATRIX", resolvedAt: null } });
    await recordAudit({ userId: user.id, action: "analysis.matrix_linked", entityType: "CurricularAnalysis", entityId: analysisId, metadata: { matrixId, warnings: count } });
    revalidatePath(`/analyses/${analysisId}`);
    return ok({ warnings: count }, matrixId ? `Comparação concluída: ${count} alerta(s).` : "Matriz desvinculada.");
  } catch (err) {
    return toActionError(err);
  }
}
