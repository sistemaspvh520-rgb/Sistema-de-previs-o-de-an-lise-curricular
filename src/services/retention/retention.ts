import "server-only";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/services/storage/storage";
import { logger } from "@/lib/logger";

/**
 * Rotina de retenção (LGPD): remove o arquivo físico dos documentos vencidos e marca deletedAt.
 * Os dados estruturados da análise permanecem.
 */
export async function runRetention(now = new Date()): Promise<{ checked: number; deleted: number; failed: number }> {
  const due = await prisma.uploadedDocument.findMany({
    where: { deletedAt: null, deleteAfter: { not: null, lte: now } },
    select: { id: true, storageKey: true, analysisId: true },
    take: 500,
  });
  const storage = getStorage();
  let deleted = 0;
  let failed = 0;
  for (const d of due) {
    try {
      await storage.delete(d.storageKey);
      await prisma.uploadedDocument.update({ where: { id: d.id }, data: { deletedAt: now, localExtraction: undefined } });
      deleted++;
    } catch (err) {
      failed++;
      logger.error("retention.delete_failed", { documentId: d.id, err: String(err) });
    }
  }
  logger.info("retention.run", { checked: due.length, deleted, failed });
  return { checked: due.length, deleted, failed };
}

/** Exclusão imediata após processamento (política DELETE_AFTER_PROCESSING). */
export async function deleteDocumentFileNow(analysisId: string): Promise<void> {
  const doc = await prisma.uploadedDocument.findUnique({ where: { analysisId } });
  if (!doc || doc.deletedAt) return;
  await getStorage().delete(doc.storageKey);
  await prisma.uploadedDocument.update({ where: { id: doc.id }, data: { deletedAt: new Date() } });
}
