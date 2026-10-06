"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PERIODS = [
  { key: "today", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "month", label: "Este mês" },
  { key: "90d", label: "90 dias" },
  { key: "custom", label: "Personalizado" },
] as const;

const ALL = "all";

/**
 * Filtro de período único da Gestão (Resultados, Uso da equipe) e de Meus relatórios: período primeiro e, se a página
 * oferecer, perfil, polo, módulo e filtros extras. Fica na URL; o período padrão da página não vai para a URL.
 */
export function PeriodFilter({
  defaultPeriod = "7d",
  period,
  fromDay,
  toDay,
  role,
  polo,
  module,
  roles = [],
  polos = [],
  modules = [],
  showModule = true,
  extra = [],
}: {
  /** Preset que a página usa quando a URL não traz período. */
  defaultPeriod?: "today" | "7d" | "30d" | "month" | "90d";
  period: string;
  fromDay: string;
  toDay: string;
  role?: string;
  polo?: string;
  module?: string;
  roles?: Array<{ value: string; label: string }>;
  polos?: Array<{ value: string; label: string }>;
  modules?: Array<{ value: string; label: string }>;
  showModule?: boolean;
  /** Filtros adicionais da página (ex.: pessoa e grade em "Uso das grades"). Trocar um filtro volta à página 1. */
  extra?: Array<{ param: string; label: string; allLabel: string; value?: string; options: Array<{ value: string; label: string }>; width?: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [customOpen, setCustomOpen] = useState(period === "custom");
  const [from, setFrom] = useState(fromDay);
  const [to, setTo] = useState(toDay);

  function update(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (!value || value === ALL) next.delete(key);
      else next.set(key, value);
    }
    start(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm", !extra.length && "lg:flex-row lg:flex-wrap lg:items-center")}>
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Período">
        {PERIODS.map((item) => {
          const active = item.key === "custom" ? customOpen || period === "custom" : period === item.key && !customOpen;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                if (item.key === "custom") return setCustomOpen(true);
                setCustomOpen(false);
                update({ period: item.key === defaultPeriod ? undefined : item.key, from: undefined, to: undefined, page: undefined });
              }}
              className={cn(
                "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "bg-brand-navy text-white" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {active && <Check className="size-3.5" strokeWidth={3} />} {item.label}
            </button>
          );
        })}
      </div>
      {customOpen && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (from && to && from <= to) update({ period: "custom", from, to, page: undefined });
          }}
        >
          <Input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} aria-label="De" className="h-9 w-auto" />
          <span className="text-sm text-muted-foreground">a</span>
          <Input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} aria-label="Até" className="h-9 w-auto" />
          <Button type="submit" size="sm" disabled={!from || !to || from > to}>Aplicar</Button>
        </form>
      )}
      <div className={cn("flex flex-1 flex-wrap items-center gap-2", extra.length ? "border-t pt-3" : "lg:justify-end", !roles.length && !polos.length && !modules.length && !extra.length && "hidden")}>
        {roles.length > 0 && <Select value={role ?? ALL} onValueChange={(value) => update({ role: value, page: undefined })}>
          <SelectTrigger className="h-9 w-full sm:w-[11rem]" aria-label="Perfil"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os perfis</SelectItem>
            {roles.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
          </SelectContent>
        </Select>}
        {polos.length > 0 && <Select value={polo ?? ALL} onValueChange={(value) => update({ polo: value, page: undefined })}>
          <SelectTrigger className="h-9 w-full sm:w-[13rem]" aria-label="Polo"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os polos</SelectItem>
            {polos.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
          </SelectContent>
        </Select>}
        {showModule && modules.length > 0 && (
          <Select value={module ?? ALL} onValueChange={(value) => update({ module: value })}>
            <SelectTrigger className="h-9 w-full sm:w-[12rem]" aria-label="Módulo"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os módulos</SelectItem>
              {modules.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {extra.map((filter) => (
          <Select key={filter.param} value={filter.value ?? ALL} onValueChange={(value) => update({ [filter.param]: value, page: undefined })}>
            <SelectTrigger className={cn("h-9 w-full", filter.width ?? "sm:w-[14rem]")} aria-label={filter.label}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{filter.allLabel}</SelectItem>
              {filter.options.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
            </SelectContent>
          </Select>
        ))}
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Atualizando" />}
      </div>
    </div>
  );
}
