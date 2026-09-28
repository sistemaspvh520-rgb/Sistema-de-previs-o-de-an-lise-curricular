"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { reassignStudentTutorAction } from "./deletion-actions";

/** Troca ou atribui o tutor do aluno (Administração e Coordenação). */
export function TutorSelect({ enrollmentId, ownerId, tutors, compact = false }: { enrollmentId: string; ownerId: string; tutors: Array<{ id: string; name: string; roleLabel: string }>; compact?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(ownerId);
  const [pending, start] = useTransition();
  function change(next: string) {
    const previous = value;
    setValue(next);
    start(async () => {
      const result = await reassignStudentTutorAction({ enrollmentId, ownerId: next });
      if (!result.ok) { toast.error(result.error); setValue(previous); return; }
      toast.success(result.message);
      router.refresh();
    });
  }
  return (
    <select
      aria-label="Tutor responsável"
      value={value}
      disabled={pending}
      onChange={(event) => change(event.target.value)}
      className={compact ? "h-9 w-full min-w-40 max-w-56 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 disabled:opacity-60" : "h-10 w-full rounded-lg border border-white/30 bg-white/10 px-3 text-sm text-white disabled:opacity-60 [&>option]:text-slate-900"}
    >
      {!tutors.some((tutor) => tutor.id === value) && <option value={value}>Tutor atual (inativo)</option>}
      {tutors.map((tutor) => <option key={tutor.id} value={tutor.id}>{compact ? tutor.name : `${tutor.name} · ${tutor.roleLabel}`}</option>)}
    </select>
  );
}
