import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { isProcessingStatus } from "@/domain/curricular-analysis/status-groups";
import type { AnalysisStatus, ReliabilityLevel, SubjectStatus, IntegrationStatus } from "@/generated/prisma/enums";

export const ANALYSIS_STATUS_LABELS: Record<AnalysisStatus, string> = {
  UPLOADED: "Recebido",
  PARSING: "Lendo documento",
  AI_EXTRACTION: "Extraindo com IA",
  NORMALIZING: "Normalizando",
  CALCULATING: "Calculando",
  VALIDATING: "Validando",
  AI_AUDIT: "Auditando com IA",
  WAITING_REVIEW: "Revisão necessária",
  COMPLETED: "Pronta",
  FAILED: "Não concluída",
  AI_ERROR: "Falha de processamento",
};

const ANALYSIS_STATUS_CLASS: Record<AnalysisStatus, string> = {
  UPLOADED: "bg-status-neutral-bg text-status-neutral",
  PARSING: "bg-status-info-bg text-status-info",
  AI_EXTRACTION: "bg-status-info-bg text-status-info",
  NORMALIZING: "bg-status-info-bg text-status-info",
  CALCULATING: "bg-status-info-bg text-status-info",
  VALIDATING: "bg-status-info-bg text-status-info",
  AI_AUDIT: "bg-status-info-bg text-status-info",
  WAITING_REVIEW: "bg-status-warning-bg text-status-warning",
  COMPLETED: "bg-status-success-bg text-status-success",
  FAILED: "bg-status-danger-bg text-status-danger",
  AI_ERROR: "bg-status-danger-bg text-status-danger",
};

export function AnalysisStatusBadge({ status, className }: { status: AnalysisStatus; className?: string }) {
  const processing = status !== "UPLOADED" && isProcessingStatus(status);
  return (
    <Badge variant="outline" className={cn("border-transparent font-medium", ANALYSIS_STATUS_CLASS[status], className)}>
      {processing && <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-current" />}
      {ANALYSIS_STATUS_LABELS[status]}
    </Badge>
  );
}

export const SUBJECT_STATUS_LABELS: Record<SubjectStatus, string> = {
  EXEMPTED: "Dispensada",
  PENDING: "Pendente",
  REVIEW: "Revisar",
};

const SUBJECT_STATUS_CLASS: Record<SubjectStatus, string> = {
  EXEMPTED: "bg-status-success-bg text-status-success",
  PENDING: "bg-status-danger-bg text-status-danger",
  REVIEW: "bg-status-warning-bg text-status-warning",
};

export function SubjectStatusBadge({ status, className }: { status: SubjectStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn("border-transparent font-medium", SUBJECT_STATUS_CLASS[status], className)}>
      {SUBJECT_STATUS_LABELS[status]}
    </Badge>
  );
}

export const RELIABILITY_LABELS: Record<ReliabilityLevel, string> = {
  HIGH: "Verificada",
  REVIEW_RECOMMENDED: "Verificada com observações",
  REVIEW_REQUIRED: "Informações necessárias",
};

const RELIABILITY_CLASS: Record<ReliabilityLevel, string> = {
  HIGH: "bg-status-success-bg text-status-success",
  REVIEW_RECOMMENDED: "bg-status-warning-bg text-status-warning",
  REVIEW_REQUIRED: "bg-status-danger-bg text-status-danger",
};

export function ReliabilityBadge({ level, className }: { level: ReliabilityLevel | null | undefined; className?: string }) {
  if (!level) return <Badge variant="outline" className={cn("bg-status-neutral-bg text-status-neutral border-transparent", className)}>Em processamento</Badge>;
  return (
    <Badge variant="outline" className={cn("border-transparent font-medium", RELIABILITY_CLASS[level], className)}>
      {RELIABILITY_LABELS[level]}
    </Badge>
  );
}

export function IntegrationStatusDot({ status }: { status: IntegrationStatus | undefined }) {
  const map: Record<IntegrationStatus, { label: string; cls: string }> = {
    CONNECTED: { label: "Conectado", cls: "bg-status-success" },
    DISCONNECTED: { label: "Não conectado", cls: "bg-status-neutral" },
    ERROR: { label: "Erro de conexão", cls: "bg-status-danger" },
  };
  const s = map[status ?? "DISCONNECTED"];
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className={cn("size-2.5 rounded-full", s.cls)} />
      {s.label}
    </span>
  );
}
