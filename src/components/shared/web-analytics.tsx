"use client";

import { Analytics } from "@vercel/analytics/next";

/**
 * Vercel Web Analytics (sem cookies). A query string é descartada antes do envio: links de
 * definir/redefinir senha carregam tokens de uso único que não podem sair do sistema.
 */
export function WebAnalytics() {
  return <Analytics beforeSend={(event) => ({ ...event, url: event.url.split("?")[0] })} />;
}
