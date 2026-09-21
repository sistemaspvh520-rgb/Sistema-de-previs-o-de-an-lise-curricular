"use client";

import { StatusIcon } from "@/features/analyses/components/grade-table";
import { SUBJECT_STATUS_LABELS } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import type { SubjectVM } from "@/features/analyses/view-model";

/** Visualização agrupada por período (§49). */
export function GradeByPeriod({ subjects, entryPeriod, onLocate, selectedId }: { subjects: SubjectVM[]; entryPeriod: number | null; onLocate?: (s: SubjectVM) => void; selectedId?: string | null }) {
  const periods = [...new Set(subjects.map((s) => s.period))].sort((a, b) => a - b);
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {periods.map((p) => {
        const list = subjects.filter((s) => s.period === p).sort((a, b) => a.sortIndex - b.sortIndex);
        const exempted = list.filter((s) => s.status === "EXEMPTED").length;
        const isBefore = entryPeriod !== null && p < entryPeriod;
        const isEntry = entryPeriod === p;
        return (
          <div key={p} className={cn("rounded-xl border bg-card shadow-sm", isEntry && "ring-2 ring-brand-cyan")}>
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <div className="font-semibold">{p}º PERÍODO</div>
              <div className="text-xs text-muted-foreground">
                {exempted}/{list.length} dispensadas
                {isEntry && <span className="ml-2 rounded bg-brand-cyan-50 px-1.5 py-0.5 text-brand-cyan-700">ingresso</span>}
                {isBefore && <span className="ml-2 rounded bg-status-neutral-bg px-1.5 py-0.5">anterior</span>}
              </div>
            </div>
            <ul className="divide-y">
              {list.map((s) => (
                <li
                  key={s.id}
                  onClick={() => onLocate?.(s)}
                  className={cn("flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-muted/50", selectedId === s.id && "bg-brand-cyan-50")}
                >
                  <div className="mt-0.5"><StatusIcon status={s.status} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-tight">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {SUBJECT_STATUS_LABELS[s.status]} · {s.workload}h
                      {s.usedSubject && (
                        <>
                          {" "}· Utilizada: <span className="text-foreground">{s.usedSubject}</span>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
