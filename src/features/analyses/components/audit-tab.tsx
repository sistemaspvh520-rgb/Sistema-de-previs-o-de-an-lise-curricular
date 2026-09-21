"use client";

import { useTransition } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, ShieldAlert, Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatDateTime, pluralize } from "@/lib/utils";
import { resolveWarningAction, reauditAnalysisAction } from "@/features/analyses/actions";
import type { AnalysisVM, WarningVM } from "@/features/analyses/view-model";

const SOURCE_LABEL: Record<WarningVM["source"], string> = {
  AUDITOR: "Verificação por IA",
  VALIDATOR: "Validação do sistema",
  PIPELINE: "Processamento",
  MATRIX: "Matriz oficial",
  EXTRACTION: "Leitura local × IA",
};

export function AuditTab({ vm, canEdit, onLocateSubject }: { vm: AnalysisVM; canEdit: boolean; onLocateSubject: (subjectId: string) => void }) {
  const [pending, start] = useTransition();
  const open = vm.warnings.filter((w) => !w.resolvedAt);
  const resolved = vm.warnings.filter((w) => w.resolvedAt);
  const byId = new Map(vm.subjects.map((s) => [s.id, s]));

  function resolve(w: WarningVM) {
    start(async () => {
      const res = await resolveWarningAction({ analysisId: vm.id, warningId: w.id });
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }
  function reaudit() {
    start(async () => {
      const res = await reauditAnalysisAction(vm.id);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard
          title="Resultado da verificação"
          icon={<Sparkles className="size-4 text-brand-cyan-700" />}
          body={
            vm.review ? (
              <>
                <div className={cn("text-lg font-semibold", vm.review.status === "OK" ? "text-status-success" : "text-status-warning")}>
                  {vm.review.status === "OK" ? "Tudo certo" : pluralize(vm.review.issues, "observação", "observações")}
                </div>
                <div className="text-xs text-muted-foreground">Verificada em {formatDateTime(vm.review.createdAt)}</div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">A verificação ainda não foi executada.</div>
            )
          }
          footer={
            canEdit && !vm.isProcessing ? (
              <Button variant="outline" size="sm" onClick={reaudit} disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Executar nova verificação
              </Button>
            ) : null
          }
        />
        <InfoCard
          title="Conferência dos cálculos"
          icon={<ShieldAlert className="size-4 text-brand-navy" />}
          body={
            <>
              <div className="text-lg font-semibold">{pluralize(open.filter((w) => w.source !== "AUDITOR").length, "observação", "observações")}</div>
              <div className="text-xs text-muted-foreground">Conferência entre os dados do documento e o cálculo.</div>
            </>
          }
        />
        <InfoCard
          title="Dados conferidos no documento"
          icon={<Info className="size-4 text-status-info" />}
          body={
            vm.claims.length ? (
              <ul className="space-y-1 text-sm">
                {vm.claims.map((c) => (
                  <li key={c.id} className="flex items-start gap-2">
                    {c.matches === false ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-status-danger" /> : c.matches === true ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-status-success" /> : <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}
                    <span>
                      <span className="font-medium">{c.type.replace(/_/g, " ")}</span>: declarado {c.value ?? "—"}
                      {c.calculatedValue !== null && ` · calculado ${c.calculatedValue}`}
                      <span className="block text-xs text-muted-foreground">p.{c.sourcePage} — “{c.rawText}”</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-muted-foreground">Nenhuma afirmação numérica encontrada no texto.</div>
            )
          }
        />
      </div>

      <section>
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Pontos para conferência ({open.length})</h3>
        <p className="mb-3 text-sm text-muted-foreground">Cada item informa o impacto e a ação recomendada antes da entrega.</p>
        {open.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Não há pendências de conferência. O resultado está pronto para uso.</div>
        ) : (
          <ul className="space-y-2">
            {open.map((w) => (
              <li key={w.id} className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-3">
                  <SeverityIcon severity={w.severity} />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">{severityLabel(w.severity)}</Badge>
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{SOURCE_LABEL[w.source]}</span>
                      {w.sourcePage && <span className="text-[11px] text-muted-foreground">p.{w.sourcePage}</span>}
                    </div>
                    <p className="mt-1 text-sm font-medium">{observationTitle(w)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{w.message}</p>
                    <p className="mt-2 rounded-md bg-muted/70 px-2.5 py-2 text-xs text-foreground"><span className="font-semibold">Próximo passo:</span> {nextStep(w.severity)}</p>
                    {w.subjectId && byId.get(w.subjectId) && (
                      <button className="mt-1 text-xs text-brand-cyan-700 underline" onClick={() => onLocateSubject(w.subjectId!)}>
                        Ver disciplina: {byId.get(w.subjectId)!.name}
                      </button>
                    )}
                  </div>
                </div>
                {canEdit && (
                  <Button variant="outline" size="sm" onClick={() => resolve(w)} disabled={pending} className="shrink-0">
                    Resolver observação
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {resolved.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Conferências concluídas ({resolved.length})</h3>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {resolved.map((w) => (
              <li key={w.id} className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-status-success" />
                <span className="line-through">{w.message}</span>
                <span className="text-xs">— {w.resolvedBy} · {formatDateTime(w.resolvedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function severityLabel(severity: WarningVM["severity"]) {
  if (severity === "CRITICAL") return "Ação necessária";
  if (severity === "WARNING") return "Conferir";
  return "Informativo";
}

function nextStep(severity: WarningVM["severity"]) {
  if (severity === "CRITICAL") return "Revise os dados indicados antes de utilizar esta informação.";
  if (severity === "WARNING") return "Confira o documento e ajuste somente se houver divergência.";
  return "Registro informativo; nenhuma ação é necessária.";
}

function observationTitle(warning: WarningVM) {
  if (warning.severity === "CRITICAL") return "Há uma divergência que pode alterar o resultado.";
  if (warning.source === "MATRIX") return "Confira a compatibilidade com a matriz curricular.";
  if (warning.source === "AUDITOR") return "A verificação identificou um ponto que merece confirmação.";
  if (warning.severity === "WARNING") return "Há um dado que precisa ser conferido no documento.";
  return "Registro informativo sobre esta análise.";
}

function InfoCard({ title, icon, body, footer }: { title: string; icon: React.ReactNode; body: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">{icon} {title}</div>
      <div className="flex-1">{body}</div>
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}

function SeverityIcon({ severity }: { severity: WarningVM["severity"] }) {
  if (severity === "CRITICAL") return <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-danger" />;
  if (severity === "WARNING") return <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-warning" />;
  return <Info className="mt-0.5 size-4 shrink-0 text-status-info" />;
}
