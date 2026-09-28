"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setStudentPoloAction } from "./polo-actions";

/** Polo do aluno na área da equipe: define ou corrige (o aluno não pode trocar depois de definido). */
export function StudentPoloSelect({ enrollmentId, poloCode, polos }: { enrollmentId: string; poloCode: string | null; polos: Array<{ code: string; name: string }> }) {
  const router = useRouter();
  const [value, setValue] = useState(poloCode ?? "");
  const [pending, start] = useTransition();
  function change(next: string) {
    const previous = value;
    setValue(next);
    start(async () => {
      const result = await setStudentPoloAction({ enrollmentId, code: next || null });
      if (!result.ok) { toast.error(result.error); setValue(previous); return; }
      toast.success(result.message);
      router.refresh();
    });
  }
  return (
    <select
      aria-label="Polo do aluno"
      value={value}
      disabled={pending}
      onChange={(event) => change(event.target.value)}
      className="h-10 w-full rounded-lg border border-white/30 bg-white/10 px-3 text-sm text-white disabled:opacity-60 [&>option]:text-slate-900"
    >
      <option value="">Sem polo — o aluno confirma no primeiro acesso</option>
      {polos.map((polo) => <option key={polo.code} value={polo.code}>{polo.name}</option>)}
    </select>
  );
}
