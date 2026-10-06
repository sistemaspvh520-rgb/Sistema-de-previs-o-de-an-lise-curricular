/** Envio do rastreamento de uso a partir do navegador: nunca bloqueia nem mostra erro. */
type UsagePayload =
  | { type: "page" | "beat"; path: string }
  | { type: "action"; name: "grade.whatsapp_copy" | "grade.search"; entityId?: string };

export function sendUsage(payload: UsagePayload): void {
  if (typeof window === "undefined") return;
  const body = JSON.stringify(payload);
  try {
    // sendBeacon sobrevive à troca de página; se o navegador recusar, cai para fetch com keepalive.
    if (navigator.sendBeacon?.("/api/usage/track", new Blob([body], { type: "application/json" }))) return;
  } catch {
    // segue para o fetch
  }
  fetch("/api/usage/track", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => undefined);
}

export function trackClientAction(name: "grade.whatsapp_copy" | "grade.search", entityId?: string): void {
  sendUsage({ type: "action", name, ...(entityId ? { entityId } : {}) });
}
