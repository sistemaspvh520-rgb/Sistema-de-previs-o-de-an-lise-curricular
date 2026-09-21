import type { LocalExtraction } from "@/services/pdf/parser";
import { effectiveRows } from "@/services/pdf/table-detector";
import { hasValidUsedSubject } from "@/domain/curricular-analysis/engine/classify";
import type { AnalysisWarningInput } from "@/domain/curricular-analysis/types";
import type { NormalizedSubject } from "@/services/pipeline/normalize";

/**
 * Cruzamento determinístico entre a tabela reconstruída localmente (camada 2) e a extração da IA (camada 3).
 * Não altera nada; gera alertas para revisão quando as duas leituras divergem.
 */
export function crossCheckWithLocalTable(local: LocalExtraction | null, subjects: NormalizedSubject[]): AnalysisWarningInput[] {
  const rows = local?.table ? effectiveRows(local.table) : [];
  if (rows.length === 0) return [];
  const warnings: AnalysisWarningInput[] = [];

  if (rows.length !== subjects.length) {
    warnings.push({
      code: "LOCAL_ROW_COUNT_MISMATCH",
      severity: "CRITICAL",
      source: "VALIDATOR",
      message: `O parser local reconstruiu ${rows.length} linha(s) na tabela, mas a IA extraiu ${subjects.length}. Confira omissões ou duplicações.`,
    });
  }

  const byCode = new Map(subjects.filter((s) => s.code).map((s) => [s.code as string, s]));
  for (const r of rows) {
    if (!r.code) continue;
    const s = byCode.get(r.code);
    if (!s) {
      warnings.push({
        code: "LOCAL_ROW_NOT_EXTRACTED",
        severity: "CRITICAL",
        source: "VALIDATOR",
        message: `Linha "${r.name}" (código ${r.code}, p.${r.page}) existe na tabela do PDF mas não foi extraída pela IA.`,
        sourcePage: r.page,
      });
      continue;
    }
    if (r.period !== null && r.period !== s.period) {
      warnings.push({ code: "LOCAL_PERIOD_MISMATCH", severity: "CRITICAL", source: "VALIDATOR", message: `"${s.name}": série ${r.period} no PDF (leitura local) × ${s.period} na extração da IA.`, sourcePage: r.page });
    }
    if (r.workload !== null && r.workload !== s.workload) {
      warnings.push({ code: "LOCAL_WORKLOAD_MISMATCH", severity: "WARNING", source: "VALIDATOR", message: `"${s.name}": C.H. ${r.workload} no PDF (leitura local) × ${s.workload} na extração da IA.`, sourcePage: r.page });
    }
    const localExempted = hasValidUsedSubject(r.usedSubject);
    const aiExempted = hasValidUsedSubject(s.usedSubject);
    if (localExempted !== aiExempted) {
      warnings.push({
        code: "LOCAL_USED_SUBJECT_MISMATCH",
        severity: "CRITICAL",
        source: "VALIDATOR",
        message: `"${s.name}": Disciplina Utilizada ${localExempted ? `"${r.usedSubject}"` : "vazia"} no PDF (leitura local) × ${aiExempted ? `"${s.usedSubject}"` : "vazia"} na IA.`,
        sourcePage: r.page,
      });
    }
  }
  return warnings;
}

/** Período de ingresso e metadados lidos deterministicamente do cabeçalho ("Série: 4", "Curso: ...", "Grade: ..."). */
export function readHeaderMetadata(local: LocalExtraction | null): { entryPeriod: number | null; course: string | null; matrix: string | null; campus: string | null; modality: string | null } {
  const f = local?.headerFields ?? {};
  const serie = f["serie"] ?? f["série"];
  const n = serie ? Number(serie.replace(/[^0-9]/g, "")) : NaN;
  return {
    entryPeriod: Number.isInteger(n) && n >= 1 && n <= 20 ? n : null,
    course: f["curso"] ?? null,
    matrix: f["grade"] ?? f["matriz"] ?? null,
    campus: f["campus"] ?? null,
    modality: f["periodo"] ?? f["modalidade"] ?? null,
  };
}
