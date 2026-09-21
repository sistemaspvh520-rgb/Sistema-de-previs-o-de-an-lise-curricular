"use client";

import { useState, useTransition } from "react";
import { Grid3x3, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { linkMatrixToAnalysisAction } from "@/features/matrices/actions";

export interface MatrixOption {
  id: string;
  label: string;
  course: string;
  year: number;
  version: string;
}

const NONE = "__none__";

export function MatrixLinkSelect({
  analysisId,
  matrices,
  currentId,
  suggestedId,
  canEdit,
}: {
  analysisId: string;
  matrices: MatrixOption[];
  currentId: string | null;
  suggestedId: string | null;
  canEdit: boolean;
}) {
  const [value, setValue] = useState(currentId ?? suggestedId ?? NONE);
  const [pending, start] = useTransition();
  const dirty = (value === NONE ? null : value) !== currentId;

  function apply() {
    start(async () => {
      const res = await linkMatrixToAnalysisAction({ analysisId, matrixId: value === NONE ? null : value });
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Grid3x3 className="size-3.5" /> Matriz oficial
      </div>
      {matrices.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nenhuma matriz cadastrada. Cadastre em Matrizes para comparar PDF × matriz oficial.</p>
      ) : (
        <>
          <div className="mt-2 flex gap-2">
            <Select value={value} onValueChange={setValue} disabled={!canEdit || pending}>
              <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— sem comparação —</SelectItem>
                {matrices.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.course} · {m.label} ({m.year}/{m.version}){m.id === suggestedId ? " · sugerida" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canEdit && (
              <Button onClick={apply} disabled={!dirty || pending}>{pending && <Loader2 className="size-4 animate-spin" />} Comparar</Button>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {suggestedId && !currentId ? "Sugerida a partir do campo “Grade” do documento. " : ""}
            A comparação só gera alertas na aba Auditoria; nunca altera a análise.
          </p>
        </>
      )}
    </div>
  );
}
