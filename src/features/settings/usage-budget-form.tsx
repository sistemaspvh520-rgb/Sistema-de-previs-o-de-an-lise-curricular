"use client";

import { useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addUsageCreditAction } from "@/features/settings/usage-actions";

export function UsageBudgetForm({ brlRate }: { brlRate: number }) {
  const [pending, start] = useTransition();
  function submit(formData: FormData) {
    start(async () => {
      const result = await addUsageCreditAction({ creditUsd: formData.get("creditUsd"), usdBrlReferenceRate: formData.get("usdBrlReferenceRate") });
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }
  return (
    <form action={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="grid grid-rows-[2.5rem_2.5rem_auto] gap-1.5"><Label htmlFor="creditUsd" className="leading-tight">Crédito adicionado<br />(US$)</Label><Input id="creditUsd" name="creditUsd" required type="text" inputMode="decimal" autoComplete="off" placeholder="Ex.: 5,00" /><p className="text-[11px] leading-4 text-muted-foreground">Cada salvamento cria um novo lançamento.</p></div>
      <div className="grid grid-rows-[2.5rem_2.5rem_auto] gap-1.5"><Label htmlFor="usdBrlReferenceRate" className="leading-tight">Cotação de referência<br />(R$/US$)</Label><Input id="usdBrlReferenceRate" name="usdBrlReferenceRate" type="text" inputMode="decimal" autoComplete="off" defaultValue={formatForInput(brlRate)} placeholder="Ex.: 5,456" /><p className="text-[11px] leading-4 text-muted-foreground">Ex.: 5,456 ou 1.234,56.</p></div>
      <Button type="submit" disabled={pending} className="sm:col-start-2 sm:justify-self-end">{pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar</Button>
    </form>
  );
}

function formatForInput(value: number) {
  return new Intl.NumberFormat("pt-BR", { useGrouping: false, maximumFractionDigits: 6 }).format(value);
}
