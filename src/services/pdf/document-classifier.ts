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
const HISTORY_HEADERS = ["historico escolar", "historico academico"];
const ACADEMIC_SIGNALS = [
  "disciplinas cursadas",
  "disciplina",
  "componentes curriculares",
  "aproveitamento",
  "situacao academica",
  "rendimento academico",
  "carga horaria",
  "nota final",
];
const IDENTITY_SIGNALS = [
  "rgm",
  "ra",
  "registro academico",
  "dados do aluno",
  "aluno(a)",
  "curso",
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
  const headers = HISTORY_HEADERS.filter((signal) => source.includes(signal));
  const history = ACADEMIC_SIGNALS.filter((signal) => source.includes(signal));
  const identity = IDENTITY_SIGNALS.filter((signal) => source.includes(signal));
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
  if (headers.length >= 1 && history.length >= 1 && identity.length >= 1)
    return {
      accepted: true,
      reason: "Histórico escolar identificado.",
      matchedSignals: [...headers, ...history, ...identity],
    };
  return {
    accepted: false,
    reason:
      "Não foi possível confirmar que o arquivo é um histórico escolar com disciplinas e dados acadêmicos.",
    matchedSignals: [...headers, ...history, ...identity],
  };
}

export class InvalidCurricularDocumentError extends Error {
  readonly code = "INVALID_CURRICULAR_DOCUMENT";
  constructor(readonly classification: DocumentClassification) {
    super(
      "Envie o PDF de resultado do SIAA do aluno, contendo curso, disciplinas cursadas e dados acadêmicos. Outros PDFs não podem iniciar uma análise curricular.",
    );
    this.name = "InvalidCurricularDocumentError";
  }
}

/** Lê apenas as três primeiras páginas: suficiente para cabeçalho e início da grade, sem iniciar o pipeline. */
export async function assertCurricularAnalysisDocument(
  bytes: Buffer,
): Promise<DocumentClassification> {
  const parsed = await parsePdf(bytes, { maxPages: 3 });
  const classification = classifyCurricularAnalysisText(
    parsed.textByPage.join("\n"),
  );
  if (!classification.accepted)
    throw new InvalidCurricularDocumentError(classification);
  return classification;
}
