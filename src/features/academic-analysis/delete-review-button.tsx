"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { deleteAcademicGridReviewAction } from "@/features/academic-analysis/actions";

export function DeleteAcademicGridReviewButton({ reviewId, compact = false }: { reviewId: string; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteAcademicGridReviewAction({ reviewId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      setOpen(false);
      router.push("/academic-analysis");
      router.refresh();
    });
  }

  return <>
    <Button type="button" variant="outline" size="sm" className="border-status-danger/30 text-status-danger hover:border-status-danger/50 hover:bg-status-danger-bg" onClick={() => setOpen(true)}>
      {compact ? "Excluir" : "Excluir análise"}
    </Button>
    <AlertDialog open={open} onOpenChange={(nextOpen) => !pending && setOpen(nextOpen)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir esta análise acadêmica?</AlertDialogTitle>
          <AlertDialogDescription>Remove a análise e o histórico de correções. Se ela faz parte do histórico de um aluno, a versão publicada e o documento que a gerou também são removidos, e a versão anterior volta a ser exibida no portal. Esta ação não pode ser desfeita.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={(event) => { event.preventDefault(); remove(); }} disabled={pending} className="bg-destructive text-white hover:bg-destructive/90">
            {pending ? "Excluindo…" : "Excluir definitivamente"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
