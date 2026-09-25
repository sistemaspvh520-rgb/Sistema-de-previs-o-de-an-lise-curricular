import "server-only";
import { parsePdf } from "@/services/pdf/parser";

export type DocumentClassification = {
  accepted: boolean;
  reason: string;
  matchedSignals: string[];
};

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
/** Marcadores presentes no PDF de resultado emitido pelo SIAA. */
const SIAA_HEADERS = [
  "analise curricular",
  "solicitacao de transferencia",
  "solicitacao de 2a graduacao",
];
const SIAA_RESULT_SIGNALS = [
  "resumo do aproveitamento",
  "disciplinas dispensadas",
  "disciplinas a cursar",
  "situacao de ingresso",
  "data da analise",
];
const ACADEMIC_SIGNALS = [
  "disciplina",
  "dispensada",
  "a cursar",
  "c.h.",
  "carga horaria",
];
const REJECTED_DOCUMENTS = [
  "boleto",
  "nota fiscal",
  "contrato",
  "certidao",
  "diploma",
  "declaracao de matricula",
  "edital",
  "curriculo vitae",
  "comprovante de pagamento",
];

/** Classifica a amostra textual antes de qualquer análise de equivalência curricular. */
export function classifyCurricularAnalysisText(
  text: string,
): DocumentClassification {
  const source = normalize(text);
  const headers = SIAA_HEADERS.filter((signal) => source.includes(signal));
  const result = SIAA_RESULT_SIGNALS.filter((signal) =>
    source.includes(signal),
  );
  const academic = ACADEMIC_SIGNALS.filter((signal) => source.includes(signal));
  const rejected = REJECTED_DOCUMENTS.filter((signal) =>
    source.includes(signal),
  );
  if (rejected.length > 0 && headers.length === 0)
    return {
      accepted: false,
      reason:
        "O PDF parece ser outro tipo de documento, não um histórico escolar acadêmico.",
      matchedSignals: rejected,
    };
  if (headers.length >= 1 && result.length >= 1 && academic.length >= 1)
    return {
      accepted: true,
      reason: "Resultado de análise curricular do SIAA identificado.",
      matchedSignals: [...headers, ...result, ...academic],
    };
  return {
    accepted: false,
    reason:
      "Não foi possível confirmar que o arquivo é o PDF de resultado da análise curricular do SIAA.",
    matchedSignals: [...headers, ...result, ...academic],
  };
}

export function validateCurricularDocumentMetadata(
  text: string,
  fields: Record<string, string>,
  classification: DocumentClassification,
): DocumentClassification {
  const normalized = normalize(text);
  const unifiedRequest = normalized.includes("campus / unidade") &&
    normalized.includes("semestre de entrada");
  if (!unifiedRequest) return classification;

  const campus = fields.campus?.trim();
  const course = fields.curso?.trim();
  const entryPeriod = fields["semestre de entrada"]?.match(/^\s*(\d{1,2})\s*[ºª°]?/i)?.[1];
  const validEntryPeriod = entryPeriod !== undefined && Number(entryPeriod) >= 1 && Number(entryPeriod) <= 20;
  if (campus && course && validEntryPeriod) return classification;

  return {
    accepted: false,
    reason: "Este PDF está incompleto ou desatualizado: campus/unidade, curso ou semestre de entrada não foram identificados corretamente. Anexe o documento atualizado com esses dados e a grade acadêmica preenchida. A análise curricular só será iniciada após a confirmação dos dados.",
    matchedSignals: [
      ...classification.matchedSignals,
      ...(!campus ? ["campus/unidade ausente"] : []),
      ...(!course ? ["curso ausente"] : []),
      ...(!validEntryPeriod ? ["semestre de entrada ausente ou inválido"] : []),
    ],
  };
}

export class InvalidCurricularDocumentError extends Error {
  readonly code = "INVALID_CURRICULAR_DOCUMENT";
  constructor(readonly classification: DocumentClassification) {
    super(
      classification.reason || "Anexe o PDF atualizado de resultado da análise curricular, com curso, período de ingresso e grade preenchidos. Confirme os dados para iniciar a análise.",
    );
    this.name = "InvalidCurricularDocumentError";
  }
}

/** Lê apenas as três primeiras páginas: suficiente para cabeçalho e início da grade, sem iniciar o pipeline. */
export async function assertCurricularAnalysisDocument(
  bytes: Buffer,
): Promise<DocumentClassification> {
  const parsed = await parsePdf(bytes, { maxPages: 3 });
  const text = parsed.textByPage.join("\n");
  const classification = validateCurricularDocumentMetadata(
    text,
    parsed.headerFields ?? {},
    classifyCurricularAnalysisText(text),
  );
  if (!classification.accepted)
    throw new InvalidCurricularDocumentError(classification);
  return classification;
}
