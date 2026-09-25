export interface CommercialProposalInput {
  studentName: string | null;
  courseName: string | null;
  totalSubjects: number;
  exemptedSubjects: number;
  totalPeriods: number;
  projectedPeriods: number | null;
  estimatedCompletionTerm: string | null;
}

export interface CommercialProposal {
  exemptedPercentage: number;
  savedTerms: number | null;
  isHighValue: boolean;
  highValueReason: string | null;
}

/**
 * Transforma o resultado acadêmico em indicadores comerciais sem alterar a
 * previsão do motor. Não há promessa de condição financeira ao candidato.
 */
export function buildCommercialProposal(
  input: CommercialProposalInput,
): CommercialProposal {
  const exemptedPercentage = input.totalSubjects
    ? Math.round((input.exemptedSubjects / input.totalSubjects) * 100)
    : 0;
  const savedTerms =
    input.projectedPeriods !== null && input.totalPeriods > 0
      ? Math.max(0, input.totalPeriods - input.projectedPeriods)
      : null;
  const isHighValue = exemptedPercentage >= 50;
  return {
    exemptedPercentage,
    savedTerms,
    isHighValue,
    highValueReason: isHighValue
      ? `${exemptedPercentage}% da grade foi aproveitada.`
      : null,
  };
}
