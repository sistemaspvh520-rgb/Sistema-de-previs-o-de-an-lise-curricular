import { SubjectStatusBadge } from "@/components/shared/status-badge";
import type { AnalysisVM } from "@/features/analyses/view-model";
import { cn } from "@/lib/utils";

export function PendingTab({ vm, onLocate }: { vm: AnalysisVM; onLocate: (id: string) => void }) {
  const needs = vm.subjects.filter((s) => s.status === "PENDING" || (s.status === "REVIEW" && vm.rules.reviewCountsAsPending));
  const backlog = vm.entryPeriod === null ? [] : needs.filter((s) => s.period < vm.entryPeriod!).sort((a, b) => a.period - b.period || a.sortIndex - b.sortIndex);
  const regular = vm.entryPeriod === null ? needs : needs.filter((s) => s.period >= vm.entryPeriod!);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <h3 className="font-semibold">Pendências anteriores ao ingresso (backlog)</h3>
          <p className="text-xs text-muted-foreground">Ordem de alocação: período mais antigo primeiro; dentro do período, ordem do documento.</p>
        </div>
        {vm.entryPeriod === null ? (
          <div className="p-6 text-sm text-muted-foreground">O PDF não informou o período de ingresso. Use a simulação de cenário, se necessário, para separar o backlog.</div>
        ) : backlog.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Nenhuma pendência de períodos anteriores.</div>
        ) : (
          <ol className="divide-y">
            {backlog.map((s, i) => (
              <li key={s.id} onClick={() => onLocate(s.id)} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                <span className="w-6 text-right font-mono text-xs text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.period}º período · {s.workload}h</div>
                </div>
                <div className="text-right">
                  <SubjectStatusBadge status={s.status} />
                  <div className={cn("mt-0.5 text-[11px]", s.scheduledTerm ? "text-brand-cyan-700" : "text-status-danger")}>
                    {s.scheduledTerm ? `adaptação em ${s.scheduledTerm}` : "sem vaga"}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <h3 className="font-semibold">A cursar como regulares</h3>
          <p className="text-xs text-muted-foreground">Pendentes do período de ingresso em diante — cursadas no próprio período.</p>
        </div>
        {regular.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Nenhuma.</div>
        ) : (
          <ul className="divide-y">
            {regular.map((s) => (
              <li key={s.id} onClick={() => onLocate(s.id)} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.period}º período · {s.workload}h</div>
                </div>
                <div className="text-right">
                  <SubjectStatusBadge status={s.status} />
                  {s.scheduledTerm && <div className="mt-0.5 text-[11px] text-muted-foreground">{s.scheduledTerm}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
