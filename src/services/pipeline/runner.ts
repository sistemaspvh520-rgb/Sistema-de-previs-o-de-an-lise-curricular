import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { logger } from "@/lib/logger";
import { pluralize } from "@/lib/utils";
import { getStorage } from "@/services/storage/storage";
import { parsePdf, type LocalExtraction } from "@/services/pdf/parser";
import { getOpenAIClient } from "@/services/openai/client-factory";
import { extractCurriculum } from "@/services/openai/extractor";
import { auditCurriculum } from "@/services/openai/auditor";
import { OpenAIIntegrationError, mapOpenAIError } from "@/services/openai/errors";
import { recordUsage } from "@/services/openai/usage";
import { getSystemSettings } from "@/repositories/settings-repository";
import { getRuleSetById } from "@/repositories/rules-repository";
import { normalizeExtraction } from "@/services/pipeline/normalize";
import { crossCheckWithLocalTable, readHeaderMetadata } from "@/services/pipeline/cross-check";
import { computeAndPersist, finalizeStatus } from "@/services/pipeline/compute";
import { parseSteps, STEP_ORDER, type ProcessingStep, type StepKey } from "@/services/pipeline/steps";
import type { AnalysisStatus } from "@/generated/prisma/enums";

class StepFailure extends Error {
  constructor(
    readonly step: StepKey,
    readonly code: string,
    message: string,
    readonly aiError: boolean,
  ) {
    super(message);
    this.name = "StepFailure";
  }
}

async function setStep(analysisId: string, steps: ProcessingStep[], key: StepKey, status: ProcessingStep["status"], message?: string, analysisStatus?: AnalysisStatus) {
  const now = new Date().toISOString();
  for (const s of steps) {
    if (s.key === key) {
      s.status = status;
      if (status === "running") s.startedAt = now;
      if (status === "done" || status === "error" || status === "skipped") s.finishedAt = now;
      if (message !== undefined) s.message = message;
    }
  }
  await prisma.curricularAnalysis.update({
    where: { id: analysisId },
    data: { processingSteps: steps as unknown as Prisma.InputJsonValue, ...(analysisStatus ? { status: analysisStatus } : {}) },
  });
}

function stepsAfter(steps: ProcessingStep[], from: StepKey): Set<StepKey> {
  const idx = STEP_ORDER.indexOf(from);
  return new Set(STEP_ORDER.slice(idx));
}

/**
 * runAnalysisPipeline — executa (ou retoma) o fluxo completo de uma análise.
 * Cada etapa persiste status + processingSteps. Falhas de OpenAI viram AI_ERROR (retomável);
 * outras falhas viram FAILED. O PDF e a extração local nunca são perdidos.
 */
export async function runAnalysisPipeline(analysisId: string): Promise<void> {
  const analysis = await prisma.curricularAnalysis.findUnique({ where: { id: analysisId }, include: { document: true } });
  if (!analysis || !analysis.document) {
    logger.error("pipeline.missing_analysis", { analysisId });
    return;
  }
  const steps = parseSteps(analysis.processingSteps);

  // Retomada: começa da primeira etapa não concluída
  const firstPending = STEP_ORDER.find((k) => {
    const s = steps.find((x) => x.key === k);
    return !s || s.status !== "done";
  }) ?? "PARSING";
  const todo = stepsAfter(steps, firstPending);
  // Reset visual das etapas que serão reexecutadas
  for (const s of steps) if (todo.has(s.key)) { s.status = "pending"; s.message = undefined; s.startedAt = undefined; s.finishedAt = undefined; }
  await prisma.curricularAnalysis.update({
    where: { id: analysisId },
    data: { processingSteps: steps as unknown as Prisma.InputJsonValue, errorCode: null, errorMessage: null },
  });

  const settings = await getSystemSettings();
  const storage = getStorage();
  const document = analysis.document;
  const ruleSet = await getRuleSetById(analysis.ruleSetVersionId);
  let bytes: Buffer | null = null;
  const loadBytes = async () => (bytes ??= await storage.read(document.storageKey));
  let local: LocalExtraction | null = (document.localExtraction as unknown as LocalExtraction | null) ?? null;

  try {
    // ---------------- PARSING ----------------
    if (todo.has("PARSING")) {
      await setStep(analysisId, steps, "PARSING", "running", undefined, "PARSING");
      try {
        local = await parsePdf(await loadBytes(), { maxPages: settings.maxPdfPages });
        await prisma.uploadedDocument.update({
          where: { id: document.id },
          data: { localExtraction: local as unknown as Prisma.InputJsonValue, pageCount: local.pageCount },
        });
        await setStep(analysisId, steps, "PARSING", "done", `${local.pageCount} página(s)`);
      } catch {
        throw new StepFailure("PARSING", "PDF_PARSE_ERROR", "Não foi possível ler o conteúdo do PDF.", false);
      }
    }

    // ---------------- EXTRACTING (OpenAI) ----------------
    if (todo.has("EXTRACTING")) {
      await setStep(analysisId, steps, "EXTRACTING", "running", undefined, "AI_EXTRACTION");
      let clientBundle;
      try {
        clientBundle = await getOpenAIClient();
      } catch (err) {
        const mapped = mapOpenAIError(err);
        throw new StepFailure("EXTRACTING", mapped.code, mapped.message, true);
      }
      const { client, config } = clientBundle;
      const started = Date.now();
      try {
        const out = await extractCurriculum(client, {
          model: config.extractionModel,
          privacyMode: settings.aiPrivacyMode,
          documentBytes: await loadBytes(),
          filename: document.originalName,
          localExtraction: local,
        });
        await prisma.aIExtraction.create({
          data: {
            analysisId,
            model: out.model,
            promptVersion: out.promptVersion,
            privacyMode: settings.aiPrivacyMode,
            rawOutput: out.data as unknown as Prisma.InputJsonValue,
            durationMs: out.durationMs,
            status: "OK",
          },
        });
        await recordUsage({ analysisId, operation: "CURRICULUM_EXTRACTION", model: out.model, ...out.usage });

        // ---------------- CLASSIFYING (normalização + status) ----------------
        await setStep(analysisId, steps, "EXTRACTING", "done", `${out.data.subjects.length} linha(s) identificada(s)`);
        await setStep(analysisId, steps, "CLASSIFYING", "running", undefined, "NORMALIZING");
        const normalized = normalizeExtraction(out.data, document.id, local);

        // Período de ingresso: o informado no envio (USER) é a fonte oficial; o cabeçalho do PDF ("Série: N",
        // leitura local) e a IA só preenchem quando ele não foi informado — e geram alerta quando divergem.
        const header = readHeaderMetadata(local);
        const aiDetected = out.data.document.detectedEntryPeriod;
        const detected = header.entryPeriod ?? aiDetected;
        const entryPeriod = analysis.entryPeriod ?? detected ?? ruleSet.rules.entryPeriodDefault ?? null;
        const entryPeriodSource = analysis.entryPeriod !== null ? "USER" : detected !== null ? "DOCUMENT" : ruleSet.rules.entryPeriodDefault !== null ? "RULE" : null;
        const extraWarnings = crossCheckWithLocalTable(local, normalized);
        if (header.entryPeriod !== null && aiDetected !== null && header.entryPeriod !== aiDetected) {
          extraWarnings.push({ code: "ENTRY_PERIOD_CONFLICT", severity: "CRITICAL", source: "EXTRACTION", message: `Período de ingresso divergente no documento: cabeçalho "Série: ${header.entryPeriod}" × IA ${aiDetected}.`, sourcePage: 1 });
        }

        await prisma.$transaction(async (tx) => {
          await tx.analyzedSubject.deleteMany({ where: { analysisId } });
          await tx.documentClaim.deleteMany({ where: { analysisId } });
          if (normalized.length) {
            await tx.analyzedSubject.createMany({
              data: normalized.map((n) => ({
                analysisId,
                rowHash: n.rowHash,
                code: n.code,
                name: n.name,
                workload: n.workload,
                period: n.period,
                usedSubject: n.usedSubject,
                status: n.status,
                readability: n.readability,
                sourcePage: n.sourcePage,
                sourceRow: n.sourceRow,
                bbox: n.bbox ? (n.bbox as unknown as Prisma.InputJsonValue) : undefined,
                origin: "AI",
                note: n.note,
                sortIndex: n.sortIndex,
              })),
            });
          }
          if (out.data.documentClaims.length) {
            await tx.documentClaim.createMany({
              data: out.data.documentClaims.map((c) => ({ analysisId, type: c.type, value: c.value, sourcePage: c.sourcePage, rawText: c.rawText })),
            });
          }
          if (detected !== null) {
            await tx.documentClaim.create({
              data: {
                analysisId,
                type: "ENTRY_PERIOD",
                value: detected,
                sourcePage: 1,
                rawText: header.entryPeriod !== null ? `Cabeçalho do documento: "Série: ${header.entryPeriod}"` : (out.data.document.detectedEntryPeriodEvidence ?? ""),
              },
            });
          }
          await tx.curricularAnalysis.update({
            where: { id: analysisId },
            data: {
              courseName: header.course ?? out.data.document.course,
              matrixLabel: header.matrix ?? out.data.document.matrix,
              campus: header.campus ?? out.data.document.campus,
              modality: header.modality ?? out.data.document.modality,
              candidateLabel: out.data.document.candidateLabel,
              entryPeriod,
              entryPeriodSource,
              extractionModel: out.model,
              extractorPromptVersion: out.promptVersion,
            },
          });
        });
        const exempted = normalized.filter((n) => n.status === "EXEMPTED").length;
        await setStep(analysisId, steps, "CLASSIFYING", "done", `${exempted} dispensada(s), ${normalized.length - exempted} pendente(s)/a revisar`);
        // Alertas persistentes desta etapa (ambiguidades da IA + cruzamento local × IA). O recálculo preserva a fonte EXTRACTION.
        await prisma.analysisWarning.deleteMany({ where: { analysisId, source: "EXTRACTION" } });
        const extractionWarnings = [
          ...out.data.ambiguities.map((a) => ({ code: "EXTRACTOR_AMBIGUITY", severity: "WARNING" as const, message: a.message, sourcePage: a.sourcePage as number | null })),
          ...extraWarnings.map((w) => ({ code: w.code, severity: w.severity, message: w.message, sourcePage: w.sourcePage ?? null })),
        ];
        if (extractionWarnings.length) {
          await prisma.analysisWarning.createMany({
            data: extractionWarnings.map((w) => ({ analysisId, code: w.code, severity: w.severity, source: "EXTRACTION" as const, message: w.message, sourcePage: w.sourcePage })),
          });
        }
      } catch (err) {
        const mapped = err instanceof OpenAIIntegrationError ? err : mapOpenAIError(err);
        await prisma.aIExtraction.create({
          data: { analysisId, model: config.extractionModel, promptVersion: "n/a", privacyMode: settings.aiPrivacyMode, durationMs: Date.now() - started, status: "ERROR", errorCode: mapped.code },
        }).catch(() => undefined);
        throw new StepFailure("EXTRACTING", mapped.code, mapped.message, true);
      }
    }

    // ---------------- CALCULATING + SIMULATING ----------------
    if (todo.has("CALCULATING")) {
      await setStep(analysisId, steps, "CALCULATING", "running", undefined, "CALCULATING");
      const result = await computeAndPersist(analysisId, { resetAuditorWarnings: true });
      await setStep(analysisId, steps, "CALCULATING", "done", pluralize(result.totals.pending + result.totals.review, "disciplina pendente", "disciplinas pendentes"));
      await setStep(analysisId, steps, "SIMULATING", "running");
      if (result.simulation) {
        await setStep(analysisId, steps, "SIMULATING", "done", `${result.simulation.semesters.length} semestre(s)`);
      } else {
        await setStep(analysisId, steps, "SIMULATING", "skipped", "período de ingresso precisa ser confirmado");
      }
    }

    // ---------------- AUDITING (OpenAI) ----------------
    if (todo.has("AUDITING")) {
      await setStep(analysisId, steps, "AUDITING", "running", undefined, "AI_AUDIT");
      try {
        const { client, config } = await getOpenAIClient();
        const current = await prisma.curricularAnalysis.findUniqueOrThrow({ where: { id: analysisId }, include: { claims: true } });
        const computed = await computeAndPersist(analysisId); // garante consistência do snapshot enviado
        const out = await auditCurriculum(client, {
          model: config.auditModel,
          privacyMode: settings.aiPrivacyMode,
          documentBytes: await loadBytes(),
          filename: document.originalName,
          localExtraction: local,
          subjects: computed.subjects,
          totals: computed.totals,
          entryPeriod: current.entryPeriod,
          simulation: computed.simulation,
          claims: computed.claims,
        });
        await prisma.$transaction(async (tx) => {
          await tx.aIReview.create({
            data: { analysisId, model: out.model, promptVersion: out.promptVersion, status: out.data.status, issues: out.data.issues as unknown as Prisma.InputJsonValue, durationMs: out.durationMs },
          });
          await tx.analysisWarning.deleteMany({ where: { analysisId, source: "AUDITOR" } });
          if (out.data.issues.length) {
            const byHash = new Map(computed.subjects.map((s) => [s.id, s.id]));
            const subjects = await tx.analyzedSubject.findMany({ where: { analysisId }, select: { id: true, rowHash: true } });
            const hashToId = new Map(subjects.map((s) => [s.rowHash, s.id]));
            await tx.analysisWarning.createMany({
              data: out.data.issues.map((i) => ({
                analysisId,
                code: `AUDITOR_${i.code}`,
                severity: i.severity,
                source: "AUDITOR" as const,
                message: i.message,
                subjectId: i.subjectRowHash ? (hashToId.get(i.subjectRowHash) ?? byHash.get(i.subjectRowHash) ?? null) : null,
                sourcePage: i.sourcePage,
              })),
            });
          }
          await tx.curricularAnalysis.update({ where: { id: analysisId }, data: { auditModel: out.model, auditorPromptVersion: out.promptVersion } });
        });
        await recordUsage({ analysisId, operation: "AUDIT", model: out.model, ...out.usage });
        await setStep(analysisId, steps, "AUDITING", "done", out.data.status === "OK" ? "nenhum problema apontado" : `${out.data.issues.length} apontamento(s)`);
      } catch (err) {
        const mapped = mapOpenAIError(err);
        throw new StepFailure("AUDITING", mapped.code, mapped.message, true);
      }
    }

    // ---------------- VALIDATING (2ª passada) + FINALIZING ----------------
    await setStep(analysisId, steps, "VALIDATING", "running", undefined, "VALIDATING");
    await computeAndPersist(analysisId);
    await setStep(analysisId, steps, "VALIDATING", "done");
    await setStep(analysisId, steps, "FINALIZING", "running");
    const final = await finalizeStatus(analysisId);
    await setStep(analysisId, steps, "FINALIZING", "done", final.reviewItemsCount > 0 ? pluralize(final.reviewItemsCount, "observação registrada", "observações registradas") : "análise concluída");
    logger.info("pipeline.completed", { analysisId, status: final.status, reliability: final.reliability });
  } catch (err) {
    if (err instanceof StepFailure) {
      await setStep(analysisId, steps, err.step, "error", err.message, err.aiError ? "AI_ERROR" : "FAILED");
      await prisma.curricularAnalysis.update({ where: { id: analysisId }, data: { errorCode: err.code, errorMessage: err.message } });
      logger.warn("pipeline.step_failed", { analysisId, step: err.step, code: err.code });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    const running = steps.find((s) => s.status === "running");
    if (running) await setStep(analysisId, steps, running.key, "error", "Erro interno.", "FAILED");
    else await prisma.curricularAnalysis.update({ where: { id: analysisId }, data: { status: "FAILED" } });
    await prisma.curricularAnalysis.update({ where: { id: analysisId }, data: { errorCode: "INTERNAL_ERROR", errorMessage: "Erro interno durante o processamento." } });
    logger.error("pipeline.failed", { analysisId, err: message });
  }
}

/**
 * recalculateAnalysis — após correção manual ou confirmação de período de ingresso.
 * Reexecuta motor + validador + status sem novo upload e sem OpenAI.
 */
export async function recalculateAnalysis(analysisId: string): Promise<void> {
  const analysis = await prisma.curricularAnalysis.findUniqueOrThrow({ where: { id: analysisId } });
  const steps = parseSteps(analysis.processingSteps);
  await setStep(analysisId, steps, "CALCULATING", "running", undefined, "CALCULATING");
  const result = await computeAndPersist(analysisId);
  await setStep(analysisId, steps, "CALCULATING", "done", pluralize(result.totals.pending + result.totals.review, "disciplina pendente", "disciplinas pendentes"));
  if (result.simulation) await setStep(analysisId, steps, "SIMULATING", "done", `${result.simulation.semesters.length} semestre(s)`);
  else await setStep(analysisId, steps, "SIMULATING", "skipped", "período de ingresso precisa ser confirmado");
  await setStep(analysisId, steps, "VALIDATING", "done");
  await setStep(analysisId, steps, "FINALIZING", "running");
  const final = await finalizeStatus(analysisId);
  await setStep(analysisId, steps, "FINALIZING", "done", final.reviewItemsCount > 0 ? pluralize(final.reviewItemsCount, "observação registrada", "observações registradas") : "análise concluída");
}
