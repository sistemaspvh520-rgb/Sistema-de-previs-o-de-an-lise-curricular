"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { createMatrixAction, replaceMatrixSubjectsAction, toggleMatrixActiveAction } from "@/features/matrices/actions";

export function CreateMatrixDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  function submit(fd: FormData) {
    start(async () => {
      const res = await createMatrixAction(Object.fromEntries(fd.entries()));
      if (res.ok) {
        toast.success(res.message);
        setOpen(false);
        router.push(`/matrices/${res.data.id}`);
      } else toast.error(res.error);
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="size-4" /> Nova matriz</Button></DialogTrigger>
      <DialogContent>
        <form action={submit}>
          <DialogHeader>
            <DialogTitle>Nova matriz curricular</DialogTitle>
            <DialogDescription>Curso, modalidade, ano/versão e vigência. As disciplinas são cadastradas em seguida.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="courseName">Curso</Label><Input id="courseName" name="courseName" required /></div>
              <div className="space-y-2"><Label htmlFor="modality">Modalidade</Label><Input id="modality" name="modality" placeholder="EAD" /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="label">Rótulo da matriz</Label><Input id="label" name="label" required placeholder="Matriz 2024.1" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="year">Ano</Label><Input id="year" name="year" type="number" required defaultValue={new Date().getFullYear()} /></div>
              <div className="space-y-2"><Label htmlFor="version">Versão</Label><Input id="version" name="version" required defaultValue="1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="validFrom">Vigência de</Label><Input id="validFrom" name="validFrom" type="date" /></div>
              <div className="space-y-2"><Label htmlFor="validTo">Vigência até</Label><Input id="validTo" name="validTo" type="date" /></div>
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Criar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MatrixSubjectsEditor({ matrixId, initialText }: { matrixId: string; initialText: string }) {
  const [text, setText] = useState(initialText);
  const [pending, start] = useTransition();
  function save() {
    start(async () => {
      const res = await replaceMatrixSubjectsAction({ matrixId, text });
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }
  return (
    <div className="space-y-3">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={18} className="font-mono text-xs" placeholder={"1 | LÍNGUA PORTUGUESA | 80\n1 | MATEMÁTICA BÁSICA | 80\n2 | DIREITO CIVIL I | 80 | INTRODUÇÃO AO DIREITO"} />
      <p className="text-xs text-muted-foreground">Uma disciplina por linha: <code className="font-mono">período | disciplina | carga horária | pré-requisitos (separados por ;)</code>. Pré-requisitos são informativos — o motor não os aplica (regra não configurada).</p>
      <Button onClick={save} disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar disciplinas</Button>
    </div>
  );
}

export function MatrixActiveSwitch({ matrixId, isActive }: { matrixId: string; isActive: boolean }) {
  const [checked, setChecked] = useState(isActive);
  const [pending, start] = useTransition();
  return (
    <Switch
      checked={checked}
      disabled={pending}
      onCheckedChange={(v) => {
        setChecked(v);
        start(async () => {
          const res = await toggleMatrixActiveAction({ matrixId, isActive: v });
          if (!res.ok) {
            toast.error(res.error);
            setChecked(!v);
          }
        });
      }}
      aria-label="Matriz ativa"
    />
  );
}
