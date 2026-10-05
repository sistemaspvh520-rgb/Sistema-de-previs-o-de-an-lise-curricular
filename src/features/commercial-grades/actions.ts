"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/services/storage/storage";
import { recordAudit } from "@/services/audit-log/audit-log";
import { logger } from "@/lib/logger";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";

// O envio e a atualização do PDF acontecem em /api/commercial-grades (ver services/commercial-grades/upload-handler.ts).

export async function deleteCommercialGradeAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("privacy:manage");
    const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
    if (!parsed.success) return fail("Grade inválida.");
    const grade = await prisma.commercialGrade.findUnique({ where: { id: parsed.data.id }, select: { id: true, courseName: true, originalName: true, storageKey: true } });
    if (!grade) return fail("Grade não encontrada.");
    await prisma.commercialGrade.delete({ where: { id: grade.id } });
    await getStorage().delete(grade.storageKey).catch(() => undefined);
    await recordAudit({ userId: user.id, action: "commercial_grade.delete", entityType: "CommercialGrade", entityId: grade.id, metadata: { courseName: grade.courseName, originalName: grade.originalName } }).catch((error) => logger.error("commercial_grade.audit_failed", { id: grade.id, error: String(error) }));
    revalidatePath("/commercial-grades");
    return ok(undefined, "Grade excluída definitivamente.");
  } catch (error) { return toActionError(error); }
}
