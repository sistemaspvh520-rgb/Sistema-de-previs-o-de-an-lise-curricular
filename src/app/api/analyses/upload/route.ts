import { NextResponse, after } from "next/server";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { rateLimit } from "@/services/rate-limit/rate-limit";
import { createAnalysisFromUpload, DuplicateDocumentError, InvalidReanalysisError, StudentAlreadyAnalyzedError } from "@/features/analyses/create-analysis";
import { PdfValidationError } from "@/services/pdf/validate";
import { runAnalysisPipeline } from "@/services/pipeline/runner";
import { getSystemSettings } from "@/repositories/settings-repository";
import { logger } from "@/lib/logger";
import { isValidTerm } from "@/domain/curricular-analysis/simulation/terms";
import { z } from "zod";
import { isPoloCode } from "@/domain/polos";

/** Dados de ingresso: obrigatórios e confirmados pelo usuário antes de iniciar a análise. */
const entrySchema = z.object({
  entryPeriod: z.coerce.number().int().min(1).max(20),
  entryTerm: z.string().refine(isValidTerm, "Use o formato AAAA.1 ou AAAA.2."),
  studentName: z.string().trim().min(3).max(120),
  poloCode: z.string().refine(isPoloCode, "Polo inválido."),
  courseFormat: z.enum(["EAD_DIGITAL", "SEMIPRESENCIAL"]),
  reanalysisOf: z.string().uuid().optional(),
});

export const runtime = "nodejs";
export const maxDuration = 300;

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // clientes sem Origin (ex.: curl) já dependem do cookie de sessão
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!can(user.role, "analysis:create")) return NextResponse.json({ error: "Sem permissão para criar análises." }, { status: 403 });

  const limit = rateLimit(`upload:${user.id}`, { capacity: 10, refillPerMinute: 10 });
  if (!limit.allowed) return NextResponse.json({ error: `Muitos envios. Aguarde ${limit.retryAfterSeconds}s.` }, { status: 429 });

  const settings = await getSystemSettings();
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > (settings.maxUploadMb + 1) * 1024 * 1024) {
    return NextResponse.json({ error: `O arquivo excede o limite de ${settings.maxUploadMb} MB.` }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Selecione um arquivo PDF." }, { status: 400 });
  const entry = entrySchema.safeParse({ entryPeriod: form.get("entryPeriod"), entryTerm: form.get("entryTerm"), studentName: form.get("studentName"), poloCode: form.get("poloCode"), courseFormat: form.get("courseFormat"), reanalysisOf: form.get("reanalysisOf") || undefined });
  if (!entry.success) return NextResponse.json({ error: "Informe nome do aluno, polo, formato do curso, período e semestre de ingresso válidos." }, { status: 400 });
  const { entryPeriod, entryTerm, studentName, poloCode, courseFormat, reanalysisOf } = entry.data;

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const { id } = await createAnalysisFromUpload({ userId: user.id, bytes, originalName: file.name, entryPeriod, entryTerm, startTerm: entryTerm, studentName, poloCode, courseFormat, reanalysisOfId: reanalysisOf ?? null });
    after(async () => {
      try {
        await runAnalysisPipeline(id);
      } catch (err) {
        logger.error("pipeline.unhandled", { analysisId: id, err: String(err) });
      }
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    if (err instanceof PdfValidationError) return NextResponse.json({ error: err.message, code: err.code }, { status: 422 });
    if (err instanceof DuplicateDocumentError) {
      const message = reanalysisOf
        ? "Este é o mesmo PDF da análise anterior. Uma reanálise exige o novo PDF do aluno."
        : "Este PDF já foi analisado. Abra a análise existente — ou, se houver um novo PDF, envie-o como reanálise.";
      return NextResponse.json({ error: message, code: "DUPLICATE_DOCUMENT", existingId: err.existingAnalysisId }, { status: 409 });
    }
    if (err instanceof StudentAlreadyAnalyzedError) return NextResponse.json({ error: err.message, code: "STUDENT_ALREADY_ANALYZED", existingId: err.existingAnalysisId }, { status: 409 });
    if (err instanceof InvalidReanalysisError) return NextResponse.json({ error: err.message, code: "INVALID_REANALYSIS" }, { status: 400 });
    logger.error("upload.failed", { err: String(err) });
    const reason = err instanceof Error && err.message.includes("Nenhuma versão de regras ativa")
      ? "Não há regras acadêmicas ativas. Peça à equipe técnica para aplicar o seed de regras."
      : "O PDF foi recebido, mas não foi possível criar a análise. Nenhuma análise foi iniciada; tente enviar novamente.";
    return NextResponse.json({ error: reason, code: "ANALYSIS_CREATION_FAILED" }, { status: 500 });
  }
}
