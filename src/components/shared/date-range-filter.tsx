"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Filtro reutilizável para dashboards; mantém os demais filtros da URL. */
export function DateRangeFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");

  function navigate(next: URLSearchParams) {
    router.push(`${pathname}${next.size ? `?${next}` : ""}`);
  }

  function apply() {
    const next = new URLSearchParams(params);
    if (from) next.set("from", from);
    else next.delete("from");
    if (to) next.set("to", to);
    else next.delete("to");
    navigate(next);
  }

  function clear() {
    setFrom("");
    setTo("");
    const next = new URLSearchParams(params);
    next.delete("from");
    next.delete("to");
    navigate(next);
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3 shadow-sm">
      <CalendarDays className="mb-2 size-4 text-brand-cyan-700" />
      <label className="grid gap-1 text-xs font-medium">
        De
        <input className="h-9 rounded-md border bg-background px-2 text-sm" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        Até
        <input className="h-9 rounded-md border bg-background px-2 text-sm" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
      </label>
      <Button size="sm" onClick={apply}>Aplicar</Button>
      {(from || to) && <Button size="sm" variant="ghost" onClick={clear}><RotateCcw className="size-3.5" /> Limpar</Button>}
    </div>
  );
}
