"use client";
import { useActionState } from "react";
import { academicRequestAction } from "./request-actions";
import { Button } from "@/components/ui/button";
export function RequestControls({
  id,
  closed,
  processing = false,
}: {
  id: string;
  closed: boolean;
  processing?: boolean;
}) {
  const [state, action, pending] = useActionState(academicRequestAction, {});
  if (processing)
    return (
      <p role="status" className="text-sm text-sky-700">
        Conferindo documento. As ações serão liberadas ao terminar.
      </p>
    );
  if (closed)
    return (
      <p className="text-sm text-slate-500">
        Tentativa encerrada. O aluno deve enviar um novo documento.
      </p>
    );
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <label className="block text-sm">
        Orientação ao aluno (ao recusar)
        <textarea
          name="reason"
          maxLength={1000}
          className="mt-2 block min-h-20 w-full rounded-xl border p-3"
          placeholder="Explique o que precisa ser corrigido no próximo envio."
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <Button
          name="action"
          value="REVIEW"
          disabled={pending}
          variant="outline"
        >
          Processar / conferir
        </Button>
        <Button name="action" value="CONCLUDE" disabled={pending}>
          Concluir
        </Button>
        <Button
          name="action"
          value="REJECT"
          disabled={pending}
          variant="destructive"
        >
          Recusar documento
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-sm text-emerald-700">
          {state.success}
        </p>
      )}
    </form>
  );
}
