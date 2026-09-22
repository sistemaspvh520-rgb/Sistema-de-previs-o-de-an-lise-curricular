import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getVapidPublicKey } from "@/services/push/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(10), auth: z.string().min(5) }),
});

/** Chave pública VAPID e estado das notificações para o navegador atual. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  return NextResponse.json({ publicKey: getVapidPublicKey() });
}

/** Registra a inscrição Web Push do navegador para o usuário logado. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const parsed = subscriptionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Inscrição inválida." }, { status: 400 });
  const { endpoint, keys } = parsed.data;
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null },
    create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null },
  });
  return NextResponse.json({ ok: true });
}

/** Remove a inscrição deste navegador. */
export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = z.object({ endpoint: z.string().url() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Inscrição inválida." }, { status: 400 });
  await prisma.pushSubscription.deleteMany({ where: { endpoint: body.data.endpoint, userId: user.id } });
  return NextResponse.json({ ok: true });
}
