"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/session";
import { setSystemSetting } from "@/repositories/settings-repository";
import { recordAudit } from "@/services/audit-log/audit-log";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";

const contactSchema = z.object({
  nome: z.string().trim().max(120),
  email: z.string().trim().max(160).refine((v) => v === "" || z.string().email().safeParse(v).success, "E-mail inválido."),
  telefone: z.string().trim().max(30),
});

const schema = z.record(
  z.string(),
  z.object({
    mantenedor: contactSchema,
    coordAcademico: contactSchema,
    coordComercial: contactSchema,
  }),
);

export async function savePoloContactsAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("privacy:manage");
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    await setSystemSetting("poloContacts", parsed.data);
    await recordAudit({ userId: user.id, action: "settings.polo_contacts.update", entityType: "SystemSetting" });
    revalidatePath("/settings/general");
    return ok(undefined, "Contatos por polo salvos.");
  } catch (err) {
    return toActionError(err);
  }
}
