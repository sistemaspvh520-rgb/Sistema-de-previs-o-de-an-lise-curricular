/**
 * Logger central com redação de dados sensíveis.
 * Nunca registra: API Keys, CPF, RG, telefones, PDFs ou prompts completos.
 */

const REDACTION_PATTERNS: Array<[RegExp, string]> = [
  [/sk-[A-Za-z0-9_\-]{8,}/g, "sk-***REDACTED***"],
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "***CPF***"],
  [/\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dXx]\b/g, "***RG***"],
  [/\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, "***TEL***"],
];

export function redact(input: unknown): unknown {
  if (typeof input === "string") {
    return REDACTION_PATTERNS.reduce((acc, [re, rep]) => acc.replace(re, rep), input);
  }
  if (Array.isArray(input)) return input.map(redact);
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (/apikey|api_key|password|secret|token|authorization/i.test(k)) {
        out[k] = "***REDACTED***";
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return input;
}

type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, message: string, meta?: Record<string, unknown>) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message: redact(message),
    ...(meta ? (redact(meta) as Record<string, unknown>) : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (process.env.NODE_ENV !== "test") console.log(line);
}

export const logger = {
  debug: (m: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === "development") write("debug", m, meta);
  },
  info: (m: string, meta?: Record<string, unknown>) => write("info", m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => write("warn", m, meta),
  error: (m: string, meta?: Record<string, unknown>) => write("error", m, meta),
};
