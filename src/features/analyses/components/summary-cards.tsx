import { Card, CardContent } from "@/components/ui/card";
import { ReliabilityBadge } from "@/components/shared/status-badge";
import { SourceBadge } from "@/features/analyses/components/source-badge";
import type { AnalysisVM } from "@/features/analyses/view-model";
import { ordinal, pluralize } from "@/lib/utils";

const ENTRY_SOURCE: Record<string, string> = {
  DOCUMENT: "Documento",
  STRUCTURED: "Campo estruturado",
  RULE: "Regra institucional",
  USER: "Confirmação do usuário",
};

export function SummaryCards({ vm, showSources = true }: { vm: AnalysisVM; showSources?: boolean }) {
  const cards: Array<{ label: string; value: React.ReactNode; source?: { label: string; detail?: string }; tone?: string; hint?: string }> = [
    { label: "Curso", value: vm.courseName ?? "Não identificado", source: { label: "PDF", detail: "Identificado a partir do documento" } },
    {
      label: "Período de ingresso",
      value: vm.entryPeriod ? ordinal(vm.entryPeriod) : "A confirmar",
      source: vm.entryPeriodSource ? { label: ENTRY_SOURCE[vm.entryPeriodSource] } : { label: "Pendente" },
      tone: vm.entryPeriod ? undefined : "text-status-warning",
    },
    { label: "Total da grade", value: vm.totals.total, source: { label: "PDF", detail: "Linhas da tabela DISCIPLINA" } },
    { label: "Dispensadas", value: vm.totals.exempted, source: { label: "Disciplina utilizada", detail: "Regra §6: coluna DISCIPLINA UTILIZADA com conteúdo" }, tone: "text-status-success" },
    { label: "Pendentes", value: vm.totals.pending + vm.totals.review, hint: vm.totals.review ? `${vm.totals.review} a revisar` : undefined, source: { label: "Disciplina utilizada" }, tone: "text-status-danger" },
    { label: "Pendências anteriores", value: vm.previousBacklogCount ?? "—", source: { label: "Motor", detail: "Pendentes de períodos anteriores ao ingresso" } },
    { label: "Semestres restantes", value: vm.semestersRemaining ?? "—", hint: vm.projectionIncomplete ? "previsão incompleta" : undefined, source: { label: `Motor v${vm.versions.engineVersion}` } },
    { label: "Previsão estimada", value: vm.estimatedCompletionTerm ?? (vm.projectionIncomplete ? "Regra pendente" : "—"), source: { label: `Regra v${vm.versions.ruleSetVersion}`, detail: `extraSubjectsAllowed = ${vm.rules.extraSubjectsAllowed}` }, tone: vm.estimatedCompletionTerm ? "text-brand-navy" : "text-status-warning" },
    { label: "Verificação", value: <ReliabilityBadge level={vm.reliability} />, hint: vm.reviewItemsCount ? pluralize(vm.reviewItemsCount, "observação registrada", "observações registradas") : "Sem observações" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {cards.map((c) => (
        <Card key={c.label} className="shadow-sm">
          <CardContent className="space-y-1.5">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{c.label}</div>
            <div className={`min-w-0 break-words text-xl font-semibold tracking-tight ${c.tone ?? ""}`} title={typeof c.value === "string" ? c.value : undefined}>
              {c.value}
            </div>
            <div className="flex items-center justify-between gap-2">
              {showSources && c.source ? <SourceBadge label={c.source.label} detail={c.source.detail} /> : <span />}
              {c.hint && <span className="text-[11px] text-muted-foreground">{c.hint}</span>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
