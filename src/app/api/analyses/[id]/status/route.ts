import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { parseSteps } from "@/services/pipeline/steps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/analyses/[id]/status">) {
  const user = await getSessionUser();
  if (!user || !can(user.role, "analysis:read")) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  const a = await prisma.curricularAnalysis.findUnique({
    where: { id },
    select: { createdById: true, status: true, processingSteps: true, errorCode: true, errorMessage: true, reliability: true, reviewItemsCount: true, updatedAt: true },
  });
  if (!a) return NextResponse.json({ error: "Análise não encontrada." }, { status: 404 });
  if (user.role !== "ADMIN" && a.createdById !== user.id) return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  return NextResponse.json({
    status: a.status,
    steps: parseSteps(a.processingSteps),
    errorCode: a.errorCode,
    errorMessage: a.errorMessage,
    reliability: a.reliability,
    reviewItemsCount: a.reviewItemsCount,
    updatedAt: a.updatedAt.toISOString(),
  });
}
