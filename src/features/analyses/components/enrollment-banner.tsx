"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  Loader2,
  UserCheck,
  UserX,
  Clock3,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { updateEnrollmentAction } from "@/features/analyses/enrollment-actions";
import { cn } from "@/lib/utils";

type Status = "PENDING" | "ENROLLED" | "NOT_ENROLLED";

const LABEL: Record<Status, string> = {
  PENDING: "Sem retorno",
  ENROLLED: "Aluno matriculado",
  NOT_ENROLLED: "Aluno não se matriculou",
};

/** Pergunta ao consultor se o aluno se matriculou; vence 24h após a entrega (cobrado por push/e-mail). */
export function EnrollmentBanner({
  analysisId,
  status,
  note,
  updatedAtLabel,
  updatedByName,
  reanalysisAtLabel,
  due,
  canEdit,
}: {
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
  const [editing, setEditing] = useState(status === "PENDING");
  const [text, setText] = useState(note ?? "");
  const [reanalysisCompleted, setReanalysisCompleted] = useState(false);

  function save(next: Status) {
    start(async () => {
      const res = await updateEnrollmentAction({
        analysisId,
        status: next,
        note: text,
        reanalysisCompleted: next === "NOT_ENROLLED" && reanalysisCompleted,
      });
      if (res.ok) {
        toast.success(res.message);
        setEditing(false);
      } else toast.error(res.error);
    });
  }

  if (!editing) {
    const positive = status === "ENROLLED";
    return (
      <div
        className={cn(
          "flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between",
          positive
            ? "border-status-success/30 bg-status-success-bg"
            : "border-border bg-card",
        )}
      >
        <div className="flex items-start gap-3">
          {positive ? (
            <UserCheck className="mt-0.5 size-5 shrink-0 text-status-success" />
          ) : (
            <UserX className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          )}
          <div>
            <div
              className={cn(
                "font-semibold",
                positive ? "text-status-success" : "text-foreground",
              )}
            >
              {LABEL[status]}
            </div>
            <p className="text-sm text-muted-foreground">
              {reanalysisAtLabel
                ? `Reanálise informada em ${reanalysisAtLabel}. Nova confirmação em 24 horas.`
                : `${updatedByName ? `Informado por ${updatedByName}` : "Informado"}${updatedAtLabel ? ` em ${updatedAtLabel}` : ""}${note ? ` · ${note}` : ""}`}
            </p>
          </div>
        </div>
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setEditing(true)}
          >
            Alterar retorno
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4",
        due
          ? "border-status-warning/40 bg-status-warning-bg"
          : "border-brand-cyan/30 bg-brand-cyan-50/60",
      )}
    >
      <div className="flex items-start gap-3">
        <Clock3
          className={cn(
            "mt-0.5 size-5 shrink-0",
            due ? "text-status-warning" : "text-brand-cyan-700",
          )}
        />
        <div>
          <div
            className={cn(
              "font-semibold",
              due ? "text-status-warning" : "text-brand-navy",
            )}
          >
            {due
              ? "Confirmação obrigatória: o aluno se matriculou?"
              : "Confirmação obrigatória de matrícula"}
          </div>
          <p className="text-sm text-muted-foreground">
            {due
              ? "A análise foi entregue há mais de 24 horas. Informe o resultado para concluir este retorno."
              : "Após o atendimento, informe se houve matrícula. Sem resposta, o aviso continuará no e-mail e no sistema."}
          </p>
        </div>
      </div>
      {canEdit ? (
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-2">
            <label
              htmlFor={`enrollment-note-${analysisId}`}
              className="text-sm font-medium"
            >
              Motivo, caso não tenha se matriculado{" "}
              <span className="text-status-danger">*</span>
            </label>
            <Textarea
              id={`enrollment-note-${analysisId}`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={300}
              placeholder="Ex.: desistiu, aguardará nova condição comercial..."
              className="min-h-20 bg-card"
            />
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={reanalysisCompleted}
                onCheckedChange={(checked) =>
                  setReanalysisCompleted(checked === true)
                }
              />
              <span>
                <RotateCcw className="mr-1 inline size-3.5" />
                Foi feita reanálise — solicitar nova confirmação em 24h
              </span>
            </label>
          </div>
          <div className="flex flex-wrap gap-2 md:justify-end">
            <Button
              size="sm"
              onClick={() => save("ENROLLED")}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}{" "}
              Sim, matriculou
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="bg-card"
              onClick={() => save("NOT_ENROLLED")}
              disabled={pending}
            >
              <UserX className="size-4" /> Não se matriculou
            </Button>
            {status !== "PENDING" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
                disabled={pending}
              >
                Cancelar
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          O consultor responsável informará o retorno.
        </p>
      )}
    </div>
  );
}
