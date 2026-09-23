"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteAnalysisAction } from "@/features/maintenance/actions";

export function DeleteAnalysisButton({
  analysisId,
  compact = false,
}: {
  analysisId: string;
  /** Versão compacta para tabelas operacionais. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  function run() {
    start(async () => {
      const res = await deleteAnalysisAction({ analysisId });
      if (res.ok) {
        toast.success(res.message);
        if (compact) router.refresh();
        else router.push("/analyses");
      } else toast.error(res.error);
    });
  }
  return (
    <>
      <Button
        variant="outline"
        size={compact ? "icon" : "default"}
        className="text-status-danger hover:text-status-danger"
        aria-label="Excluir análise"
        title="Excluir análise"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <Trash2 className="size-4" />
        {!compact && "Excluir análise"}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta análise?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove definitivamente a análise, disciplinas, previsão,
              correções, alertas, dados da IA e o PDF. Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                run();
              }}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending && <Loader2 className="size-4 animate-spin" />} Excluir
              definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
