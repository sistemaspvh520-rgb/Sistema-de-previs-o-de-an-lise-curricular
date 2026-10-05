import { logger } from "@/lib/logger";

/** Formato padrão de retorno de server actions. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail<T = undefined>(error: string, fieldErrors?: Record<string, string>): ActionResult<T> {
  return { ok: false, error, fieldErrors };
}

/** Referência curta e sem dados pessoais da causa técnica (ex.: "PrismaClientKnownRequestError P2002"). */
function errorReference(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const name = "name" in err && typeof err.name === "string" ? err.name : "Error";
  const code = "code" in err && typeof err.code === "string" ? ` ${err.code}` : "";
  return `${name}${code}`.slice(0, 60);
}

/**
 * Converte erros conhecidos em mensagens amigáveis; nunca expõe stacktrace.
 * Erros inesperados são registrados no log do servidor e a mensagem ganha uma referência curta
 * do tipo do erro, para que o suporte consiga localizar a causa sem abrir o código.
 */
export function toActionError<T = undefined>(err: unknown, fallback = "Não foi possível concluir a operação."): ActionResult<T> {
  if (err && typeof err === "object" && "name" in err) {
    const name = (err as { name: string }).name;
    if (name === "ForbiddenError" || name === "UnauthorizedError") {
      return fail((err as Error).message);
    }
  }
  const reference = errorReference(err);
  logger.error("action.unexpected_error", { reference, message: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500) });
  return fail(reference ? `${fallback} (ref.: ${reference})` : fallback);
}
