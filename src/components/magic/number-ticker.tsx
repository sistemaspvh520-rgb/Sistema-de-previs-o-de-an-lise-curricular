"use client";
import { useLayoutEffect, useRef } from "react";

const format = (value: number, suffix: string) => `${value.toLocaleString("pt-BR")}${suffix}`;

/** Contador animado (estilo Magic UI "NumberTicker"); com movimento reduzido mostra o valor final. */
export function NumberTicker({ value, duration = 900, suffix = "", className }: { value: number; duration?: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || value === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      node.textContent = format(Math.round(value * (1 - Math.pow(1 - t, 3))), suffix);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    node.textContent = format(0, suffix);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      node.textContent = format(value, suffix);
    };
  }, [value, duration, suffix]);
  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {format(value, suffix)}
    </span>
  );
}
