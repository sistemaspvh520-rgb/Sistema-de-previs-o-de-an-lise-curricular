"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, FileSearch, Info, Loader2, Pencil, Plus, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn, formatDateTime, ordinal, pluralize } from "@/lib/utils";
import { resolveWarningAction, reauditAnalysisAction } from "@/features/analyses/actions";
import { addMissingSubjectAction, applyAllSuggestionsAction, resolveWithChoiceAction } from "@/features/analyses/review-actions";
import type { AnalysisVM, ClaimVM, SubjectVM, WarningVM } from "@/features/analyses/view-model";

const CLAIM_LABEL: Record<string, string> = {
  TOTAL_SUBJECTS: "Total de disciplinas",
  EXEMPTED_TOTAL: "Disciplinas dispensadas",
  PENDING_TOTAL: "Disciplinas a cursar",
  ENTRY_PERIOD: "Período de ingresso",
  OTHER: "Outro número",
};

const FIELD_LABEL: Record<string, string> = { usedSubject: "disciplina utilizada", period: "período", workload: "carga horária" };

interface FieldMismatch { kind: "FIELD_MISMATCH"; field: "usedSubject" | "period" | "workload"; localValue: string | number | null; aiValue: string | number | null; recommended: "AI" | "LOCAL" }
interface MissingRow { kind: "MISSING_ROW"; row: { code: string | null; name: string; workload: number | null; period: number | null; usedSubject: string | null; page: number } }

function warningData(w: WarningVM): FieldMismatch | MissingRow | null {
  const d = w.data;
  if (!d) return null;
  if (d.kind === "FIELD_MISMATCH") return d as unknown as FieldMismatch;
  if (d.kind === "MISSING_ROW") return d as unknown as MissingRow;
  return null;
}

function formatValue(field: string, v: string | number | null) {
  if (v === null || v === undefined || v === "") return field === "usedSubject" ? "em branco (a cursar)" : "—";
  if (field === "period") return `${ordinal(Number(v))} período`;
  if (field === "workload") return `${v}h`;
  return String(v);
}

export function AuditTab({ vm, canEdit, onLocateSubject, onEditSubject }: { vm: AnalysisVM; canEdit: boolean; onLocateSubject: (subjectId: string, openPdf?: boolean) => void; onEditSubject?: (subject: SubjectVM) => void }) {
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const open = vm.warnings.filter((w) => !w.resolvedAt);
  const resolved = vm.warnings.filter((w) => w.resolvedAt);
  const byId = new Map(vm.subjects.map((s) => [s.id, s]));
  const withSuggestion = open.filter((w) => warningData(w) !== null);
  const mismatchedClaims = vm.claims.filter((c) => c.matches === false);
  const okClaims = vm.claims.filter((c) => c.matches !== false);

  function run(id: string | null, fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    setBusyId(id);
    start(async () => {
      const res = await fn();
      if (res.ok) toast.success(res.message ?? "Concluído.");
      else toast.error(res.error ?? "Não foi possível concluir.");
      setBusyId(null);
    });
  }

  const tone = open.length === 0 ? "ok" : open.some((w) => w.severity === "CRITICAL") ? "danger" : "warning";

  return (
    <div className="space-y-5">
      {/* Cabeçalho: situação em linguagem simples + ações principais */}
      <div className={cn("flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between", tone === "ok" && "border-status-success/30 bg-status-success-bg/40", tone === "warning" && "border-status-warning/30 bg-status-warning-bg/40", tone === "danger" && "border-status-danger/30 bg-status-danger-bg/40")}>
        <div className="flex items-start gap-3">
          {tone === "ok" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-status-success" /> : <AlertTriangle className={cn("mt-0.5 size-5 shrink-0", tone === "danger" ? "text-status-danger" : "text-status-warning")} />}
          <div>
            <div className="font-semibold">
              {open.length === 0 ? "Nenhum ponto pendente — resultado pronto para uso." : `${pluralize(open.length, "ponto", "pontos")} para conferir antes de usar o resultado.`}
            </div>
            <div className="text-sm text-muted-foreground">
              {open.length === 0
                ? vm.review ? `Verificação por IA concluída em ${formatDateTime(vm.review.createdAt)}.` : "O sistema não encontrou divergências entre o PDF e o cálculo."
                : withSuggestion.length > 0
                  ? `${pluralize(withSuggestion.length, "ponto tem", "pontos têm")} sugestão automática — você pode aplicar com um clique.`
                  : "Cada ponto abaixo mostra o que foi encontrado e o que fazer."}
            </div>
          </div>
        </div>
        {canEdit && !vm.isProcessing && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {withSuggestion.length > 0 && (
              <Button size="sm" onClick={() => run("all", () => applyAllSuggestionsAction({ analysisId: vm.id }))} disabled={pending}>
                {busyId === "all" ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />} Aplicar sugestões ({withSuggestion.length})
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => run("reaudit", () => reauditAnalysisAction(vm.id))} disabled={pending}>
              {busyId === "reaudit" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Nova verificação por IA
            </Button>
          </div>
        )}
      </div>

      {/* Pontos abertos */}
      {open.length > 0 && (
        <ul className="space-y-3">
          {open.map((w) => {
            const data = warningData(w);
            const subject = w.subjectId ? byId.get(w.subjectId) : undefined;
            const busy = busyId === w.id;
            return (
              <li key={w.id} className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <SeverityIcon severity={w.severity} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{pointTitle(w, data, subject)}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{pointDescription(w, data)}</p>

                    {data?.kind === "FIELD_MISMATCH" && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <ChoiceCard
                          label="Lido no PDF"
                          value={formatValue(data.field, data.localValue)}
                          recommended={data.recommended === "LOCAL"}
                          disabled={!canEdit || pending}
                          busy={busy}
                          onClick={() => run(w.id, () => resolveWithChoiceAction({ analysisId: vm.id, warningId: w.id, choice: "LOCAL" }))}
                        />
                        <ChoiceCard
                          label="Na análise atual"
                          value={formatValue(data.field, data.aiValue)}
                          recommended={data.recommended === "AI"}
                          disabled={!canEdit || pending}
                          busy={busy}
                          onClick={() => run(w.id, () => resolveWithChoiceAction({ analysisId: vm.id, warningId: w.id, choice: "AI" }))}
                        />
                      </div>
                    )}

                    {data?.kind === "MISSING_ROW" && (
                      <div className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                        <div className="font-medium">{data.row.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {data.row.code ? `${data.row.code} · ` : ""}{data.row.period ? `${ordinal(data.row.period)} período` : "período não legível"} · {data.row.workload ? `${data.row.workload}h` : "carga não legível"} · {data.row.usedSubject ? `dispensada por "${data.row.usedSubject}"` : "a cursar"} · p.{data.row.page}
                        </div>
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      {data?.kind === "MISSING_ROW" && canEdit && (
                        <Button size="sm" onClick={() => run(w.id, () => addMissingSubjectAction({ analysisId: vm.id, warningId: w.id }))} disabled={pending}>
                          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Adicionar à grade
                        </Button>
                      )}
                      {subject && (
                        <Button variant="outline" size="sm" onClick={() => onLocateSubject(subject.id, true)}>
                          <FileSearch className="size-4" /> Ver no PDF
                        </Button>
                      )}
                      {subject && canEdit && onEditSubject && (
                        <Button variant="outline" size="sm" onClick={() => onEditSubject(subject)}>
                          <Pencil className="size-4" /> Corrigir disciplina
                        </Button>
                      )}
                      {w.sourcePage && !subject && (
                        <span className="self-center text-xs text-muted-foreground">Página {w.sourcePage} do PDF</span>
                      )}
                      {canEdit && (
                        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => run(w.id, () => resolveWarningAction({ analysisId: vm.id, warningId: w.id }))} disabled={pending}>
                          {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Marcar como conferido
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Números declarados no documento */}
      {vm.claims.length > 0 && (
        <section className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-brand-cyan-700" /> Números do documento × cálculo do sistema</div>
          {mismatchedClaims.length > 0 ? (
            <ul className="mt-2 space-y-1.5 text-sm">
              {mismatchedClaims.map((c) => <ClaimRow key={c.id} claim={c} />)}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Todos os números conferem ({okClaims.length}).</p>
          )}
          {mismatchedClaims.length > 0 && okClaims.length > 0 && (
            <details className="group mt-2">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground"><ChevronDown className="size-3.5 transition group-open:rotate-180" /> {pluralize(okClaims.length, "número que confere", "números que conferem")}</summary>
              <ul className="mt-2 space-y-1.5 text-sm">{okClaims.map((c) => <ClaimRow key={c.id} claim={c} />)}</ul>
            </details>
          )}
        </section>
      )}

      {resolved.length > 0 && (
        <details className="group rounded-xl border bg-card p-4 shadow-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold"><ChevronDown className="size-4 transition group-open:rotate-180" /> Pontos já conferidos ({resolved.length})</summary>
          <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            {resolved.map((w) => (
              <li key={w.id} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-status-success" />
                <span><span className="line-through">{w.message}</span> <span className="text-xs">— {w.resolvedBy} · {formatDateTime(w.resolvedAt)}</span></span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ChoiceCard({ label, value, recommended, disabled, busy, onClick }: { label: string; value: string; recommended: boolean; disabled: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn("flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition hover:border-brand-cyan-700 hover:bg-brand-cyan-700/5 disabled:cursor-default disabled:opacity-70", recommended && "border-brand-cyan-700/60 bg-brand-cyan-700/5")}
    >
      <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
        {recommended && <span className="rounded-full bg-brand-cyan-700 px-1.5 py-px text-[10px] font-semibold normal-case tracking-normal text-white">sugerido</span>}
      </span>
      <span className="text-sm font-semibold">{value}</span>
      <span className="text-xs text-brand-cyan-700">{busy ? <Loader2 className="inline size-3 animate-spin" /> : recommended ? "Usar este valor" : "Usar este valor"}</span>
    </button>
  );
}

function ClaimRow({ claim }: { claim: ClaimVM }) {
  const ok = claim.matches !== false;
  return (
    <li className="flex items-start gap-2">
      {ok ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-status-success" /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-status-danger" />}
      <span>
        <span className="font-medium">{CLAIM_LABEL[claim.type] ?? claim.type}</span>: o documento diz {claim.type === "ENTRY_PERIOD" && claim.value ? ordinal(claim.value) : claim.value ?? "—"}
        {claim.calculatedValue !== null && (ok ? " — confere" : `, o sistema calculou ${claim.type === "ENTRY_PERIOD" ? ordinal(claim.calculatedValue) : claim.calculatedValue}`)}
        {!ok && <span className="block text-xs text-muted-foreground">Confira a página {claim.sourcePage} do PDF. Se o documento estiver certo, corrija a disciplina na grade.</span>}
      </span>
    </li>
  );
}

function pointTitle(w: WarningVM, data: FieldMismatch | MissingRow | null, subject?: SubjectVM) {
  if (data?.kind === "FIELD_MISMATCH") return `${subject?.name ?? "Disciplina"}: ${FIELD_LABEL[data.field]} com leituras diferentes`;
  if (data?.kind === "MISSING_ROW") return "Disciplina do PDF que não entrou na análise";
  if (w.code === "COUNT_MISMATCH" || w.code === "LOCAL_COUNT_MISMATCH") return "Quantidade de disciplinas diferente da tabela do PDF";
  if (w.code === "ENTRY_PERIOD_MISMATCH") return "Período de ingresso diverge do documento";
  if (w.code === "DOCUMENT_TOTAL_MISMATCH") return "Um total do documento não bate com o cálculo";
  if (w.source === "AUDITOR") return subject ? `${subject.name}: a verificação por IA pede confirmação` : "A verificação por IA pede confirmação";
  if (w.severity === "CRITICAL") return "Divergência que pode alterar o resultado";
  return subject ? `${subject.name}: ponto a conferir` : "Ponto a conferir";
}

function pointDescription(w: WarningVM, data: FieldMismatch | MissingRow | null) {
  if (data?.kind === "FIELD_MISMATCH") return "O sistema leu um valor na tabela do PDF e a IA leu outro. Escolha qual está correto — a grade e a previsão são recalculadas na hora.";
  if (data?.kind === "MISSING_ROW") return "Esta linha está na tabela do PDF, mas não foi incluída na grade. Adicione-a ou, se for uma linha repetida/inválida, marque como conferido.";
  return w.message;
}

function SeverityIcon({ severity }: { severity: WarningVM["severity"] }) {
  if (severity === "CRITICAL") return <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-danger" />;
  if (severity === "WARNING") return <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-warning" />;
  return <Info className="mt-0.5 size-4 shrink-0 text-status-info" />;
}
