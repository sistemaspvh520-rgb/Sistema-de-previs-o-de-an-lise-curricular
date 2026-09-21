"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { decideAnalysisDeletionRequestAction } from "@/features/analyses/deletion-actions";

export function DeletionRequestActions({ requestId }: { requestId: string }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  function decide(decision: "APPROVE" | "REJECT") {
    start(async () => {
      const result = await decideAnalysisDeletionRequestAction({ requestId, decision, note });
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
      <Input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Observação para o solicitante (opcional)" className="sm:w-64" />
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => decide("REJECT")} disabled={pending}><X className="size-4" /> Recusar</Button>
        <Button size="sm" variant="destructive" onClick={() => decide("APPROVE")} disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Aprovar e excluir</Button>
      </div>
    </div>
  );
}
