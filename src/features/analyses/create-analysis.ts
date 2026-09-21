import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/services/storage/storage";
import { validatePdfBytes, PdfValidationError } from "@/services/pdf/validate";
import { countPdfPages } from "@/services/pdf/parser";
import { getSystemSettings } from "@/repositories/settings-repository";
import { getActiveRuleSet } from "@/repositories/rules-repository";
import { ENGINE_VERSION } from "@/domain/curricular-analysis/version";
import { suggestStartTerm, isValidTerm } from "@/domain/curricular-analysis/simulation/terms";
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

export interface CreateAnalysisInput {
  userId: string;
  bytes: Buffer;
  originalName: string;
  entryPeriod?: number | null;
  entryTerm?: string | null;
  startTerm?: string | null;
}

/** Valida, armazena e cria a análise em estado UPLOADED. Não executa o pipeline. */
export async function createAnalysisFromUpload(input: CreateAnalysisInput): Promise<{ id: string }> {
  const settings = await getSystemSettings();
  await validatePdfBytes(input.bytes, { maxBytes: settings.maxUploadMb * 1024 * 1024 });

  let pageCount: number;
  try {
    pageCount = await countPdfPages(input.bytes);
  } catch {
    throw new PdfValidationError("NOT_PDF", "Não foi possível abrir o PDF. O arquivo pode estar corrompido ou protegido.");
  }
  if (pageCount > settings.maxPdfPages) {
    throw new PdfValidationError("TOO_MANY_PAGES", `O PDF tem ${pageCount} páginas; o limite é ${settings.maxPdfPages}.`);
  }

  const ruleSet = await getActiveRuleSet();
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const storage = getStorage();
  const stored = await storage.save(input.bytes, { extension: "pdf" });
  const startTerm = input.startTerm && isValidTerm(input.startTerm) ? input.startTerm : suggestStartTerm();
  const entryTerm = input.entryTerm && isValidTerm(input.entryTerm) ? input.entryTerm : null;
  const entryPeriod = input.entryPeriod && Number.isInteger(input.entryPeriod) && input.entryPeriod >= 1 && input.entryPeriod <= 20 ? input.entryPeriod : null;
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
