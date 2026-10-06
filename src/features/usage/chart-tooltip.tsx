"use client";

import { useCallback, useState, type FocusEvent, type PointerEvent } from "react";

export interface TooltipRow {
  value: string;
  label: string;
  color?: string;
}

export interface TooltipContent {
  title: string;
  rows: TooltipRow[];
}

interface TooltipState extends TooltipContent {
  x: number;
  y: number;
}

/** Dica de gráfico: valor em destaque, rótulo secundário, chave em traço curto da cor da série. */
export function useChartTooltip() {
  const [tip, setTip] = useState<TooltipState | null>(null);
  const show = useCallback((event: PointerEvent<Element> | FocusEvent<Element>, content: TooltipContent) => {
    const rect = (event.currentTarget as Element).getBoundingClientRect();
    const x = "clientX" in event ? event.clientX : rect.left + rect.width / 2;
    const y = "clientY" in event ? event.clientY : rect.top;
    setTip({ ...content, x, y });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  return { tip, show, hide };
}

export function ChartTooltip({ tip }: { tip: TooltipState | null }) {
  if (!tip) return null;
  const left = typeof window !== "undefined" ? Math.min(tip.x + 12, window.innerWidth - 220) : tip.x + 12;
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 min-w-36 max-w-52 rounded-lg border bg-white px-3 py-2 text-xs shadow-lg"
      style={{ left, top: Math.max(8, tip.y - 12), transform: "translateY(-100%)" }}
    >
      <div className="mb-1 font-medium text-muted-foreground">{tip.title}</div>
      {tip.rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2 py-0.5">
          {row.color && <span aria-hidden="true" className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />}
          <span className="font-semibold text-slate-900">{row.value}</span>
          <span className="truncate text-muted-foreground">{row.label}</span>
        </div>
      ))}
    </div>
  );
}
