"use client";

import { FileDown, MessageCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildCommercialProposal } from "@/domain/commercial/proposal";
import type { AnalysisVM } from "@/features/analyses/view-model";

function proposalInput(vm: AnalysisVM) {
  return {
    studentName: vm.studentName,
    courseName: vm.courseName,
    totalSubjects: vm.totals.total,
    exemptedSubjects: vm.totals.exempted,
    totalPeriods: Math.max(0, ...vm.totals.periods),
    projectedPeriods: vm.semestersRemaining,
    estimatedCompletionTerm: vm.estimatedCompletionTerm,
  };
}

export function buildCommercialWhatsAppMessage(
  vm: AnalysisVM,
) {
  const proposal = buildCommercialProposal(proposalInput(vm));
  return [
    `Olá${vm.studentName ? `, ${vm.studentName}` : ""}! Temos uma ótima notícia sobre seu aproveitamento curricular 🎓`,
    "",
    vm.courseName ? `Curso: *${vm.courseName}*` : null,
    `✓ *${vm.totals.exempted} disciplinas* já aproveitadas (${proposal.exemptedPercentage}% da grade).`,
    proposal.savedTerms !== null && proposal.savedTerms > 0 ? `✓ Projeção de até *${proposal.savedTerms} semestre(s)* a menos no percurso.` : null,
    vm.estimatedCompletionTerm ? `✓ Previsão acadêmica de conclusão: *${vm.estimatedCompletionSummary ?? vm.estimatedCompletionTerm}*.` : null,
    "",
    "Vamos conversar para escolher a melhor condição de matrícula?",
    "",
    "*Estimativas sujeitas à oferta de disciplinas, matrícula e condições comerciais vigentes.*",
  ].filter((line): line is string => Boolean(line)).join("\n");
}

export function CommercialProposalActions({
  vm,
}: {
  vm: AnalysisVM;
}) {
  const proposal = buildCommercialProposal(proposalInput(vm));
  const message = buildCommercialWhatsAppMessage(vm);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {proposal.isHighValue && (
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-gold-50 px-2.5 py-1 text-xs font-semibold text-brand-navy">
          <Sparkles className="size-3.5 text-brand-gold" /> Lead prioritário: {proposal.highValueReason}
        </span>
      )}
      <Button variant="outline" asChild>
        <a href={`/analyses/${vm.id}/proposal`} target="_blank" rel="noreferrer">
          <FileDown className="size-4" /> Proposta para imprimir/PDF
        </a>
      </Button>
      <Button asChild>
        <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
          <MessageCircle className="size-4" /> Enviar no WhatsApp
        </a>
      </Button>
    </div>
  );
}
