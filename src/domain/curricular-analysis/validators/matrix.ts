import type { AnalysisWarningInput, SubjectRow } from "@/domain/curricular-analysis/types";

export interface OfficialMatrixSubject {
  name: string;
  workload: number;
  period: number;
}

export interface MatrixComparison {
  missingInDocument: OfficialMatrixSubject[];
  extraInDocument: SubjectRow[];
  periodMismatches: Array<{ subject: SubjectRow; officialPeriod: number }>;
  workloadMismatches: Array<{ subject: SubjectRow; officialWorkload: number }>;
  matchRate: number;
  warnings: AnalysisWarningInput[];
}

function key(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/**
 * compareWithOfficialMatrix — PDF versus matriz oficial (§57). Só gera alertas; nunca altera.
 * Casamento por nome normalizado (várias ocorrências do mesmo nome são casadas em ordem).
 */
export function compareWithOfficialMatrix(subjects: SubjectRow[], matrix: OfficialMatrixSubject[]): MatrixComparison {
  const officialByKey = new Map<string, OfficialMatrixSubject[]>();
  for (const m of matrix) {
    const k = key(m.name);
    officialByKey.set(k, [...(officialByKey.get(k) ?? []), m]);
  }
  const missing: OfficialMatrixSubject[] = [];
  const extra: SubjectRow[] = [];
  const periodMismatches: MatrixComparison["periodMismatches"] = [];
  const workloadMismatches: MatrixComparison["workloadMismatches"] = [];
  let matched = 0;

  for (const s of subjects) {
    const list = officialByKey.get(key(s.name));
    const official = list?.shift();
    if (!official) {
      extra.push(s);
      continue;
    }
    matched++;
    if (official.period !== s.period) periodMismatches.push({ subject: s, officialPeriod: official.period });
    if (official.workload !== s.workload) workloadMismatches.push({ subject: s, officialWorkload: official.workload });
  }
  for (const list of officialByKey.values()) missing.push(...list);

  const warnings: AnalysisWarningInput[] = [];
  for (const m of missing) {
    warnings.push({ code: "MATRIX_SUBJECT_MISSING", severity: "WARNING", source: "MATRIX", message: `Disciplina da matriz oficial ausente no PDF: "${m.name}" (${m.period}º período).` });
  }
  for (const s of extra) {
    warnings.push({ code: "MATRIX_SUBJECT_EXTRA", severity: "WARNING", source: "MATRIX", message: `Disciplina do PDF não consta na matriz oficial: "${s.name}".`, subjectId: s.id, sourcePage: s.sourcePage });
  }
  for (const p of periodMismatches) {
    warnings.push({ code: "MATRIX_PERIOD_MISMATCH", severity: "WARNING", source: "MATRIX", message: `"${p.subject.name}": período ${p.subject.period}º no PDF, ${p.officialPeriod}º na matriz.`, subjectId: p.subject.id, sourcePage: p.subject.sourcePage });
  }
  for (const w of workloadMismatches) {
    warnings.push({ code: "MATRIX_WORKLOAD_MISMATCH", severity: "INFO", source: "MATRIX", message: `"${w.subject.name}": C.H. ${w.subject.workload}h no PDF, ${w.officialWorkload}h na matriz.`, subjectId: w.subject.id, sourcePage: w.subject.sourcePage });
  }
  const matchRate = matrix.length ? matched / matrix.length : 0;
  if (matrix.length && matchRate < 0.5) {
    warnings.push({ code: "MATRIX_POSSIBLY_WRONG", severity: "CRITICAL", source: "MATRIX", message: `Apenas ${Math.round(matchRate * 100)}% das disciplinas da matriz foram encontradas no PDF. A matriz vinculada pode estar incorreta.` });
  }
  return { missingInDocument: missing, extraInDocument: extra, periodMismatches, workloadMismatches, matchRate, warnings };
}
