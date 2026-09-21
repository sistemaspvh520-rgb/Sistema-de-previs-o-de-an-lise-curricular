"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { confirmEntryPeriodAction } from "@/features/analyses/actions";

export function EntryPeriodBanner({ analysisId, periods, canEdit }: { analysisId: string; periods: number[]; canEdit: boolean }) {
  const [value, setValue] = useState<string>("");
  const [pending, start] = useTransition();
  const max = Math.max(8, ...(periods.length ? periods : [8]));
  const options = Array.from({ length: max }, (_, i) => i + 1);

  function confirm() {
    if (!value) return;
    start(async () => {
      const res = await confirmEntryPeriodAction({ analysisId, entryPeriod: Number(value) });
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-status-warning/30 bg-status-warning-bg p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-status-warning" />
        <div>
          <div className="font-semibold text-status-warning">Informe o período de ingresso para finalizar a previsão</div>
          <p className="text-sm text-status-warning/90">
            Não encontramos essa informação no documento. Selecione em qual período o candidato iniciou para o sistema calcular a previsão completa.
          </p>
        </div>
      </div>
      {canEdit ? (
        <div className="flex shrink-0 items-center gap-2">
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger className="w-40 bg-card"><SelectValue placeholder="Selecionar" /></SelectTrigger>
            <SelectContent>
              {options.map((p) => (
                <SelectItem key={p} value={String(p)}>{p}º período</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={confirm} disabled={!value || pending}>
            {pending && <Loader2 className="size-4 animate-spin" />} Confirmar
          </Button>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">Um analista precisa informar o período de ingresso.</span>
      )}
    </div>
  );
}

export function AdditionalRuleBanner({ canManageRules }: { canManageRules: boolean }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-status-warning/30 bg-status-warning-bg p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-status-warning" />
        <div>
          <div className="font-semibold text-status-warning">Defina como concluir disciplinas após o último período</div>
          <p className="text-sm text-status-warning/90">
            Ainda há disciplinas após o último período oficial. Configure a capacidade do semestre adicional para concluir a previsão com a regra institucional correta.
          </p>
        </div>
      </div>
      {canManageRules && (
        <Button asChild variant="outline" className="shrink-0 bg-card">
          <Link href="/settings/rules">Configurar regra</Link>
        </Button>
      )}
    </div>
  );
}
