import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Download, Hourglass, ShieldCheck } from "lucide-react";
import { requirePagePermission } from "@/lib/session";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { POLOS } from "@/domain/polos";
import { ROLE_LABELS, STAFF_ROLES } from "@/lib/rbac";
import { MODULE_LABELS, WORK_MODULES, type WorkModule } from "@/domain/usage/modules";
import { formatDuration, lastDayKeys, resolveUsagePeriod } from "@/domain/usage/metrics";
import { getTeamUsage, TREND_DAYS, type ModuleSummary, type StaffRole } from "@/services/usage/team-usage";
import { ManagementTabs } from "@/features/usage/management-tabs";
import { UsageFilters } from "@/features/usage/usage-filters";
import { TeamUsageTable } from "@/features/usage/team-table";
import { initials } from "@/features/usage/format";
import { MiniBars, UsageRhythm } from "@/features/usage/visuals";
import { MODULE_COLORS } from "@/features/usage/palette";
import { AttentionPanel, type AttentionKind } from "@/features/usage/attention-panel";

const ATTENTION_KINDS: AttentionKind[] = ["never", "idle", "grades", "analyses", "academic"];
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Uso da equipe" };
export const dynamic = "force-dynamic";

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);
const isStaffRole = (value: string | undefined): value is StaffRole => Boolean(value && (STAFF_ROLES as readonly string[]).includes(value));
const isWorkModule = (value: string | undefined): value is WorkModule => Boolean(value && (WORK_MODULES as readonly string[]).includes(value));

export default async function TeamUsagePage({ searchParams }: PageProps<"/management/team-usage">) {
  await requirePagePermission("audit:read");
  const params = await searchParams;
  const now = new Date();
  const period = resolveUsagePeriod({ period: one(params.period), from: one(params.from), to: one(params.to) }, now);
  const role = isStaffRole(one(params.role)) ? (one(params.role) as StaffRole) : undefined;
  const polo = POLOS.some((item) => item.code === one(params.polo)) ? one(params.polo) : undefined;
  const focus = isWorkModule(one(params.module)) ? (one(params.module) as WorkModule) : undefined;
  const report = await getTeamUsage({ from: period.from, to: period.to, role, polo, module: focus }, now);
  const trendDays = lastDayKeys(now, TREND_DAYS);

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ period: one(params.period), from: one(params.from), to: one(params.to), role, polo, module: focus })) if (value) query.set(key, value);
  const queryString = query.toString();
  const moduleHref = (module?: WorkModule) => {
    const next = new URLSearchParams(query);
    if (module && module !== focus) next.set("module", module);
    else next.delete("module");
    const text = next.toString();
    return `/management/team-usage${text ? `?${text}` : ""}#equipe`;
  };
  const adoption = report.accounts ? Math.round((report.active7d / report.accounts) * 100) : 0;
  const attention = ATTENTION_KINDS.includes(one(params.attn) as AttentionKind) ? (one(params.attn) as AttentionKind) : undefined;
  const attentionHref = (kind?: AttentionKind) => {
    const next = new URLSearchParams(query);
    if (kind) next.set("attn", kind);
    const text = next.toString();
    return `/management/team-usage${text ? `?${text}` : ""}#atencao`;
  };
  const personHref = (id: string) => `/management/team-usage/${id}${queryString ? `?${queryString}` : ""}`;

  return (
    <>
      <PageHeader
        eyebrow="Gestão"
        title="Uso da equipe"
        description="Quem realmente usa a análise curricular, as grades comerciais e o sistema acadêmico — tempo ativo, telas e ações de cada pessoa."
        actions={
          <a href={`/api/management/team-usage/export${queryString ? `?${queryString}` : ""}`} className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Download className="size-4" /> Exportar CSV
          </a>
        }
      />
      <ManagementTabs active="/management/team-usage" />
      <UsageFilters
        period={period.key}
        fromDay={period.fromDay}
        toDay={period.toDay}
        role={role}
        polo={polo}
        module={focus}
        roles={STAFF_ROLES.map((value) => ({ value, label: ROLE_LABELS[value] }))}
        polos={POLOS.map((item) => ({ value: item.code, label: item.name }))}
        modules={WORK_MODULES.map((value) => ({ value, label: MODULE_LABELS[value] }))}
      />

      <section aria-label="Resumo de uso" className="relative mt-5 overflow-hidden rounded-2xl border border-brand-cyan/30 bg-[radial-gradient(circle_at_12%_0%,rgba(6,147,227,0.42),transparent_45%),linear-gradient(135deg,#00284d,#071426)] p-5 text-white shadow-xl sm:p-6">
        <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-brand-cyan/15 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">Online agora</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-5xl font-bold tabular-nums">{report.online.length}</span>
              <span className="text-sm text-slate-300">de {report.accounts} {report.accounts === 1 ? "conta" : "contas"}</span>
            </div>
            {report.online.length ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {report.online.map((person) => (
                  <li key={person.id}>
                    <Link href={`/management/team-usage/${person.id}${queryString ? `?${queryString}` : ""}`} className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 py-1 pl-1 pr-3 text-xs transition-colors hover:bg-white/20">
                      <span className="relative flex size-6 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-brand-navy">
                        {initials(person.name)}
                        <span aria-hidden="true" className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-[#00284d] bg-status-success" />
                      </span>
                      <span className="max-w-32 truncate">{person.name.split(" ")[0]}</span>
                      {person.module && <span className="text-cyan-200">· {MODULE_LABELS[person.module]}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-300">Ninguém usando o sistema neste momento.</p>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <HeroMetric label="Ativos hoje" value={report.activeToday} detail={`de ${report.accounts} contas`} />
            <HeroMetric label="Ativos em 7 dias" value={report.active7d} detail={`${adoption}% de adoção`} />
            <HeroMetric label="Ativos em 30 dias" value={report.active30d} detail={`${report.accounts - report.active30d} sem uso`} />
            <HeroMetric label="Tempo ativo" value={formatDuration(report.activeSeconds)} detail={focus ? `${MODULE_LABELS[focus]} · ${period.label.toLocaleLowerCase("pt-BR")}` : period.label} />
            <HeroMetric label="Ações de trabalho" value={report.actions} detail={focus ? MODULE_LABELS[focus] : "análises, grades, alunos…"} />
            <HeroMetric label="Logins" value={report.logins} detail={period.label} />
          </dl>
        </div>
      </section>

      <AttentionPanel report={report} active={attention} hrefFor={attentionHref} personHref={personHref} />

      <section aria-label="Uso por módulo" className="mt-6 grid gap-4 lg:grid-cols-3">
        {report.modules.map((summary) => (
          <ModuleCard key={summary.module} summary={summary} active={focus === summary.module} dimmed={Boolean(focus && focus !== summary.module)} href={moduleHref(summary.module)} trendDays={trendDays} />
        ))}
      </section>
      <p className="mt-3 text-right text-sm">
        <Link href={`/management/team-usage/grades${queryString ? `?${queryString}` : ""}`} className="inline-flex items-center gap-1 font-medium text-brand-cyan-700 hover:underline">
          Ver quais grades cada pessoa usou <ArrowUpRight className="size-4" />
        </Link>
      </p>

      <section id="equipe" className="mt-6 scroll-mt-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Equipe</h2>
            <p className="text-sm text-muted-foreground">
              {report.activeInPeriod} de {report.accounts} {report.accounts === 1 ? "pessoa usou" : "pessoas usaram"} o sistema · {period.label.toLocaleLowerCase("pt-BR")}
              {focus ? ` · ordenado por ${MODULE_LABELS[focus]}` : ""}
            </p>
          </div>
          {focus && <Link href={moduleHref()} className="text-sm font-medium text-brand-cyan-700 hover:underline">Ver todos os módulos</Link>}
        </div>
        <TeamUsageTable people={report.people} trendDays={trendDays} query={queryString} focusLabel={focus ? MODULE_LABELS[focus] : undefined} />
      </section>

      <section className="mt-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Hourglass className="size-4 text-brand-cyan-700" /> Quando a equipe trabalha</CardTitle>
            <p className="text-xs text-muted-foreground">Tempo ativo por horário e por dia da semana (horário de Porto Velho) · {period.label.toLocaleLowerCase("pt-BR")}{focus ? ` · ${MODULE_LABELS[focus]}` : ""}.</p>
          </CardHeader>
          <CardContent>
            <UsageRhythm grid={report.heatmap} />
          </CardContent>
        </Card>
      </section>

      <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-cyan-700" />
        O registro guarda só telas, tempo ativo e ações de trabalho da equipe — nunca o que é digitado nem dados de alunos. Sessões de &quot;Acessar como&quot; não contam. Linha do tempo detalhada por 180 dias; totais por hora por 2 anos.
      </p>
    </>
  );
}

function HeroMetric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/7 p-3">
      <dt className="text-xs font-medium text-cyan-100">{label}</dt>
      <dd className="mt-1 text-2xl font-bold tabular-nums text-white">{value}</dd>
      <dd className="mt-0.5 truncate text-[11px] text-slate-300">{detail}</dd>
    </div>
  );
}

function ModuleCard({ summary, active, dimmed, href, trendDays }: { summary: ModuleSummary; active: boolean; dimmed: boolean; href: string; trendDays: string[] }) {
  const color = MODULE_COLORS[summary.module];
  const keyActions = summary.actions.slice(0, 3);
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group flex flex-col rounded-2xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "ring-2 ring-brand-navy",
        dimmed && "opacity-60 hover:opacity-100",
      )}
      style={{ borderTopWidth: 4, borderTopColor: color }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">{summary.label}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{active ? "Filtrando a equipe por este módulo" : "Toque para ver a equipe por este módulo"}</p>
        </div>
        <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs text-muted-foreground">Pessoas ativas</dt>
          <dd className="text-2xl font-bold tabular-nums text-slate-900">{summary.people}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Tempo ativo</dt>
          <dd className="text-2xl font-bold tabular-nums text-slate-900">{formatDuration(summary.activeSeconds)}</dd>
        </div>
      </dl>
      <ul className="mt-3 space-y-1 text-sm">
        {keyActions.length ? (
          keyActions.map((action) => (
            <li key={action.name} className="flex items-baseline justify-between gap-3">
              <span className="truncate text-slate-600">{action.plural.charAt(0).toUpperCase() + action.plural.slice(1)}</span>
              <span className="font-semibold tabular-nums text-slate-900">{action.count}</span>
            </li>
          ))
        ) : (
          <li className="text-muted-foreground">Nenhuma ação registrada no período.</li>
        )}
      </ul>
      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
        <div className="min-w-0 text-xs text-muted-foreground">
          {summary.top.length ? (
            <>Quem mais usa: <span className="font-medium text-slate-700">{summary.top.map((person) => person.name.split(" ")[0]).join(", ")}</span></>
          ) : (
            "Ninguém usou no período."
          )}
        </div>
        <MiniBars values={summary.trend} days={trendDays} color={color} label={`Uso de ${summary.label}`} width={96} height={30} />
      </div>
    </Link>
  );
}
