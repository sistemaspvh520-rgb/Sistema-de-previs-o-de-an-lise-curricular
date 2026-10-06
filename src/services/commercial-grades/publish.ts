import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getStorage } from "@/services/storage/storage";
import { recordAudit } from "@/services/audit-log/audit-log";
import { cleanReadingText, readCommercialGrade, type CommercialGradeReading } from "@/services/commercial-grades/reader";

/** A Vercel recusa corpos acima de ~4,5 MB antes de a função rodar; matrizes reais têm dezenas de KB. */
export const COMMERCIAL_GRADE_MAX_MB = 4;
export const COMMERCIAL_GRADE_PREFIX = "commercial-grades";

/** `warning`: há algo para o time conferir (divergência IA × PDF, dado faltando ou IA indisponível). */
export type PublishAction = "created" | "updated" | "unchanged";
export type PublishResult = { ok: true; id: string; message: string; warning: boolean; action: PublishAction } | { ok: false; error: string; status: number };

const refuse = (error: string, status = 422): PublishResult => ({ ok: false, error, status });

/**
 * Lê o PDF e publica a grade no catálogo. Com `replaceId`, substitui a grade existente (mantém uma só por matriz).
 * Com `upsert` (envio em lote), o mesmo PDF já publicado vira "sem mudança" e uma grade do mesmo curso e modalidade
 * (mesmo com vigência diferente) é atualizada em vez de recusada.
 * Erros de negócio voltam como `{ ok: false }`; falhas inesperadas sobem para quem chamou registrar.
 */
export async function publishCommercialGrade(input: { bytes: Buffer; filename: string; userId: string; replaceId?: string; upsert?: boolean; useAi?: boolean }): Promise<PublishResult> {
  const { bytes, filename, userId, replaceId, upsert, useAi } = input;
  let previous = replaceId ? await prisma.commercialGrade.findUnique({ where: { id: replaceId }, select: { id: true, storageKey: true } }) : null;
  if (replaceId && !previous) return refuse("Grade não encontrada.", 404);

  const contentHash = fingerprint(bytes);
  const sameFile = await prisma.commercialGrade.findFirst({ where: { contentHash, ...(replaceId ? { NOT: { id: replaceId } } : {}) }, select: { id: true, courseName: true } });
  if (sameFile && upsert && !replaceId) return { ok: true, id: sameFile.id, warning: false, action: "unchanged", message: `“${sameFile.courseName}” já estava atualizada (mesmo PDF).` };
  if (sameFile) return refuse(replaceId ? `Este PDF já pertence à grade “${sameFile.courseName}”.` : `Este mesmo PDF já está disponível como “${sameFile.courseName}”.`, 409);

  const reading = await readCommercialGrade(bytes, filename, { useAi });
  const courseName = reading.courseName || cleanReadingText(filename.replace(/\.pdf$/i, ""), 180) || "Grade sem nome";
  const catalogKey = fingerprint(`${normalizeCatalogValue(courseName)}|${normalizeCatalogValue(reading.modality)}|${normalizeCatalogValue(reading.curriculumTerm)}`);
  if (upsert && !previous) {
    // Mesmo curso e modalidade: é a nova versão da matriz. Prefere a de mesma vigência; senão, a mais recente.
    const candidates = await prisma.commercialGrade.findMany({ where: { courseName: { equals: courseName, mode: "insensitive" } }, select: { id: true, storageKey: true, modality: true, curriculumTerm: true, updatedAt: true }, orderBy: { updatedAt: "desc" } });
    const sameModality = candidates.filter((item) => normalizeCatalogValue(item.modality) === normalizeCatalogValue(reading.modality));
    previous = sameModality.find((item) => normalizeCatalogValue(item.curriculumTerm) === normalizeCatalogValue(reading.curriculumTerm)) ?? sameModality[0] ?? null;
  }
  const sameMatrix = await prisma.commercialGrade.findFirst({
    where: { ...(previous ? { NOT: { id: previous.id } } : {}), OR: [{ catalogKey }, { courseName, modality: reading.modality, curriculumTerm: reading.curriculumTerm }] },
    select: { courseName: true, curriculumTerm: true },
  });
  if (sameMatrix) return refuse(`Já existe uma matriz de “${sameMatrix.courseName}”${sameMatrix.curriculumTerm ? ` (${sameMatrix.curriculumTerm})` : ""}. Exclua a versão anterior antes de ${previous ? "atualizar" : "publicar outra"}.`, 409);

  const stored = await getStorage().save(bytes, { extension: "pdf", prefix: COMMERCIAL_GRADE_PREFIX });
  const data = gradeData(reading, { courseName, contentHash, catalogKey, originalName: filename, storageKey: stored.key, sizeBytes: stored.sizeBytes, uploadedById: userId });
  let id: string;
  try {
    id = previous
      ? (await prisma.commercialGrade.update({ where: { id: previous.id }, data, select: { id: true } })).id
      : (await prisma.commercialGrade.create({ data, select: { id: true } })).id;
  } catch (error) {
    // Sem registro no catálogo o PDF seria um arquivo órfão.
    await getStorage().delete(stored.key).catch(() => undefined);
    throw error;
  }
  if (previous) await getStorage().delete(previous.storageKey).catch(() => undefined);
  try {
    await recordAudit({ userId, action: previous ? "commercial_grade.update" : "commercial_grade.upload", entityType: "CommercialGrade", entityId: id, metadata: { courseName, originalName: filename, degree: reading.degree, knowledgeArea: reading.knowledgeArea, durationSemesters: reading.durationSemesters, hasTcc: reading.hasTcc, totalInternshipHours: reading.totalInternshipHours, source: reading.source, aiNote: reading.aiNote ?? null, checkedWithPdf: reading.checkedWithPdf ?? false, divergences: reading.divergences ?? [] } });
  } catch (error) {
    // A grade já está publicada: uma falha só na auditoria não deve acusar erro ao usuário.
    logger.error("commercial_grade.audit_failed", { id, error: String(error) });
  }
  const notice = publishMessage(reading, Boolean(previous));
  return { ok: true, id, message: notice.message, warning: notice.warning, action: previous ? "updated" : "created" };
}

/** Mensagem ao publicar: diz quem leu a grade (IA conferida com o PDF, só o PDF) e o que o time precisa conferir. */
export function publishMessage(reading: Pick<CommercialGradeReading, "source" | "aiNote" | "complete" | "checkedWithPdf" | "divergences">, updated: boolean): { message: string; warning: boolean } {
  const done = updated ? "Grade atualizada" : "Grade disponibilizada";
  if (reading.divergences?.length)
    return { warning: true, message: `${done}, mas a IA e a leitura do PDF divergiram em: ${reading.divergences.join("; ")}. Mantivemos o que está no PDF; confira antes do envio.` };
  if (reading.source === "AI")
    return { warning: false, message: reading.checkedWithPdf ? `${done}: lida pela IA e conferida com o PDF.` : `${done}: lida pela IA; confira os dados antes do envio.` };
  const why = reading.aiNote ? ` (IA indisponível: ${reading.aiNote})` : "";
  if (reading.complete !== false)
    return { warning: Boolean(reading.aiNote), message: `${done}: lida do PDF${why}; confira os dados antes do envio.` };
  return { warning: true, message: `${done}, mas o PDF não trouxe todos os dados (curso, carga horária ou duração)${why}; revise antes do envio.` };
}

function gradeData(reading: CommercialGradeReading, own: { courseName: string; contentHash: string; catalogKey: string; originalName: string; storageKey: string; sizeBytes: number; uploadedById: string }) {
  return {
    ...own,
    modality: reading.modality, curriculumTerm: reading.curriculumTerm, degree: reading.degree, knowledgeArea: reading.knowledgeArea,
    durationSemesters: reading.durationSemesters, courseTracks: reading.courseTracks, internshipInfo: reading.internshipInfo, hasTcc: reading.hasTcc,
    totalInternshipHours: reading.totalInternshipHours, totalCourseHours: reading.totalCourseHours, whatsappSummary: reading.whatsappSummary,
  };
}

/** Arquivos do bucket sem grade correspondente (ex.: envios que falharam antes da correção). Ignora os recém-criados, que podem estar sendo gravados. */
export async function findOrphanGradeFiles(now = Date.now()): Promise<string[]> {
  const [files, rows] = await Promise.all([getStorage().list(COMMERCIAL_GRADE_PREFIX), prisma.commercialGrade.findMany({ select: { storageKey: true } })]);
  const known = new Set(rows.map((row) => row.storageKey));
  return files.filter((file) => !known.has(file.key) && now - file.createdAt.getTime() > 10 * 60 * 1000).map((file) => file.key);
}

export async function removeOrphanGradeFiles(): Promise<number> {
  const orphans = await findOrphanGradeFiles();
  let removed = 0;
  for (const key of orphans) {
    // Reconfere logo antes de apagar: se uma grade passou a usar o arquivo, ele fica.
    if (await prisma.commercialGrade.findUnique({ where: { storageKey: key }, select: { id: true } })) continue;
    await getStorage().delete(key).then(() => { removed += 1; }).catch((error) => logger.warn("commercial_grade.orphan_delete_failed", { key, error: String(error) }));
  }
  return removed;
}

function fingerprint(value: Buffer | string) { return createHash("sha256").update(value).digest("hex"); }
function normalizeCatalogValue(value: string | null | undefined) { return (value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase(); }
