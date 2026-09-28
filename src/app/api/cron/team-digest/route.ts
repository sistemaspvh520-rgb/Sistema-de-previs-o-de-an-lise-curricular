import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
import { sendWeeklyTeamDigests } from "@/services/student-portal/team-digest";

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

/** Resumo semanal da Central Acadêmica para cada tutor (Authorization: Bearer <CRON_SECRET>). */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  return NextResponse.json(await sendWeeklyTeamDigests());
}
