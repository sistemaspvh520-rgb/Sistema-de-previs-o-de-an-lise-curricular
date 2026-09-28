import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/observability/sentry-options";

Sentry.init({
  ...sentryOptions,
  // Ruído de extensões do navegador e de abas abertas antes de uma publicação (a tela recarrega sozinha).
  ignoreErrors: [/ResizeObserver loop/, /ChunkLoadError/, /Loading (CSS )?chunk \d+ failed/, /dynamically imported module/],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
