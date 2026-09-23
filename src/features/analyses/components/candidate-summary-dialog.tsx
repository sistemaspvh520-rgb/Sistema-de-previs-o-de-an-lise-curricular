"use client";

import { formatCourseFormat } from "@/domain/course-formats";
import { useState } from "react";
import { Copy, Check, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { AnalysisVM } from "@/features/analyses/view-model";

export function buildCandidateSummary(vm: AnalysisVM): string {
  const pendencias = vm.totals.pending + vm.totals.review;
  const ingresso = vm.entryPeriod ? `${vm.entryPeriod}º período` : null;
  const previsao = vm.estimatedCompletionTerm;
  const primeiroPasso = vm.entryPeriod
    ? `Você seguirá a partir do ${ingresso}, conforme informado no resultado da análise.`
    : "Ainda estamos confirmando o período de ingresso informado no documento.";
  const conclusao = previsao
    ? `Mantidas as ofertas regulares e a matrícula nas disciplinas previstas, a conclusão estimada é ${previsao}.`
    : "A previsão de conclusão será disponibilizada após a confirmação completa da análise.";
  return [
    "Olá! Concluímos a análise do seu aproveitamento curricular 🎓",
    "",
    vm.studentName ? `${vm.studentName}, veja seu resultado:` : "Veja seu resultado:",
    vm.courseName ? `Curso: ${vm.courseName}${vm.courseFormat ? ` (${formatCourseFormat(vm.courseFormat)})` : ""}.` : null,
    "",
    `✓ ${vm.totals.exempted} ${vm.totals.exempted === 1 ? "disciplina foi aproveitada" : "disciplinas foram aproveitadas"}.`,
    `• ${pendencias} ${pendencias === 1 ? "disciplina permanece" : "disciplinas permanecem"} para cursar.`,
    `• ${primeiroPasso}`,
    `• ${conclusao}`,
    ...(vm.narrative?.bulletLines.length ? ["", "Organização prevista:", ...vm.narrative.bulletLines] : []),
    "",
    "Esta é uma previsão acadêmica e pode ser ajustada caso haja alteração na oferta de disciplinas, matrícula ou regras institucionais.",
    "Em caso de dúvida, fale conosco — estamos à disposição.",
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
