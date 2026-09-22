/**
 * Datas do sistema são armazenadas em timestamptz (instante absoluto) e sempre
 * EXIBIDAS no fuso de Rondônia. Sem isso, Server Components na Vercel (UTC)
 * mostravam 01:58 quando eram 21:58 em Porto Velho.
 */
export const APP_TIME_ZONE = "America/Porto_Velho";

type DateInput = Date | string | null | undefined;

export function formatDateTime(d: DateInput): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: APP_TIME_ZONE }).format(new Date(d));
}

export function formatDate(d: DateInput): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: APP_TIME_ZONE }).format(new Date(d));
}

/** Ano/mês/dia civis no fuso da aplicação (independente do fuso do servidor). */
export function zonedDateParts(now: Date = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIME_ZONE, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Deslocamento do fuso da aplicação em minutos para um instante (Porto Velho = -240, sem horário de verão). */
function zoneOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIME_ZONE, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** Instante correspondente a 00:00 do 1º dia do mês corrente no fuso da aplicação. */
export function startOfCurrentMonth(now: Date = new Date()): Date {
  const { year, month } = zonedDateParts(now);
  const naive = Date.UTC(year, month - 1, 1, 0, 0, 0);
  return new Date(naive - zoneOffsetMinutes(new Date(naive)) * 60_000);
}

const RELATIVE_UNITS: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
  { unit: "year", ms: 365 * 24 * 60 * 60_000 },
  { unit: "month", ms: 30 * 24 * 60 * 60_000 },
  { unit: "day", ms: 24 * 60 * 60_000 },
  { unit: "hour", ms: 60 * 60_000 },
  { unit: "minute", ms: 60_000 },
];

/** "há 5 minutos", "há 3 dias", "agora"; datas nulas viram "nunca". */
export function formatRelativeTime(d: DateInput, now: Date = new Date()): string {
  if (!d) return "nunca";
  const diff = new Date(d).getTime() - now.getTime();
  const abs = Math.abs(diff);
  if (abs < 60_000) return "agora";
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "always" });
  for (const { unit, ms } of RELATIVE_UNITS) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return "agora";
}

/** Dias inteiros decorridos desde a data (0 quando é hoje); null quando não há data. */
export function daysSince(d: DateInput, now: Date = new Date()): number | null {
  if (!d) return null;
  return Math.max(0, Math.floor((now.getTime() - new Date(d).getTime()) / (24 * 60 * 60_000)));
}
