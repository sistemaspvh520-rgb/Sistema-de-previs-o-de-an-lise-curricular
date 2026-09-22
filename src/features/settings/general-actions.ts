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
  followUpBusinessStartHour: z.coerce.number().int().min(0).max(22),
  followUpBusinessEndHour: z.coerce.number().int().min(1).max(23),
  followUpRepeatBusinessDays: z.coerce.number().int().min(1).max(5),
  polos: z.array(z.object({ code: z.string().regex(/^\d{3,12}$/), name: z.string().trim().min(2).max(120) })).min(1).max(50).refine((rows) => new Set(rows.map((row) => row.code)).size === rows.length, "Não repita códigos de polo."),
  courseFormats: z.array(z.enum(["EAD_DIGITAL", "SEMIPRESENCIAL"])).min(1),
}).refine((data) => data.followUpBusinessStartHour < data.followUpBusinessEndHour, { message: "O horário inicial deve ser anterior ao final.", path: ["followUpBusinessEndHour"] });

export async function saveGeneralSettingsAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("privacy:manage");
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    await Promise.all([
      setSystemSetting("institutionName", parsed.data.institutionName), setSystemSetting("maxUploadMb", parsed.data.maxUploadMb), setSystemSetting("maxPdfPages", parsed.data.maxPdfPages), setSystemSetting("defaultStartTerm", parsed.data.defaultStartTerm || null),
      setSystemSetting("polos", parsed.data.polos), setSystemSetting("courseFormats", parsed.data.courseFormats), setSystemSetting("followUpBusinessStartHour", parsed.data.followUpBusinessStartHour), setSystemSetting("followUpBusinessEndHour", parsed.data.followUpBusinessEndHour), setSystemSetting("followUpRepeatBusinessDays", parsed.data.followUpRepeatBusinessDays),
    ]);
    await recordAudit({ userId: user.id, action: "settings.general.update", entityType: "SystemSetting", metadata: parsed.data });
    revalidatePath("/settings/general");
    return ok(undefined, "Configurações salvas.");
  } catch (err) {
    return toActionError(err);
  }
}
