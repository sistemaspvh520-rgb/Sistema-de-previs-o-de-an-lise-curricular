import "server-only";
import { after, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getSystemSettings } from "@/repositories/settings-repository";
import { rateLimit } from "@/services/rate-limit/rate-limit";
import { parsePdf } from "@/services/pdf/parser";
import { validatePdfBytes, PdfValidationError } from "@/services/pdf/validate";
import { extractAcademicDocument } from "@/services/academic-documents/adapters";
import { requireEnrollment } from "./access";
import { ensureEnrollment, PortalInputError } from "./enrollments";
import { claimUpload, processUpload } from "./processing";
import { sha256 } from "./fingerprints";

export async function submitAcademicDocument(
  request: Request,
  internal = false,
) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return NextResponse.json(
      { error: "Origem não permitida." },
      { status: 403 },
    );
  const user = await getSessionUser({ allowStudent: !internal });
  if (!user)
    return NextResponse.json(
      { error: "Faça login para continuar." },
      { status: 401 },
    );
  if (user.role !== "STUDENT" && !can(user.role, "students:manage"))
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  const limit = rateLimit(`academic-upload:${user.id}`, {
    capacity: 10,
    refillPerMinute: 3,
  });
  if (!limit.allowed)
    return NextResponse.json(
      {
        error: `Aguarde ${limit.retryAfterSeconds}s antes de enviar novamente.`,
      },
      { status: 429 },
    );
  try {
    const settings = await getSystemSettings();
    const maxBytes = Math.min(settings.maxUploadMb, 20) * 1024 * 1024;
    if (
      Number(request.headers.get("content-length") ?? 0) >
      maxBytes + 1024 * 1024
    )
      return NextResponse.json(
        { error: "O arquivo excede o tamanho permitido." },
        { status: 413 },
      );
    const form = await request.formData();
    // Inspect every multipart field, including repeated "file" keys and hidden alternate fields.
    const documents = [...form.values()].filter(
      (value) => value instanceof File,
    );
    if (documents.length !== 1 || form.getAll("file").length !== 1)
      throw new PortalInputError("Envie apenas 1 arquivo PDF por solicitação.");
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      !/\.pdf$/i.test(file.name) ||
      (file.type &&
        !["application/pdf", "application/octet-stream"].includes(file.type))
    )
      throw new PortalInputError("Selecione um arquivo PDF.");
    if (form.get("confirmUpdatedTranscript") !== "true")
      throw new PortalInputError(
        "Confirme que o documento está atualizado e completo.",
      );
    if (file.size > maxBytes)
      throw new PortalInputError("O arquivo excede o tamanho permitido.");
    const bytes = Buffer.from(await file.arrayBuffer());
    await validatePdfBytes(bytes, { maxBytes });
    const requestedId = form.get("enrollmentId");
    let enrollmentId: string;
    if (!internal || requestedId) {
      enrollmentId = (
        await requireEnrollment(
          user,
          typeof requestedId === "string" ? requestedId : undefined,
        )
      ).id;
    } else {
      // Before any extraction, find an exact document only inside the tutor's scope.
      const existing = await prisma.academicAnalysisSource.findFirst({
        where: {
          sourceFileHash: sha256(bytes),
          enrollment: can(user.role, "academic:all") ? {} : { ownerId: user.id },
        },
        select: { enrollmentId: true },
      });
      if (existing) enrollmentId = existing.enrollmentId;
      else {
        const local = await parsePdf(bytes, { maxPages: settings.maxPdfPages });
        if (local.pageCount > settings.maxPdfPages)
          throw new PortalInputError("O PDF excede o limite de páginas.");
        const snapshot = extractAcademicDocument(local, file.name);
        if (!snapshot.rgm || !snapshot.studentName)
          throw new PortalInputError(
            "O documento precisa identificar nome e RGM para vincular a análise ao aluno correto.",
          );
        enrollmentId = (
          await ensureEnrollment(user, {
            rgm: snapshot.rgm,
            name: snapshot.studentName,
            courseName: snapshot.courseName,
          })
        ).id;
      }
    }
    const safeName = file.name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 200);
    const claim = await claimUpload(user, enrollmentId, bytes, safeName);
    if (
      !claim.run &&
      claim.source.status === "PROCESSING" &&
      claim.source.sourceFileHash !== sha256(bytes)
    ) {
      return NextResponse.json(
        {
          error:
            "Já existe outro documento desta matrícula em processamento. Aguarde a conclusão e envie este arquivo novamente.",
        },
        { status: 409 },
      );
    }
    if (claim.run)
      after(() => processUpload(claim.source.id, claim.source.attempts, bytes));
    const enrollment = await requireEnrollment(user, enrollmentId);
    return NextResponse.json(
      {
        jobId: claim.source.id,
        enrollmentId,
        status: claim.source.status,
        id: enrollment.currentVersion?.reviewId ?? null,
        duplicate: claim.duplicate,
        message: claim.duplicate
          ? "Este documento já foi analisado. Exibindo a análise atual."
          : "Estamos atualizando sua análise.",
      },
      {
        status: claim.source.status === "COMPLETED" ? 200 : 202,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    if (
      error instanceof PortalInputError ||
      error instanceof PdfValidationError
    )
      return NextResponse.json({ error: error.message }, { status: 422 });
    if (error instanceof Error && error.name === "ForbiddenError")
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    return NextResponse.json(
      {
        error:
          "Não foi possível receber o documento. Confira o documento e tente novamente.",
      },
      { status: 422 },
    );
  }
}

export const handleAcademicUpload = submitAcademicDocument;
