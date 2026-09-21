import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/services/storage/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Entrega o PDF original somente a usuários autenticados e autorizados. Nunca via /public. */
export async function GET(_req: Request, ctx: RouteContext<"/api/analyses/[id]/document">) {
  const user = await getSessionUser();
  if (!user || !can(user.role, "analysis:read")) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  const doc = await prisma.uploadedDocument.findUnique({ where: { analysisId: id }, include: { analysis: { select: { createdById: true } } } });
  if (!doc) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  if (user.role !== "ADMIN" && doc.analysis.createdById !== user.id) return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  if (doc.deletedAt) return NextResponse.json({ error: "O arquivo foi removido pela política de retenção." }, { status: 410 });

  const storage = getStorage();
  if (!(await storage.exists(doc.storageKey))) return NextResponse.json({ error: "Arquivo indisponível." }, { status: 410 });
  const bytes = await storage.read(doc.storageKey);
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.originalName)}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
