import "server-only";

import type { AcademicGridSnapshot } from "@/domain/academic-analysis/types";
import { applyHistoryPeriodInference } from "@/domain/academic-analysis/history-period-inference";
import { assignHistoryPeriodsWithAI } from "@/services/academic-analysis/ai-period-mapping";
import { getOpenAIClient } from "@/services/openai/client-factory";
import { recordUsage } from "@/services/openai/usage";
import { logger } from "@/lib/logger";

export type HistoryMappingMethod = "HEURISTIC" | "AI" | "NONE";

export function isHistorySnapshot(snapshot: AcademicGridSnapshot): boolean {
  return snapshot.documentType === "SIMPLE_ACADEMIC_HISTORY" || snapshot.documentType === "OFFICIAL_ACADEMIC_HISTORY";
}

export function historyNeedsMapping(snapshot: AcademicGridSnapshot): boolean {
  return (
    isHistorySnapshot(snapshot) &&
    (!snapshot.result.currentPeriodConfirmed ||
      snapshot.disciplines.some((row) => row.inMainCurriculum && row.sourcePage > 0 && row.period === null))
  );
}

/**
 * Mapeia os períodos curriculares de um histórico: primeiro pela estrutura do
 * documento (determinístico), depois com IA quando a estrutura não for conclusiva.
 */
export async function autoMapHistorySnapshot(
  snapshot: AcademicGridSnapshot,
  opts: { allowAI: boolean },
): Promise<{ snapshot: AcademicGridSnapshot; method: HistoryMappingMethod; mappedRows: number }> {
  if (!historyNeedsMapping(snapshot)) return { snapshot, method: "NONE", mappedRows: 0 };
  const heuristic = applyHistoryPeriodInference(snapshot);
  if (heuristic.applied) return { snapshot: heuristic.snapshot, method: "HEURISTIC", mappedRows: heuristic.mappedRows };
  if (!opts.allowAI) return { snapshot, method: "NONE", mappedRows: 0 };

  const ordered = snapshot.disciplines
    .filter((row) => row.sourcePage > 0)
    .sort((a, b) => a.sourcePage - b.sourcePage || a.sourceRow - b.sourceRow);
  if (ordered.length < 4 || ordered.length > 200) return { snapshot, method: "NONE", mappedRows: 0 };
  try {
    const { client, config } = await getOpenAIClient({ timeoutMs: 60_000, maxRetries: 1 });
    const result = await assignHistoryPeriodsWithAI({
      client,
      model: config.extractionModel,
      courseName: snapshot.courseName,
      rows: ordered.map((row) => ({ name: row.name, academicTerm: row.academicTerm, status: row.originalStatus })),
    });
    await recordUsage({ operation: "DOCUMENT_EXTRACTION", model: config.extractionModel, ...result.usage }).catch(() => undefined);
    if (!result.periods) return { snapshot, method: "NONE", mappedRows: 0 };
    const assisted = applyHistoryPeriodInference(snapshot, result.periods);
    return assisted.applied
      ? { snapshot: assisted.snapshot, method: "AI", mappedRows: assisted.mappedRows }
      : { snapshot, method: "NONE", mappedRows: 0 };
  } catch (error) {
    logger.warn("academic_analysis.history_ai_mapping.failed", { errorName: error instanceof Error ? error.name : "unknown" });
    return { snapshot, method: "NONE", mappedRows: 0 };
  }
}
