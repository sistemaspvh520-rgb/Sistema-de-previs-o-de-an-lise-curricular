import { describe, expect, it } from "vitest";
import { classifyCurricularAnalysisText } from "@/services/pdf/document-classifier";

describe("classificador de documento curricular", () => {
  it("aceita o resultado de análise curricular do SIAA", () => {
    const result = classifyCurricularAnalysisText(
      "Análise Curricular Solicitação de Transferência Resumo do Aproveitamento Disciplinas Dispensadas — 10 Disciplinas a Cursar — 42 Disciplina C.H. Situação",
    );
    expect(result.accepted).toBe(true);
  });

  it("bloqueia documentos incompatíveis", () => {
    const result = classifyCurricularAnalysisText(
      "Boleto bancário contrato e comprovante de pagamento",
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("outro tipo de documento");
  });
});
