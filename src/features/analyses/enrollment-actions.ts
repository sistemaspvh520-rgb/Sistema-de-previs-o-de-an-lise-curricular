"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { requireAnalysisAccess } from "@/lib/analysis-access";
import { recordAudit } from "@/services/audit-log/audit-log";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";

const schema = z.object({
  analysisId: z.string().uuid(),
  status: z.enum(["ENROLLED", "NOT_ENROLLED", "PENDING"]),
  note: z.string().trim().max(300).optional(),
});

/** Retorno do consultor: o aluno se matriculou após a análise? Alimenta os relatórios de conversão. */
export async function updateEnrollmentAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("analysis:review");
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    const a = await requireAnalysisAccess(parsed.data.analysisId, user);
    if (a.status !== "COMPLETED") return fail("O retorno de matrícula só se aplica a análises entregues.");
    await prisma.curricularAnalysis.update({
      where: { id: a.id },
      data: {
        enrollmentStatus: parsed.data.status,
        enrollmentNote: parsed.data.note || null,
        enrollmentUpdatedAt: new Date(),
        enrollmentUpdatedById: user.id,
        // Voltar para "sem retorno" reabre a cobrança em 24h.
        ...(parsed.data.status === "PENDING" ? { followUpDueAt: new Date(Date.now() + 24 * 60 * 60_000), followUpNotifiedAt: null, followUpNotificationCount: 0 } : {}),
      },
    });
    await recordAudit({ userId: user.id, action: "analysis.enrollment_updated", entityType: "CurricularAnalysis", entityId: a.id, metadata: { status: parsed.data.status, note: parsed.data.note ?? null } });
    revalidatePath(`/analyses/${a.id}`);
    revalidatePath("/analyses");
    revalidatePath("/management");
    const message = parsed.data.status === "ENROLLED" ? "Matrícula registrada. Obrigado pelo retorno!" : parsed.data.status === "NOT_ENROLLED" ? "Registrado: o aluno não se matriculou." : "Retorno reaberto; você será lembrado novamente.";
    return ok(undefined, message);
  } catch (err) {
    return toActionError(err);
  }
}
