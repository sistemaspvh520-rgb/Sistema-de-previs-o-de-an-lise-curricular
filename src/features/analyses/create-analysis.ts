import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getStorage } from "@/services/storage/storage";
import { validatePdfBytes, PdfValidationError } from "@/services/pdf/validate";
import { countPdfPages } from "@/services/pdf/parser";
import { getSystemSettings } from "@/repositories/settings-repository";
import { getActiveRuleSet } from "@/repositories/rules-repository";
import { ENGINE_VERSION } from "@/domain/curricular-analysis/version";
import { isValidTerm } from "@/domain/curricular-analysis/simulation/terms";
import { cleanStudentName, normalizeStudentName } from "@/domain/student-name";
import type { CourseFormat } from "@/generated/prisma/enums";
import { initialSteps } from "@/services/pipeline/steps";
import { recordAudit } from "@/services/audit-log/audit-log";
import type { Prisma } from "@/generated/prisma/client";
import type { RetentionPolicy } from "@/generated/prisma/enums";

export function retentionDeadline(policy: RetentionPolicy, from = new Date()): Date | null {
  const days: Partial<Record<RetentionPolicy, number>> = { DAYS_30: 30, DAYS_90: 90, DAYS_180: 180 };
  const d = days[policy];
  if (!d) return null;
  return new Date(from.getTime() + d * 24 * 60 * 60 * 1000);
}

export class DuplicateDocumentError extends Error {
  constructor(readonly existingAnalysisId: string) {
    super("Este PDF já foi analisado. Abra a análise existente ou reenvie confirmando a duplicidade.");
    this.name = "DuplicateDocumentError";
  }
}

export interface CreateAnalysisInput {
  userId: string;
  bytes: Buffer;
  originalName: string;
  /** Lido do PDF durante o processamento; usado apenas em envios legados. */
  entryPeriod?: number | null;
  entryTerm: string;
  /** Identificação do atendimento, informada pelo analista. */
  studentName: string;
  poloCode: string;
  courseFormat: CourseFormat;
  /** Primeiro semestre da previsão; por padrão igual ao semestre de ingresso. */
  startTerm?: string | null;
  /** Reanálise do mesmo aluno: id da análise anterior (exige um PDF diferente). */
  reanalysisOfId?: string | null;
}

export class StudentAlreadyAnalyzedError extends Error {
  constructor(readonly existingAnalysisId: string, readonly existingStudentName: string) {
    super("Já existe uma análise para este aluno. Abra a análise existente ou marque este envio como reanálise com o novo PDF.");
    this.name = "StudentAlreadyAnalyzedError";
  }
}

export class InvalidReanalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidReanalysisError";
  }
}

/** Valida, armazena e cria a análise em estado UPLOADED. Não executa o pipeline. */
export async function createAnalysisFromUpload(input: CreateAnalysisInput): Promise<{ id: string }> {
  const settings = await getSystemSettings();
  await validatePdfBytes(input.bytes, { maxBytes: settings.maxUploadMb * 1024 * 1024 });

  let pageCount: number;
  try {
    pageCount = await countPdfPages(input.bytes);
  } catch (err) {
    // registra a causa real (ex.: worker do pdf.js ausente no bundle) — o usuário só vê a mensagem amigável
    const message = err instanceof Error ? err.message : String(err);
    logger.error("pdf.open_failed", { originalName: input.originalName, sizeBytes: input.bytes.length, err: message, stack: err instanceof Error ? err.stack?.split("\n").slice(0, 8).join(" | ") : undefined });
    const looksInternal = /worker|Cannot find module|ENOENT|import|fetch/i.test(message);
    throw new PdfValidationError(
      "NOT_PDF",
      looksInternal
        ? "Falha interna ao ler o PDF (leitor indisponível). A equipe técnica foi notificada; tente novamente em instantes."
        : "Não foi possível abrir o PDF. O arquivo pode estar corrompido ou protegido por senha.",
    );
  }
  if (pageCount > settings.maxPdfPages) {
    throw new PdfValidationError("TOO_MANY_PAGES", `O PDF tem ${pageCount} páginas; o limite é ${settings.maxPdfPages}.`);
  }

  if (input.entryPeriod !== undefined && input.entryPeriod !== null && (!Number.isInteger(input.entryPeriod) || input.entryPeriod < 1 || input.entryPeriod > 20)) {
    throw new Error("Período de ingresso inválido.");
  }
  if (!isValidTerm(input.entryTerm)) throw new Error("Semestre de ingresso inválido.");
  const studentName = cleanStudentName(input.studentName);
  if (studentName.length < 3) throw new Error("Informe o nome do aluno.");
  const polo = settings.polos.find((item) => item.code === input.poloCode);
  if (!polo) throw new Error("Polo inválido.");
  if (!settings.courseFormats.includes(input.courseFormat)) throw new Error("Formato do curso indisponível.");

  const ruleSet = await getActiveRuleSet();
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  // O mesmo PDF nunca gera duas análises — nem como reanálise (reanálise exige o novo PDF).
  const existingDoc = await prisma.uploadedDocument.findFirst({ where: { sha256 }, orderBy: { createdAt: "desc" }, select: { analysisId: true } });
  if (existingDoc) throw new DuplicateDocumentError(existingDoc.analysisId);
  // Um aluno só tem nova análise se for declarada como reanálise da anterior.
  const previous = await findLatestAnalysisForStudent(studentName);
  if (input.reanalysisOfId) {
    const target = await prisma.curricularAnalysis.findUnique({ where: { id: input.reanalysisOfId }, select: { id: true, studentName: true } });
    if (!target) throw new InvalidReanalysisError("A análise anterior indicada não existe mais.");
    if (!target.studentName || normalizeStudentName(target.studentName) !== normalizeStudentName(studentName)) throw new InvalidReanalysisError("A análise anterior indicada pertence a outro aluno.");
  } else if (previous) {
    throw new StudentAlreadyAnalyzedError(previous.id, previous.studentName);
  }
  const storage = getStorage();
  const stored = await storage.save(input.bytes, { extension: "pdf" });
  const entryTerm = input.entryTerm;
  const entryPeriod = input.entryPeriod ?? null;
  const startTerm = input.startTerm && isValidTerm(input.startTerm) ? input.startTerm : entryTerm;
  const safeName = input.originalName.replace(/[\\/:*?"<>|]/g, "_").slice(0, 200) || "documento.pdf";

  try {
    const analysis = await prisma.curricularAnalysis.create({
      data: {
        status: "UPLOADED",
        createdById: input.userId,
        startTerm,
        entryTerm,
        entryPeriod,
        entryPeriodSource: entryPeriod === null ? null : "USER",
        studentName,
        poloCode: polo.code,
        poloName: polo.name,
        courseFormat: input.courseFormat,
        reanalysisOfId: input.reanalysisOfId ?? null,
        ruleSetVersionId: ruleSet.id,
        engineVersion: ENGINE_VERSION,
        processingSteps: initialSteps() as unknown as Prisma.InputJsonValue,
        document: {
          create: {
            originalName: safeName,
            storageKey: stored.key,
            sizeBytes: stored.sizeBytes,
            sha256,
            pageCount,
            mimeType: "application/pdf",
            deleteAfter: retentionDeadline(settings.retentionPolicy),
          },
        },
      },
    });
    try {
      await recordAudit({ userId: input.userId, action: "analysis.create", entityType: "CurricularAnalysis", entityId: analysis.id, metadata: { originalName: safeName, pageCount, sizeBytes: stored.sizeBytes, entryPeriod, entryTerm, startTerm } });
    } catch {
      // A análise já foi criada; uma falha no registro de auditoria não deve impedir o processamento.
    }
    return { id: analysis.id };
  } catch (err) {
    await storage.delete(stored.key).catch(() => undefined);
    throw err;
  }
}

/** Análises anteriores do mesmo aluno (comparação sem acentos/caixa), mais recente primeiro. */
export async function findAnalysesForStudent(name: string, take = 5) {
  const normalized = normalizeStudentName(name);
  if (normalized.length < 3) return [];
  const candidates = await prisma.curricularAnalysis.findMany({
    where: { studentName: { contains: normalized.split(" ")[0], mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, studentName: true, courseName: true, poloName: true, status: true, createdAt: true, createdById: true, enrollmentStatus: true, createdBy: { select: { name: true } } },
  });
  return candidates
    .filter((a) => a.studentName && normalizeStudentName(a.studentName) === normalized)
    .slice(0, take)
    .map((a) => ({ ...a, studentName: a.studentName as string }));
}

async function findLatestAnalysisForStudent(name: string) {
  const [latest] = await findAnalysesForStudent(name, 1);
  return latest ?? null;
}
