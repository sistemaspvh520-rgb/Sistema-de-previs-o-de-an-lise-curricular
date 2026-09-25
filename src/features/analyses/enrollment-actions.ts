"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { requireAnalysisAccess } from "@/lib/analysis-access";
import { recordAudit } from "@/services/audit-log/audit-log";
import {
  fail,
  ok,
  toActionError,
  type ActionResult,
} from "@/lib/action-result";

const schema = z
  .object({
    analysisId: z.string().uuid(),
    status: z.enum(["ENROLLED", "NOT_ENROLLED"]),
    note: z.string().trim().max(300).optional(),
    reanalysisCompleted: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (
      data.status === "NOT_ENROLLED" &&
      !data.reanalysisCompleted &&
      !data.note?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["note"],
        message: "Informe o motivo da não matrícula.",
      });
    }
  });

/** Retorno do consultor: o aluno se matriculou após a análise? Alimenta os relatórios de conversão. */
export async function updateEnrollmentAction(
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requirePermission("analysis:review");
    const parsed = schema.safeParse(input);
    if (!parsed.success)
      return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    const a = await requireAnalysisAccess(parsed.data.analysisId, user);
    if (a.status !== "COMPLETED")
      return fail("O retorno de matrícula só se aplica a análises entregues.");
    const now = new Date();
    // A reanálise mantém a origem comercial registrada, mas reabre a confirmação
    // para que o mesmo usuário informe o desfecho após 24 horas.
    const reopenForReanalysis =
      parsed.data.status === "NOT_ENROLLED" && parsed.data.reanalysisCompleted;
    await prisma.curricularAnalysis.update({
      where: { id: a.id },
      data: {
        enrollmentStatus: reopenForReanalysis ? "PENDING" : parsed.data.status,
        enrollmentNote: parsed.data.note || null,
        enrollmentUpdatedAt: now,
        enrollmentUpdatedById: user.id,
        enrollmentReanalysisAt: reopenForReanalysis ? now : null,
        ...(reopenForReanalysis
          ? {
              followUpDueAt: new Date(now.getTime() + 24 * 60 * 60_000),
              followUpNotifiedAt: null,
              followUpNotificationCount: 0,
            }
          : {
              followUpDueAt: null,
              followUpNotifiedAt: null,
              followUpNotificationCount: 0,
            }),
      },
    });
    await recordAudit({
      userId: user.id,
      action: "analysis.enrollment_updated",
      entityType: "CurricularAnalysis",
      entityId: a.id,
      metadata: {
        status: reopenForReanalysis ? "PENDING" : parsed.data.status,
        note: parsed.data.note ?? null,
        reanalysisCompleted: reopenForReanalysis,
      },
    });
    revalidatePath(`/analyses/${a.id}`);
    revalidatePath("/analyses");
    revalidatePath("/management");
    const message =
      parsed.data.status === "ENROLLED"
        ? "Matrícula registrada. Obrigado pelo retorno!"
        : reopenForReanalysis
          ? "Reanálise registrada. A confirmação voltará a ser cobrada em 24 horas."
          : "Registrado: o aluno não se matriculou.";
    return ok(undefined, message);
  } catch (err) {
    return toActionError(err);
  }
}
