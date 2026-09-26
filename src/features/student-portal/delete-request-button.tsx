"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
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
import { deleteAcademicRequestAction } from "./request-actions";

export function DeleteRequestButton({
  requestId,
  protocol,
  redirectTo,
  iconOnly = false,
}: {
  requestId: string;
  protocol: number;
  redirectTo?: string;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  function remove() {
    start(async () => {
      const result = await deleteAcademicRequestAction({ requestId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      setOpen(false);
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    });
  }
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={iconOnly ? "icon-sm" : "sm"}
        aria-label={`Excluir solicitação #${protocol}`}
        title="Excluir solicitação"
        className="border-status-danger/30 text-status-danger hover:border-status-danger/50 hover:bg-status-danger-bg hover:text-status-danger"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" />
        {!iconOnly && "Excluir"}
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a solicitação #{protocol}?</AlertDialogTitle>
            <AlertDialogDescription>
              O documento enviado e a versão da análise gerada por ele serão removidos. Se era a análise atual do aluno, a
              versão anterior volta a ser exibida no portal. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                remove();
              }}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? "Excluindo…" : "Excluir definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
