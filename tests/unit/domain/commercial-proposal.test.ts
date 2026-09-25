import { describe, expect, it } from "vitest";
import { buildCommercialProposal } from "@/domain/commercial/proposal";

describe("buildCommercialProposal", () => {
  it("sinaliza lead de alto valor e estima semestres poupados", () => {
    const proposal = buildCommercialProposal({
      studentName: "Ana", courseName: "Direito", totalSubjects: 40,
      exemptedSubjects: 24, totalPeriods: 8, projectedPeriods: 4,
      estimatedCompletionTerm: "2028.2",
    });
    expect(proposal.exemptedPercentage).toBe(60);
    expect(proposal.savedTerms).toBe(4);
    expect(proposal.isHighValue).toBe(true);
  });

  it("não estima o tempo poupado quando a projeção ainda não existe", () => {
    const proposal = buildCommercialProposal({
      studentName: null, courseName: null, totalSubjects: 10,
      exemptedSubjects: 2, totalPeriods: 2, projectedPeriods: null,
      estimatedCompletionTerm: null,
    });
    expect(proposal.savedTerms).toBeNull();
    expect(proposal.isHighValue).toBe(false);
  });
});
