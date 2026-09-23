"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Loader2, RotateCcw, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { confirmEntryPeriodAction, restoreDocumentEntryPeriodAction } from "@/features/analyses/actions";

/** O PDF é a fonte normal; este diálogo existe apenas para comparar cenários. */
export function EntryPeriodSimulationDialog({ analysisId, currentPeriod, documentPeriod, periods, canEdit }: { analysisId: string; currentPeriod: number | null; documentPeriod: number | null; periods: number[]; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentPeriod?.toString() ?? documentPeriod?.toString() ?? "");
  const [pending, start] = useTransition();
  const max = Math.max(8, ...(periods.length ? periods : [8]), documentPeriod ?? 0, currentPeriod ?? 0);
  const options = Array.from({ length: max }, (_, i) => i + 1);
  const isScenario = currentPeriod !== null && documentPeriod !== null && currentPeriod !== documentPeriod;

  function apply() {
    if (!value) return;
    start(async () => {
      const res = await confirmEntryPeriodAction({ analysisId, entryPeriod: Number(value) });
      if (res.ok) {
        toast.success(res.message);
        setOpen(false);
      } else toast.error(res.error);
    });
  }

  function restore() {
    start(async () => {
      const res = await restoreDocumentEntryPeriodAction(analysisId);
      if (res.ok) {
        toast.success(res.message);
        setOpen(false);
      } else toast.error(res.error);
    });
  }

  if (!canEdit) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" className="animate-in fade-in slide-in-from-bottom-1 duration-500"><SlidersHorizontal className="size-4" /> {isScenario ? "Cenário alternativo" : "Simular outro período"}</Button></DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Simular período de ingresso</DialogTitle>
          <DialogDescription>{documentPeriod ? `O PDF informa ingresso no ${documentPeriod}º período. Altere somente para comparar outra projeção.` : "O período não foi identificado neste documento. Escolha um cenário para gerar a projeção."}</DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-brand-cyan-50 p-3 text-sm text-brand-navy animate-in fade-in zoom-in-95 duration-300">A mudança recalcula a previsão e fica registrada no histórico. O valor lido no PDF pode ser restaurado a qualquer momento.</div>
        <div className="space-y-2">
          <Label htmlFor="scenario-period">Período para simulação</Label>
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger id="scenario-period"><SelectValue placeholder="Selecionar período" /></SelectTrigger>
            <SelectContent>{options.map((p) => <SelectItem key={p} value={String(p)}>{p}º período</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          {documentPeriod && isScenario && <Button variant="outline" onClick={restore} disabled={pending}><RotateCcw className="size-4" /> Usar valor do PDF</Button>}
          <Button onClick={apply} disabled={pending || !value || Number(value) === currentPeriod}>{pending && <Loader2 className="size-4 animate-spin" />} Aplicar cenário</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdditionalRuleBanner() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-status-warning/30 bg-status-warning-bg p-4 animate-in fade-in slide-in-from-top-2 duration-300 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-status-warning" />
        <div>
          <div className="font-semibold text-status-warning">Defina como concluir disciplinas após o último período</div>
          <p className="text-sm text-status-warning/90">Ainda há disciplinas após o último período oficial e a regra do semestre adicional não está definida. Avise a equipe técnica para ajustar a regra institucional.</p>
        </div>
      </div>
    </div>
  );
}
