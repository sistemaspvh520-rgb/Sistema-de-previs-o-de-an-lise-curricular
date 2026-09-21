"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/session";
import { setSystemSetting } from "@/repositories/settings-repository";
import { recordAudit } from "@/services/audit-log/audit-log";
import { runRetention } from "@/services/retention/retention";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";

const schema = z.object({
  retentionPolicy: z.enum(["DAYS_30", "DAYS_90", "DAYS_180", "INDEFINITE", "DELETE_AFTER_PROCESSING"]),
  aiPrivacyMode: z.enum(["PDF_FILE", "REDACTED_TEXT"]),
});

export async function savePrivacySettingsAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("privacy:manage");
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    await setSystemSetting("retentionPolicy", parsed.data.retentionPolicy);
    await setSystemSetting("aiPrivacyMode", parsed.data.aiPrivacyMode);
    await recordAudit({ userId: user.id, action: "settings.privacy.update", entityType: "SystemSetting", metadata: parsed.data });
    revalidatePath("/settings/privacy");
    return ok(undefined, "Política de privacidade salva. Aplica-se a novos documentos.");
  } catch (err) {
    return toActionError(err);
  }
}

export async function runRetentionNowAction(): Promise<ActionResult<{ deleted: number }>> {
  try {
    const user = await requirePermission("privacy:manage");
    const result = await runRetention();
    await recordAudit({ userId: user.id, action: "retention.run", entityType: "UploadedDocument", metadata: result });
    revalidatePath("/settings/privacy");
    return ok(result, `${result.deleted} arquivo(s) removido(s).`);
  } catch (err) {
    return toActionError(err);
  }
}
