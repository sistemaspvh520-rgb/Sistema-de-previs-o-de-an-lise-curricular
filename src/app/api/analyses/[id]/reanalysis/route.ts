import { NextResponse, after } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { createAnalysisFromUpload, DuplicateDocumentError, InvalidReanalysisError } from "@/features/analyses/create-analysis";
import { PdfValidationError } from "@/services/pdf/validate";
import { runAnalysisPipeline } from "@/services/pipeline/runner";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request, ctx: RouteContext<"/api/analyses/[id]/reanalysis">) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!can(user.role, "analysis:create")) return NextResponse.json({ error: "Sem permissão para enviar uma nova solicitação." }, { status: 403 });
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Análise inválida." }, { status: 400 });

  const original = await prisma.curricularAnalysis.findUnique({
    where: { id },
    select: { createdById: true, studentName: true, poloCode: true, courseFormat: true, startTerm: true },
  });
  if (!original) return NextResponse.json({ error: "Análise não encontrada." }, { status: 404 });
  if (user.role !== "ADMIN" && original.createdById !== user.id) return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  if (!original.studentName || !original.poloCode || !original.courseFormat) {
    return NextResponse.json({ error: "Esta análise não tem todos os dados de atendimento necessários para criar uma nova solicitação." }, { status: 422 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Selecione o PDF atualizado." }, { status: 400 });

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await createAnalysisFromUpload({
      userId: user.id,
      bytes,
      originalName: file.name,
      entryPeriod: null,
      entryTerm: original.startTerm,
      startTerm: original.startTerm,
      studentName: original.studentName,
      poloCode: original.poloCode,
      courseFormat: original.courseFormat,
      reanalysisOfId: id,
    });
    after(() => runAnalysisPipeline(result.id).catch((err) => logger.error("pipeline.unhandled", { analysisId: result.id, err: String(err) })));
    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (err) {
    if (err instanceof PdfValidationError) return NextResponse.json({ error: err.message }, { status: 422 });
    if (err instanceof DuplicateDocumentError) return NextResponse.json({ error: "Este PDF já foi analisado. Envie a versão atualizada do documento.", existingId: err.existingAnalysisId }, { status: 409 });
    if (err instanceof InvalidReanalysisError) return NextResponse.json({ error: err.message }, { status: 400 });
    logger.error("reanalysis.upload_failed", { analysisId: id, err: String(err) });
    return NextResponse.json({ error: "Não foi possível criar a nova solicitação. Tente novamente." }, { status: 500 });
  }
}
