"use client";

import { useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveOfficialUsageSnapshotAction } from "@/features/settings/usage-actions";

export function UsageOfficialSnapshotForm({ period, spendUsd, balanceUsd }: { period: string; spendUsd?: number | null; balanceUsd?: number | null }) {
  const [pending, start] = useTransition();
  function submit(formData: FormData) {
    start(async () => {
      const result = await saveOfficialUsageSnapshotAction({
        period,
        officialSpendUsd: formData.get("officialSpendUsd"),
        officialBalanceUsd: formData.get("officialBalanceUsd"),
      });
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }
  return <form action={submit} className="grid gap-4 sm:grid-cols-2">
    <div className="space-y-1.5"><Label htmlFor="officialSpendUsd">Gasto oficial no período (US$)</Label><Input id="officialSpendUsd" name="officialSpendUsd" required type="text" inputMode="decimal" autoComplete="off" defaultValue={formatForInput(spendUsd)} placeholder="Ex.: 0,79" /><p className="text-[11px] leading-4 text-muted-foreground">Copie o valor “September spend” da OpenAI.</p></div>
    <div className="space-y-1.5"><Label htmlFor="officialBalanceUsd">Saldo oficial atual (US$)</Label><Input id="officialBalanceUsd" name="officialBalanceUsd" required type="text" inputMode="decimal" autoComplete="off" defaultValue={formatForInput(balanceUsd)} placeholder="Ex.: 4,21" /><p className="text-[11px] leading-4 text-muted-foreground">Copie o valor “Credit balance” da OpenAI.</p></div>
    <Button type="submit" disabled={pending} className="sm:col-span-2 sm:justify-self-end">{pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Registrar dados oficiais</Button>
  </form>;
}

function formatForInput(value: number | null | undefined) {
  return typeof value === "number" ? new Intl.NumberFormat("pt-BR", { useGrouping: false, maximumFractionDigits: 6 }).format(value) : undefined;
}
