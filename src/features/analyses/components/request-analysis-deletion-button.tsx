"use client";

import { useState, useTransition } from "react";
import { Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { requestAnalysisDeletionAction } from "@/features/analyses/deletion-actions";

export function RequestAnalysisDeletionButton({ analysisId }: { analysisId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      const result = await requestAnalysisDeletionAction({ analysisId, reason });
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
        setReason("");
      } else toast.error(result.error);
    });
  }

  return (
    <>
      <Button variant="outline" className="text-status-danger hover:text-status-danger" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" /> Solicitar exclusão
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar exclusão da análise</DialogTitle>
            <DialogDescription>Um administrador avaliará o pedido. Até a aprovação, a análise e o PDF continuarão disponíveis.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="deletion-reason" className="text-sm font-medium">Motivo <span className="font-normal text-muted-foreground">(opcional)</span></label>
            <Textarea id="deletion-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="Ex.: arquivo enviado em duplicidade." rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
            <Button variant="destructive" onClick={submit} disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Enviar solicitação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
