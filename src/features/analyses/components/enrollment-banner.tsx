"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, CircleHelp, Clock3, Loader2, RotateCcw, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateEnrollmentAction } from "@/features/analyses/enrollment-actions";
import { cn } from "@/lib/utils";

type Status = "PENDING" | "ENROLLED" | "NOT_ENROLLED";

const LABEL: Record<Status, string> = {
  PENDING: "Aguardando retorno",
  ENROLLED: "Aluno matriculado",
  NOT_ENROLLED: "Aluno não se matriculou",
};

/** Registra o resultado comercial com três decisões mutuamente compreensíveis. */
export function EnrollmentBanner({ analysisId, status, note, updatedAtLabel, updatedByName, reanalysisAtLabel, due, canEdit }: {
  analysisId: string;
  status: Status;
  note: string | null;
  updatedAtLabel: string | null;
  updatedByName: string | null;
  reanalysisAtLabel: string | null;
  due: boolean;
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(status === "PENDING" && (!reanalysisAtLabel || due));
  const [decision, setDecision] = useState<"NOT_ENROLLED" | null>(null);
  const [text, setText] = useState(note ?? "");

  function save(next: "ENROLLED" | "NOT_ENROLLED", reanalysis = false) {
    start(async () => {
      const res = await updateEnrollmentAction({ analysisId, status: next, note: text, reanalysisCompleted: reanalysis });
      if (res.ok) {
        toast.success(res.message);
        setDecision(null);
        setEditing(false);
      } else toast.error(res.error);
    });
  }

  if (!editing) {
    const positive = status === "ENROLLED";
    return (
      <div className={cn("flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between", positive ? "border-status-success/30 bg-status-success-bg" : "border-brand-cyan/30 bg-brand-cyan-50/50")}>
        <div className="flex items-start gap-3">
          {positive ? <UserCheck className="mt-0.5 size-5 shrink-0 text-status-success" /> : <RotateCcw className="mt-0.5 size-5 shrink-0 text-brand-cyan-700" />}
          <div>
            <div className={cn("font-semibold", positive ? "text-status-success" : "text-brand-navy")}>{reanalysisAtLabel ? "Reanálise registrada" : LABEL[status]}</div>
            <p className="text-sm text-muted-foreground">
              {reanalysisAtLabel
                ? `Novo retorno programado para 24 horas após ${reanalysisAtLabel}.`
                : `${updatedByName ? `Informado por ${updatedByName}` : "Informado"}${updatedAtLabel ? ` em ${updatedAtLabel}` : ""}${note ? ` · ${note}` : ""}`}
            </p>
          </div>
        </div>
        {canEdit && <Button variant="outline" size="sm" className="shrink-0" onClick={() => setEditing(true)}>Alterar retorno</Button>}
      </div>
    );
  }

  return (
    <section className={cn("rounded-2xl border p-4 shadow-sm sm:p-5", due ? "border-status-warning/50 bg-status-warning-bg" : "border-brand-cyan/30 bg-brand-cyan-50/50")} aria-label="Atualização do resultado comercial">
      <div className="flex items-start gap-3">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", due ? "bg-status-warning/15 text-status-warning" : "bg-brand-cyan/10 text-brand-cyan-700")}><Clock3 className="size-5" /></span>
        <div>
          <p className={cn("font-semibold", due ? "text-status-warning" : "text-brand-navy")}>{due ? "Ação necessária: registre o resultado do atendimento" : "Resultado do atendimento"}</p>
          <p className="mt-1 text-sm text-muted-foreground">{due ? "Já se passaram 24 horas. Escolha o desfecho abaixo para manter a carteira atualizada." : "Quando houver uma definição, selecione uma das três opções abaixo."}</p>
        </div>
      </div>

      {canEdit ? (
        <div className="mt-5 space-y-4">
          <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Resultado do atendimento">
            <OutcomeButton icon={pending ? Loader2 : CheckCircle2} title="Matriculou" description="Registrar matrícula confirmada" tone="success" disabled={pending} onClick={() => save("ENROLLED")} />
            <OutcomeButton icon={UserX} title="Não se matriculou" description="Informar o motivo" tone="danger" active={decision === "NOT_ENROLLED"} disabled={pending} onClick={() => setDecision("NOT_ENROLLED")} />
            <OutcomeButton icon={RotateCcw} title="Reanálise" description="Novo retorno em 24 horas" tone="info" disabled={pending} onClick={() => save("NOT_ENROLLED", true)} />
          </div>

          {decision === "NOT_ENROLLED" && (
            <div className="rounded-xl border border-status-danger/25 bg-card/90 p-3 sm:p-4">
              <div className="flex items-start gap-2">
                <CircleHelp className="mt-0.5 size-4 shrink-0 text-status-danger" />
                <div className="min-w-0 flex-1 space-y-2">
                  <label htmlFor={`enrollment-note-${analysisId}`} className="text-sm font-semibold">Motivo da não matrícula <span className="text-status-danger">*</span></label>
                  <Textarea id={`enrollment-note-${analysisId}`} value={text} onChange={(event) => setText(event.target.value)} maxLength={300} placeholder="Ex.: desistiu, aguardará nova condição comercial..." className="min-h-20 bg-card" autoFocus />
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setDecision(null)} disabled={pending}>Cancelar</Button>
                    <Button type="button" size="sm" variant="destructive" onClick={() => save("NOT_ENROLLED")} disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Confirmar não matrícula</Button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {status !== "PENDING" && <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDecision(null); }} disabled={pending}>Cancelar alteração</Button>}
        </div>
      ) : <p className="mt-4 text-sm text-muted-foreground">O consultor responsável informará o retorno.</p>}
    </section>
  );
}

function OutcomeButton({ icon: Icon, title, description, tone, active = false, disabled, onClick }: {
  icon: typeof CheckCircle2;
  title: string;
  description: string;
  tone: "success" | "danger" | "info";
  active?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const colors = {
    success: "border-status-success/35 hover:border-status-success hover:bg-status-success-bg text-status-success",
    danger: "border-status-danger/35 hover:border-status-danger hover:bg-status-danger-bg text-status-danger",
    info: "border-brand-cyan/40 hover:border-brand-cyan hover:bg-brand-cyan-50 text-brand-cyan-700",
  };
  return (
    <Button variant="outline" className={cn("h-auto min-h-20 justify-start bg-card px-4 py-3 text-left", colors[tone], active && "border-status-danger bg-status-danger-bg")} disabled={disabled} onClick={onClick}>
      <Icon className={cn("size-5 shrink-0", title === "Matriculou" && disabled && "animate-spin")} />
      <span><span className="block font-semibold text-foreground">{title}</span><span className="mt-0.5 block whitespace-normal text-xs font-normal text-muted-foreground">{description}</span></span>
    </Button>
  );
}
