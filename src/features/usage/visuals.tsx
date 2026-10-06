"use client";

import { Clock } from "lucide-react";
import type { UsageModule } from "@/generated/prisma/enums";
import { MODULE_LABELS } from "@/domain/usage/modules";
import { formatDuration } from "@/domain/usage/metrics";
import { ChartTooltip, useChartTooltip } from "@/features/usage/chart-tooltip";
import { MODULE_COLORS, TREND_ACCENT, TREND_MUTED } from "@/features/usage/palette";

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

/**
 * Ritmo da equipe: minutos ativos por horário (colunas) e por dia da semana (barras com o valor escrito).
 * Uma só cor, grade discreta, só o pico rotulado no gráfico de horários; o resto aparece ao passar o mouse.
 */
export function UsageRhythm({ grid }: { grid: number[][] }) {
  const { tip, show, hide } = useChartTooltip();
  const byHour = Array.from({ length: 24 }, (_, hour) => grid.reduce((sum, row) => sum + (row?.[hour] ?? 0), 0));
  const byWeekday = WEEK_ORDER.map((weekday) => ({ weekday, minutes: (grid[weekday] ?? []).reduce((sum, value) => sum + value, 0) }));
  const total = byHour.reduce((sum, value) => sum + value, 0);
  if (!total) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-slate-50/60 px-6 py-10 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm"><Clock className="size-5" /></span>
        <p className="mt-3 text-sm font-medium text-slate-700">Ainda sem tempo ativo no período</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">O gráfico aparece assim que a equipe usar o sistema. Escolha um período maior para ver mais dias.</p>
      </div>
    );
  }
  const used = byHour.flatMap((minutes, hour) => (minutes > 0 ? [hour] : []));
  const first = Math.min(6, used[0]);
  const last = Math.max(22, used[used.length - 1]);
  const hours = Array.from({ length: last - first + 1 }, (_, index) => first + index);
  const peakHour = hours.reduce((best, hour) => (byHour[hour] > byHour[best] ? hour : best), hours[0]);
  const peakDay = byWeekday.reduce((best, item) => (item.minutes > best.minutes ? item : best), byWeekday[0]);
  const maxHour = Math.max(...hours.map((hour) => byHour[hour]), 1);
  const maxDay = Math.max(...byWeekday.map((item) => item.minutes), 1);

  const width = 560;
  const height = 170;
  const pad = { top: 22, bottom: 22, left: 4, right: 4 };
  const plotH = height - pad.top - pad.bottom;
  const slot = (width - pad.left - pad.right) / hours.length;
  const barW = Math.min(18, slot - 4);
  const fmt = (minutes: number) => formatDuration(minutes * 60);
  return (
    <div>
      <p className="text-sm text-slate-600">
        Pico às <span className="font-semibold text-slate-900">{peakHour}h</span> e às <span className="font-semibold text-slate-900">{WEEKDAY_NAMES[peakDay.weekday].toLocaleLowerCase("pt-BR")}s</span> · {fmt(total)} de uso no período.
      </p>
      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <figure>
          <figcaption className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Por horário</figcaption>
          <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`Minutos ativos por horário; pico às ${peakHour}h com ${fmt(byHour[peakHour])}`}>
            <line x1={pad.left} x2={width - pad.right} y1={height - pad.bottom + 0.5} y2={height - pad.bottom + 0.5} stroke="#cbd5e1" />
            <line x1={pad.left} x2={width - pad.right} y1={pad.top + 0.5} y2={pad.top + 0.5} stroke="#eef2f6" strokeDasharray="3 3" />
            {hours.map((hour, index) => {
              const minutes = byHour[hour];
              const h = minutes > 0 ? Math.max(3, (minutes / maxHour) * plotH) : 0;
              const x = pad.left + index * slot + (slot - barW) / 2;
              const peak = hour === peakHour;
              return (
                <g key={hour} onPointerMove={(event) => show(event, { title: `${hour}h às ${hour + 1}h`, rows: [{ value: minutes ? fmt(minutes) : "sem uso", label: "ativos no período", color: TREND_ACCENT }] })} onPointerLeave={hide}>
                  <rect x={pad.left + index * slot} y={pad.top} width={slot} height={plotH} fill="transparent" />
                  {h > 0 && <rect x={x} y={height - pad.bottom - h} width={barW} height={h} rx={3} fill={TREND_ACCENT} opacity={peak ? 1 : 0.55} />}
                  {peak && <text x={x + barW / 2} y={height - pad.bottom - h - 6} textAnchor="middle" className="fill-slate-900 text-[11px] font-semibold">{fmt(minutes)}</text>}
                  {hour % 2 === 0 && <text x={pad.left + index * slot + slot / 2} y={height - 6} textAnchor="middle" className="fill-slate-500 text-[10px]">{hour}h</text>}
                </g>
              );
            })}
          </svg>
        </figure>
        <figure>
          <figcaption className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Por dia da semana</figcaption>
          <ul className="space-y-2">
            {byWeekday.map(({ weekday, minutes }) => (
              <li key={weekday} className="grid grid-cols-[2.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-sm">
                <span className="text-xs text-slate-600">{WEEKDAY_LABELS[weekday]}</span>
                <span className="h-2.5 rounded-full bg-slate-100">
                  {minutes > 0 && <span className="block h-full rounded-full" style={{ width: `${Math.max(3, (minutes / maxDay) * 100)}%`, backgroundColor: TREND_ACCENT, opacity: weekday === peakDay.weekday ? 1 : 0.55 }} />}
                </span>
                <span className={minutes ? "text-right text-xs font-semibold tabular-nums text-slate-900" : "text-right text-xs text-slate-400"}>{minutes ? fmt(minutes) : "—"}</span>
              </li>
            ))}
          </ul>
        </figure>
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
