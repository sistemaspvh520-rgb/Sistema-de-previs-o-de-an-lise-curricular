import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/observability/sentry-options";

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") Sentry.init(sentryOptions);
}

/** Erros de páginas, Server Actions e rotas de API vão para o Sentry. */
export const onRequestError = Sentry.captureRequestError;
