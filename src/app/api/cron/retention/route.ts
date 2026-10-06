import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
import { runRetention } from "@/services/retention/retention";
import { purgeOldUsage } from "@/services/usage/track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const secret = getEnv().CRON_SECRET;
  if (!token || token.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
}

/** Acionado por agendador externo: Authorization: Bearer <CRON_SECRET>. */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const result = await runRetention();
  // Uso da equipe: linha do tempo por 180 dias, agregado por hora por 2 anos.
  const usage = await purgeOldUsage();
  return NextResponse.json({ ...result, usage });
}
