"use client";

import { formatCourseFormat } from "@/domain/course-formats";
import { useState } from "react";
import { Copy, Check, MessageCircle, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { readableName } from "@/lib/text";
import type { AnalysisVM } from "@/features/analyses/view-model";

/** "CST EM ANÁLISE E DESENVOLVIMENTO DE SISTEMAS" → "Análise e Desenvolvimento de Sistemas". */
function friendlyCourseName(courseName: string | null): string | null {
  if (!courseName) return null;
  const base = courseName.replace(/\s*\(.*?\)\s*$/, "").replace(/^(cst|curso superior de tecnologia|tecnologia)\s+em\s+/i, "").trim();
  return base ? readableName(base) : null;
}

function firstName(studentName: string | null): string | null {
  const first = studentName?.trim().split(/\s+/)[0];
  if (!first) return null;
  return first.charAt(0).toLocaleUpperCase("pt-BR") + first.slice(1).toLocaleLowerCase("pt-BR");
}

/**
 * Mensagens de WhatsApp para o candidato, na ordem de envio: cumprimento, aprovação,
 * (aqui o PDF do resultado é anexado), resultado detalhado e aviso de previsão.
 */
export function buildCandidateMessages(vm: AnalysisVM): string[] {
  const pendencias = vm.totals.pending + vm.totals.review;
  const ingresso = vm.entryPeriod ? `${vm.entryPeriod}º período` : null;
  const previsao = vm.estimatedCompletionTerm;
  const name = firstName(vm.studentName);
  const course = friendlyCourseName(vm.courseName);
  const destino = vm.entryPeriod ? `no ${vm.entryPeriod}º semestre${course ? ` de ${course}` : ""}` : course ? `em ${course}` : "no curso";
  const primeiroPasso = ingresso
    ? `Você seguirá a partir do ${ingresso}, conforme informado no resultado da análise.`
    : "Ainda estamos confirmando o período de ingresso informado no documento.";
  const conclusao = previsao
    ? `Mantidas as ofertas regulares e a matrícula nas disciplinas previstas, a conclusão estimada é ${vm.estimatedCompletionSummary ?? previsao}.`
    : "A previsão de conclusão será disponibilizada após a confirmação completa da análise.";
  return [
    `Oi${name ? `, ${name}` : ""}! Tudo bem? Recebi agora o resultado da sua análise curricular`,
    `A análise foi aprovada e você poderá ingressar ${destino}, com aproveitamento de disciplinas que já cursou anteriormente`,
    [
      vm.courseName ? `Curso: ${vm.courseName}${vm.courseFormat ? ` (${formatCourseFormat(vm.courseFormat)})` : ""}.` : null,
      "",
      `✓ ${vm.totals.exempted} ${vm.totals.exempted === 1 ? "disciplina foi aproveitada" : "disciplinas foram aproveitadas"}.`,
      `• ${pendencias} ${pendencias === 1 ? "disciplina permanece" : "disciplinas permanecem"} para cursar.`,
      `• ${primeiroPasso}`,
      `• ${conclusao}`,
      ...(vm.narrative?.bulletLines.length ? ["", "Organização prevista:", ...vm.narrative.bulletLines] : []),
    ]
      .filter((l) => l !== null)
      .join("\n")
      .replace(/^\n+/, ""),
    "Esta é uma previsão acadêmica e pode ser ajustada caso haja alteração na oferta de disciplinas, matrícula ou regras institucionais",
  ];
}

export function CandidateSummaryDialog({ vm }: { vm: AnalysisVM }) {
  const [messages, setMessages] = useState(() => buildCandidateMessages(vm));
  const [copied, setCopied] = useState<number | "all" | null>(null);

  async function copy(text: string, which: number | "all") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      toast.success(which === "all" ? "Todas as mensagens copiadas." : `Mensagem ${which + 1} copiada.`);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto manualmente.");
    }
  }

  return (
    <Dialog onOpenChange={(o) => o && setMessages(buildCandidateMessages(vm))}>
      <DialogTrigger asChild>
        <Button variant="outline"><MessageCircle className="size-4" /> Gerar resumo para candidato</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Mensagens para o candidato</DialogTitle>
          <DialogDescription>Enviadas em sequência pelo WhatsApp. Ajuste se necessário e copie uma a uma.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {messages.map((message, index) => (
            <div key={index} className="space-y-2">
              {index === 2 && (
                <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
                  <Paperclip className="size-3.5" /> Anexe aqui o PDF do resultado da análise.
                </div>
              )}
              <Textarea
                value={message}
                onChange={(e) => setMessages((current) => current.map((m, i) => (i === index ? e.target.value : m)))}
                rows={index === 2 ? 11 : 3}
                className="font-sans"
                aria-label={`Mensagem ${index + 1}`}
              />
              <Button variant="outline" size="sm" onClick={() => copy(message, index)}>
                {copied === index ? <Check className="size-4" /> : <Copy className="size-4" />} Copiar mensagem {index + 1}
              </Button>
            </div>
          ))}
        </div>
        <Button onClick={() => copy(messages.join("\n\n"), "all")}>
          {copied === "all" ? <Check className="size-4" /> : <Copy className="size-4" />} Copiar tudo
        </Button>
      </DialogContent>
    </Dialog>
  );
}
