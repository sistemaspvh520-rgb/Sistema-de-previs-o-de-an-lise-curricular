import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ENGINE_VERSION } from "@/domain/curricular-analysis/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Verificação de saúde para monitoramento/deploy: banco acessível e versão. Sem dados sensíveis. */
export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "up", engineVersion: ENGINE_VERSION, latencyMs: Date.now() - started });
  } catch {
    return NextResponse.json({ status: "degraded", db: "down", engineVersion: ENGINE_VERSION }, { status: 503 });
  }
}
