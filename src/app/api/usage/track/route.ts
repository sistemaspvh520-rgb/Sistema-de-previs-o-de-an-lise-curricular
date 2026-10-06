import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/services/rate-limit/rate-limit";
import { isTrackableUser, recordAction, recordHeartbeat, recordPageView } from "@/services/usage/track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ações que o próprio navegador informa (as demais são registradas no servidor). */
const CLIENT_ACTIONS = ["grade.whatsapp_copy", "grade.search"] as const;

const bodySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("page"), path: z.string().min(1).max(300) }),
  z.object({ type: z.literal("beat"), path: z.string().min(1).max(300) }),
  z.object({ type: z.literal("action"), name: z.enum(CLIENT_ACTIONS), entityId: z.string().uuid().optional() }),
]);

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Registro de uso enviado pelo navegador (tela aberta, minuto ativo, ação). Responde 204 sem corpo e nunca expõe
 * erro à tela: o rastreamento não pode atrapalhar quem está trabalhando.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse(null, { status: 403 });
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });
  if (!isTrackableUser(user)) return new NextResponse(null, { status: 204 });
  // Um minuto ativo por minuto e navegação normal cabem com folga; acima disso é ruído (ou abuso) e é descartado.
  if (!rateLimit(`usage:${user.id}`, { capacity: 30, refillPerMinute: 20 }).allowed) return new NextResponse(null, { status: 204 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const body = parsed.data;
  try {
    if (body.type === "page") await recordPageView(user.id, body.path);
    else if (body.type === "beat") await recordHeartbeat(user.id, body.path);
    else await recordAction(user.id, body.name, body.entityId);
  } catch (error) {
    logger.warn("usage.record_failed", { type: body.type, error: String(error) });
  }
  return new NextResponse(null, { status: 204 });
}
