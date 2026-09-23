"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { Loader2, PanelRightOpen, PanelRightClose } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { TermSelect } from "@/components/shared/term-select";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SummaryCards } from "@/features/analyses/components/summary-cards";
import { GradeTable } from "@/features/analyses/components/grade-table";
import { GradeByPeriod } from "@/features/analyses/components/grade-by-period";
import { SubjectEditDialog } from "@/features/analyses/components/subject-edit-dialog";
import { Timeline } from "@/features/analyses/components/timeline";
import { AuditTab } from "@/features/analyses/components/audit-tab";
import { HistoryTab } from "@/features/analyses/components/history-tab";
import { PendingTab } from "@/features/analyses/components/pending-tab";
import { CandidateSummaryDialog } from "@/features/analyses/components/candidate-summary-dialog";
import {
  AdditionalRuleBanner,
  EntryPeriodSimulationDialog,
} from "@/features/analyses/components/entry-period-banner";
import { EnrollmentBanner } from "@/features/analyses/components/enrollment-banner";
import { UploadReanalysisDialog } from "@/features/analyses/components/upload-reanalysis-dialog";
import { formatDateTime } from "@/lib/time";
import { DeleteAnalysisButton } from "@/features/analyses/components/delete-analysis-button";
import { RequestAnalysisDeletionButton } from "@/features/analyses/components/request-analysis-deletion-button";
import { updateStartTermAction } from "@/features/analyses/actions";
import type { AnalysisVM, SubjectVM } from "@/features/analyses/view-model";
import { cn } from "@/lib/utils";

// No celular as abas rolam na horizontal (sem quebrar em linhas desiguais); no desktop voltam a quebrar.
const TAB = "shrink-0 px-3 py-1.5 sm:shrink sm:px-1.5 sm:py-0.5";

const PdfViewer = dynamic(
  () =>
    import("@/features/analyses/components/pdf-viewer").then(
      (m) => m.PdfViewer,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center rounded-xl border">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

export function AnalysisView({
  vm,
  perms,
}: {
  vm: AnalysisVM;
  perms: {
    create?: boolean;
    review: boolean;
    diagnostics: boolean;
    delete?: boolean;
    requestDelete?: boolean;
  };
}) {
  const [tab, setTab] = useState("summary");
  const [showPdf, setShowPdf] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SubjectVM | null>(null);
  const [editing, setEditing] = useState<SubjectVM | null>(null);
  // O analista pode corrigir uma análise entregue; toda alteração é registrada e recalculada.
  const editable = perms.review && !vm.isProcessing;
  const pdfAvailable = !!vm.document && !vm.document.deletedAt;
  const documentPeriod =
    vm.claims.find(
      (claim) => claim.type === "ENTRY_PERIOD" && claim.value !== null,
    )?.value ?? null;

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

  return (
    <div className="space-y-6">
      {vm.projectionIncomplete && vm.entryPeriod !== null && (
        <AdditionalRuleBanner />
      )}
      {vm.status === "COMPLETED" && (
        <EnrollmentBanner
          analysisId={vm.id}
          status={vm.enrollment.status}
          note={vm.enrollment.note}
          updatedAtLabel={
            vm.enrollment.updatedAt
              ? formatDateTime(vm.enrollment.updatedAt)
              : null
          }
          updatedByName={vm.enrollment.updatedByName}
          reanalysisAtLabel={
            vm.enrollment.reanalysisAt
              ? formatDateTime(vm.enrollment.reanalysisAt)
              : null
          }
          due={vm.enrollment.due}
          canEdit={perms.review}
        />
      )}

      {vm.subjects.length > 0 && (
        <SummaryCards vm={vm} showSources={perms.diagnostics} />
      )}
      {vm.subjects.length === 0 && !vm.isProcessing && (
        <div className="rounded-xl border border-status-warning/30 bg-status-warning-bg p-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="font-semibold text-status-warning">
            Ainda não há disciplinas disponíveis nesta análise
          </div>
          <p className="mt-1 text-sm text-status-warning/90">
            Envie o PDF atualizado para criar uma nova solicitação. O documento
            anterior continuará preservado no histórico.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {vm.subjects.length > 0 && <CandidateSummaryDialog vm={vm} />}
        {editable && <StartTermDialog vm={vm} />}
        <EntryPeriodSimulationDialog
          analysisId={vm.id}
          currentPeriod={vm.entryPeriod}
          documentPeriod={documentPeriod}
          periods={vm.totals.periods}
          canEdit={editable}
        />
        {perms.create && <UploadReanalysisDialog analysisId={vm.id} />}
        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:justify-end">
          {perms.delete && <DeleteAnalysisButton analysisId={vm.id} />}
          {perms.requestDelete && (
            <RequestAnalysisDeletionButton analysisId={vm.id} />
          )}
          {pdfAvailable && perms.diagnostics && (
            <Button
              variant={showPdf ? "secondary" : "outline"}
              className="hidden xl:inline-flex"
              onClick={() => setShowPdf((s) => !s)}
            >
              {showPdf ? (
                <PanelRightClose className="size-4" />
              ) : (
                <PanelRightOpen className="size-4" />
              )}{" "}
              {showPdf ? "Ocultar PDF" : "PDF lado a lado"}
            </Button>
          )}
        </div>
      </div>

      {vm.subjects.length > 0 && (
        <div className={cn("grid gap-6", showPdf && "xl:grid-cols-2")}>
          <Tabs value={tab} onValueChange={setTab} className="min-w-0">
            <TabsList className="flex h-auto w-full flex-nowrap justify-start gap-1 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible">
              <TabsTrigger value="summary" className={TAB}>
                Resumo
              </TabsTrigger>
              <TabsTrigger value="grade" className={TAB}>
                Grade curricular
              </TabsTrigger>
              <TabsTrigger value="pending" className={TAB}>
                Pendências
              </TabsTrigger>
              <TabsTrigger value="projection" className={TAB}>
                Previsão
              </TabsTrigger>
              {perms.diagnostics && (
                <TabsTrigger value="pdf" className={TAB}>
                  PDF original
                </TabsTrigger>
              )}
              {perms.diagnostics && (
                <TabsTrigger value="audit" className={TAB}>
                  Conferência
                  {vm.warnings.filter((w) => !w.resolvedAt).length > 0 && (
                    <span className="ml-1.5 rounded-full bg-status-warning px-1.5 text-[10px] font-semibold text-white">
                      {vm.warnings.filter((w) => !w.resolvedAt).length}
                    </span>
                  )}
                </TabsTrigger>
              )}
              {perms.diagnostics && (
                <TabsTrigger value="history" className={TAB}>
                  Histórico
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent
              value="summary"
              className="mt-4 animate-in fade-in slide-in-from-bottom-1 duration-300"
            >
              <SummaryTab
                vm={vm}
                onLocate={locate}
                selectedId={selected?.id}
                showDiagnostics={perms.diagnostics}
              />
            </TabsContent>
            <TabsContent value="grade" className="mt-4">
              <GradeTable
                subjects={vm.subjects}
                canEdit={editable}
                onEdit={setEditing}
                onLocate={locate}
                selectedId={selected?.id}
              />
            </TabsContent>
            <TabsContent value="pending" className="mt-4">
              <PendingTab vm={vm} onLocate={locateById} />
            </TabsContent>
            <TabsContent value="projection" className="mt-4">
              <Timeline vm={vm} showDetails={perms.diagnostics} />
            </TabsContent>
            {perms.diagnostics && (
              <TabsContent value="pdf" className="mt-4">
                {pdfAvailable ? (
                  <div className="h-[75vh]">
                    <PdfViewer
                      url={`/api/analyses/${vm.id}/document`}
                      page={page}
                      onPageChange={setPage}
                      highlight={selected?.bbox ?? null}
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                    O arquivo original foi removido pela política de retenção.
                    Os dados estruturados permanecem.
                  </div>
                )}
              </TabsContent>
            )}
            {perms.diagnostics && (
              <TabsContent value="audit" className="mt-4">
                <AuditTab
                  vm={vm}
                  canEdit={editable}
                  onLocateSubject={locateById}
                  onEditSubject={setEditing}
                />
              </TabsContent>
            )}
            {perms.diagnostics && (
              <TabsContent value="history" className="mt-4">
                <HistoryTab vm={vm} />
              </TabsContent>
            )}
          </Tabs>

          {showPdf && pdfAvailable && perms.diagnostics && tab !== "pdf" && (
            <div className="sticky top-20 h-[80vh] min-w-0">
              <PdfViewer
                url={`/api/analyses/${vm.id}/document`}
                page={page}
                onPageChange={setPage}
                highlight={selected?.bbox ?? null}
              />
            </div>
          )}
        </div>
      )}

      <SubjectEditDialog
        analysisId={vm.id}
        subject={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </div>
  );
}

function SummaryTab({
  vm,
  onLocate,
  selectedId,
  showDiagnostics,
}: {
  vm: AnalysisVM;
  onLocate: (s: SubjectVM) => void;
  selectedId?: string;
  showDiagnostics: boolean;
}) {
  return (
    <div className="space-y-6">
      {showDiagnostics && (
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Início da previsão
          </div>
          <div className="mt-1 text-2xl font-semibold">{vm.startTerm}</div>
          <div className="text-xs text-muted-foreground">
            Primeiro semestre da projeção{" "}
            {vm.entryPeriod ? `(período do PDF: ${vm.entryPeriod}º)` : ""}.
          </div>
        </div>
      )}
      <GradeByPeriod
        subjects={vm.subjects}
        entryPeriod={vm.entryPeriod}
        onLocate={onLocate}
        selectedId={selectedId}
      />
    </div>
  );
}

function StartTermDialog({ vm }: { vm: AnalysisVM }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState(vm.startTerm);
  const [pending, start] = useTransition();
  function save() {
    start(async () => {
      const res = await updateStartTermAction({
        analysisId: vm.id,
        startTerm: term,
      });
      if (res.ok) {
        toast.success(res.message);
        setOpen(false);
      } else toast.error(res.error);
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="animate-in fade-in slide-in-from-bottom-1 duration-500"
        >
          Início da previsão: {vm.startTerm}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Início da previsão</DialogTitle>
          <DialogDescription>
            Escolha em qual semestre-calendário a projeção deve começar. O
            período acadêmico continua sendo lido do PDF.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="term">Primeiro semestre projetado</Label>
          <TermSelect id="term" value={term} onChange={setTerm} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={save}
            disabled={pending || !/^\d{4}\.[12]$/.test(term)}
          >
            {pending && <Loader2 className="size-4 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
