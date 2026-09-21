"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteAnalysisAction } from "@/features/maintenance/actions";

export function DeleteAnalysisButton({ analysisId }: { analysisId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();
  function run() {
    start(async () => {
      const res = await deleteAnalysisAction({ analysisId });
      if (res.ok) {
        toast.success(res.message);
        router.push("/analyses");
      } else toast.error(res.error);
    });
  }
  return (
    <>
      <Button variant="outline" className="text-status-danger hover:text-status-danger" onClick={() => { setConfirm(""); setOpen(true); }}>
        <Trash2 className="size-4" /> Excluir análise
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta análise?</AlertDialogTitle>
            <AlertDialogDescription>Remove definitivamente a análise, disciplinas, previsão, correções, alertas, dados da IA e o PDF. Para confirmar, digite <strong>EXCLUIR</strong>.</AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="EXCLUIR" autoComplete="off" />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); run(); }} disabled={pending || confirm !== "EXCLUIR"} className="bg-destructive text-white hover:bg-destructive/90">
              {pending && <Loader2 className="size-4 animate-spin" />} Excluir definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
