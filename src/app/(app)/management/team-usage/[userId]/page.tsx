import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock3, LogIn, MonitorSmartphone, MousePointerClick, Zap } from "lucide-react";
import { z } from "zod";
import { requirePagePermission } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/rbac";
import { formatDateTime } from "@/lib/time";
import { MODULE_LABELS } from "@/domain/usage/modules";
import { formatDuration, resolveUsagePeriod } from "@/domain/usage/metrics";
import { getPersonUsage } from "@/services/usage/team-usage";
import { ManagementTabs } from "@/features/usage/management-tabs";
import { StatusChip } from "@/features/usage/team-table";
import { initials } from "@/features/usage/format";
import { DailyStackedBars, ModuleLegend, ModuleSplitBar } from "@/features/usage/visuals";
import { MODULE_COLORS } from "@/features/usage/palette";

export const metadata: Metadata = { title: "Uso de uma pessoa" };
export const dynamic = "force-dynamic";

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);
const timeOnly = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Porto_Velho", hour: "2-digit", minute: "2-digit" });

export default async function PersonUsagePage({ params, searchParams }: PageProps<"/management/team-usage/[userId]">) {
  await requirePagePermission("audit:read");
  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) notFound();
  const query = await searchParams;
  const now = new Date();
  // Detalhe: mínimo de 30 dias, para a série diária fazer sentido mesmo vindo do filtro "Hoje" ou "7 dias".
  const chosen = resolveUsagePeriod({ period: one(query.period), from: one(query.from), to: one(query.to) }, now);
  const period = chosen.key === "today" || chosen.key === "7d" ? resolveUsagePeriod({ period: "30d" }, now) : chosen;
  const detail = await getPersonUsage(userId, { from: period.from, to: period.to }, now);
  if (!detail) notFound();
  const { person, daily, topScreens, sessions, timeline } = detail;
  const back = new URLSearchParams();
  for (const key of ["period", "from", "to", "role", "polo", "module"]) {
    const value = one(query[key]);
    if (value) back.set(key, value);
  }
  const backHref = `/management/team-usage${back.toString() ? `?${back.toString()}` : ""}`;
  const workSeconds = person.moduleSeconds.CURRICULAR + person.moduleSeconds.GRADES + person.moduleSeconds.ACADEMIC;
  const totalSeconds = Object.values(person.moduleSeconds).reduce((sum, value) => sum + value, 0);

  return (
    <>
      <ManagementTabs active="/management/team-usage" />
      <Link href={backHref} className="mb-4 flex w-fit items-center gap-1.5 text-sm font-medium text-brand-cyan-700 hover:underline">
        <ArrowLeft className="size-4" /> Voltar ao uso da equipe
      </Link>

      <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-brand-navy text-lg font-semibold text-white">{initials(person.name)}</span>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-900">{person.name}</h1>
              <p className="text-sm text-muted-foreground">{ROLE_LABELS[person.role]}{person.poloName ? ` · ${person.poloName}` : ""}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusChip kind={person.status.kind} label={person.status.label} />
                {person.online && person.currentScreen && <span className="text-xs text-muted-foreground">agora em {person.currentScreen}</span>}
                {!person.online && person.lastSeenAt && <span className="text-xs text-muted-foreground">último acesso {formatDateTime(person.lastSeenAt)}</span>}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground sm:text-right">{period.label}{period !== chosen ? " (mínimo para o detalhe)" : ""}</p>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric icon={Clock3} label="Tempo ativo" value={formatDuration(totalSeconds)} detail={`${formatDuration(workSeconds)} nos módulos de trabalho`} />
          <Metric icon={MonitorSmartphone} label="Dias com uso" value={String(person.activeDays)} detail={period.label.toLocaleLowerCase("pt-BR")} />
          <Metric icon={Zap} label="Ações de trabalho" value={String(person.actions)} detail={person.highlights[0] ?? "nenhuma no período"} />
          <Metric icon={LogIn} label="Logins" value={String(person.logins)} detail={`${sessions.length} sessões recentes`} />
        </dl>
        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground"><span>Onde o tempo foi usado</span><ModuleLegend includeOther /></div>
          <ModuleSplitBar seconds={person.moduleSeconds} className="h-3" />
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
            {(["CURRICULAR", "GRADES", "ACADEMIC"] as const).map((module) => (
              <li key={module} className="text-muted-foreground">{MODULE_LABELS[module]}: <span className="font-semibold text-slate-800">{formatDuration(person.moduleSeconds[module])}</span> · {person.moduleActions[module]} {person.moduleActions[module] === 1 ? "ação" : "ações"}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Tempo ativo por dia</CardTitle>
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">Empilhado por módulo · passe o mouse sobre um dia para ver os valores.</p><ModuleLegend includeOther /></div>
          </CardHeader>
          <CardContent><DailyStackedBars daily={daily} /></CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><MousePointerClick className="size-4 text-brand-cyan-700" /> Telas mais usadas</CardTitle>
            <p className="text-xs text-muted-foreground">Quantas vezes cada tela foi aberta no período.</p>
          </CardHeader>
          <CardContent>
            {topScreens.length ? (
              <ul className="space-y-2.5">
                {topScreens.map((screen) => (
                  <li key={screen.name}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate text-slate-700">{screen.label}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-slate-900">{screen.views}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${(screen.views / topScreens[0].views) * 100}%`, backgroundColor: MODULE_COLORS[screen.module] }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma tela registrada no período. O registro de telas começou com esta versão do painel.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Sessões recentes</CardTitle>
            <p className="text-xs text-muted-foreground">Blocos de uso contínuo (pausas de mais de 30 minutos começam uma nova sessão).</p>
          </CardHeader>
          <CardContent>
            {sessions.length ? (
              <ol className="space-y-3">
                {sessions.map((session) => (
                  <li key={session.start.toISOString()} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium text-slate-900">{formatDateTime(session.start)}{session.end > session.start ? ` – ${timeOnly.format(session.end)}` : ""}</span>
                      <span className="text-xs text-muted-foreground">{[session.screens ? `${session.screens} ${session.screens === 1 ? "tela" : "telas"}` : null, session.actions ? `${session.actions} ${session.actions === 1 ? "ação" : "ações"}` : null, session.login ? "login" : null].filter(Boolean).join(" · ") || "acesso"}</span>
                    </div>
                    {session.modules.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {session.modules.map((module) => (
                          <span key={module} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"><span aria-hidden="true" className="size-2 rounded-[2px]" style={{ backgroundColor: MODULE_COLORS[module] }} />{MODULE_LABELS[module]}</span>
                        ))}
                      </div>
                    )}
                    {session.summary.length > 0 && <p className="mt-1.5 text-xs text-muted-foreground">{session.summary.join(" · ")}</p>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">Sem sessões no período.</p>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Linha do tempo</CardTitle>
            <p className="text-xs text-muted-foreground">Logins, telas abertas e ações, da mais recente para a mais antiga.</p>
          </CardHeader>
          <CardContent>
            {timeline.length ? (
              <ol className="relative space-y-3 border-l border-slate-200 pl-4">
                {timeline.map((item, index) => (
                  <li key={`${item.at.toISOString()}-${index}`} className="relative">
                    <span aria-hidden="true" className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-white" style={{ backgroundColor: item.kind === "login" ? "#64748b" : MODULE_COLORS[item.module] }} />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                      <span className={item.kind === "page" ? "text-slate-600" : "font-medium text-slate-900"}>{item.label}{item.count > 1 && <span className="ml-1 text-xs font-normal text-muted-foreground">×{item.count}</span>}</span>
                      <span className="text-[11px] text-muted-foreground">{formatDateTime(item.at)}</span>
                    </div>
                    {item.module !== "OTHER" && <span className="text-[11px] text-muted-foreground">{MODULE_LABELS[item.module]}</span>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">Nada registrado no período.</p>
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Clock3; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border bg-slate-50/60 p-3">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="size-3.5" /> {label}</dt>
      <dd className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</dd>
      <dd className="mt-0.5 truncate text-[11px] text-muted-foreground">{detail}</dd>
    </div>
  );
}
