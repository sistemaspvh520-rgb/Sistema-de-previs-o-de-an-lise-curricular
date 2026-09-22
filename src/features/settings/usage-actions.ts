"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/session";
import { setSystemSetting } from "@/repositories/settings-repository";
import { recordAudit } from "@/services/audit-log/audit-log";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";

const schema = z.object({
  aiMonthlyBudgetUsd: z.coerce.number().min(0).max(1_000_000),
  usdBrlReferenceRate: z.coerce.number().min(0.01).max(100),
});

export async function saveUsageBudgetAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("integration:manage");
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Informe valores válidos.");
    await setSystemSetting("aiMonthlyBudgetUsd", parsed.data.aiMonthlyBudgetUsd);
    await setSystemSetting("usdBrlReferenceRate", parsed.data.usdBrlReferenceRate);
    await recordAudit({ userId: user.id, action: "settings.usage_budget.update", entityType: "SystemSetting", metadata: parsed.data });
    revalidatePath("/settings/usage");
    revalidatePath("/management");
    return ok(undefined, "Orçamento e cotação de referência atualizados.");
  } catch (err) {
    return toActionError(err);
  }
}
