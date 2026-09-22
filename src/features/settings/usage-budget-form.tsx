"use client";

import { useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveUsageBudgetAction } from "@/features/settings/usage-actions";

export function UsageBudgetForm({ budgetUsd, brlRate }: { budgetUsd: number; brlRate: number }) {
  const [pending, start] = useTransition();
  function submit(formData: FormData) {
    start(async () => {
      const result = await saveUsageBudgetAction({ aiMonthlyBudgetUsd: formData.get("aiMonthlyBudgetUsd"), usdBrlReferenceRate: formData.get("usdBrlReferenceRate") });
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }
  return (
    <form action={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="grid grid-rows-[2.5rem_2.5rem_auto] gap-1.5"><Label htmlFor="aiMonthlyBudgetUsd" className="leading-tight">Orçamento mensal<br />(US$)</Label><Input id="aiMonthlyBudgetUsd" name="aiMonthlyBudgetUsd" type="text" inputMode="decimal" autoComplete="off" defaultValue={formatForInput(budgetUsd)} placeholder="Ex.: 5,00" /><p className="text-[11px] leading-4 text-muted-foreground">Aceita vírgula, ponto e valores colados.</p></div>
      <div className="grid grid-rows-[2.5rem_2.5rem_auto] gap-1.5"><Label htmlFor="usdBrlReferenceRate" className="leading-tight">Cotação de referência<br />(R$/US$)</Label><Input id="usdBrlReferenceRate" name="usdBrlReferenceRate" type="text" inputMode="decimal" autoComplete="off" defaultValue={formatForInput(brlRate)} placeholder="Ex.: 5,456" /><p className="text-[11px] leading-4 text-muted-foreground">Ex.: 5,456 ou 1.234,56.</p></div>
      <Button type="submit" disabled={pending} className="sm:col-start-2 sm:justify-self-end">{pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar</Button>
    </form>
  );
}

function formatForInput(value: number) {
  return new Intl.NumberFormat("pt-BR", { useGrouping: false, maximumFractionDigits: 6 }).format(value);
}
