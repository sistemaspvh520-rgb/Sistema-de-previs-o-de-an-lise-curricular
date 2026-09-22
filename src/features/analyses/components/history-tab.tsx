import { formatDateTime, pluralize } from "@/lib/utils";
import type { AnalysisVM } from "@/features/analyses/view-model";

const FIELD_LABEL: Record<string, string> = {
  name: "Disciplina",
  workload: "C.H.",
  period: "Período",
  usedSubject: "Disciplina utilizada",
  status: "Status",
  entryPeriod: "Período de ingresso",
  startTerm: "Semestre de ingresso",
  entryTerm: "Semestre de ingresso",
};

export function HistoryTab({ vm }: { vm: AnalysisVM }) {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold">Histórico da análise</h3>
        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Row k="Criada por" v={`${vm.createdBy.name} · ${formatDateTime(vm.createdAt)}`} />
          <Row k="Documento" v={vm.document ? `${vm.document.originalName} · ${vm.document.pageCount ?? "?"} pág.` : "—"} />
          <Row k="Regras acadêmicas" v={`Versão ${vm.versions.ruleSetVersion}`} />
          <Row k="Última atualização" v={formatDateTime(vm.lastCalculatedAt)} />
          <Row k="Entrega" v={vm.completedAt ? `Concluída em ${formatDateTime(vm.completedAt)}` : "Em processamento"} />
        </dl>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Alterações do analista ({pluralize(vm.corrections.length, "registro")})</h3>
        {vm.corrections.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma alteração foi necessária até o momento.</div>
        ) : (
          <ol className="relative space-y-3 border-l pl-5">
            {vm.corrections.map((c) => (
              <li key={c.id} className="relative">
                <span className="absolute -left-[26px] top-1.5 size-2.5 rounded-full bg-brand-cyan ring-4 ring-background" />
                <div className="rounded-lg border bg-card p-3 shadow-sm">
                  <div className="text-xs text-muted-foreground">{formatDateTime(c.createdAt)} · {c.user}</div>
                  <div className="text-sm">
                    <span className="font-medium">{FIELD_LABEL[c.field] ?? c.field}</span>
                    {c.subjectName && <span className="text-muted-foreground"> de {c.subjectName}</span>}:{" "}
                    <span className="rounded bg-status-danger-bg px-1 text-status-danger line-through">{c.previousValue ?? "—"}</span>{" "}
                    → <span className="rounded bg-status-success-bg px-1 text-status-success">{c.newValue ?? "—"}</span>
                  </div>
                  {c.reason && <div className="mt-1 text-xs text-muted-foreground">Motivo: {c.reason}</div>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="break-words [overflow-wrap:anywhere]">{v}</dd>
    </div>
  );
}
