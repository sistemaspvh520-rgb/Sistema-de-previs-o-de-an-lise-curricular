"use client";

import { useState } from "react";
import { ArrowDown, Copy, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn, pluralize } from "@/lib/utils";
import type { AnalysisVM, ProjectionVM, SubjectVM } from "@/features/analyses/view-model";

export function Timeline({ vm, showDetails = true }: { vm: AnalysisVM; showDetails?: boolean }) {
  const [explain, setExplain] = useState<ProjectionVM | null>(null);
  const byId = new Map(vm.subjects.map((s) => [s.id, s]));

  if (vm.entryPeriod === null) {
    return <p className="text-sm text-muted-foreground">O PDF não informou o período de ingresso. Use “Simular outro período” apenas se quiser comparar cenários.</p>;
  }
  if (vm.projections.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma disciplina a cursar: todas as disciplinas estão dispensadas.</p>;
  }

  return (
    <div className="space-y-2">
      {vm.narrative && <NarrativeCard vm={vm} />}
      {vm.projections.map((p, i) => (
        <div key={p.id}>
          <SemesterCard p={p} byId={byId} onExplain={() => setExplain(p)} showDetails={showDetails} />
          {i < vm.projections.length - 1 && (
            <div className="flex justify-center py-1 text-muted-foreground/50"><ArrowDown className="size-4" /></div>
          )}
        </div>
      ))}
      {vm.projectionIncomplete && (
        <div className="rounded-xl border border-dashed border-status-warning/40 bg-status-warning-bg p-4 text-sm text-status-warning">
          Restam <strong>{pluralize(vm.remainingBacklogCount, "disciplina", "disciplinas")}</strong> sem semestre definido. A previsão será concluída após configurar a regra de semestre adicional.
        </div>
      )}
      {vm.estimatedCompletionTerm && (
        <div className="rounded-xl bg-brand-navy p-4 text-white">
          <div className="text-xs uppercase tracking-wider opacity-70">Previsão estimada de conclusão</div>
          <div className="text-2xl font-semibold">{vm.estimatedCompletionTerm}</div>
          <div className="text-sm">{vm.estimatedCompletionDate ? `Até ${vm.estimatedCompletionDate}` : "Data do calendário não cadastrada"}</div>
          <div className="text-xs opacity-70">{pluralize(vm.semestersRemaining ?? 0, "semestre previsto", "semestres previstos")} · {vm.completionCalendarConfidence === "OFFICIAL" ? "calendário oficial" : vm.completionCalendarConfidence === "ESTIMATED" ? "calendário projetado" : "calendário não identificado"}</div>
        </div>
      )}

      <Dialog open={!!explain} onOpenChange={(o) => !o && setExplain(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Como chegamos nesta previsão?</DialogTitle>
            <DialogDescription>{explain?.term} · {explain?.explanation.periodLabel}</DialogDescription>
          </DialogHeader>
          {explain && (
            <div className="space-y-3">
              <dl className="divide-y rounded-lg border">
                {explain.explanation.lines.map((l) => (
                  <div key={l.label} className="flex items-baseline justify-between gap-4 px-3 py-2 text-sm">
                    <dt className="text-muted-foreground">
                      {l.label}
                      {l.note && <span className="ml-1 font-mono text-[11px] opacity-70">({l.note})</span>}
                    </dt>
                    <dd className="font-semibold">{l.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="rounded-lg bg-brand-navy-50 px-3 py-2 text-sm font-medium text-brand-navy">{explain.explanation.summary}</div>
              <p className="text-xs text-muted-foreground">Fonte: Motor Acadêmico v{vm.versions.engineVersion} · Regra Acadêmica v{vm.versions.ruleSetVersion}.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NarrativeCard({ vm }: { vm: AnalysisVM }) {
  const n = vm.narrative!;
  async function copy() {
    try {
      await navigator.clipboard.writeText(n.text);
      toast.success("Previsão copiada.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }
  return (
    <div className="mb-4 rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Previsão em texto</div>
          <ul className="mt-2 space-y-0.5 text-sm">
            {n.headerLines.map((l) => (
              <li key={l}>{renderBold(l)}</li>
            ))}
          </ul>
        </div>
        <Button variant="outline" size="sm" onClick={copy}><Copy className="size-4" /> Copiar</Button>
      </div>
      <div className="mt-3 text-sm font-medium">A previsão fica assim:</div>
      <ul className="mt-1 space-y-1 text-sm">
        {n.bulletLines.map((l) => (
          <li key={l}>{renderBold(l)}</li>
        ))}
      </ul>
      {n.conclusionLine && <p className={cn("mt-3 text-sm", vm.projectionIncomplete ? "text-status-warning" : "font-medium text-brand-navy")}>{renderBold(n.conclusionLine)}</p>}
    </div>
  );
}

/** Converte *texto* em <strong>. */
function renderBold(line: string): React.ReactNode {
  const parts = line.split(/(\*[^*]+\*)/g);
  return parts.map((p, i) => (p.startsWith("*") && p.endsWith("*") ? <strong key={i}>{p.slice(1, -1)}</strong> : <span key={i}>{p}</span>));
}

function SemesterCard({ p, byId, onExplain, showDetails }: { p: ProjectionVM; byId: Map<string, SubjectVM>; onExplain: () => void; showDetails: boolean }) {
  const [open, setOpen] = useState(false);
  const full = p.semesterLoad >= p.maximumCapacity;
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
        <div className="min-w-[110px]">
          <div className="text-xl font-semibold tracking-tight">{p.term}</div>
          <div className="text-xs text-muted-foreground">{p.isAdditional ? "Semestre adicional" : `${p.periodNumber}º período`}</div>
          {p.calendarWindow && <div className="mt-1 text-xs text-muted-foreground">{p.calendarWindow}</div>}
        </div>
        <Stat label="Regulares" value={p.regularSubjectsToTake} />
        <Stat label="Adaptações" value={p.subjectsFromBacklog} tone="text-brand-cyan-700" />
        <Stat label="Total" value={`${p.semesterLoad} / ${p.maximumCapacity}`} tone={full ? "text-brand-navy" : undefined} />
        <Stat label="Pendências restantes" value={p.remainingBacklog} tone={p.remainingBacklog ? "text-status-danger" : "text-status-success"} />
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>{open ? "Ocultar disciplinas" : "Ver disciplinas"}</Button>
          {showDetails && <Button variant="outline" size="sm" onClick={onExplain}><HelpCircle className="size-4" /> Como chegamos?</Button>}
        </div>
      </div>
      <div className="h-1.5 w-full bg-muted">
        <div className="h-full bg-brand-navy transition-all" style={{ width: `${Math.min(100, (p.regularSubjectsToTake / Math.max(1, p.maximumCapacity)) * 100)}%` }} />
        <div className="-mt-1.5 h-1.5 bg-brand-cyan transition-all" style={{ marginLeft: `${Math.min(100, (p.regularSubjectsToTake / Math.max(1, p.maximumCapacity)) * 100)}%`, width: `${Math.min(100, (p.subjectsFromBacklog / Math.max(1, p.maximumCapacity)) * 100)}%` }} />
      </div>
      {open && (
        <div className="grid gap-4 border-t px-5 py-4 md:grid-cols-2">
          <SubjectList title="Regulares" ids={p.regularSubjectIds} byId={byId} />
          <SubjectList title="Adaptações (pendências anteriores)" ids={p.backlogSubjectIds} byId={byId} accent />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-semibold", tone)}>{value}</div>
    </div>
  );
}

function SubjectList({ title, ids, byId, accent }: { title: string; ids: string[]; byId: Map<string, SubjectVM>; accent?: boolean }) {
  return (
    <div>
      <div className={cn("mb-1.5 text-xs font-semibold uppercase tracking-wider", accent ? "text-brand-cyan-700" : "text-muted-foreground")}>{title} ({ids.length})</div>
      {ids.length === 0 ? (
        <div className="text-sm text-muted-foreground">—</div>
      ) : (
        <ul className="space-y-1 text-sm">
          {ids.map((id) => {
            const s = byId.get(id);
            return (
              <li key={id} className="flex justify-between gap-2">
                <span>{s?.name ?? id}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{s ? `${s.period}º · ${s.workload}h` : ""}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
