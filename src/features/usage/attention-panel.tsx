import Link from "next/link";
import { BookOpen, CircleCheck, CircleSlash, FileX2, GraduationCap, Siren, UserX, type LucideIcon } from "lucide-react";
import { ATTENTION_KINDS, type AttentionKind, type AttentionTone } from "@/features/usage/attention";
import { cn } from "@/lib/utils";

/**
 * "Pedem atenção": só os blocos de contagem, que funcionam como filtros da tabela da Equipe logo abaixo (a lista de
 * pessoas é uma só). Cor sempre acompanhada de ícone e texto.
 */
export const ATTENTION_ICONS: Record<AttentionKind, LucideIcon> = {
  never: CircleSlash,
  idle: UserX,
  grades: BookOpen,
  analyses: FileX2,
  academic: GraduationCap,
};

export const TONE = {
  danger: { tile: "border-status-danger/30 bg-status-danger-bg/60", bar: "bg-status-danger", icon: "bg-status-danger text-white", text: "text-status-danger", chip: "bg-status-danger-bg text-status-danger ring-status-danger/20" },
  warning: { tile: "border-status-warning/30 bg-status-warning-bg/60", bar: "bg-status-warning", icon: "bg-status-warning text-white", text: "text-status-warning", chip: "bg-status-warning-bg text-status-warning ring-status-warning/20" },
} satisfies Record<AttentionTone, Record<string, string>>;

export function AttentionPanel({ counts, flagged, accounts, active, hrefFor }: { counts: Record<AttentionKind, number>; flagged: number; accounts: number; active?: AttentionKind; hrefFor: (kind?: AttentionKind) => string }) {
  if (!flagged) {
    return (
      <section id="atencao" aria-label="Pedem atenção" className="mt-6 flex items-center gap-4 rounded-2xl border border-status-success/30 bg-status-success-bg/60 p-5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-status-success text-white"><CircleCheck className="size-6" /></span>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Tudo em dia</h2>
          <p className="text-sm text-slate-600">Ninguém da equipe pede atenção: todos acessam e usam a parte que é sua.</p>
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
              <span className="rounded-full bg-status-warning px-2.5 py-0.5 text-sm font-bold text-white tabular-nums">{flagged}</span>
            </h2>
            <p className="text-sm text-muted-foreground">{flagged} de {accounts} {accounts === 1 ? "pessoa" : "pessoas"}. Toque num bloco para filtrar a tabela da equipe.</p>
          </div>
        </div>
        {active && <Link href={hrefFor()} scroll={false} className="text-sm font-medium text-brand-cyan-700 hover:underline">Ver todos</Link>}
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-5">
        {ATTENTION_KINDS.map(({ kind, title, caption, tone }) => {
          const count = counts[kind];
          const Icon = ATTENTION_ICONS[kind];
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
    </section>
  );
}
