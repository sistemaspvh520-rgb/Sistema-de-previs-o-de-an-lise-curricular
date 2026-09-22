"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Liga/desliga as notificações do navegador (Web Push) para os lembretes de retorno de matrícula. */
export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<"unsupported" | "loading" | "on" | "off" | "denied">("loading");

  useEffect(() => {
    const checkSubscription = async () => {
      // Adia a atualização para não sincronizar estado durante a montagem.
      await Promise.resolve();
      if (!publicKey || typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") { setState("denied"); return; }
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    };
    void checkSubscription().catch(() => setState("off"));
  }, [publicKey]);

  async function enable() {
    if (!publicKey) return;
    setState("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setState("denied"); toast.error("Permissão de notificação negada no navegador."); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) throw new Error("Falha ao registrar a inscrição.");
      setState("on");
      toast.success("Notificações ativadas neste navegador.");
    } catch (err) {
      setState("off");
      toast.error(err instanceof Error ? err.message : "Não foi possível ativar as notificações.");
    }
  }

  async function disable() {
    setState("loading");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("off");
      toast.success("Notificações desativadas neste navegador.");
    } catch {
      setState("on");
      toast.error("Não foi possível desativar.");
    }
  }

  if (state === "unsupported") return <span className="flex items-center gap-2 text-xs text-muted-foreground"><BellOff className="size-4" /> Notificações indisponíveis neste navegador</span>;
  if (state === "denied") return <span className="flex items-center gap-2 text-xs text-muted-foreground"><BellOff className="size-4" /> Notificações bloqueadas no navegador</span>;
  if (state === "loading") return <span className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Notificações…</span>;
  return state === "on" ? (
    <button type="button" onClick={disable} className="flex w-full items-center gap-2 text-left"><BellRing className="size-4 text-status-success" /> Notificações ativas · desativar</button>
  ) : (
    <button type="button" onClick={enable} className="flex w-full items-center gap-2 text-left"><BellRing className="size-4" /> Ativar notificações no navegador</button>
  );
}
