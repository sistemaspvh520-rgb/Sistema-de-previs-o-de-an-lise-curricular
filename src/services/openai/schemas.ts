import { z } from "zod";

/**
 * Structured Outputs — schemas rigorosos usados com zodTextFormat (strict).
 * Regras do modo strict: todos os campos obrigatórios (usar .nullable() em vez de .optional()),
 * sem additionalProperties, sem defaults.
 */

export const readabilitySchema = z.enum(["CLEAR", "UNCLEAR", "UNREADABLE"]);

export const extractedSubjectSchema = z.object({
  code: z.string().nullable().describe("Código numérico da disciplina (coluna Código), quando existir; senão null."),
  name: z.string().describe("Texto da coluna DISCIPLINA (componente da grade da instituição de destino), exatamente como no documento."),
  workload: z.number().describe("Carga horária (C.H.) em horas. Use 0 quando o documento mostrar 0 ou vazio."),
  period: z.number().int().describe("Valor da coluna SÉRIE/PERÍODO como inteiro (1 = 1º período)."),
  usedSubject: z
    .string()
    .nullable()
    .describe(
      "Texto da coluna DISCIPLINA UTILIZADA. null quando for '-', vazio, 'não', 'sem aproveitamento' ou somente espaços.",
    ),
  sourcePage: z.number().int().describe("Página do PDF (1-based) onde a linha aparece."),
  sourceRow: z.number().int().describe("Índice da linha dentro da tabela naquela página (1-based)."),
  readability: readabilitySchema.describe("CLEAR quando todos os campos foram lidos com segurança; UNCLEAR se algum campo é duvidoso; UNREADABLE se ilegível."),
  note: z.string().nullable().describe("Observação curta sobre dúvida de leitura, ou null."),
});

export const documentClaimTypeSchema = z.enum(["PENDING_TOTAL", "EXEMPTED_TOTAL", "TOTAL_SUBJECTS", "ENTRY_PERIOD", "OTHER"]);

export const documentClaimSchema = z.object({
  type: documentClaimTypeSchema,
  value: z.number().nullable().describe("Valor numérico declarado no texto, ou null se não numérico."),
  sourcePage: z.number().int(),
  rawText: z.string().describe("Trecho literal do documento que originou a afirmação."),
});

export const ambiguitySchema = z.object({
  sourcePage: z.number().int(),
  sourceRow: z.number().int().nullable(),
  message: z.string(),
});

export const curriculumExtractionSchema = z.object({
  document: z.object({
    course: z.string().nullable().describe("Nome do curso de destino, se identificável."),
    matrix: z.string().nullable().describe("Identificação da matriz/grade curricular (ex.: campo 'Grade:'), se presente."),
    campus: z.string().nullable().describe("Campus, se presente."),
    modality: z.string().nullable().describe("Modalidade/turno (ex.: campo 'Período: EAD'), se presente."),
    candidateLabel: z.string().nullable().describe("Identificação não sensível do candidato (ex.: iniciais ou RGM). Nunca CPF/RG."),
    detectedEntryPeriod: z.number().int().nullable().describe("Período de ingresso informado EXPLICITAMENTE no documento, ou null."),
    detectedEntryPeriodEvidence: z.string().nullable().describe("Trecho literal que justifica detectedEntryPeriod, ou null."),
  }),
  subjects: z.array(extractedSubjectSchema),
  documentClaims: z.array(documentClaimSchema),
  ambiguities: z.array(ambiguitySchema),
});

export type CurriculumExtraction = z.infer<typeof curriculumExtractionSchema>;
export type ExtractedSubject = z.infer<typeof extractedSubjectSchema>;
export type DocumentClaimType = z.infer<typeof documentClaimTypeSchema>;

export const auditIssueCodeSchema = z.enum([
  "POSSIBLE_MISSING_ROW",
  "POSSIBLE_DUPLICATE_ROW",
  "WRONG_PERIOD",
  "WRONG_WORKLOAD",
  "WRONG_STATUS",
  "USED_SUBJECT_MISREAD",
  "TOTAL_MISMATCH",
  "TABLE_TEXT_INCONSISTENCY",
  "RESULT_INCONSISTENCY",
  "OTHER",
]);

export const auditIssueSchema = z.object({
  code: auditIssueCodeSchema,
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]),
  subjectRowHash: z.string().nullable().describe("rowHash da disciplina afetada, quando aplicável."),
  sourcePage: z.number().int().nullable(),
  message: z.string().describe("Explicação objetiva em português do problema encontrado."),
});

export const curriculumAuditSchema = z.object({
  status: z.enum(["OK", "REVIEW"]),
  issues: z.array(auditIssueSchema),
});

export type CurriculumAudit = z.infer<typeof curriculumAuditSchema>;
export type AuditIssue = z.infer<typeof auditIssueSchema>;
