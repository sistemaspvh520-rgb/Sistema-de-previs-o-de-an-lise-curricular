"use client";

import { useState, useTransition } from "react";
import { BellRing, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveNotificationPreferencesAction } from "@/features/account/notification-preferences-actions";

export function NotificationPreferences({ initialEmail, initialPush, initialRepeatDays, initialMaxReminders }: { initialEmail: boolean; initialPush: boolean; initialRepeatDays: number; initialMaxReminders: number }) {
  const [email, setEmail] = useState(initialEmail);
  const [push, setPush] = useState(initialPush);
  const [repeatDays, setRepeatDays] = useState(String(initialRepeatDays));
  const [maxReminders, setMaxReminders] = useState(String(initialMaxReminders));
  const [pending, start] = useTransition();
  function save() {
    if (!email && !push) return toast.error("Mantenha pelo menos um canal de lembrete ativo.");
    start(async () => {
      const result = await saveNotificationPreferencesAction({ email, push, repeatDays, maxReminders });
      if (result.ok) toast.success(result.message); else toast.error(result.error);
    });
  }
  return <div className="space-y-4"><p className="text-sm text-muted-foreground">Escolha como receber lembretes de matrícula das análises que você criou.</p><label className="flex items-center gap-3 rounded-lg border p-3 text-sm"><Mail className="size-4 text-brand-cyan-700" /><span className="flex-1"><span className="block font-medium">E-mail</span><span className="text-xs text-muted-foreground">Resumo com links para responder.</span></span><input type="checkbox" checked={email} onChange={(event) => setEmail(event.target.checked)} /></label><label className="flex items-center gap-3 rounded-lg border p-3 text-sm"><BellRing className="size-4 text-brand-cyan-700" /><span className="flex-1"><span className="block font-medium">Notificação no navegador</span><span className="text-xs text-muted-foreground">Requer ativação no menu do perfil neste dispositivo.</span></span><input type="checkbox" checked={push} onChange={(event) => setPush(event.target.checked)} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Intervalo (dias úteis)<input className="mt-1 block h-9 w-full rounded-md border bg-card px-3" type="number" min="1" max="5" value={repeatDays} onChange={(event) => setRepeatDays(event.target.value)} /></label><label className="text-sm font-medium">Máximo por análise<input className="mt-1 block h-9 w-full rounded-md border bg-card px-3" type="number" min="1" max="20" value={maxReminders} onChange={(event) => setMaxReminders(event.target.value)} /></label></div><Button onClick={save} disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />}Salvar preferências</Button></div>;
}
