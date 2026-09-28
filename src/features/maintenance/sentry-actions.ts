"use server";

import * as Sentry from "@sentry/nextjs";
import { requirePermission } from "@/lib/session";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";

/** Envia um erro de teste ao Sentry para o administrador confirmar que o monitoramento está ativo. */
export async function sendSentryTestAction(): Promise<ActionResult<{ eventId: string }>> {
  try {
    await requirePermission("privacy:manage");
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return fail("Sentry desligado: falta NEXT_PUBLIC_SENTRY_DSN na Vercel.");
    const eventId = Sentry.captureException(new Error("Teste do Sentry — enviado em Configurações → Manutenção"), { tags: { test: "true" } });
    const delivered = await Sentry.flush(5000);
    if (!delivered) return fail("O Sentry não confirmou o recebimento. Confira o DSN e tente de novo.");
    return ok({ eventId });
  } catch (error) {
    return toActionError(error);
  }
}
