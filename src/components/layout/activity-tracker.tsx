"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { sendUsage } from "@/features/usage/track-client";

/** Um sinal por minuto de uso real. */
const BEAT_MS = 60_000;
/** Sem mexer o mouse, teclar, rolar ou tocar por mais que isto, a aba aberta não conta como uso. */
const IDLE_MS = 2 * 60_000;
const INTERACTIONS = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"] as const;
/** Última tela registrada (fora do componente: sobrevive à montagem dupla do React em desenvolvimento). */
let lastPage = { path: "", at: 0 };

/**
 * Mede o uso da equipe: tela aberta a cada navegação e tempo ativo (aba visível e interação recente).
 * Não lê o conteúdo da página nem o que é digitado — só a rota e se houve interação.
 */
export function ActivityTracker() {
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  // Começa em 0 e é marcado na primeira navegação (abaixo): a página acabou de ser aberta, então há uso.
  const lastInteraction = useRef(0);

  useEffect(() => {
    pathRef.current = pathname;
    const now = Date.now();
    lastInteraction.current = now;
    if (lastPage.path === pathname && now - lastPage.at < 2_000) return;
    lastPage = { path: pathname, at: now };
    sendUsage({ type: "page", path: pathname });
  }, [pathname]);

  useEffect(() => {
    let lastMark = 0;
    const mark = () => {
      const now = Date.now();
      // pointermove/scroll disparam muitas vezes: basta registrar uma vez a cada 5 s.
      if (now - lastMark > 5_000) {
        lastMark = now;
        lastInteraction.current = now;
      }
    };
    for (const event of INTERACTIONS) window.addEventListener(event, mark, { passive: true, capture: true });
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastInteraction.current > IDLE_MS) return;
      sendUsage({ type: "beat", path: pathRef.current });
    }, BEAT_MS);
    return () => {
      for (const event of INTERACTIONS) window.removeEventListener(event, mark, { capture: true });
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
