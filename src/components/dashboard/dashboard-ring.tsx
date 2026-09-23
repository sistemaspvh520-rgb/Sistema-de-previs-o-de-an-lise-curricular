"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Indicador circular animado, com alternativa estática para pessoas que reduzem movimento. */
export function DashboardRing({
  value,
  total,
  label,
  detail,
  className,
}: {
  value: number;
  total: number;
  label: string;
  detail: string;
  className?: string;
}) {
  const percent =
    total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  const [drawnPercent, setDrawnPercent] = useState(0);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawnPercent(percent));
    return () => cancelAnimationFrame(frame);
  }, [percent]);

  const circumference = 2 * Math.PI * 42;
  const offset = circumference - (drawnPercent / 100) * circumference;

  return (
    <div className={cn("relative grid size-44 place-items-center", className)}>
      <svg
        viewBox="0 0 100 100"
        className="size-full -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          className="text-white/10"
        />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinecap="round"
          className="text-brand-cyan transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-4xl font-bold tracking-tight text-white">
            {percent}%
          </div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-100">
            {label}
          </div>
          <div className="mt-1 text-sm font-medium text-white/75">
            {value} / {total}
          </div>
          <span className="sr-only">{detail}</span>
        </div>
      </div>
    </div>
  );
}
