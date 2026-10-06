import Link from "next/link";
import { BookOpen, CircleCheck, CircleSlash, FileX2, GraduationCap, Siren, UserX, type LucideIcon } from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import { ROLE_LABELS } from "@/lib/rbac";
import type { TeamUsageReport } from "@/services/usage/team-usage";
import { initials } from "@/features/usage/format";
import { cn } from "@/lib/utils";

/**
 * "Pedem atenção": blocos por problema (com contagem, clicáveis para filtrar) e um card por pessoa com TODOS os
 * problemas dela — a mesma pessoa não se repete em listas diferentes. Vermelho = não usa o sistema; âmbar = não usa
 * a parte que é sua. Cor sempre acompanhada de ícone e texto.
 */

export type AttentionKind = "never" | "idle" | "grades" | "analyses" | "academic";
type Tone = "danger" | "warning";

const KINDS: Array<{ kind: AttentionKind; title: string; caption: string; tone: Tone; icon: LucideIcon }> = [
  { kind: "never", title: "Nunca acessaram", caption: "não usam o sistema", tone: "danger", icon: CircleSlash },
  { kind: "idle", title: "Parados há 14+ dias", caption: "não usam o sistema", tone: "danger", icon: UserX },
  { kind: "grades", title: "Sem uso das grades", caption: "no período", tone: "warning", icon: BookOpen },
  { kind: "analyses", title: "Analistas sem análises", caption: "no período", tone: "warning", icon: FileX2 },
  { kind: "academic", title: "Tutores sem uso acadêmico", caption: "com alunos, na semana", tone: "warning", icon: GraduationCap },
];

const TONE = {
  danger: { tile: "border-status-danger/30 bg-status-danger-bg/60", bar: "bg-status-danger", icon: "bg-status-danger text-white", text: "text-status-danger", chip: "bg-status-danger-bg text-status-danger ring-status-danger/20", avatar: "bg-status-danger text-white" },
  warning: { tile: "border-status-warning/30 bg-status-warning-bg/60", bar: "bg-status-warning", icon: "bg-status-warning text-white", text: "text-status-warning", chip: "bg-status-warning-bg text-status-warning ring-status-warning/20", avatar: "bg-status-warning text-white" },
} as const;

interface Issue {
  kind: AttentionKind;
  label: string;
  tone: Tone;
  icon: LucideIcon;
}

interface Flagged {
  id: string;
  name: string;
  role: Role;
  poloName: string | null;
  issues: Issue[];
  idleDays: number;
}

function flagged(report: TeamUsageReport): Flagged[] {
  const byId = new Map<string, Flagged>();
  const people = new Map(report.people.map((person) => [person.id, person]));
  const add = (id: string, name: string, role: Role, kind: AttentionKind, label: string, idleDays = 0) => {
    const meta = KINDS.find((item) => item.kind === kind)!;
    const current = byId.get(id) ?? { id, name, role, poloName: people.get(id)?.poloName ?? null, issues: [], idleDays: 0 };
    current.issues.push({ kind, label, tone: meta.tone, icon: meta.icon });
    current.idleDays = Math.max(current.idleDays, idleDays);
    byId.set(id, current);
  };
  const { attention } = report;
  for (const person of attention.neverAccessed) add(person.id, person.name, person.role, "never", "Nunca acessou");
  for (const person of attention.idle) add(person.id, person.name, person.role, "idle", `Parado há ${person.days} dias`, person.days);
  for (const person of attention.withoutGrades) add(person.id, person.name, person.role, "grades", "Sem uso das grades");
  for (const person of attention.analystsWithoutAnalyses) add(person.id, person.name, "ANALYST", "analyses", "Sem análises no período");
  for (const person of attention.tutorsWithoutAcademic) add(person.id, person.name, "TUTOR", "academic", `Sem uso acadêmico · ${person.students} ${person.students === 1 ? "aluno" : "alunos"}`);
  const severity = (item: Flagged) => (item.issues.some((issue) => issue.kind === "never") ? 3 : item.issues.some((issue) => issue.tone === "danger") ? 2 : 1);
  return [...byId.values()].sort((a, b) => severity(b) - severity(a) || b.issues.length - a.issues.length || b.idleDays - a.idleDays || a.name.localeCompare(b.name, "pt-BR"));
}

export function AttentionPanel({ report, active, hrefFor, personHref }: { report: TeamUsageReport; active?: AttentionKind; hrefFor: (kind?: AttentionKind) => string; personHref: (id: string) => string }) {
  const all = flagged(report);
  const counts = new Map(KINDS.map(({ kind }) => [kind, all.filter((item) => item.issues.some((issue) => issue.kind === kind)).length]));
  const visible = active ? all.filter((item) => item.issues.some((issue) => issue.kind === active)) : all;

  if (!all.length) {
    return (
      <section id="atencao" aria-label="Pedem atenção" className="mt-6 flex items-center gap-4 rounded-2xl border border-status-success/30 bg-status-success-bg/60 p-5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-status-success text-white"><CircleCheck className="size-6" /></span>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Tudo em dia</h2>
          <p className="text-sm text-slate-600">Ninguém da equipe pede atenção no período: todos acessam e usam a parte que é sua.</p>
        </div>
      </section>
    );
  }

  return (
    <section id="atencao" aria-label="Pedem atenção" className="mt-6 scroll-mt-6 overflow-hidden rounded-2xl border border-status-warning/30 bg-card shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-status-warning/20 bg-gradient-to-r from-status-warning-bg via-white to-white px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-status-warning text-white shadow-sm"><Siren className="size-5" /></span>
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              Pedem atenção
              <span className="rounded-full bg-status-warning px-2.5 py-0.5 text-sm font-bold text-white tabular-nums">{all.length}</span>
            </h2>
            <p className="text-sm text-muted-foreground">{all.length === 1 ? "Uma pessoa não está usando" : `${all.length} pessoas não estão usando`} o sistema ou a parte que é sua. Toque num bloco para filtrar.</p>
          </div>
        </div>
        {active && <Link href={hrefFor()} scroll={false} className="text-sm font-medium text-brand-cyan-700 hover:underline">Ver todos</Link>}
      </div>

      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-5">
        {KINDS.map(({ kind, title, caption, tone, icon: Icon }) => {
          const count = counts.get(kind) ?? 0;
          const style = TONE[tone];
          const selected = active === kind;
          return (
            <Link
              key={kind}
              href={selected ? hrefFor() : hrefFor(kind)}
              scroll={false}
              aria-current={selected ? "true" : undefined}
              className={cn(
                "group relative overflow-hidden rounded-xl border p-3 pl-4 transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                count ? style.tile : "border-slate-200 bg-slate-50/60",
                selected && "ring-2 ring-slate-900/70",
                active && !selected && "opacity-60 hover:opacity-100",
              )}
            >
              <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-1", count ? style.bar : "bg-slate-200")} />
              <div className="flex items-start justify-between gap-2">
                <span className={cn("flex size-8 items-center justify-center rounded-lg", count ? style.icon : "bg-slate-200 text-slate-500")}><Icon className="size-4" /></span>
                <span className={cn("text-3xl font-bold leading-none tabular-nums", count ? style.text : "text-slate-400")}>{count}</span>
              </div>
              <div className="mt-2 text-sm font-semibold leading-tight text-slate-900">{title}</div>
              <div className="text-[11px] text-muted-foreground">{count ? caption : "ninguém"}</div>
            </Link>
          );
        })}
      </div>

      <ul className="grid gap-3 border-t bg-slate-50/50 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
        {visible.map((person) => {
          const worst = person.issues.some((issue) => issue.tone === "danger") ? "danger" : "warning";
          return (
            <li key={person.id}>
              <Link href={personHref(person.id)} className={cn("flex h-full gap-3 rounded-xl border bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", worst === "danger" ? "border-status-danger/30" : "border-status-warning/30")}>
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-bold", TONE[worst].avatar)}>{initials(person.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-slate-900">{person.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{ROLE_LABELS[person.role]}{person.poloName ? ` · ${person.poloName}` : ""}</span>
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {person.issues.map(({ kind, label, tone, icon: Icon }) => (
                      <span key={kind} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", TONE[tone].chip)}>
                        <Icon className="size-3" aria-hidden="true" /> {label}
                      </span>
                    ))}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
