"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { CheckCircle2, Loader2, PanelRightOpen, PanelRightClose, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { TermSelect } from "@/components/shared/term-select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SummaryCards } from "@/features/analyses/components/summary-cards";
import { GradeTable } from "@/features/analyses/components/grade-table";
import { GradeByPeriod } from "@/features/analyses/components/grade-by-period";
import { SubjectEditDialog } from "@/features/analyses/components/subject-edit-dialog";
import { Timeline } from "@/features/analyses/components/timeline";
import { AuditTab } from "@/features/analyses/components/audit-tab";
import { HistoryTab } from "@/features/analyses/components/history-tab";
import { PendingTab } from "@/features/analyses/components/pending-tab";
import { CandidateSummaryDialog } from "@/features/analyses/components/candidate-summary-dialog";
import { EntryPeriodBanner, AdditionalRuleBanner } from "@/features/analyses/components/entry-period-banner";
import { SourceBadge } from "@/features/analyses/components/source-badge";
import { MatrixLinkSelect, type MatrixOption } from "@/features/analyses/components/matrix-link-select";
import { DeleteAnalysisButton } from "@/features/analyses/components/delete-analysis-button";
import { completeAnalysisAction, reopenAnalysisAction, updateStartTermAction } from "@/features/analyses/actions";
import type { AnalysisVM, SubjectVM } from "@/features/analyses/view-model";
import { cn } from "@/lib/utils";

const PdfViewer = dynamic(() => import("@/features/analyses/components/pdf-viewer").then((m) => m.PdfViewer), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center rounded-xl border"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>,
});

export function AnalysisView({ vm, perms, matrices = [], suggestedMatrixId = null }: { vm: AnalysisVM; perms: { review: boolean; complete: boolean; rules: boolean; diagnostics: boolean; delete?: boolean }; matrices?: MatrixOption[]; suggestedMatrixId?: string | null }) {
  const [tab, setTab] = useState("summary");
  const [showPdf, setShowPdf] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SubjectVM | null>(null);
  const [editing, setEditing] = useState<SubjectVM | null>(null);
  const [pending, start] = useTransition();
  // O analista pode corrigir uma análise entregue; toda alteração é registrada e recalculada.
  const editable = perms.review && !vm.isProcessing;
  const pdfAvailable = !!vm.document && !vm.document.deletedAt;

  function locate(s: SubjectVM) {
    setSelected(s);
    setPage(s.bbox?.page ?? s.sourcePage);
    if (pdfAvailable) setShowPdf(true);
  }
  function locateById(id: string) {
    const s = vm.subjects.find((x) => x.id === id);
    if (s) {
      locate(s);
      setTab("grade");
    }
  }

  function complete(note: string) {
    start(async () => {
      const res = await completeAnalysisAction({ analysisId: vm.id, note });
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }
  function reopen() {
    start(async () => {
      const res = await reopenAnalysisAction(vm.id);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-6">
      {vm.entryPeriod === null && !vm.isProcessing && <EntryPeriodBanner analysisId={vm.id} periods={vm.totals.periods} canEdit={editable} />}
      {vm.projectionIncomplete && vm.entryPeriod !== null && <AdditionalRuleBanner canManageRules={perms.rules} />}

      <SummaryCards vm={vm} showSources={perms.diagnostics} />

      <div className="flex flex-wrap items-center gap-2">
        <CandidateSummaryDialog vm={vm} />
        {editable && <StartTermDialog vm={vm} />}
        {perms.complete && vm.status === "WAITING_REVIEW" && vm.entryPeriod !== null && <CompleteDialog onConfirm={complete} pending={pending} count={vm.reviewItemsCount} />}
        {perms.review && vm.status === "COMPLETED" && <Button variant="outline" onClick={reopen} disabled={pending}><RotateCcw className="size-4" /> Registrar nova revisão</Button>}
        <div className="ml-auto flex items-center gap-2">
          {perms.delete && <DeleteAnalysisButton analysisId={vm.id} />}
          {pdfAvailable && perms.diagnostics && (
            <Button variant={showPdf ? "secondary" : "outline"} onClick={() => setShowPdf((s) => !s)}>
              {showPdf ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />} {showPdf ? "Ocultar PDF" : "PDF lado a lado"}
            </Button>
          )}
        </div>
      </div>

      <div className={cn("grid gap-6", showPdf && "xl:grid-cols-2")}>
        <Tabs value={tab} onValueChange={setTab} className="min-w-0">
          <TabsList className="flex h-auto w-full justify-start overflow-x-auto">
            <TabsTrigger value="summary">Resumo</TabsTrigger>
            <TabsTrigger value="grade">Grade curricular</TabsTrigger>
            <TabsTrigger value="pending">Pendências</TabsTrigger>
            <TabsTrigger value="projection">Previsão</TabsTrigger>
            {perms.diagnostics && <TabsTrigger value="pdf">PDF original</TabsTrigger>}
            {perms.diagnostics && <TabsTrigger value="audit">
              Auditoria IA
              {vm.warnings.filter((w) => !w.resolvedAt).length > 0 && (
                <span className="ml-1.5 rounded-full bg-status-warning px-1.5 text-[10px] font-semibold text-white">{vm.warnings.filter((w) => !w.resolvedAt).length}</span>
              )}
            </TabsTrigger>}
            {perms.diagnostics && <TabsTrigger value="history">Histórico</TabsTrigger>}
          </TabsList>

          <TabsContent value="summary" className="mt-4">
            <SummaryTab vm={vm} onLocate={locate} selectedId={selected?.id} showDiagnostics={perms.diagnostics} />
            {perms.review && (
              <div className="mt-4">
                <MatrixLinkSelect analysisId={vm.id} matrices={matrices} currentId={vm.matrix?.id ?? null} suggestedId={suggestedMatrixId} canEdit={editable} />
              </div>
            )}
          </TabsContent>
          <TabsContent value="grade" className="mt-4">
            <GradeTable subjects={vm.subjects} canEdit={editable} onEdit={setEditing} onLocate={locate} selectedId={selected?.id} />
          </TabsContent>
          <TabsContent value="pending" className="mt-4">
            <PendingTab vm={vm} onLocate={locateById} />
          </TabsContent>
          <TabsContent value="projection" className="mt-4">
            <Timeline vm={vm} showDetails={perms.diagnostics} />
          </TabsContent>
          {perms.diagnostics && <TabsContent value="pdf" className="mt-4">
            {pdfAvailable ? (
              <div className="h-[75vh]"><PdfViewer url={`/api/analyses/${vm.id}/document`} page={page} onPageChange={setPage} highlight={selected?.bbox ?? null} /></div>
            ) : (
              <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">O arquivo original foi removido pela política de retenção. Os dados estruturados permanecem.</div>
            )}
          </TabsContent>}
          {perms.diagnostics && <TabsContent value="audit" className="mt-4">
            <AuditTab vm={vm} canEdit={editable} onLocateSubject={locateById} />
          </TabsContent>}
          {perms.diagnostics && <TabsContent value="history" className="mt-4">
            <HistoryTab vm={vm} />
          </TabsContent>}
        </Tabs>

        {showPdf && pdfAvailable && perms.diagnostics && tab !== "pdf" && (
          <div className="sticky top-20 h-[80vh] min-w-0">
            <PdfViewer url={`/api/analyses/${vm.id}/document`} page={page} onPageChange={setPage} highlight={selected?.bbox ?? null} />
          </div>
        )}
      </div>

      <SubjectEditDialog analysisId={vm.id} subject={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
    </div>
  );
}

function SummaryTab({ vm, onLocate, selectedId, showDiagnostics }: { vm: AnalysisVM; onLocate: (s: SubjectVM) => void; selectedId?: string; showDiagnostics: boolean }) {
  return (
    <div className="space-y-6">
      {showDiagnostics && <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Regras aplicadas</div>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Disciplinas extras / semestre</dt><dd className="font-semibold">+{vm.rules.extraSubjectsAllowed}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Semestre adicional</dt><dd className="font-semibold">{vm.rules.additionalSemesterCapacityRule.type === "UNCONFIGURED" ? "não configurado" : vm.rules.additionalSemesterCapacityRule.type}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Bônus das dispensas</dt><dd className="font-semibold">1 vaga por dispensa</dd></div>
          </dl>
          <div className="mt-2"><SourceBadge label={`Regra Acadêmica v${vm.versions.ruleSetVersion}`} /></div>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Semestre de ingresso</div>
          <div className="mt-1 text-2xl font-semibold">{vm.startTerm}</div>
          <div className="text-xs text-muted-foreground">Primeiro semestre da projeção (ingresso no {vm.entryPeriod ? `${vm.entryPeriod}º período` : "período a confirmar"}).</div>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Leitura</div>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Extractor</dt><dd className="font-mono text-xs">{vm.versions.extractionModel ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Auditor</dt><dd className="font-mono text-xs">{vm.versions.auditModel ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Linhas duvidosas</dt><dd className="font-semibold">{vm.subjects.filter((s) => s.readability !== "CLEAR").length}</dd></div>
          </dl>
          <div className="mt-2"><SourceBadge label="OpenAI" /></div>
        </div>
      </div>}
      <GradeByPeriod subjects={vm.subjects} entryPeriod={vm.entryPeriod} onLocate={onLocate} selectedId={selectedId} />
    </div>
  );
}

function StartTermDialog({ vm }: { vm: AnalysisVM }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState(vm.startTerm);
  const [pending, start] = useTransition();
  function save() {
    start(async () => {
      const res = await updateStartTermAction({ analysisId: vm.id, startTerm: term });
      if (res.ok) {
        toast.success(res.message);
        setOpen(false);
      } else toast.error(res.error);
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline">Semestre de ingresso: {vm.startTerm}</Button></DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Semestre de ingresso</DialogTitle>
          <DialogDescription>É também o primeiro semestre da previsão. Ao alterar, os dois valores são atualizados.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="term">Semestre letivo de ingresso</Label>
          <TermSelect id="term" value={term} onChange={setTerm} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={save} disabled={pending || !/^\d{4}\.[12]$/.test(term)}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteDialog({ onConfirm, pending, count }: { onConfirm: (note: string) => void; pending: boolean; count: number }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><CheckCircle2 className="size-4" /> Concluir análise</Button></DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Concluir análise</DialogTitle>
          <DialogDescription>
            {count > 0 ? `Há ${count === 1 ? "uma observação" : `${count} observações`} registrada${count === 1 ? "" : "s"}. Ao concluir, você confirma que revisou o resultado.` : "Confirme a conclusão desta análise."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="note">Observação (opcional)</Label>
          <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => { onConfirm(note); setOpen(false); }} disabled={pending}>Concluir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
