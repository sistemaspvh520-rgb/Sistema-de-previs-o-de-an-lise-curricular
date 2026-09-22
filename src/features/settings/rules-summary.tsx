import type { AcademicRules } from "@/domain/curricular-analysis/rules/types";

function describeAdditional(rule: AcademicRules["additionalSemesterCapacityRule"]): string {
  switch (rule.type) {
    case "SAME_AS_LAST_PERIOD": return "Mesma capacidade do último período";
    case "FIXED_VALUE": return `${rule.value} disciplinas`;
    case "CUSTOM_RULE": return `${rule.regular} regulares + ${rule.extra} extras`;
    default: return "Não configurada";
  }
}

/** Regras acadêmicas em vigor (somente leitura): definidas pela instituição e versionadas com cada análise. */
export function RulesSummary({ rules, version }: { rules: AcademicRules; version: string }) {
  const rows: Array<[string, string]> = [
    ["Disciplinas extras por semestre", `+${rules.extraSubjectsAllowed}`],
    ["Teto de disciplinas por semestre", rules.maximumSubjectsPerSemester === null ? "Período + extras" : String(rules.maximumSubjectsPerSemester)],
    ["Semestre adicional", describeAdditional(rules.additionalSemesterCapacityRule)],
    ["Ordem das pendências", rules.backlogOrdering === "OLDEST_FIRST" ? "Período mais antigo primeiro" : rules.backlogOrdering],
    ["Disciplinas 'Revisar'", rules.reviewCountsAsPending ? "Contam como pendentes" : "Não contam como pendentes"],
    ["Unidade da série", rules.periodUnit === "SEMESTER" ? "Semestre" : "Ano"],
  ];
  return (
    <dl className="divide-y text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-4 py-2">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right font-medium">{value}</dd>
        </div>
      ))}
      <div className="pt-2 text-xs text-muted-foreground">Versão {version} · confirmada com a equipe acadêmica. Alterações passam pela equipe técnica (seed de regras), nunca pela tela.</div>
    </dl>
  );
}
