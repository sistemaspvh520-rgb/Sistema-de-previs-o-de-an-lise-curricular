"use client";

import { useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addUsageCreditAction } from "@/features/settings/usage-actions";

export function UsageBudgetForm() {
  const [pending, start] = useTransition();
  function submit(formData: FormData) {
    start(async () => {
      const result = await addUsageCreditAction({ creditUsd: formData.get("creditUsd"), creditBrl: formData.get("creditBrl") });
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }
  return (
    <form action={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="grid grid-rows-[2.5rem_2.5rem_auto] gap-1.5"><Label htmlFor="creditUsd" className="leading-tight">Crédito adicionado<br />(US$)</Label><Input id="creditUsd" name="creditUsd" required type="text" inputMode="decimal" autoComplete="off" placeholder="Ex.: 5,00" /><p className="text-[11px] leading-4 text-muted-foreground">Valor que entrou na plataforma da OpenAI.</p></div>
      <div className="grid grid-rows-[2.5rem_2.5rem_auto] gap-1.5"><Label htmlFor="creditBrl" className="leading-tight">Valor pago<br />(R$)</Label><Input id="creditBrl" name="creditBrl" required type="text" inputMode="decimal" autoComplete="off" placeholder="Ex.: 27,28" /><p className="text-[11px] leading-4 text-muted-foreground">Valor efetivo cobrado no pagamento.</p></div>
      <Button type="submit" disabled={pending} className="sm:col-start-2 sm:justify-self-end">{pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar</Button>
    </form>
  );
}
