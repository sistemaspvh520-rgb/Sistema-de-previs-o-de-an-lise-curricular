"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/session";
import { setSystemSetting } from "@/repositories/settings-repository";
import { recordAudit } from "@/services/audit-log/audit-log";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";

function parseLocalizedNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number.NaN;
  const cleaned = value.trim().replace(/[^0-9,.-]/g, "");
  if (!cleaned) return Number.NaN;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  // A separação mais à direita é a decimal quando os dois formatos aparecem.
  // Assim aceitamos tanto 1.234,56 quanto 1,234.56, além de 5,456 e 5.456.
  const normalized = lastComma >= 0 && lastDot >= 0
    ? lastComma > lastDot
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "")
    : cleaned.replace(",", ".");
  return Number(normalized);
}

const localizedMoney = (min: number, max: number) =>
  z.preprocess(parseLocalizedNumber, z.number().finite().min(min).max(max));
const schema = z.object({
  aiMonthlyBudgetUsd: localizedMoney(0, 1_000_000),
  usdBrlReferenceRate: localizedMoney(0.01, 100),
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
