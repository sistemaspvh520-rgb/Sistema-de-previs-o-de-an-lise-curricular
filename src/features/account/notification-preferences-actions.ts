"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/services/audit-log/audit-log";
import {
  fail,
  ok,
  toActionError,
  type ActionResult,
} from "@/lib/action-result";

const schema = z
  .object({
    email: z.boolean(),
    push: z.boolean(),
    repeatDays: z.coerce.number().int().min(1).max(5),
    startHour: z.coerce.number().int().min(0).max(22),
    endHour: z.coerce.number().int().min(1).max(23),
  })
  .refine(
    (value) => value.email || value.push,
    "Mantenha pelo menos um canal ativo.",
  )
  .refine((value) => value.startHour < value.endHour, {
    message: "O início do expediente deve ser anterior ao fim.",
    path: ["endHour"],
  });
export async function saveNotificationPreferencesAction(
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(input);
    if (!parsed.success)
      return fail(parsed.error.issues[0]?.message ?? "Preferências inválidas.");
    await prisma.user.update({
      where: { id: user.id },
      data: {
        followUpEmailEnabled: parsed.data.email,
        followUpPushEnabled: parsed.data.push,
        followUpRepeatBusinessDays: parsed.data.repeatDays,
        followUpBusinessStartHour: parsed.data.startHour,
        followUpBusinessEndHour: parsed.data.endHour,
      },
    });
    await recordAudit({
      userId: user.id,
      action: "account.notification_preferences.update",
      entityType: "User",
      entityId: user.id,
      metadata: parsed.data,
    });
    revalidatePath("/settings/account");
    return ok(undefined, "Preferências de notificação salvas.");
  } catch (error) {
    return toActionError(error);
  }
}
