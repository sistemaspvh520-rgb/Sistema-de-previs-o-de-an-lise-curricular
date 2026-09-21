"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { ActionResult } from "@/lib/action-result";

type Scope = "ALL" | "30" | "90" | "180" | "365";

export function PurgeCard({
  title,
  description,
  count,
  countLabel,
  action,
  extra,
}: {
  title: string;
  description: string;
  count: number;
  countLabel: string;
  action: (input: { confirm: string; olderThanDays: number | null; onlyStatus?: string }) => Promise<ActionResult<unknown>>;
  extra?: { label: string; options: Array<{ value: string; label: string }> };
}) {
  const [scope, setScope] = useState<Scope>("ALL");
  const [extraValue, setExtraValue] = useState(extra?.options[0]?.value ?? "ALL");
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      const res = await action({ confirm, olderThanDays: scope === "ALL" ? null : Number(scope), ...(extra ? { onlyStatus: extraValue } : {}) });
      setOpen(false);
      setConfirm("");
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-2xl font-semibold tracking-tight">{count.toLocaleString("pt-BR")} <span className="text-sm font-normal text-muted-foreground">{countLabel}</span></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Alcance</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tudo</SelectItem>
                <SelectItem value="30">Mais antigos que 30 dias</SelectItem>
                <SelectItem value="90">Mais antigos que 90 dias</SelectItem>
                <SelectItem value="180">Mais antigos que 180 dias</SelectItem>
                <SelectItem value="365">Mais antigos que 1 ano</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {extra && (
            <div className="space-y-1.5">
              <Label>{extra.label}</Label>
              <Select value={extraValue} onValueChange={setExtraValue}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {extra.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <Button variant="destructive" onClick={() => setOpen(true)} disabled={count === 0}>
          <Trash2 className="size-4" /> Limpar
        </Button>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription>
                A exclusão é definitiva e não pode ser desfeita. Para confirmar, digite <strong>LIMPAR</strong>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="LIMPAR" autoComplete="off" />
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => { e.preventDefault(); run(); }} disabled={pending || confirm !== "LIMPAR"} className="bg-destructive text-white hover:bg-destructive/90">
                {pending && <Loader2 className="size-4 animate-spin" />} Confirmar limpeza
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
