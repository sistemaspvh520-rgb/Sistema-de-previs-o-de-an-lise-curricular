/** Envio do rastreamento de uso a partir do navegador: nunca bloqueia nem mostra erro. */
type UsagePayload =
  | { type: "page" | "beat"; path: string }
  | { type: "action"; name: "grade.whatsapp_open" | "grade.whatsapp_copy"; entityId: string }
  | { type: "action"; name: "grade.search" };

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

/** Uso de uma grade específica (abrir ou copiar a mensagem de WhatsApp). */
export function trackGradeUse(name: "grade.whatsapp_open" | "grade.whatsapp_copy", gradeId: string | undefined): void {
  if (gradeId) sendUsage({ type: "action", name, entityId: gradeId });
}

/** Busca no catálogo de grades (o texto buscado não é enviado). */
export function trackGradeSearch(): void {
  sendUsage({ type: "action", name: "grade.search" });
}
