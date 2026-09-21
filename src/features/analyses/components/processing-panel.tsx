"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, CircleDot, Loader2, RefreshCw, XCircle, MinusCircle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProcessingStep } from "@/services/pipeline/steps";
import { retryAnalysisAction } from "@/features/analyses/actions";
import { OPENAI_ERROR_MESSAGES } from "@/services/openai/error-messages";

interface StatusPayload {
  status: string;
  steps: ProcessingStep[];
  errorCode: string | null;
  errorMessage: string | null;
}

const FINAL = ["COMPLETED", "WAITING_REVIEW", "FAILED", "AI_ERROR"];

export function ProcessingPanel({
  analysisId,
  initialSteps,
  initialStatus,
  errorCode,
  errorMessage,
  canRetry,
}: {
  analysisId: string;
  initialSteps: ProcessingStep[];
  initialStatus: string;
  errorCode: string | null;
  errorMessage: string | null;
  canRetry: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<StatusPayload>({ status: initialStatus, steps: initialSteps, errorCode, errorMessage });
  const [pending, start] = useTransition();
  const processing = !FINAL.includes(data.status);

  useEffect(() => {
    if (!processing) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/analyses/${analysisId}/status`, { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as StatusPayload;
        if (!alive) return;
        setData(body);
        if (FINAL.includes(body.status)) router.refresh();
      } catch {
        /* tenta de novo no próximo tick */
      }
    };
    const id = setInterval(tick, 1500);
    tick();
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [analysisId, processing, router]);

  function retry() {
    start(async () => {
      const res = await retryAnalysisAction(analysisId);
      if (res.ok) {
        toast.success(res.message);
        setData((d) => ({ ...d, status: "PARSING", errorCode: null, errorMessage: null }));
        router.refresh();
      } else toast.error(res.error);
    });
  }

  const failed = data.status === "FAILED" || data.status === "AI_ERROR";
  const friendly = data.errorCode && data.errorCode in OPENAI_ERROR_MESSAGES ? OPENAI_ERROR_MESSAGES[data.errorCode as keyof typeof OPENAI_ERROR_MESSAGES] : data.errorMessage;

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{failed ? "Processamento interrompido" : "Processando análise"}</CardTitle>
        {processing && <Loader2 className="size-4 animate-spin text-brand-cyan-700" />}
      </CardHeader>
      <CardContent>
        <ol className="space-y-2.5">
          {data.steps.map((s) => (
            <li key={s.key} className="flex items-start gap-3 text-sm">
              <StepIcon status={s.status} />
              <div className="min-w-0 flex-1">
                <div className={cn("font-medium", s.status === "pending" && "text-muted-foreground", s.status === "error" && "text-status-danger")}>{s.label}</div>
                {s.message && <div className="text-xs text-muted-foreground">{s.message}</div>}
              </div>
            </li>
          ))}
        </ol>
        {failed && (
          <div className="mt-5 rounded-lg border border-status-danger/20 bg-status-danger-bg p-4 text-sm text-status-danger">
            <div className="font-medium">{data.status === "AI_ERROR" ? "Falha na comunicação com a OpenAI" : "Falha no processamento"}</div>
            <p className="mt-1">{friendly ?? "Erro inesperado."}</p>
            <p className="mt-1 text-xs opacity-80">O PDF e tudo que já foi extraído foram preservados. Você pode tentar novamente.</p>
            {canRetry && (
              <Button className="mt-3" variant="outline" size="sm" onClick={retry} disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Tentar novamente
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StepIcon({ status }: { status: ProcessingStep["status"] }) {
  switch (status) {
    case "done":
      return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-success" />;
    case "running":
      return <CircleDot className="mt-0.5 size-4 shrink-0 animate-pulse text-brand-cyan-700" />;
    case "error":
      return <XCircle className="mt-0.5 size-4 shrink-0 text-status-danger" />;
    case "skipped":
      return <MinusCircle className="mt-0.5 size-4 shrink-0 text-status-warning" />;
    default:
      return <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />;
  }
}
