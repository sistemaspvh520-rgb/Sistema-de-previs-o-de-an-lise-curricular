"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { requireAnalysisAccess } from "@/lib/analysis-access";
import { recordAudit } from "@/services/audit-log/audit-log";
import { recalculateAnalysis } from "@/services/pipeline/runner";
import { classifySubject } from "@/domain/curricular-analysis/engine/classify";
import { buildRowHash } from "@/domain/curricular-analysis/engine/row-hash";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";
import { logger } from "@/lib/logger";

const idSchema = z.string().uuid();

interface FieldMismatch {
  kind: "FIELD_MISMATCH";
  rowHash: string;
  field: "usedSubject" | "period" | "workload";
  localValue: string | number | null;
  aiValue: string | number | null;
  recommended: "AI" | "LOCAL";
}
interface MissingRow {
  kind: "MISSING_ROW";
  row: { code: string | null; name: string; workload: number | null; period: number | null; usedSubject: string | null; page: number; rowIndex: number };
}

function parseData(data: unknown): FieldMismatch | MissingRow | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.kind === "FIELD_MISMATCH" && typeof d.rowHash === "string" && typeof d.field === "string") return d as unknown as FieldMismatch;
  if (d.kind === "MISSING_ROW" && d.row && typeof d.row === "object") return d as unknown as MissingRow;
  return null;
}

/**
 * Resolve um ponto de conferência aplicando uma escolha:
 *  - "LOCAL": grava na disciplina o valor lido do PDF (leitura local);
 *  - "AI": mantém o valor da análise;
 *  - "ACK": apenas marca como conferido.
 * Toda alteração vira ManualCorrection + recálculo.
 */
export async function resolveWithChoiceAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("analysis:review");
    const parsed = z.object({ analysisId: idSchema, warningId: idSchema, choice: z.enum(["LOCAL", "AI", "ACK"]) }).safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    const { analysisId, warningId, choice } = parsed.data;
    await requireAnalysisAccess(analysisId, user);
    const w = await prisma.analysisWarning.findFirst({ where: { id: warningId, analysisId } });
    if (!w) return fail("Ponto de conferência não encontrado.");
    const data = parseData(w.data);

    let changed = false;
    if (choice === "LOCAL" && data?.kind === "FIELD_MISMATCH") {
      const subject = w.subjectId
        ? await prisma.analyzedSubject.findFirst({ where: { id: w.subjectId, analysisId } })
        : await prisma.analyzedSubject.findFirst({ where: { analysisId, rowHash: data.rowHash } });
      if (!subject) return fail("Disciplina não encontrada para aplicar a correção.");
      const previous = data.field === "usedSubject" ? subject.usedSubject : data.field === "period" ? subject.period : subject.workload;
      const update: { usedSubject?: string | null; period?: number; workload?: number; status?: "EXEMPTED" | "PENDING" | "REVIEW"; origin: "USER"; readability: "CLEAR" } = { origin: "USER", readability: "CLEAR" };
      if (data.field === "usedSubject") {
        const value = typeof data.localValue === "string" && data.localValue.trim() ? data.localValue.trim().toUpperCase() : null;
        update.usedSubject = value;
        update.status = classifySubject({ usedSubject: value });
      } else if (data.field === "period") {
        if (typeof data.localValue !== "number") return fail("Valor local inválido.");
        update.period = data.localValue;
      } else {
        if (typeof data.localValue !== "number") return fail("Valor local inválido.");
        update.workload = data.localValue;
      }
      await prisma.$transaction([
        prisma.analyzedSubject.update({ where: { id: subject.id }, data: update }),
        prisma.manualCorrection.create({
          data: { analysisId, subjectId: subject.id, userId: user.id, field: data.field, previousValue: previous === null || previous === undefined ? null : String(previous), newValue: update[data.field] === null || update[data.field] === undefined ? null : String(update[data.field]), reason: "Aplicado o valor lido diretamente do PDF (ponto de conferência)." },
        }),
        ...(update.status && update.status !== subject.status
          ? [prisma.manualCorrection.create({ data: { analysisId, subjectId: subject.id, userId: user.id, field: "status", previousValue: subject.status, newValue: update.status, reason: "Reclassificada pela disciplina utilizada do PDF." } })]
          : []),
      ]);
      changed = true;
    }

    await prisma.analysisWarning.update({ where: { id: warningId }, data: { resolvedAt: new Date(), resolvedById: user.id } });
    await recordAudit({ userId: user.id, action: "analysis.warning_resolved", entityType: "AnalysisWarning", entityId: warningId, metadata: { analysisId, choice, code: w.code } });
    // Manter a leitura atual ou apenas reconhecer o ponto não altera a grade.
    // Recalcular nesses casos recriaria a mesma divergência da leitura local.
    if (changed) await recalculateAnalysis(analysisId);
    revalidatePath(`/analyses/${analysisId}`);
    return ok(undefined, changed ? "Correção aplicada e previsão recalculada." : choice === "AI" ? "Leitura da análise mantida." : "Ponto marcado como conferido.");
  } catch (err) {
    logger.error("resolveWithChoiceAction", { err: String(err) });
    return toActionError(err);
  }
}

/** Adiciona à grade uma disciplina que está no PDF mas não entrou na análise. */
export async function addMissingSubjectAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("analysis:review");
    const parsed = z.object({ analysisId: idSchema, warningId: idSchema }).safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    const { analysisId, warningId } = parsed.data;
    await requireAnalysisAccess(analysisId, user);
    const w = await prisma.analysisWarning.findFirst({ where: { id: warningId, analysisId } });
    const data = w ? parseData(w.data) : null;
    if (!w || data?.kind !== "MISSING_ROW") return fail("Este ponto não tem uma linha para adicionar.");
    const row = data.row;
    if (!row.period) return fail("A linha do PDF não tem período legível; adicione manualmente pela grade.");
    const analysis = await prisma.curricularAnalysis.findUniqueOrThrow({ where: { id: analysisId }, include: { document: { select: { id: true } }, subjects: { select: { sortIndex: true }, orderBy: { sortIndex: "desc" }, take: 1 } } });
    const rowHash = buildRowHash({ documentId: analysis.document?.id ?? analysisId, page: row.page, rowIndex: row.rowIndex, subjectName: row.name, period: row.period });
    const usedSubject = row.usedSubject ? row.usedSubject.toUpperCase() : null;
    const created = await prisma.analyzedSubject.create({
      data: {
        analysisId,
        rowHash: `${rowHash}-u`,
        code: row.code,
        name: row.name.toUpperCase(),
        workload: row.workload ?? 0,
        period: row.period,
        usedSubject,
        status: classifySubject({ usedSubject }),
        readability: "CLEAR",
        sourcePage: row.page,
        sourceRow: row.rowIndex,
        origin: "USER",
        sortIndex: (analysis.subjects[0]?.sortIndex ?? 0) + 1,
      },
    });
    await prisma.manualCorrection.create({ data: { analysisId, subjectId: created.id, userId: user.id, field: "name", previousValue: null, newValue: created.name, reason: "Disciplina adicionada a partir da tabela do PDF (ponto de conferência)." } });
    await prisma.analysisWarning.update({ where: { id: warningId }, data: { resolvedAt: new Date(), resolvedById: user.id, subjectId: created.id } });
    await recordAudit({ userId: user.id, action: "analysis.subject_added", entityType: "AnalyzedSubject", entityId: created.id, metadata: { analysisId, fromWarning: warningId } });
    await recalculateAnalysis(analysisId);
    revalidatePath(`/analyses/${analysisId}`);
    return ok(undefined, `"${created.name}" adicionada à grade. Previsão recalculada.`);
  } catch (err) {
    logger.error("addMissingSubjectAction", { err: String(err) });
    return toActionError(err);
  }
}

/** Aplica a sugestão recomendada em todos os pontos que têm sugestão (valores do PDF ou da análise, linhas faltantes). */
export async function applyAllSuggestionsAction(input: unknown): Promise<ActionResult<{ applied: number }>> {
  try {
    const user = await requirePermission("analysis:review");
    const parsed = z.object({ analysisId: idSchema }).safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    await requireAnalysisAccess(parsed.data.analysisId, user);
    let applied = 0;
    // Uma correção pode recriar os alertas determinísticos. Buscamos o próximo
    // item aberto a cada rodada para nunca usar um id que já foi substituído.
    for (let attempt = 0; attempt < 50; attempt++) {
      const open = await prisma.analysisWarning.findMany({ where: { analysisId: parsed.data.analysisId, resolvedAt: null } });
      const w = open.find((item) => {
        const data = parseData(item.data);
        return data?.kind === "FIELD_MISMATCH" || data?.kind === "MISSING_ROW";
      });
      if (!w) break;
      const data = parseData(w.data);
      const res = data?.kind === "FIELD_MISMATCH"
        ? await resolveWithChoiceAction({ analysisId: parsed.data.analysisId, warningId: w.id, choice: data.recommended })
        : await addMissingSubjectAction({ analysisId: parsed.data.analysisId, warningId: w.id });
      if (!res.ok) return fail(res.error ?? "Não foi possível aplicar uma das sugestões.");
      applied++;
    }
    revalidatePath(`/analyses/${parsed.data.analysisId}`);
    return ok({ applied }, applied ? `${applied} sugestão(ões) aplicada(s).` : "Nenhum ponto com sugestão automática.");
  } catch (err) {
    logger.error("applyAllSuggestionsAction", { err: String(err) });
    return toActionError(err);
  }
}
