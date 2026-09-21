"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/session";
import { setSystemSetting } from "@/repositories/settings-repository";
import { recordAudit } from "@/services/audit-log/audit-log";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";
import { isValidTerm } from "@/domain/curricular-analysis/simulation/terms";

const schema = z.object({
  institutionName: z.string().trim().min(2).max(160),
  maxUploadMb: z.coerce.number().int().min(1).max(50),
  maxPdfPages: z.coerce.number().int().min(1).max(300),
  defaultStartTerm: z.string().trim().refine((value) => value === "" || isValidTerm(value), "Use AAAA.1 ou AAAA.2."),
});

export async function saveGeneralSettingsAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("privacy:manage");
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    await setSystemSetting("institutionName", parsed.data.institutionName);
    await setSystemSetting("maxUploadMb", parsed.data.maxUploadMb);
    await setSystemSetting("maxPdfPages", parsed.data.maxPdfPages);
    await setSystemSetting("defaultStartTerm", parsed.data.defaultStartTerm || null);
    await recordAudit({ userId: user.id, action: "settings.general.update", entityType: "SystemSetting", metadata: parsed.data });
    revalidatePath("/settings/general");
    return ok(undefined, "Configurações salvas.");
  } catch (err) {
    return toActionError(err);
  }
}
