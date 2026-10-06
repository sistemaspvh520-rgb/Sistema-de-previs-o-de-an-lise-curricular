"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowUp, CircleCheck, CircleSlash, Clock3 } from "lucide-react";
import type { UsageModule } from "@/generated/prisma/enums";
import { ROLE_LABELS } from "@/lib/rbac";
import { formatDateTime } from "@/lib/time";
import { MODULE_LABELS } from "@/domain/usage/modules";
import { formatDuration, type PersonStatusKind } from "@/domain/usage/metrics";
import type { PersonUsage } from "@/services/usage/team-usage";
import { MODULE_COLORS } from "@/features/usage/palette";
import { MiniBars, ModuleSplitBar } from "@/features/usage/visuals";
import { initials } from "@/features/usage/format";
import { cn } from "@/lib/utils";

type SortKey = "activeSeconds" | "actions" | "activeDays" | "lastSeenAt" | "name";

/** "29/09, 09:20" — curto para caber na coluna; a data completa fica na dica. */
const shortDateTime = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Porto_Velho", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const STATUS_STYLE: Record<PersonStatusKind, { className: string; icon: typeof CircleCheck | null }> = {
  online: { className: "bg-status-success-bg text-status-success", icon: null },
  today: { className: "bg-status-success-bg text-status-success", icon: CircleCheck },
  recent: { className: "bg-slate-100 text-slate-700", icon: Clock3 },
  idle: { className: "bg-status-warning-bg text-status-warning", icon: AlertTriangle },
  never: { className: "bg-status-danger-bg text-status-danger", icon: CircleSlash },
};

export function StatusChip({ kind, label }: { kind: PersonStatusKind; label: string }) {
  const style = STATUS_STYLE[kind];
  const Icon = style.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", style.className)}>
      {kind === "online" ? (
        <span aria-hidden="true" className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-success opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2 rounded-full bg-status-success" />
        </span>
      ) : (
        Icon && <Icon className="size-3.5" />
      )}
      {label}
    </span>
  );
}

/** Módulo em que a pessoa passou mais tempo, em texto (a barra colorida nunca é a única pista). */
function mainModule(seconds: Record<UsageModule, number>): string | null {
  const [module, value] = (Object.entries(seconds) as Array<[UsageModule, number]>).sort((a, b) => b[1] - a[1])[0] ?? [];
  return module && value > 0 ? MODULE_LABELS[module] : null;
}

export function TeamUsageTable({ people, trendDays, query, focusLabel }: { people: PersonUsage[]; trendDays: string[]; query: string; focusLabel?: string }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "activeSeconds", desc: true });
  const sorted = useMemo(() => {
    const value = (person: PersonUsage): number | string => {
      if (sort.key === "name") return person.name.toLocaleLowerCase("pt-BR");
      if (sort.key === "lastSeenAt") return person.lastSeenAt ? new Date(person.lastSeenAt).getTime() : 0;
      return person[sort.key];
    };
    return [...people].sort((a, b) => {
      const [x, y] = [value(a), value(b)];
      const order = x < y ? -1 : x > y ? 1 : 0;
      return sort.desc ? -order : order;
    });
  }, [people, sort]);

  const header = (key: SortKey, label: string, className?: string) => (
    <th scope="col" className={cn("px-2.5 py-2.5 text-left font-medium", className)} aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"}>
      <button type="button" onClick={() => setSort((current) => ({ key, desc: current.key === key ? !current.desc : key !== "name" }))} className="inline-flex items-center gap-1 rounded hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {label}
        {sort.key === key && (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    </th>
  );
  const href = (id: string) => `/management/team-usage/${id}${query ? `?${query}` : ""}`;

  if (!people.length) return <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">Ninguém encontrado com esses filtros.</p>;

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border bg-card shadow-sm lg:block">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="border-b bg-slate-50/80 text-xs text-muted-foreground">
            <tr>
              {header("name", "Pessoa")}
              {header("lastSeenAt", "Situação")}
              {header("activeSeconds", focusLabel ? `Tempo · ${focusLabel}` : "Tempo ativo")}
              {header("activeDays", "Dias")}
              <th scope="col" className="w-36 px-2.5 py-2.5 text-left font-medium">Onde trabalha</th>
              {header("actions", "Ações")}
              <th scope="col" className="px-2.5 py-2.5 text-left font-medium">14 dias</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((person) => (
              <tr key={person.id} className="group transition-colors hover:bg-brand-cyan-50/40">
                <td className="px-2.5 py-3">
                  <Link href={href(person.id)} className="flex items-center gap-3 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-navy text-xs font-semibold text-white">{initials(person.name)}</span>
                    <span className="min-w-0">
                      <span className="block max-w-48 truncate font-medium text-slate-900 group-hover:underline">{person.name}</span>
                      <span className="block max-w-48 truncate text-xs text-muted-foreground">{ROLE_LABELS[person.role]}{person.poloName ? ` · ${person.poloName}` : ""}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-2.5 py-3">
                  <StatusChip kind={person.status.kind} label={person.status.label} />
                  <div className="mt-1 max-w-40 truncate text-[11px] text-muted-foreground" title={person.lastSeenAt ? `Último acesso: ${formatDateTime(person.lastSeenAt)}` : undefined}>
                    {person.online ? (person.currentScreen ? `em ${person.currentScreen}` : "agora") : person.lastSeenAt ? `visto ${shortDateTime.format(new Date(person.lastSeenAt))}` : "nunca acessou"}
                  </div>
                </td>
                <td className="whitespace-nowrap px-2.5 py-3 font-semibold tabular-nums text-slate-900">{formatDuration(person.activeSeconds)}</td>
                <td className="px-2.5 py-3 tabular-nums text-slate-700">{person.activeDays}</td>
                <td className="px-2.5 py-3">
                  <ModuleSplitBar seconds={person.moduleSeconds} />
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">{mainModule(person.moduleSeconds) ?? "sem tempo ativo"}</div>
                </td>
                <td className="px-2.5 py-3">
                  <div className="font-semibold tabular-nums text-slate-900">{person.actions}</div>
                  <div className="max-w-40 truncate text-[11px] text-muted-foreground" title={person.highlights.join(" · ")}>{person.highlights.join(" · ") || (person.logins ? `${person.logins} login(s)` : "—")}</div>
                </td>
                <td className="px-2.5 py-3"><MiniBars values={person.trend} days={trendDays} label={`Uso de ${person.name}`} width={84} height={26} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-3 lg:hidden">
        {sorted.map((person) => (
          <li key={person.id}>
            <Link href={href(person.id)} className="block rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-brand-cyan-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-navy text-xs font-semibold text-white">{initials(person.name)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-900">{person.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{ROLE_LABELS[person.role]}{person.poloName ? ` · ${person.poloName}` : ""}</div>
                  <div className="mt-2"><StatusChip kind={person.status.kind} label={person.status.label} /></div>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 p-2"><dt className="text-[11px] text-muted-foreground">Tempo</dt><dd className="text-sm font-semibold tabular-nums">{formatDuration(person.activeSeconds)}</dd></div>
                <div className="rounded-lg bg-slate-50 p-2"><dt className="text-[11px] text-muted-foreground">Dias</dt><dd className="text-sm font-semibold tabular-nums">{person.activeDays}</dd></div>
                <div className="rounded-lg bg-slate-50 p-2"><dt className="text-[11px] text-muted-foreground">Ações</dt><dd className="text-sm font-semibold tabular-nums">{person.actions}</dd></div>
              </dl>
              <ModuleSplitBar seconds={person.moduleSeconds} className="mt-3" />
              <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="truncate">{mainModule(person.moduleSeconds) ?? "sem tempo ativo"}</span>
                <span className="shrink-0">{person.lastSeenAt ? formatDateTime(person.lastSeenAt) : "nunca acessou"}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {(["CURRICULAR", "GRADES", "ACADEMIC"] as const).map((module) => (
          <span key={module} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ backgroundColor: MODULE_COLORS[module] }} />{MODULE_LABELS[module]}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ backgroundColor: MODULE_COLORS.OTHER }} />Gestão e configurações</span>
        <span>· Tempo ativo = aba visível com uso real (mouse, teclado ou toque) nos últimos 2 minutos.</span>
      </p>
    </>
  );
}
