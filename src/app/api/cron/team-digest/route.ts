import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
import { sendWeeklyTeamDigests } from "@/services/student-portal/team-digest";
import { sendWeeklyUsageDigests } from "@/services/usage/usage-digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const secret = getEnv().CRON_SECRET;
  if (!token || token.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
}

/** Resumos semanais: Central Acadêmica para cada tutor e uso da equipe para os administradores (Authorization: Bearer <CRON_SECRET>). */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const team = await sendWeeklyTeamDigests();
  const usage = await sendWeeklyUsageDigests().catch((error) => ({ sent: 0, error: error instanceof Error ? error.name : "unknown" }));
  return NextResponse.json({ ...team, usage });
}
