"use client";

import { useState, useTransition } from "react";
import { BellRing, Clock3, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveNotificationPreferencesAction } from "@/features/account/notification-preferences-actions";

export function NotificationPreferences({
  initialEmail,
  initialPush,
  initialRepeatDays,
  initialStartHour,
  initialEndHour,
}: {
  initialEmail: boolean;
  initialPush: boolean;
  initialRepeatDays: number;
  initialStartHour: number | null;
  initialEndHour: number | null;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [push, setPush] = useState(initialPush);
  const [repeatDays, setRepeatDays] = useState(String(initialRepeatDays));
  const [startHour, setStartHour] = useState(String(initialStartHour ?? 8));
  const [endHour, setEndHour] = useState(String(initialEndHour ?? 18));
  const [pending, start] = useTransition();
  function save() {
    if (!email && !push)
      return toast.error("Mantenha pelo menos um canal de lembrete ativo.");
    start(async () => {
      const result = await saveNotificationPreferencesAction({
        email,
        push,
        repeatDays,
        startHour,
        endHour,
      });
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Escolha como receber lembretes das análises que você criou.
      </p>
      <label className="flex items-center gap-3 rounded-lg border p-3 text-sm">
        <Mail className="size-4 text-brand-cyan-700" />
        <span className="flex-1">
          <span className="block font-medium">E-mail</span>
          <span className="text-xs text-muted-foreground">
            Resumo com links para responder.
          </span>
        </span>
        <input
          type="checkbox"
          checked={email}
          onChange={(event) => setEmail(event.target.checked)}
        />
      </label>
      <label className="flex items-center gap-3 rounded-lg border p-3 text-sm">
        <BellRing className="size-4 text-brand-cyan-700" />
        <span className="flex-1">
          <span className="block font-medium">Notificação no navegador</span>
          <span className="text-xs text-muted-foreground">
            Requer ativação no menu do perfil neste dispositivo.
          </span>
        </span>
        <input
          type="checkbox"
          checked={push}
          onChange={(event) => setPush(event.target.checked)}
        />
      </label>
      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Clock3 className="size-4 text-brand-cyan-700" /> Meu expediente
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <HourField label="Das" value={startHour} onChange={setStartHour} />
          <HourField
            label="Até"
            value={endHour}
            onChange={setEndHour}
            startAt={1}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Os avisos só são enviados dentro deste período, em dias úteis.
        </p>
      </div>
      <label className="block text-sm font-medium">
        Repetir a cada (dias úteis)
        <input
          className="mt-1 block h-9 w-full rounded-md border bg-card px-3"
          type="number"
          min="1"
          max="5"
          value={repeatDays}
          onChange={(event) => setRepeatDays(event.target.value)}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Em cada dia de aviso, você recebe um resumo pela manhã e outro à tarde
        enquanto houver retorno pendente.
      </p>
      <Button onClick={save} disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}Salvar
        preferências
      </Button>
    </div>
  );
}

function HourField({
  label,
  value,
  onChange,
  startAt = 0,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  startAt?: number;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <select
        className="mt-1 block h-9 w-full rounded-md border bg-card px-3"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {Array.from(
          { length: 24 - startAt },
          (_, index) => index + startAt,
        ).map((hour) => (
          <option key={hour} value={hour}>
            {String(hour).padStart(2, "0")}:00
          </option>
        ))}
      </select>
    </label>
  );
}
