import type { LocalExtraction } from "@/services/pdf/parser";
import { effectiveRows } from "@/services/pdf/table-detector";
import { hasValidUsedSubject } from "@/domain/curricular-analysis/engine/classify";
import type { SubjectRow } from "@/domain/curricular-analysis/types";
import type { CurriculumAudit } from "@/services/openai/schemas";

export const LOCAL_AUDIT_MODEL = "auditoria-local";
export const LOCAL_AUDIT_VERSION = "local-audit-1.0";

export interface LocalAuditClaimMismatch {
  type: string;
  value: number | null;
  calculatedValue: number | null;
  sourcePage: number;
}

export interface LocalAuditInput {
  subjects: SubjectRow[];
  /** Linhas corrigidas manualmente: não são comparadas com o PDF. */
  manualIds: ReadonlySet<string>;
  local: LocalExtraction | null;
  claimMismatches: LocalAuditClaimMismatch[];
}

type Issue = CurriculumAudit["issues"][number];

const CLAIM_LABEL: Record<string, string> = {
  PENDING_TOTAL: "disciplinas pendentes",
  EXEMPTED_TOTAL: "disciplinas dispensadas",
  TOTAL_SUBJECTS: "disciplinas no total",
};

function flat(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Auditoria local (sem IA): segunda conferência determinística que compara a análise gravada com a
 * tabela reconstruída do próprio PDF e com os totais declarados no documento. Só aponta; nunca altera dados.
 */
export function auditCurriculumLocally(input: LocalAuditInput): CurriculumAudit {
  const issues: Issue[] = [];
  const { subjects, manualIds, local } = input;
  const auto = subjects.filter((s) => !manualIds.has(s.id));

  // 1) Tabela reconstruída do PDF × linhas da análise (mesma página/linha).
  const rows = local?.table ? effectiveRows(local.table) : [];
  if (rows.length > 0) {
    const byPosition = new Map(auto.map((s) => [`${s.sourcePage}:${s.sourceRow}`, s]));
    const seen = new Set<string>();
    for (const row of rows) {
      const key = `${row.page}:${row.rowIndex}`;
      const subject = byPosition.get(key);
      if (!subject) {
        if (!subjects.some((s) => manualIds.has(s.id) && flat(s.name) === flat(row.name))) {
          issues.push({ code: "POSSIBLE_MISSING_ROW", severity: "CRITICAL", subjectRowHash: null, sourcePage: row.page, message: `A disciplina "${row.name}" (página ${row.page}) está na tabela do PDF, mas não consta na análise.` });
        }
        continue;
      }
      seen.add(key);
      if (row.period !== null && row.period > 0 && row.period !== subject.period) {
        issues.push({ code: "WRONG_PERIOD", severity: "CRITICAL", subjectRowHash: subject.id, sourcePage: row.page, message: `"${subject.name}": o PDF indica o ${row.period}º período e a análise ficou com o ${subject.period}º.` });
      }
      if (row.workload !== null && row.workload > 0 && row.workload !== subject.workload) {
        issues.push({ code: "WRONG_WORKLOAD", severity: "WARNING", subjectRowHash: subject.id, sourcePage: row.page, message: `"${subject.name}": o PDF indica ${row.workload}h e a análise ficou com ${subject.workload}h.` });
      }
      if (subject.status !== "REVIEW" && hasValidUsedSubject(row.usedSubject) !== (subject.status === "EXEMPTED")) {
        issues.push({ code: "WRONG_STATUS", severity: "CRITICAL", subjectRowHash: subject.id, sourcePage: row.page, message: subject.status === "EXEMPTED" ? `"${subject.name}" está como dispensada, mas o PDF não traz disciplina utilizada.` : `"${subject.name}" está como pendente, mas o PDF traz "${row.usedSubject}" como disciplina utilizada.` });
      }
    }
    for (const subject of auto) {
      if (!seen.has(`${subject.sourcePage}:${subject.sourceRow}`)) {
        issues.push({ code: "TABLE_TEXT_INCONSISTENCY", severity: "WARNING", subjectRowHash: subject.id, sourcePage: subject.sourcePage, message: `"${subject.name}" está na análise, mas não foi encontrada na tabela reconstruída do PDF (página ${subject.sourcePage}, linha ${subject.sourceRow}).` });
      }
    }
  }

  // 2) Linhas repetidas (mesma disciplina e período).
  const firstByKey = new Map<string, SubjectRow>();
  for (const subject of subjects) {
    const key = `${flat(subject.name)}|${subject.period}`;
    const first = firstByKey.get(key);
    if (first) {
      issues.push({ code: "POSSIBLE_DUPLICATE_ROW", severity: "WARNING", subjectRowHash: subject.id, sourcePage: subject.sourcePage, message: `"${subject.name}" (${subject.period}º período) aparece mais de uma vez (páginas ${first.sourcePage} e ${subject.sourcePage}).` });
    } else firstByKey.set(key, subject);
  }

  // 3) Totais declarados no documento × totais calculados.
  for (const claim of input.claimMismatches) {
    issues.push({ code: "TOTAL_MISMATCH", severity: "WARNING", subjectRowHash: null, sourcePage: claim.sourcePage, message: `O PDF declara ${claim.value ?? "?"} ${CLAIM_LABEL[claim.type] ?? "itens"} e o cálculo chegou a ${claim.calculatedValue ?? "?"}.` });
  }

  return { status: issues.length === 0 ? "OK" : "REVIEW", issues };
}
