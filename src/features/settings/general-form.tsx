"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveGeneralSettingsAction } from "@/features/settings/general-actions";
import { TermSelect } from "@/components/shared/term-select";

export function GeneralSettingsForm({
  initial,
  readOnly,
}: {
  initial: { institutionName: string; maxUploadMb: number; maxPdfPages: number; defaultStartTerm: string | null };
  readOnly: boolean;
}) {
  const [pending, start] = useTransition();
  const [defaultStartTerm, setDefaultStartTerm] = useState(initial.defaultStartTerm ?? "");
  function submit(fd: FormData) {
    start(async () => {
      const res = await saveGeneralSettingsAction({
        institutionName: fd.get("institutionName"),
        maxUploadMb: fd.get("maxUploadMb"),
        maxPdfPages: fd.get("maxPdfPages"),
        defaultStartTerm: fd.get("defaultStartTerm"),
      });
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }
  return (
    <form action={submit} className="grid max-w-xl gap-5">
      <div className="space-y-2">
        <Label htmlFor="institutionName">Nome da instituição</Label>
        <Input id="institutionName" name="institutionName" defaultValue={initial.institutionName} disabled={readOnly} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="maxUploadMb">Tamanho máximo do PDF (MB)</Label>
          <Input id="maxUploadMb" name="maxUploadMb" type="number" min={1} max={50} defaultValue={initial.maxUploadMb} disabled={readOnly} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maxPdfPages">Máximo de páginas</Label>
          <Input id="maxPdfPages" name="maxPdfPages" type="number" min={1} max={300} defaultValue={initial.maxPdfPages} disabled={readOnly} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="defaultStartTerm">Semestre padrão de ingresso</Label>
        <TermSelect id="defaultStartTerm" name="defaultStartTerm" value={defaultStartTerm} onChange={setDefaultStartTerm} disabled={readOnly} />
        <p className="text-xs text-muted-foreground">Preenche o semestre de ingresso — o mesmo usado para iniciar a previsão. Continua editável no envio.</p>
      </div>
      {!readOnly && (
        <div>
          <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
        </div>
      )}
    </form>
  );
}
