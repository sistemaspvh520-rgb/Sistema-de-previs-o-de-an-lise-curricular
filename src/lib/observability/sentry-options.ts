import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Opções comuns do Sentry (navegador, servidor e edge). Sem `NEXT_PUBLIC_SENTRY_DSN` o SDK fica
 * desligado. Pensado para LGPD: nada de dados pessoais automáticos, e a URL perde a query string
 * (links de convite e de redefinição de senha levam tokens nela).
 */
export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  // Só erros; desempenho fica com o Vercel Speed Insights.
  tracesSampleRate: 0,
  beforeSend: scrubEvent,
};

function stripQuery(url: string) {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    if (event.request.url) event.request.url = stripQuery(event.request.url);
    delete event.request.query_string;
    delete event.request.cookies;
    delete event.request.data;
    if (event.request.headers) {
      for (const name of Object.keys(event.request.headers)) {
        if (/cookie|authorization|token|forwarded-for|real-ip/i.test(name)) delete event.request.headers[name];
      }
    }
  }
  for (const crumb of event.breadcrumbs ?? []) {
    const data = crumb.data as Record<string, unknown> | undefined;
    if (data) for (const key of ["url", "from", "to"]) if (typeof data[key] === "string") data[key] = stripQuery(data[key] as string);
  }
  if (event.user) event.user = { id: event.user.id };
  return event;
}
