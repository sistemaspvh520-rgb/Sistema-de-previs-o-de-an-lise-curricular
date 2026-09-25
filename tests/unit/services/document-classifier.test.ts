import { describe, expect, it } from "vitest";
import { classifyCurricularAnalysisText, validateCurricularDocumentMetadata } from "@/services/pdf/document-classifier";

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

  it("rejects incomplete transfer-analysis forms with missing academic identifiers", () => {
    const text = "Solicitação de Transferência ou 2ª Graduação — Análise Curricular Campus / Unidade Curso Semestre de Entrada Resumo do Aproveitamento Disciplinas Dispensadas Disciplinas a Cursar Situação de Ingresso Data da Análise C.H.";
    const initial = classifyCurricularAnalysisText(text);
    expect(initial.accepted).toBe(true);

    const rejected = validateCurricularDocumentMetadata(text, {
      campus: "",
      curso: "",
      "semestre de entrada": "0º Semestre",
    }, initial);
    expect(rejected.accepted).toBe(false);
    expect(rejected.reason).toContain("incompleto ou desatualizado");
    expect(rejected.reason).toContain("confirmação");
  });

  it("accepts the transfer-analysis form when its required metadata is present", () => {
    const text = "Solicitação de Transferência — Análise Curricular Campus / Unidade Curso Semestre de Entrada Resumo do Aproveitamento Disciplinas Dispensadas Disciplinas a Cursar Situação de Ingresso Data da Análise C.H.";
    const initial = classifyCurricularAnalysisText(text);
    const accepted = validateCurricularDocumentMetadata(text, {
      campus: "POLO DIGITAL",
      curso: "SISTEMAS DE INFORMAÇÃO",
      "semestre de entrada": "4º Semestre",
    }, initial);
    expect(accepted.accepted).toBe(true);
  });
});
