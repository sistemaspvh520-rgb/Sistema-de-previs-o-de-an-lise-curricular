"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUBJECT_STATUS_LABELS } from "@/components/shared/status-badge";
import { updateSubjectAction } from "@/features/analyses/actions";
import type { SubjectVM } from "@/features/analyses/view-model";
import type { SubjectStatus } from "@/generated/prisma/enums";

export function SubjectEditDialog({
  analysisId,
  subject,
  open,
  onOpenChange,
}: {
  analysisId: string;
  subject: SubjectVM | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {subject && (
          <SubjectEditForm
            key={subject.id}
            analysisId={analysisId}
            subject={subject}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SubjectEditForm({
  analysisId,
  subject,
  onOpenChange,
}: {
  analysisId: string;
  subject: SubjectVM;
  onOpenChange: (o: boolean) => void;
}) {
  const [name, setName] = useState(subject.name);
  const [workload, setWorkload] = useState(String(subject.workload));
  const [period, setPeriod] = useState(String(subject.period));
  const [usedSubject, setUsedSubject] = useState(subject.usedSubject ?? "");
  const [status, setStatus] = useState<SubjectStatus>(subject.status);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await updateSubjectAction({
        analysisId,
        subjectId: subject.id,
        name,
        workload,
        period,
        usedSubject: usedSubject.trim() ? usedSubject : null,
        status,
        reason,
      });
      if (res.ok) {
        toast.success(res.message);
        onOpenChange(false);
      } else toast.error(res.error);
    });
  }

  const suggested: SubjectStatus =
    usedSubject.trim() && !/^[\s\-–—]+$/.test(usedSubject)
      ? "EXEMPTED"
      : "PENDING";

  return (
    <>
      <DialogHeader>
        <DialogTitle>Corrigir disciplina</DialogTitle>
        <DialogDescription>
          Fonte: PDF · página {subject.sourcePage} · linha {subject.sourceRow}.
          A alteração fica registrada no histórico e o motor recalcula
          automaticamente.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <div className="space-y-2">
          <Label htmlFor="s-name">Disciplina (grade de destino)</Label>
          <Input
            id="s-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="s-workload">C.H. (horas)</Label>
            <Input
              id="s-workload"
              type="number"
              min={0}
              value={workload}
              onChange={(e) => setWorkload(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-period">Período</Label>
            <Input
              id="s-period"
              type="number"
              min={1}
              max={20}
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-used">
            Disciplina utilizada (formação anterior)
          </Label>
          <Input
            id="s-used"
            value={usedSubject}
            onChange={(e) => setUsedSubject(e.target.value)}
            placeholder="vazio ou - = sem aproveitamento"
          />
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as SubjectStatus)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SUBJECT_STATUS_LABELS) as SubjectStatus[]).map(
                (s) => (
                  <SelectItem key={s} value={s}>
                    {SUBJECT_STATUS_LABELS[s]}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          {status !== suggested && status !== "REVIEW" && (
            <p className="text-xs text-status-warning">
              Pela regra da Disciplina Utilizada o status sugerido seria{" "}
              <strong>{SUBJECT_STATUS_LABELS[suggested]}</strong>. Registre o
              motivo abaixo.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-reason">Motivo (opcional)</Label>
          <Textarea
            id="s-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button onClick={save} disabled={pending || !name.trim()}>
          {pending && <Loader2 className="size-4 animate-spin" />} Salvar e
          recalcular
        </Button>
      </DialogFooter>
    </>
  );
}
