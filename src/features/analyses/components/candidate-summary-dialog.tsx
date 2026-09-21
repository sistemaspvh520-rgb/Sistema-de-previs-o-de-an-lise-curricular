"use client";

import { useState } from "react";
import { Copy, Check, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { AnalysisVM } from "@/features/analyses/view-model";

export function buildCandidateSummary(vm: AnalysisVM): string {
  const ingresso = vm.entryPeriod ? `${vm.entryPeriod}º período` : "a confirmar";
  const previsao = vm.estimatedCompletionTerm ?? "a confirmar";
  return [
    "Analisamos seu aproveitamento curricular 🎓",
    "",
    vm.courseName ? `Curso: ${vm.courseName}` : null,
    `Ingresso previsto: ${ingresso}`,
    `Disciplinas aproveitadas: ${vm.totals.exempted}`,
    `Pendências identificadas: ${vm.totals.pending + vm.totals.review}`,
    `Previsão estimada de conclusão: ${previsao}`,
    ...(vm.narrative ? ["", ...vm.narrative.headerLines.filter((l) => l.startsWith("⚠️") || l.startsWith("Semestres")), "", "A previsão fica assim:", "", ...vm.narrative.bulletLines, "", vm.narrative.conclusionLine ?? ""] : []),
    "",
    "A previsão considera a análise curricular e as regras acadêmicas atualmente cadastradas.",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

export function CandidateSummaryDialog({ vm }: { vm: AnalysisVM }) {
  const [text, setText] = useState(() => buildCandidateSummary(vm));
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Resumo copiado.");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto manualmente.");
    }
  }

  return (
    <Dialog onOpenChange={(o) => o && setText(buildCandidateSummary(vm))}>
      <DialogTrigger asChild>
        <Button variant="outline"><MessageCircle className="size-4" /> Gerar resumo para candidato</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resumo para o candidato</DialogTitle>
          <DialogDescription>Texto pronto para WhatsApp. Ajuste se necessário antes de copiar.</DialogDescription>
        </DialogHeader>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} className="font-sans" />
        <Button onClick={copy}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />} Copiar</Button>
      </DialogContent>
    </Dialog>
  );
}
