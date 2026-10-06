import type { TeamUsageReport } from "@/services/usage/team-usage";

/**
 * Problemas de uso por pessoa. Vermelho = não usa o sistema; âmbar = não usa a parte que é sua.
 * Dados puros (sem componentes): servem à faixa de filtros, à tabela da equipe e ao filtro por URL.
 */
export type AttentionKind = "never" | "idle" | "grades" | "analyses" | "academic";
export type AttentionTone = "danger" | "warning";

export const ATTENTION_KINDS: Array<{ kind: AttentionKind; title: string; caption: string; tone: AttentionTone }> = [
  { kind: "never", title: "Nunca acessaram", caption: "não usam o sistema", tone: "danger" },
  { kind: "idle", title: "Parados há 14+ dias", caption: "não usam o sistema", tone: "danger" },
  { kind: "grades", title: "Sem uso das grades", caption: "no período", tone: "warning" },
  { kind: "analyses", title: "Analistas sem análises", caption: "no período", tone: "warning" },
  { kind: "academic", title: "Tutores sem uso acadêmico", caption: "com alunos, na semana", tone: "warning" },
];

export interface AttentionFlag {
  kind: AttentionKind;
  label: string;
  tone: AttentionTone;
}

export function isAttentionKind(value: string | undefined): value is AttentionKind {
  return ATTENTION_KINDS.some((item) => item.kind === value);
}

const toneOf = (kind: AttentionKind): AttentionTone => ATTENTION_KINDS.find((item) => item.kind === kind)!.tone;

/** Todas as etiquetas de problema de cada pessoa (mesmo id pode ter várias). */
export function attentionFlags(report: TeamUsageReport): Record<string, AttentionFlag[]> {
  const flags: Record<string, AttentionFlag[]> = {};
  const add = (id: string, kind: AttentionKind, label: string) => {
    (flags[id] ??= []).push({ kind, label, tone: toneOf(kind) });
  };
  const { attention } = report;
  for (const person of attention.neverAccessed) add(person.id, "never", "Nunca acessou");
  for (const person of attention.idle) add(person.id, "idle", `Parado há ${person.days} dias`);
  for (const person of attention.withoutGrades) add(person.id, "grades", "Sem uso das grades");
  for (const person of attention.analystsWithoutAnalyses) add(person.id, "analyses", "Sem análises no período");
  for (const person of attention.tutorsWithoutAcademic) add(person.id, "academic", `Sem uso acadêmico · ${person.students} ${person.students === 1 ? "aluno" : "alunos"}`);
  return flags;
}

export function attentionCounts(flags: Record<string, AttentionFlag[]>): Record<AttentionKind, number> {
  const counts: Record<AttentionKind, number> = { never: 0, idle: 0, grades: 0, analyses: 0, academic: 0 };
  for (const list of Object.values(flags)) for (const flag of list) counts[flag.kind] += 1;
  return counts;
}

/** Pessoas distintas com algum problema (para o selo do título). */
export const flaggedPeople = (flags: Record<string, AttentionFlag[]>) => Object.keys(flags).length;


/** Classes da etiqueta de problema (usadas na tabela da equipe). */
export const FLAG_CHIP_CLASS: Record<AttentionTone, string> = {
  danger: "bg-status-danger-bg text-status-danger ring-status-danger/20",
  warning: "bg-status-warning-bg text-status-warning ring-status-warning/20",
};
