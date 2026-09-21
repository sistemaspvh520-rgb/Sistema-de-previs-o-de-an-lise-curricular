import { NextResponse, after } from "next/server";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { rateLimit } from "@/services/rate-limit/rate-limit";
import { createAnalysisFromUpload } from "@/features/analyses/create-analysis";
import { PdfValidationError } from "@/services/pdf/validate";
import { runAnalysisPipeline } from "@/services/pipeline/runner";
import { getSystemSettings } from "@/repositories/settings-repository";
import { logger } from "@/lib/logger";
import { isValidTerm } from "@/domain/curricular-analysis/simulation/terms";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
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
  const entryTerm = typeof form.get("entryTerm") === "string" ? (form.get("entryTerm") as string) : null;
  const entryPeriod = Number(form.get("entryPeriod"));
  if (!Number.isInteger(entryPeriod) || entryPeriod < 1 || entryPeriod > 20 || !entryTerm || !isValidTerm(entryTerm)) {
    return NextResponse.json({ error: "Informe período e semestre de ingresso válidos." }, { status: 400 });
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const { id } = await createAnalysisFromUpload({ userId: user.id, bytes, originalName: file.name, entryPeriod, entryTerm, startTerm: entryTerm });
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
    logger.error("upload.failed", { err: String(err) });
    const reason = err instanceof Error && err.message.includes("Nenhuma versão de regras ativa")
      ? "Não há regras acadêmicas ativas. Peça a um administrador para ativar uma configuração em Regras Acadêmicas."
      : "O PDF foi recebido, mas não foi possível criar a análise. Nenhuma análise foi iniciada; tente enviar novamente.";
    return NextResponse.json({ error: reason, code: "ANALYSIS_CREATION_FAILED" }, { status: 500 });
  }
}
