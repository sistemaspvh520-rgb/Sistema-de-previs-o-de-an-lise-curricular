"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { decideStudentDeletionAction, deleteStudentAction, requestStudentDeletionAction } from "./deletion-actions";

const DANGER = "border-status-danger/30 text-status-danger hover:border-status-danger/50 hover:bg-status-danger-bg hover:text-status-danger";

/**
 * Administração e Coordenação: "Excluir aluno" (direto). Tutor: "Solicitar exclusão" (com motivo).
 * Com pedido pendente, mostra o selo em vez do botão.
 */
export function StudentDeletionButton({ enrollmentId, name, rgm, canDelete, pendingRequest, redirectTo, iconOnly = false }: { enrollmentId: string; name: string; rgm: string; canDelete: boolean; pendingRequest: boolean; redirectTo?: string; iconOnly?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  if (pendingRequest && !canDelete)
    return <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800" title="Aguardando aprovação da administração ou da coordenação"><Clock className="size-3.5" /> Exclusão solicitada</span>;

  function submit() {
    start(async () => {
      const result = canDelete ? await deleteStudentAction(enrollmentId) : await requestStudentDeletionAction({ enrollmentId, reason });
      if (!result.ok) { toast.error(result.error); return; }
      toast.success(result.message);
      setOpen(false);
      setReason("");
      if (canDelete && redirectTo) router.push(redirectTo);
      router.refresh();
    });
  }

  const label = canDelete ? "Excluir aluno" : "Solicitar exclusão";
  return (
    <>
      <Button type="button" variant="outline" size={iconOnly ? "icon-sm" : "sm"} aria-label={`${label}: ${name}`} title={label} className={DANGER} onClick={() => setOpen(true)}>
        <Trash2 className="size-4" />
        {!iconOnly && label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{canDelete ? `Excluir ${name}?` : `Solicitar a exclusão de ${name}`}</DialogTitle>
            <DialogDescription>
              {canDelete
                ? `RGM ${rgm}. Serão apagados definitivamente a matrícula, as análises, os documentos enviados, as solicitações e a conta do Portal Acadêmico do aluno. A exclusão fica registrada na auditoria e não pode ser desfeita.`
                : `RGM ${rgm}. O pedido vai para a administração ou a coordenação acadêmica, que aprovam ou recusam. Até a decisão, nada é apagado.`}
            </DialogDescription>
          </DialogHeader>
          {!canDelete && (
            <label className="block text-sm font-medium">
              Motivo
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="Ex.: cadastro duplicado, RGM digitado errado, aluno desistiu do curso…" className="mt-2 min-h-24" />
            </label>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
            <Button type="button" onClick={submit} disabled={pending || (!canDelete && reason.trim().length < 3)} className={canDelete ? "bg-status-danger text-white hover:bg-status-danger/90" : undefined}>
              {pending ? "Enviando…" : canDelete ? "Excluir definitivamente" : "Enviar pedido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Aprovar ou recusar um pedido de exclusão (Administração e Coordenação). */
export function StudentDeletionDecision({ requestId, name }: { requestId: string; name: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"APPROVE" | "REJECT" | null>(null);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  function decide() {
    if (!mode) return;
    start(async () => {
      const result = await decideStudentDeletionAction({ requestId, decision: mode, note: note || undefined });
      if (!result.ok) { toast.error(result.error); return; }
      toast.success(result.message);
      setMode(null);
      setNote("");
      router.refresh();
    });
  }
  return (
    <>
      <span className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setMode("REJECT")}><X className="size-4" /> Recusar</Button>
        <Button type="button" size="sm" className="bg-status-danger text-white hover:bg-status-danger/90" onClick={() => setMode("APPROVE")}><Check className="size-4" /> Aprovar e excluir</Button>
      </span>
      <Dialog open={mode !== null} onOpenChange={(value) => !value && setMode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{mode === "APPROVE" ? `Aprovar e excluir ${name}?` : `Recusar o pedido de exclusão de ${name}?`}</DialogTitle>
            <DialogDescription>
              {mode === "APPROVE"
                ? "O aluno, as análises, os documentos enviados e a conta do Portal Acadêmico serão apagados definitivamente."
                : "O aluno é mantido. A observação fica registrada para o tutor."}
            </DialogDescription>
          </DialogHeader>
          <label className="block text-sm font-medium">
            Observação (opcional)
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} className="mt-2 min-h-20" />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMode(null)} disabled={pending}>Cancelar</Button>
            <Button type="button" onClick={decide} disabled={pending} className={mode === "APPROVE" ? "bg-status-danger text-white hover:bg-status-danger/90" : undefined}>
              {pending ? "Salvando…" : mode === "APPROVE" ? "Excluir definitivamente" : "Recusar pedido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
