import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { rateLimit } from "@/services/rate-limit/rate-limit";
import { getSystemSettings } from "@/repositories/settings-repository";
import { parsePdf } from "@/services/pdf/parser";
import { PdfValidationError, validatePdfBytes } from "@/services/pdf/validate";
import { extractAcademicGrid } from "@/services/academic-analysis/extract";
import { getActiveRuleSet } from "@/repositories/rules-repository";
import { DEFAULT_RULES } from "@/domain/curricular-analysis/rules/types";
import { recordAudit } from "@/services/audit-log/audit-log";
import { logger } from "@/lib/logger";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const maxDuration = 120;

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try { return new URL(origin).host === host; } catch { return false; }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!can(user.role, "analysis:review")) return NextResponse.json({ error: "Sem permissão para usar a Análise Acadêmica." }, { status: 403 });
  const limit = rateLimit(`academic-upload:${user.id}`, { capacity: 10, refillPerMinute: 5 });
  if (!limit.allowed) return NextResponse.json({ error: `Muitos envios. Aguarde ${limit.retryAfterSeconds}s.` }, { status: 429 });

  const settings = await getSystemSettings();
  const maxUploadMb = Math.min(settings.maxUploadMb, 20);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > (maxUploadMb + 1) * 1024 * 1024) return NextResponse.json({ error: `O arquivo excede o limite de ${maxUploadMb} MB.` }, { status: 413 });

  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "Envio inválido." }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Selecione o extrato ou grade curricular em PDF." }, { status: 400 });

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    await validatePdfBytes(bytes, { maxBytes: maxUploadMb * 1024 * 1024 });
    const local = await parsePdf(bytes, { maxPages: settings.maxPdfPages });
    if (local.pageCount > settings.maxPdfPages) return NextResponse.json({ error: `O PDF tem ${local.pageCount} páginas; o limite configurado é ${settings.maxPdfPages}.` }, { status: 422 });
    const snapshot = extractAcademicGrid(local, file.name);
    const activeRuleSet = await getActiveRuleSet().catch(() => null);
    snapshot.projectionRules = activeRuleSet?.rules ?? DEFAULT_RULES;
    snapshot.projectionRulesVersion = activeRuleSet?.version ?? "padrão";
    const safeName = file.name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 200) || "extrato.pdf";
    const review = await prisma.academicGridReview.create({
      data: {
        createdById: user.id,
        studentName: snapshot.studentName,
        rgm: snapshot.rgm,
        courseName: snapshot.courseName,
        currentPeriod: snapshot.result.currentPeriod,
        currentPeriodRaw: snapshot.result.currentPeriod === null ? null : snapshot.result.currentPeriod.toString(),
        currentPeriodConfirmed: snapshot.result.currentPeriodConfirmed,
        sourceFilename: safeName,
        sourceSha256: createHash("sha256").update(bytes).digest("hex"),
        sourcePageCount: local.pageCount,
        status: snapshot.result.status,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    await recordAudit({ userId: user.id, action: "academic_grid.created", entityType: "AcademicGridReview", entityId: review.id, metadata: { sourceFilename: safeName, pageCount: local.pageCount, extractedDisciplines: snapshot.disciplines.length, status: snapshot.result.status } });
    return NextResponse.json({ id: review.id, warnings: snapshot.extractionWarnings }, { status: 201 });
  } catch (error) {
    if (error instanceof PdfValidationError) return NextResponse.json({ error: error.message, code: error.code }, { status: 422 });
    const detail = error instanceof Error ? error.message : String(error);
    logger.warn("academic_grid.upload_failed", { userId: user.id, filename: file.name.slice(0, 200), reason: detail });
    return NextResponse.json({ error: "Não foi possível ler o extrato. Confirme que o PDF está íntegro e tem texto selecionável. Se necessário, prossiga com revisão manual." }, { status: 422 });
  }
}
