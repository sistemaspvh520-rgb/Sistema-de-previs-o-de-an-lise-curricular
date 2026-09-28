import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, FileWarning, GraduationCap, KeyRound, Mail, Rocket, Trash2, UserPlus, Waypoints, type LucideIcon } from "lucide-react";
import type { ActionItem, AdvanceItem, AttentionItem, GraduatingItem, TeamInsights } from "@/services/student-portal/team-insights";
import { readableName } from "@/lib/text";
import { cn } from "@/lib/utils";
import { CopyMessageButton } from "./copy-message-button";

const VISIBLE = 6;

const ACTION_META: Record<ActionItem["kind"], { label: string; icon: LucideIcon; tone: string; cta: string }> = {
  DELETION: { label: "Pedido de exclusão", icon: Trash2, tone: "bg-rose-50 text-rose-700", cta: "Decidir" },
  DOCUMENT: { label: "Documento com falha", icon: FileWarning, tone: "bg-rose-50 text-rose-700", cta: "Ver aluno" },
  MAPPING: { label: "Confirmar mapeamento", icon: Waypoints, tone: "bg-amber-50 text-amber-800", cta: "Abrir análise" },
  NO_ACCESS: { label: "Sem acesso ao portal", icon: UserPlus, tone: "bg-sky-50 text-sky-800", cta: "Criar acesso" },
  INVITE: { label: "Convite não aceito", icon: KeyRound, tone: "bg-violet-50 text-violet-800", cta: "Reenviar" },
  OUTDATED: { label: "Análise desatualizada", icon: CalendarClock, tone: "bg-slate-100 text-slate-700", cta: "Ver aluno" },
};

function Section({ icon: Icon, tone, title, description, count, children, id }: { icon: LucideIcon; tone: string; title: string; description: string; count: number; children: React.ReactNode; id: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", tone)}><Icon className="size-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`${id}-title`} className="text-base font-semibold text-slate-900">{title}</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700">{count}</span>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">{description}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="flex items-center gap-2 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="size-4 shrink-0" /> {children}</p>;
}

/** Mostra os primeiros itens e guarda o restante num "ver todos", para a página não virar um paredão. */
function Collapsible<T>({ items, render, label }: { items: T[]; render: (item: T, index: number) => React.ReactNode; label: string }) {
  const head = items.slice(0, VISIBLE);
  const rest = items.slice(VISIBLE);
  return (
    <>
      <ul className="divide-y divide-slate-100">{head.map(render)}</ul>
      {rest.length > 0 && (
        <details className="group">
          <summary className="mt-2 cursor-pointer list-none text-sm font-semibold text-brand-cyan-700 [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Ver mais {rest.length} {label}</span>
            <span className="hidden group-open:inline">Mostrar menos</span>
          </summary>
          <ul className="divide-y divide-slate-100">{rest.map((item, index) => render(item, index + VISIBLE))}</ul>
        </details>
      )}
    </>
  );
}

function Student({ name, rgm, tutor, showTutor }: { name: string; rgm: string; tutor: string; showTutor: boolean }) {
  return (
    <span className="min-w-0">
      <span className="block truncate font-medium text-slate-900">{readableName(name)}</span>
      <span className="block truncate text-xs text-slate-500">RGM {rgm}{showTutor ? ` · ${tutor}` : ""}</span>
    </span>
  );
}

export function TeamPanel({ insights, showTutor }: { insights: TeamInsights; showTutor: boolean }) {
  const byKind = Object.entries(ACTION_META).map(([kind, meta]) => ({ kind: kind as ActionItem["kind"], meta, count: insights.actions.filter((item) => item.kind === kind).length })).filter((group) => group.count > 0);
  return (
    <div className="space-y-4">
      <Section id="precisa-de-voce" icon={AlertTriangle} tone="bg-amber-50 text-amber-700" title="Precisa de você" description="Só o que depende de uma ação da equipe. Quando tudo estiver em dia, esta lista fica vazia." count={insights.actions.length}>
        {insights.actions.length === 0 ? (
          <Empty>Nada pendente. Todas as análises estão em dia.</Empty>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              {byKind.map(({ kind, meta, count }) => (
                <span key={kind} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", meta.tone)}>
                  <meta.icon className="size-3.5" /> {meta.label} · {count}
                </span>
              ))}
            </div>
            <Collapsible
              items={insights.actions}
              label="itens"
              render={(item: ActionItem, index) => {
                const meta = ACTION_META[item.kind];
                return (
                  <li key={`${item.enrollmentId}-${item.kind}-${index}`} className="flex flex-wrap items-center gap-3 py-3">
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", meta.tone)}><meta.icon className="size-4" /></span>
                    <span className="min-w-0 flex-1 basis-56">
                      <Student name={item.name} rgm={item.rgm} tutor={item.tutor.name} showTutor={showTutor} />
                      <span className="mt-0.5 block text-xs text-slate-600">{item.detail}</span>
                    </span>
                    <Link href={item.href} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-[#003B71] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#07558f]">
                      {meta.cta} <ArrowRight className="size-3.5" />
                    </Link>
                  </li>
                );
              }}
            />
          </>
        )}
      </Section>

      <Section id="podem-avancar" icon={Rocket} tone="bg-sky-50 text-sky-700" title="Podem avançar agora" description="Alunos com pendências e vaga livre neste semestre. Cada inclusão adianta a formatura — vale o contato." count={insights.canAdvance.length}>
        {insights.canAdvance.length === 0 ? (
          <Empty>Nenhum aluno com vaga livre para pendências neste momento.</Empty>
        ) : (
          <Collapsible
            items={insights.canAdvance}
            label="alunos"
            render={(item: AdvanceItem) => (
              <li key={item.enrollmentId} className="flex flex-wrap items-center gap-3 py-3">
                <span className="grid min-w-12 shrink-0 place-items-center rounded-xl bg-sky-50 px-2 py-1.5 text-center text-sky-800">
                  <span className="text-lg font-semibold leading-none tabular-nums">+{item.canAddNow}</span>
                  <span className="text-[10px] font-medium">{item.canAddNow === 1 ? "vaga" : "vagas"}</span>
                </span>
                <span className="min-w-0 flex-1 basis-56">
                  <Student name={item.name} rgm={item.rgm} tutor={item.tutor.name} showTutor={showTutor} />
                  <span className="mt-0.5 block text-xs text-slate-600">{item.pending} {item.pending === 1 ? "pendência anterior" : "pendências anteriores"} · cabe(m) {item.canAddNow} neste semestre</span>
                </span>
                <span className="flex flex-wrap gap-2">
                  <CopyMessageButton message={item.message} />
                  {item.email && (
                    <a href={`mailto:${item.email}?subject=${encodeURIComponent("Você pode adiantar a sua formatura")}&body=${encodeURIComponent(item.message)}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#003B71] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#07558f]">
                      <Mail className="size-3.5" /> Enviar e-mail
                    </a>
                  )}
                  <Link href={`/academic-analysis/students/${item.enrollmentId}`} className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">Ver aluno</Link>
                </span>
              </li>
            )}
          />
        )}
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section id="formandos" icon={GraduationCap} tone="bg-emerald-50 text-emerald-700" title="Formandos à vista" description={`Conclusão prevista até o próximo semestre (atual: ${insights.currentTerm}). Boa hora para formatura e pós-graduação.`} count={insights.graduating.length}>
          {insights.graduating.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">Nenhum aluno com conclusão prevista para os próximos semestres.</p>
          ) : (
            <Collapsible
              items={insights.graduating}
              label="alunos"
              render={(item: GraduatingItem) => (
                <li key={item.enrollmentId} className="flex items-center gap-3 py-3">
                  <Link href={`/academic-analysis/students/${item.enrollmentId}`} className="min-w-0 flex-1 hover:underline"><Student name={item.name} rgm={item.rgm} tutor={item.tutor.name} showTutor={showTutor} /></Link>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-emerald-800">{item.completion}</span>
                </li>
              )}
            />
          )}
        </Section>

        <Section id="atencao" icon={AlertTriangle} tone="bg-rose-50 text-rose-700" title="Atenção" description="Alunos que pedem um acompanhamento mais de perto." count={insights.attention.length}>
          {insights.attention.length === 0 ? (
            <Empty>Nenhum aluno em situação de atenção.</Empty>
          ) : (
            <Collapsible
              items={insights.attention}
              label="alunos"
              render={(item: AttentionItem) => (
                <li key={item.enrollmentId} className="py-3">
                  <Link href={`/academic-analysis/students/${item.enrollmentId}`} className="block hover:underline"><Student name={item.name} rgm={item.rgm} tutor={item.tutor.name} showTutor={showTutor} /></Link>
                  <span className="mt-1.5 flex flex-wrap gap-1.5">
                    {item.reasons.map((reason) => <span key={reason} className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-800">{reason}</span>)}
                  </span>
                </li>
              )}
            />
          )}
        </Section>
      </div>
    </div>
  );
}
