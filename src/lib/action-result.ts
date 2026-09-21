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

/** Converte erros conhecidos em mensagens amigáveis; nunca expõe stacktrace. */
export function toActionError<T = undefined>(err: unknown, fallback = "Não foi possível concluir a operação."): ActionResult<T> {
  if (err && typeof err === "object" && "name" in err) {
    const name = (err as { name: string }).name;
    if (name === "ForbiddenError" || name === "UnauthorizedError") {
      return fail((err as Error).message);
    }
  }
  return fail(fallback);
}
