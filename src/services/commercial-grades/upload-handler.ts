import "server-only";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/services/rate-limit/rate-limit";
import { validatePdfBytes, PdfValidationError } from "@/services/pdf/validate";
import { COMMERCIAL_GRADE_MAX_MB, publishCommercialGrade } from "@/services/commercial-grades/publish";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/services/storage/storage";

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Recebe o PDF de uma grade comercial pelo mesmo caminho da análise acadêmica: rota de API com
 * origem, sessão, permissão, limite de taxa, validação do PDF e mensagens de erro reais.
 * Com `replaceId`, substitui a grade existente.
 */
/** Origem, sessão, permissão e limite de taxa comuns ao envio e à releitura. */
async function authorize(request: Request): Promise<{ userId: string } | { response: NextResponse }> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return { response: json({ error: "Origem não permitida." }, 403) };
  const user = await getSessionUser();
  if (!user) return { response: json({ error: "Faça login para continuar." }, 401) };
  if (!can(user.role, "privacy:manage")) return { response: json({ error: "Acesso negado." }, 403) };
  // Folga para envio em lote (dezenas de PDFs seguidos); só administradores chegam aqui.
  const limit = rateLimit(`commercial-grade-upload:${user.id}`, { capacity: 80, refillPerMinute: 40 });
  if (!limit.allowed) return { response: json({ error: `Aguarde ${limit.retryAfterSeconds}s antes de enviar novamente.` }, 429) };
  return { userId: user.id };
}

export async function handleCommercialGradeUpload(request: Request, replaceId?: string) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;
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
    const result = await publishCommercialGrade({ bytes, filename, userId: auth.userId, replaceId, upsert: form.get("mode") === "upsert" });
    if (!result.ok) return json({ error: result.error }, result.status);
    revalidatePath("/commercial-grades");
    return json({ id: result.id, message: result.message, warning: result.warning, action: result.action });
  } catch (error) {
    if (error instanceof PdfValidationError) return json({ error: error.message }, 422);
    const reference = error instanceof Error ? `${error.name}${"code" in error && typeof error.code === "string" ? ` ${error.code}` : ""}`.slice(0, 60) : "Error";
    logger.error("commercial_grade.upload_failed", { reference, message: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500) });
    return json({ error: `Não foi possível publicar a grade. Tente novamente; se persistir, informe o código (ref.: ${reference}).` }, 500);
  }
}

/** Relê com a IA o PDF já guardado de uma grade (grades publicadas antes da leitura atual), sem novo envio. */
export async function handleCommercialGradeReread(request: Request, id: string) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;
  try {
    const grade = await prisma.commercialGrade.findUnique({ where: { id }, select: { storageKey: true, originalName: true } });
    if (!grade) return json({ error: "Grade não encontrada." }, 404);
    if (!(await getStorage().exists(grade.storageKey))) return json({ error: "O PDF desta grade não está mais disponível. Use Atualizar grade e envie o arquivo." }, 410);
    const bytes = await getStorage().read(grade.storageKey);
    const result = await publishCommercialGrade({ bytes, filename: grade.originalName, userId: auth.userId, replaceId: id });
    if (!result.ok) return json({ error: result.error }, result.status);
    revalidatePath("/commercial-grades");
    return json({ id: result.id, message: result.message, warning: result.warning });
  } catch (error) {
    const reference = error instanceof Error ? error.name.slice(0, 60) : "Error";
    logger.error("commercial_grade.reread_failed", { id, reference, message: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500) });
    return json({ error: `Não foi possível reler a grade. Tente novamente; se persistir, informe o código (ref.: ${reference}).` }, 500);
  }
}
