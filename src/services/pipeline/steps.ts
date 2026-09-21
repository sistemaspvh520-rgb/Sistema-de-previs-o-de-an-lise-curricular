export type StepKey =
  | "RECEIVED"
  | "VALIDATED"
  | "PARSING"
  | "EXTRACTING"
  | "CLASSIFYING"
  | "CALCULATING"
  | "SIMULATING"
  | "AUDITING"
  | "VALIDATING"
  | "FINALIZING";

export type StepStatus = "pending" | "running" | "done" | "error" | "skipped";

export interface ProcessingStep {
  key: StepKey;
  label: string;
  status: StepStatus;
  startedAt?: string;
  finishedAt?: string;
  message?: string;
}

export const STEP_LABELS: Record<StepKey, string> = {
  RECEIVED: "Arquivo recebido",
  VALIDATED: "PDF validado",
  PARSING: "Lendo documento",
  EXTRACTING: "Identificando grade",
  CLASSIFYING: "Identificando dispensas",
  CALCULATING: "Calculando pendências",
  SIMULATING: "Simulando períodos",
  AUDITING: "Auditando com OpenAI",
  VALIDATING: "Validando resultado",
  FINALIZING: "Finalizando",
};

export const STEP_ORDER: StepKey[] = [
  "RECEIVED",
  "VALIDATED",
  "PARSING",
  "EXTRACTING",
  "CLASSIFYING",
  "CALCULATING",
  "SIMULATING",
  "AUDITING",
  "VALIDATING",
  "FINALIZING",
];

export function initialSteps(): ProcessingStep[] {
  const now = new Date().toISOString();
  return STEP_ORDER.map((key) => ({
    key,
    label: STEP_LABELS[key],
    status: key === "RECEIVED" || key === "VALIDATED" ? "done" : "pending",
    ...(key === "RECEIVED" || key === "VALIDATED" ? { startedAt: now, finishedAt: now } : {}),
  }));
}

export function parseSteps(value: unknown): ProcessingStep[] {
  if (!Array.isArray(value) || value.length === 0) return initialSteps();
  return value as ProcessingStep[];
}
