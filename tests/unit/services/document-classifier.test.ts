import { describe, expect, it } from "vitest";
import { classifyCurricularAnalysisText } from "@/services/pdf/document-classifier";

describe("classificador de documento curricular", () => {
  it("aceita histórico escolar com sinais acadêmicos", () => {
    const result = classifyCurricularAnalysisText(
      "HISTÓRICO ESCOLAR Dados do aluno RGM 123 Curso: Administração Disciplinas cursadas Carga horária Situação acadêmica",
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
