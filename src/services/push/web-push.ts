import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

let configured: boolean | null = null;

/** Push só funciona com as chaves VAPID configuradas (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY). */
export function isPushConfigured(): boolean {
  if (configured !== null) return configured;
  const env = getEnv();
  configured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
  if (configured) webpush.setVapidDetails(env.VAPID_SUBJECT ?? "mailto:sistemas@cruzeirodosul.edu.br", env.VAPID_PUBLIC_KEY as string, env.VAPID_PRIVATE_KEY as string);
  return configured;
}

export function getVapidPublicKey(): string | null {
  return isPushConfigured() ? (getEnv().VAPID_PUBLIC_KEY as string) : null;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

/** Envia a notificação a todos os navegadores inscritos do usuário; remove inscrições expiradas (404/410). */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<{ sent: number; removed: number }> {
  if (!isPushConfigured()) return { sent: 0, removed: 0 };
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  let removed = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 24 });
      await prisma.pushSubscription.update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } });
      sent += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
        removed += 1;
      } else {
        logger.warn("push.send_failed", { userId, status, err: String(err) });
      }
    }
  }
  return { sent, removed };
}
