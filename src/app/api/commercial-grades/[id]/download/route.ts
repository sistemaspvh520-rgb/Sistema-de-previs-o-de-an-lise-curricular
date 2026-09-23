import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/services/storage/storage";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(_request: Request, ctx: RouteContext<"/api/commercial-grades/[id]/download">) {
  const user = await getSessionUser(); if (!user || !can(user.role, "analysis:read")) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const { id } = await ctx.params; if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  const grade = await prisma.commercialGrade.findUnique({ where: { id } }); if (!grade) return NextResponse.json({ error: "Grade não encontrada." }, { status: 404 });
  const storage = getStorage(); if (!(await storage.exists(grade.storageKey))) return NextResponse.json({ error: "Arquivo indisponível." }, { status: 410 });
  const bytes = await storage.read(grade.storageKey); return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Length": String(bytes.length), "Content-Disposition": `attachment; filename="${encodeURIComponent(grade.originalName)}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
