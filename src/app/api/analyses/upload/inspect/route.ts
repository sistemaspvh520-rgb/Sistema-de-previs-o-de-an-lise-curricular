import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { rateLimit } from "@/services/rate-limit/rate-limit";
import { getSystemSettings } from "@/repositories/settings-repository";
import { PdfValidationError, validatePdfBytes } from "@/services/pdf/validate";
import { inspectCurricularAnalysisDocument } from "@/services/pdf/document-classifier";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Lê o cabeçalho do PDF assim que o analista o anexa, sem gravar nada: diz se é o resultado do SIAA e quais dados do
 * cabeçalho (curso, semestre de entrada) vieram em branco, para a tela pedi-los antes do envio.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req))
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!can(user.role, "analysis:create"))
    return NextResponse.json({ error: "Sem permissão para criar análises." }, { status: 403 });

  const limit = rateLimit(`upload-inspect:${user.id}`, { capacity: 20, refillPerMinute: 20 });
  if (!limit.allowed)
    return NextResponse.json({ error: `Muitas leituras. Aguarde ${limit.retryAfterSeconds}s.` }, { status: 429 });

  const settings = await getSystemSettings();
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > (settings.maxUploadMb + 1) * 1024 * 1024)
    return NextResponse.json({ error: `O arquivo excede o limite de ${settings.maxUploadMb} MB.` }, { status: 413 });

  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
  }
  if (!(file instanceof File))
    return NextResponse.json({ error: "Selecione um arquivo PDF." }, { status: 400 });

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    await validatePdfBytes(bytes, { maxBytes: settings.maxUploadMb * 1024 * 1024 });
    const classification = await inspectCurricularAnalysisDocument(bytes);
    const missing = classification.missing ?? [];
    return NextResponse.json({
      // Cabeçalho incompleto não é recusa: a tela pede os dados que faltam.
      accepted: classification.accepted || missing.length > 0,
      missing,
      error: classification.accepted || missing.length > 0 ? undefined : classification.reason,
    });
  } catch (err) {
    if (err instanceof PdfValidationError)
      return NextResponse.json({ accepted: false, missing: [], error: err.message }, { status: 422 });
    logger.warn("upload.inspect_failed", { err: String(err) });
    return NextResponse.json({ error: "Não foi possível ler o PDF agora." }, { status: 500 });
  }
}
