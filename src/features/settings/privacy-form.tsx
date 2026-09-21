"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { savePrivacySettingsAction, runRetentionNowAction } from "@/features/settings/privacy-actions";
import type { AIPrivacyMode, RetentionPolicy } from "@/generated/prisma/enums";

export const RETENTION_LABELS: Record<RetentionPolicy, string> = {
  DAYS_30: "30 dias",
  DAYS_90: "90 dias",
  DAYS_180: "180 dias",
  INDEFINITE: "Indefinidamente",
  DELETE_AFTER_PROCESSING: "Excluir após processamento",
};

export function PrivacyForm({ initial }: { initial: { retentionPolicy: RetentionPolicy; aiPrivacyMode: AIPrivacyMode } }) {
  const [retention, setRetention] = useState<RetentionPolicy>(initial.retentionPolicy);
  const [mode, setMode] = useState<AIPrivacyMode>(initial.aiPrivacyMode);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await savePrivacySettingsAction({ retentionPolicy: retention, aiPrivacyMode: mode });
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }
  function runNow() {
    start(async () => {
      const res = await runRetentionNowAction();
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }

  return (
    <div className="grid gap-6">
      <div className="space-y-2">
        <Label>Retenção dos PDFs enviados</Label>
        <Select value={retention} onValueChange={(v) => setRetention(v as RetentionPolicy)}>
          <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(RETENTION_LABELS) as RetentionPolicy[]).map((k) => (
              <SelectItem key={k} value={k}>{RETENTION_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Após o prazo o arquivo físico é removido; os dados estruturados da análise permanecem. Aplica-se a novos envios.</p>
      </div>
      <div className="space-y-2">
        <Label>Dados enviados à OpenAI</Label>
        <Select value={mode} onValueChange={(v) => setMode(v as AIPrivacyMode)}>
          <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="PDF_FILE">PDF completo (melhor leitura de tabelas)</SelectItem>
            <SelectItem value="REDACTED_TEXT">Somente texto com CPF/RG/telefone mascarados</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          No modo PDF completo, o documento é enviado como arquivo à API (pode conter dados pessoais). No modo texto, apenas o texto extraído localmente com PII mascarada é enviado — mais privado, leitura de tabela menos robusta.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
        <Button variant="outline" onClick={runNow} disabled={pending}><Trash2 className="size-4" /> Executar retenção agora</Button>
      </div>
    </div>
  );
}
