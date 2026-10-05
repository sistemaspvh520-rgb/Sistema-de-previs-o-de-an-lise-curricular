import "server-only";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/services/rate-limit/rate-limit";
import { validatePdfBytes, PdfValidationError } from "@/services/pdf/validate";
import { COMMERCIAL_GRADE_MAX_MB, publishCommercialGrade } from "@/services/commercial-grades/publish";

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Recebe o PDF de uma grade comercial pelo mesmo caminho da análise acadêmica: rota de API com
 * origem, sessão, permissão, limite de taxa, validação do PDF e mensagens de erro reais.
 * Com `replaceId`, substitui a grade existente.
 */
export async function handleCommercialGradeUpload(request: Request, replaceId?: string) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Origem não permitida." }, 403);
  const user = await getSessionUser();
  if (!user) return json({ error: "Faça login para continuar." }, 401);
  if (!can(user.role, "privacy:manage")) return json({ error: "Acesso negado." }, 403);
  const limit = rateLimit(`commercial-grade-upload:${user.id}`, { capacity: 10, refillPerMinute: 6 });
  if (!limit.allowed) return json({ error: `Aguarde ${limit.retryAfterSeconds}s antes de enviar novamente.` }, 429);
  try {
    const maxBytes = COMMERCIAL_GRADE_MAX_MB * 1024 * 1024;
    if (Number(request.headers.get("content-length") ?? 0) > maxBytes + 1024 * 1024) return json({ error: `O PDF excede o limite de ${COMMERCIAL_GRADE_MAX_MB} MB.` }, 413);
    const form = await request.formData().catch(() => null);
    const files = form?.getAll("file") ?? [];
    const file = files[0];
    if (!form || files.length !== 1 || !(file instanceof File) || !/\.pdf$/i.test(file.name)) return json({ error: "Selecione 1 arquivo PDF." }, 422);
    const bytes = Buffer.from(await file.arrayBuffer());
    await validatePdfBytes(bytes, { maxBytes });
    const filename = file.name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 200);
    const result = await publishCommercialGrade({ bytes, filename, userId: user.id, replaceId });
    if (!result.ok) return json({ error: result.error }, result.status);
    revalidatePath("/commercial-grades");
    return json({ id: result.id, message: result.message });
  } catch (error) {
    if (error instanceof PdfValidationError) return json({ error: error.message }, 422);
    const reference = error instanceof Error ? `${error.name}${"code" in error && typeof error.code === "string" ? ` ${error.code}` : ""}`.slice(0, 60) : "Error";
    logger.error("commercial_grade.upload_failed", { reference, message: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500) });
    return json({ error: `Não foi possível publicar a grade. Tente novamente; se persistir, informe o código (ref.: ${reference}).` }, 500);
  }
}
