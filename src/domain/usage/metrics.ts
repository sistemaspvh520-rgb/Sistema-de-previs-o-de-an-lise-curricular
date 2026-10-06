import { APP_TIME_ZONE, startOfCurrentMonth } from "@/lib/time";

/** Regras puras do painel "Uso da equipe" (sem banco), todas no fuso de Porto Velho. */

const DAY_MS = 24 * 60 * 60_000;
/** Visto há menos que isto = "online agora" (o navegador manda sinal a cada minuto). */
export const ONLINE_WINDOW_MS = 3 * 60_000;
/** Pausa que separa duas sessões de uso. */
export const SESSION_GAP_MS = 30 * 60_000;
/** A partir de quantos dias sem uso a pessoa entra no painel de atenção. */
export const IDLE_ALERT_DAYS = 14;

const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const weekdayHourFormatter = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIME_ZONE, weekday: "short", hour: "numeric", hourCycle: "h23" });
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-10-06" no fuso da aplicação. */
export function zonedDayKey(at: Date): string {
  return dayFormatter.format(at);
}

/** Dia da semana (0 = domingo) e hora (0–23) no fuso da aplicação. */
export function zonedWeekdayHour(at: Date): { weekday: number; hour: number } {
  const parts = weekdayHourFormatter.formatToParts(at);
  const weekday = WEEKDAYS.indexOf(parts.find((part) => part.type === "weekday")?.value ?? "Sun");
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0) % 24;
  return { weekday: Math.max(0, weekday), hour };
}

/** 00:00 (Porto Velho, UTC−4 fixo) do dia "AAAA-MM-DD". */
export function startOfZonedDay(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00-04:00`);
}

/** Os `count` últimos dias (o último é hoje), como chaves "AAAA-MM-DD". */
export function lastDayKeys(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, index) => zonedDayKey(new Date(now.getTime() - (count - 1 - index) * DAY_MS)));
}

export type UsagePeriodKey = "today" | "7d" | "30d" | "month" | "90d" | "custom";
export interface UsagePeriod {
  key: UsagePeriodKey;
  from: Date;
  to: Date;
  label: string;
  /** Datas no formato do <input type="date">, para os filtros. */
  fromDay: string;
  toDay: string;
}

type PresetKey = Exclude<UsagePeriodKey, "custom" | "month">;
const PRESET_DAYS: Record<PresetKey, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90 };
const PRESET_LABELS: Record<UsagePeriodKey, string> = { today: "Hoje", "7d": "Últimos 7 dias", "30d": "Últimos 30 dias", month: "Este mês", "90d": "Últimos 90 dias", custom: "Personalizado" };
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Período dos filtros (padrão configurável por página; 7 dias se omitido). Datas inválidas ou invertidas voltam ao
 * padrão. Compartilhado por Resultados, Uso da equipe e Meus relatórios: o preset sempre vira `from`/`to`.
 */
export function resolveUsagePeriod(params: { period?: string; from?: string; to?: string }, now = new Date(), defaultKey: Exclude<UsagePeriodKey, "custom"> = "7d"): UsagePeriod {
  const today = zonedDayKey(now);
  if (params.period === "custom" && params.from && params.to && DAY_KEY.test(params.from) && DAY_KEY.test(params.to) && params.from <= params.to) {
    const to = params.to > today ? today : params.to;
    const from = params.from > to ? to : params.from;
    const label = `${from.split("-").reverse().join("/")} a ${to.split("-").reverse().join("/")}`;
    return { key: "custom", from: startOfZonedDay(from), to: new Date(startOfZonedDay(to).getTime() + DAY_MS - 1), label, fromDay: from, toDay: to };
  }
  const asked = params.period === "month" || (params.period && params.period in PRESET_DAYS) ? (params.period as Exclude<UsagePeriodKey, "custom">) : undefined;
  const key = asked ?? defaultKey;
  if (key === "month") {
    const from = startOfCurrentMonth(now);
    return { key, from, to: now, label: PRESET_LABELS.month, fromDay: zonedDayKey(from), toDay: today };
  }
  const fromDay = lastDayKeys(now, PRESET_DAYS[key])[0];
  return { key, from: startOfZonedDay(fromDay), to: now, label: PRESET_LABELS[key], fromDay, toDay: today };
}

export type PersonStatusKind = "online" | "today" | "recent" | "idle" | "never";
export interface PersonStatus {
  kind: PersonStatusKind;
  label: string;
  /** Dias desde o último uso (null quando nunca usou). */
  days: number | null;
}

/** Situação de uso de uma pessoa a partir do último sinal de vida. */
export function personStatus(lastSeenAt: Date | null, online: boolean, now = new Date()): PersonStatus {
  if (online) return { kind: "online", label: "Online agora", days: 0 };
  if (!lastSeenAt) return { kind: "never", label: "Nunca acessou", days: null };
  if (zonedDayKey(lastSeenAt) === zonedDayKey(now)) return { kind: "today", label: "Usou hoje", days: 0 };
  const days = Math.max(1, Math.round((startOfZonedDay(zonedDayKey(now)).getTime() - startOfZonedDay(zonedDayKey(lastSeenAt)).getTime()) / DAY_MS));
  if (days >= IDLE_ALERT_DAYS) return { kind: "idle", label: `Sem uso há ${days} dias`, days };
  return { kind: "recent", label: days === 1 ? "Usou ontem" : `Usou há ${days} dias`, days };
}

export interface UsageSession<T> {
  start: Date;
  end: Date;
  items: T[];
}

/** Agrupa marcas de tempo em sessões separadas por pausas maiores que `gapMs` (mais recente primeiro). */
export function groupSessions<T extends { at: Date }>(items: T[], gapMs = SESSION_GAP_MS): UsageSession<T>[] {
  const sorted = [...items].sort((a, b) => a.at.getTime() - b.at.getTime());
  const sessions: UsageSession<T>[] = [];
  for (const item of sorted) {
    const current = sessions[sessions.length - 1];
    if (current && item.at.getTime() - current.end.getTime() <= gapMs) {
      current.end = item.at;
      current.items.push(item);
    } else {
      sessions.push({ start: item.at, end: item.at, items: [item] });
    }
  }
  return sessions.reverse();
}

/** "2 h 05 min", "45 min", "menos de 1 min", "—". */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "—";
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${String(rest).padStart(2, "0")} min` : `${hours} h`;
}
