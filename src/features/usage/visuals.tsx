"use client";

import type { UsageModule } from "@/generated/prisma/enums";
import { MODULE_LABELS } from "@/domain/usage/modules";
import { formatDuration } from "@/domain/usage/metrics";
import { ChartTooltip, useChartTooltip } from "@/features/usage/chart-tooltip";
import { HEAT_EMPTY, HEAT_RAMP, MODULE_COLORS, TREND_ACCENT, TREND_MUTED } from "@/features/usage/palette";

/** Os três módulos de trabalho e "Outros" (Gestão, Configurações), sempre nesta ordem. */
const STACK: Array<{ key: "CURRICULAR" | "GRADES" | "ACADEMIC" | "OTHER"; label: string; color: string }> = [
  { key: "CURRICULAR", label: MODULE_LABELS.CURRICULAR, color: MODULE_COLORS.CURRICULAR },
  { key: "GRADES", label: MODULE_LABELS.GRADES, color: MODULE_COLORS.GRADES },
  { key: "ACADEMIC", label: MODULE_LABELS.ACADEMIC, color: MODULE_COLORS.ACADEMIC },
  { key: "OTHER", label: "Gestão e configurações", color: MODULE_COLORS.OTHER },
];

function stacked(seconds: Record<UsageModule, number>) {
  return STACK.map((item) => ({ ...item, value: item.key === "OTHER" ? seconds.MANAGEMENT + seconds.SETTINGS + seconds.OTHER : seconds[item.key] }));
}

const dayLabel = (day: string) => day.split("-").reverse().slice(0, 2).join("/");
const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WEEKDAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
/** Segunda primeiro, como na semana de trabalho. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Legenda de módulos (retângulo, como as barras que ela identifica). */
export function ModuleLegend({ includeOther = false }: { includeOther?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {STACK.filter((item) => includeOther || item.key !== "OTHER").map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ backgroundColor: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Minutos ativos por dia (colunas), com o dia de hoje em destaque. Cada coluna inteira é a área de toque da dica.
 * `color`: usa a cor do módulo (dias anteriores em tom mais leve); sem ela, cinza discreto + azul para hoje.
 */
export function MiniBars({ values, days, color, label, width = 112, height = 28 }: { values: number[]; days: string[]; color?: string; label: string; width?: number; height?: number }) {
  const { tip, show, hide } = useChartTooltip();
  const gap = 2;
  const barWidth = (width - gap * (values.length - 1)) / values.length;
  const max = Math.max(...values, 1);
  const total = values.reduce((sum, value) => sum + value, 0);
  return (
    <>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: ${formatDuration(total * 60)} nos últimos ${values.length} dias`} className="block overflow-visible">
        <line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke="#e2e8f0" strokeWidth={1} />
        {values.map((value, index) => {
          const x = index * (barWidth + gap);
          const h = value > 0 ? Math.max(2, (value / max) * (height - 2)) : 0;
          const today = index === values.length - 1;
          const fill = color ?? (today ? TREND_ACCENT : TREND_MUTED);
          return (
            <g key={days[index]} onPointerMove={(event) => show(event, { title: dayLabel(days[index]) + (today ? " · hoje" : ""), rows: [{ value: value ? `${value} min` : "sem uso", label: "ativo", color: fill }] })} onPointerLeave={hide}>
              <rect x={x - gap / 2} y={0} width={barWidth + gap} height={height} fill="transparent" />
              {h > 0 && <rect x={x} y={height - h} width={barWidth} height={h} rx={1.5} fill={fill} opacity={color && !today ? 0.5 : 1} />}
            </g>
          );
        })}
      </svg>
      <ChartTooltip tip={tip} />
    </>
  );
}

/** Divisão do tempo ativo por módulo (barra empilhada horizontal, 2 px entre os segmentos). */
export function ModuleSplitBar({ seconds, className }: { seconds: Record<UsageModule, number>; className?: string }) {
  const { tip, show, hide } = useChartTooltip();
  const parts = stacked(seconds).filter((part) => part.value > 0);
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  if (!total) return <div className={`h-2 rounded-full bg-slate-100 ${className ?? ""}`} aria-label="Sem tempo ativo no período" />;
  return (
    <>
      <div className={`flex h-2 gap-0.5 ${className ?? ""}`} role="img" aria-label={parts.map((part) => `${part.label}: ${formatDuration(part.value)}`).join("; ")}>
        {parts.map((part, index) => (
          <div
            key={part.key}
            className={`h-full transition-opacity hover:opacity-80 ${index === 0 ? "rounded-l-full" : ""} ${index === parts.length - 1 ? "rounded-r-full" : ""}`}
            style={{ width: `${(part.value / total) * 100}%`, minWidth: 3, backgroundColor: part.color }}
            onPointerMove={(event) => show(event, { title: part.label, rows: [{ value: formatDuration(part.value), label: `${Math.round((part.value / total) * 100)}% do tempo`, color: part.color }] })}
            onPointerLeave={hide}
          />
        ))}
      </div>
      <ChartTooltip tip={tip} />
    </>
  );
}

/** Minutos ativos por dia da semana × hora (Porto Velho). Escala de um só tom; célula vazia em cinza neutro. */
export function UsageHeatmap({ grid }: { grid: number[][] }) {
  const { tip, show, hide } = useChartTooltip();
  const max = Math.max(...grid.flat(), 0);
  const level = (value: number) => (value <= 0 || max <= 0 ? -1 : Math.min(HEAT_RAMP.length - 1, Math.floor((value / max) * HEAT_RAMP.length - 1e-9)));
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  let peak = { weekday: 0, hour: 0, minutes: 0 };
  grid.forEach((row, weekday) => row.forEach((minutes, hour) => { if (minutes > peak.minutes) peak = { weekday, hour, minutes }; }));
  return (
    <div>
      <p className="mb-2 text-xs text-slate-600">
        {peak.minutes ? <>Pico de uso: <span className="font-semibold text-slate-900">{WEEKDAY_NAMES[peak.weekday]}, {peak.hour}h</span> ({peak.minutes} min no período).</> : "Ainda sem tempo ativo registrado no período."}
      </p>
      <div className="overflow-x-auto pb-1">
        <table className="border-separate border-spacing-[2px] text-[10px] text-muted-foreground" aria-label="Minutos ativos por dia da semana e hora (só as horas com uso são lidas)">
          <thead>
            <tr>
              <th className="w-8" />
              {hours.map((hour) => (
                <th key={hour} scope="col" className="w-4 min-w-4 font-normal">
                  {hour % 3 === 0 ? `${hour}h` : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEK_ORDER.map((weekday) => (
              <tr key={weekday}>
                <th scope="row" className="pr-1 text-left font-normal">{WEEKDAY_LABELS[weekday]}</th>
                {hours.map((hour) => {
                  const minutes = grid[weekday]?.[hour] ?? 0;
                  const step = level(minutes);
                  return (
                    <td
                      key={hour}
                      className="size-4 min-w-4 rounded-[3px] transition-[outline] hover:outline hover:outline-2 hover:outline-slate-900/30"
                      style={{ backgroundColor: step < 0 ? HEAT_EMPTY : HEAT_RAMP[step] }}
                      onPointerMove={(event) => show(event, { title: `${WEEKDAY_NAMES[weekday]}, ${hour}h`, rows: [{ value: minutes ? `${minutes} min` : "sem uso", label: "ativos no período" }] })}
                      onPointerLeave={hide}
                    >
                      {minutes > 0 && <span className="sr-only">{`${WEEKDAY_NAMES[weekday]} ${hour}h: ${minutes} min`}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span>menos</span>
        {HEAT_RAMP.map((color) => (
          <span key={color} aria-hidden="true" className="size-3 rounded-[3px]" style={{ backgroundColor: color }} />
        ))}
        <span>mais</span>
        <span aria-hidden="true" className="ml-3 size-3 rounded-[3px]" style={{ backgroundColor: HEAT_EMPTY }} />
        <span>sem uso</span>
      </div>
      <ChartTooltip tip={tip} />
    </div>
  );
}

/** Tempo ativo por dia, empilhado por módulo (detalhe de uma pessoa). Um eixo, grade discreta, dica por barra. */
export function DailyStackedBars({ daily }: { daily: Array<{ day: string; seconds: Record<UsageModule, number> }> }) {
  const { tip, show, hide } = useChartTooltip();
  const width = 720;
  const height = 180;
  const pad = { top: 8, right: 4, bottom: 22, left: 36 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const rows = daily.map((item) => ({ day: item.day, parts: stacked(item.seconds) }));
  const totals = rows.map((row) => row.parts.reduce((sum, part) => sum + part.value, 0) / 60);
  const maxMinutes = Math.max(...totals, 0);
  const step = maxMinutes <= 30 ? 10 : maxMinutes <= 90 ? 30 : maxMinutes <= 240 ? 60 : 120;
  const top = Math.max(step, Math.ceil(maxMinutes / step) * step);
  const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, index) => index * step);
  const slot = plotW / Math.max(rows.length, 1);
  const barW = Math.max(2, Math.min(22, slot - 2));
  const y = (minutes: number) => pad.top + plotH - (minutes / top) * plotH;
  const labelEvery = Math.max(1, Math.ceil(rows.length / 8));
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Tempo ativo por dia, por módulo">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? "#cbd5e1" : "#eef2f6"} strokeWidth={1} />
            <text x={pad.left - 6} y={y(tick) + 3} textAnchor="end" className="fill-slate-500 text-[10px]">{tick >= 60 ? `${tick / 60}h` : `${tick}m`}</text>
          </g>
        ))}
        {rows.map((row, index) => {
          const x = pad.left + index * slot + (slot - barW) / 2;
          let cursor = 0;
          const parts = row.parts.filter((part) => part.value > 0);
          return (
            <g
              key={row.day}
              onPointerMove={(event) => show(event, { title: dayLabel(row.day), rows: parts.length ? parts.map((part) => ({ value: formatDuration(part.value), label: part.label, color: part.color })) : [{ value: "sem uso", label: "" }] })}
              onPointerLeave={hide}
            >
              <rect x={pad.left + index * slot} y={pad.top} width={slot} height={plotH} fill="transparent" />
              {parts.map((part, partIndex) => {
                const minutes = part.value / 60;
                const segTop = y(cursor + minutes);
                const segH = Math.max(1, y(cursor) - segTop - (partIndex < parts.length - 1 ? 2 : 0));
                cursor += minutes;
                const last = partIndex === parts.length - 1;
                return <rect key={part.key} x={x} y={segTop} width={barW} height={segH} rx={last ? 2 : 0} fill={part.color} />;
              })}
              {index % labelEvery === 0 && (
                <text x={pad.left + index * slot + slot / 2} y={height - 6} textAnchor="middle" className="fill-slate-500 text-[10px]">{dayLabel(row.day)}</text>
              )}
            </g>
          );
        })}
      </svg>
      <ChartTooltip tip={tip} />
    </div>
  );
}
