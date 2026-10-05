import "server-only";

import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { parsePdf, type ParsedPage } from "@/services/pdf/parser";
import { getOpenAIClient } from "@/services/openai/client-factory";
import { formatIntegrationError, mapOpenAIError } from "@/services/openai/errors";
import { logger } from "@/lib/logger";
import { normalizeCatalogMetadata, type CommercialTrack } from "@/services/commercial-grades/course-metadata";
import { readMatrixLayout, type MatrixLayoutReading } from "@/services/commercial-grades/matrix-layout";

const gradeReadingSchema = z.object({
  courseName: z.string().nullable(),
  modality: z.string().nullable(),
  curriculumTerm: z.string().nullable(),
  hasTcc: z.boolean(),
  totalInternshipHours: z.number().int().nullable(),
  totalCourseHours: z.number().int().nullable(),
  internships: z.array(z.object({ semester: z.number().int(), name: z.string(), workload: z.number().int().nullable() })),
  degree: z.string().nullable(),
  knowledgeArea: z.string().nullable(),
  durationSemesters: z.number().int().nullable(),
  tracks: z.array(z.object({
    name: z.string(),
    decisionSemester: z.number().int().nullable(),
    decisionEvidence: z.string().nullable(),
    internships: z.array(z.object({ semester: z.number().int(), name: z.string(), workload: z.number().int().nullable() })),
  })),
});

type GradeReading = z.infer<typeof gradeReadingSchema>;

export interface CommercialGradeReading {
  courseName: string | null;
  modality: string | null;
  curriculumTerm: string | null;
  hasTcc: boolean;
  totalInternshipHours: number | null;
  totalCourseHours: number | null;
  degree: string | null;
  knowledgeArea: string | null;
  durationSemesters: number | null;
  courseTracks: CommercialTrack[];
  internshipInfo: string | null;
  whatsappSummary: string;
  source: "AI" | "LOCAL";
  /** Quando a IA foi necessária e falhou, o motivo (legível). IA desligada ou dispensada não gera aviso. */
  aiNote?: string | null;
  /** false quando o PDF não trouxe curso, carga horária total ou duração (o time precisa conferir). */
  complete?: boolean;
}

const INSTRUCTIONS = `Você lê matrizes curriculares brasileiras para um time comercial. Extraia somente dados comprovados pelo PDF.
- Liste cada componente que contenha "ESTÁGIO" com o semestre em que aparece e o nome completo.
- hasTcc é true quando houver TCC, Trabalho de Curso, Trabalho de Conclusão ou equivalente.
- totalInternshipHours deve ser o total declarado no resumo da matriz; não some estimativas se esse total não estiver claro.
- totalCourseHours deve ser o total geral em horas-relógio, se declarado.
- degree é o grau acadêmico principal: Bacharelado, Licenciatura, Tecnólogo ou Área básica de ingresso. knowledgeArea é a área ampla que organiza o curso, como Saúde, Educação, Gestão, Tecnologia ou Direito.
- durationSemesters é a duração total prevista na matriz. Use somente a duração declarada ou o maior semestre explicitamente listado na matriz.
- Se a matriz tiver mais de uma formação/trilha (por exemplo, Bacharelado e Licenciatura), retorne uma entrada em tracks para cada uma. Em cada trilha, inclua apenas os estágios dela.
- decisionSemester só pode ser preenchido se o PDF disser expressamente em qual semestre o aluno escolhe/define a formação. Não deduza o período pela posição dos estágios. Se não estiver explícito, use null e explique brevemente em decisionEvidence que a matriz não informa o período.
- Não invente estágio, carga horária, modalidade ou vigência. Retorne em português e preserve o nome da disciplina.`;

/** Tempo total reservado à IA (as rotas de envio têm maxDuration de 120 s). */
const AI_BUDGET_MS = 100_000;
/** A partir deste tamanho o texto extraído localmente basta e o PDF não é reenviado à IA. */
const TEXT_ONLY_MIN_CHARS = 1_500;

/**
 * Lê a grade direto do PDF (layout da "Matriz Curricular" do SIAA). A IA só entra quando o PDF não traz curso, carga
 * horária total ou duração (ex.: PDF escaneado ou outro layout) e o interruptor de IA está ligado; nesse caso o que foi
 * lido do PDF prevalece e a IA completa o resto.
 * Nunca lança por causa do conteúdo do PDF: o que não puder ser lido vira campo vazio, para o time comercial revisar.
 */
export async function readCommercialGrade(bytes: Buffer, filename: string): Promise<CommercialGradeReading> {
  let text = "";
  let pages: ParsedPage[] | undefined;
  try {
    const local = await parsePdf(bytes, { maxPages: 80 });
    text = local.textByPage.join("\n");
    pages = local.pages;
  } catch (error) {
    logger.warn("commercial_grade.local_read_failed", { filename, error: String(error) });
  }
  const layout = readMatrixLayout(pages);
  if (layout && layoutComplete(layout)) return { ...sanitizeReading(layoutReading(layout, filename)), aiNote: null, complete: true };
  const fromPdf = layout ? layoutReading(layout, filename) : null;
  const legacy = localReading(text, filename);
  const fallback = fromPdf ? mergeReadings(fromPdf, legacy) : legacy;
  const complete = Boolean(fallback.courseName && fallback.totalCourseHours !== null && fallback.durationSemesters !== null);
  let aiNote: string | null = null;
  // Texto local suficiente dispensa o PDF (base64 de até 4 MB, mais tokens e muito mais lento); PDF escaneado segue anexado.
  const textOnly = text.trim().length >= TEXT_ONLY_MIN_CHARS;
  const startedAt = Date.now();
  // A IA de raciocínio gasta parte do limite de saída pensando: se a resposta vier cortada, tenta de novo com mais folga.
  for (const maxOutputTokens of [6_000, 16_000]) {
    // As rotas de envio têm 120 s: cada tentativa usa o que resta do orçamento, sem repetir a chamada do SDK.
    const remainingMs = AI_BUDGET_MS - (Date.now() - startedAt);
    if (remainingMs < 15_000) break;
    try {
      const { client, config } = await getOpenAIClient({ timeoutMs: remainingMs, maxRetries: 0 });
      const response = await client.responses.parse({
        model: config.extractionModel,
        instructions: INSTRUCTIONS,
        input: [{ role: "user", content: textOnly
          ? [{ type: "input_text", text: "Leia a matriz curricular a partir do texto extraído do PDF abaixo.\n\n" + text }]
          : [
            { type: "input_text", text: "Leia a matriz curricular anexada. Use o texto extraído abaixo como apoio para localizar totais e semestres.\n\n" + text },
            { type: "input_file", filename, file_data: `data:application/pdf;base64,${bytes.toString("base64")}` },
          ] }],
        text: { format: zodTextFormat(gradeReadingSchema, "commercial_grade_reading") },
        max_output_tokens: maxOutputTokens,
      });
      const parsed = response.output_parsed ? gradeReadingSchema.parse(response.output_parsed) : null;
      if (parsed) return { ...sanitizeReading(presentReading(parsed, fallback, "AI", Boolean(fromPdf))), complete: true };
      aiNote = response.status === "incomplete" ? "a resposta da IA veio incompleta" : "a IA não devolveu os dados no formato esperado";
      logger.warn("commercial_grade.ai_read_empty", { filename, status: response.status, reason: response.incomplete_details?.reason, maxOutputTokens });
    } catch (error) {
      const mapped = mapOpenAIError(error);
      // IA desligada é uma escolha, não uma falha: a grade segue com o que o PDF trouxe.
      if (mapped.code === "AI_DISABLED") break;
      aiNote = formatIntegrationError(mapped).replace(/\.$/, "");
      logger.warn("commercial_grade.ai_read_failed", { filename, code: mapped.code, status: mapped.status, detail: mapped.detail, maxOutputTokens, elapsedMs: Date.now() - startedAt });
      // Só vale repetir quando a falha foi na resposta (corte/formato); chave, cota, modelo, rede ou IA desligada não mudam na segunda tentativa.
      if (mapped.code !== "INVALID_STRUCTURED_OUTPUT") break;
    }
  }
  return { ...sanitizeReading(fallback), aiNote, complete };
}

/** Curso, carga total e duração: com eles a grade do SIAA está lida por inteiro e a IA não é chamada. */
function layoutComplete(layout: MatrixLayoutReading): boolean {
  return Boolean(layout.courseName && layout.totalCourseHours !== null && layout.durationSemesters !== null && layout.componentCount > 0);
}

/** Layout parcial: o que veio das colunas do SIAA prevalece; os rótulos do texto corrido completam o resto. */
function mergeReadings(layout: CommercialGradeReading, text: CommercialGradeReading): CommercialGradeReading {
  const courseName = layout.courseName ?? text.courseName;
  const internshipInfo = layout.internshipInfo ?? text.internshipInfo;
  const totalInternshipHours = layout.totalInternshipHours ?? text.totalInternshipHours;
  const totalCourseHours = layout.totalCourseHours ?? text.totalCourseHours;
  const hasTcc = layout.hasTcc || text.hasTcc;
  const metadata = normalizeCatalogMetadata({ courseName, durationSemesters: layout.durationSemesters ?? text.durationSemesters });
  return { ...layout, courseName, modality: layout.modality ?? text.modality, curriculumTerm: layout.curriculumTerm ?? text.curriculumTerm, hasTcc, totalInternshipHours, totalCourseHours, degree: metadata.degree, knowledgeArea: metadata.knowledgeArea, durationSemesters: metadata.durationSemesters, internshipInfo, whatsappSummary: whatsappText({ courseName, hasTcc, totalInternshipHours, totalCourseHours, internshipInfo, certain: false }) };
}

function layoutReading(layout: MatrixLayoutReading, filename: string): CommercialGradeReading {
  const courseName = layout.courseName ?? filename.replace(/\.pdf$/i, "").trim();
  const internshipInfo = layout.internships.length ? layout.internships.map((item) => `- ${item.semester}º sem.: ${item.name}${item.workload ? ` (${item.workload}h)` : ""}`).join("\n") : null;
  const metadata = normalizeCatalogMetadata({ courseName, durationSemesters: layout.durationSemesters });
  const reading = { courseName, modality: layout.modality, curriculumTerm: layout.curriculumTerm, hasTcc: layout.hasTcc, totalInternshipHours: layout.totalInternshipHours, totalCourseHours: layout.totalCourseHours, degree: metadata.degree, knowledgeArea: metadata.knowledgeArea, durationSemesters: metadata.durationSemesters, courseTracks: layout.tracks, internshipInfo };
  return { ...reading, whatsappSummary: whatsappText({ ...reading, certain: false }), source: "LOCAL" };
}

/** Maior valor aceito nas colunas inteiras (INT4 do PostgreSQL) com folga para carga horária/semestres reais. */
const MAX_REASONABLE_INT = 100_000;

/** Remove caracteres de controle (inclusive NUL, que o PostgreSQL rejeita) e espaços repetidos; vazio vira null. */
export function cleanReadingText(value: string | null | undefined, maxLength = 4_000): string | null {
  const cleaned = (value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[ \t]+\n/g, "\n").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

/** Inteiro positivo e plausível; qualquer outra coisa (NaN, decimal, estouro) vira null. */
export function safeReadingInt(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_REASONABLE_INT ? value : null;
}

function cleanDeep<T>(value: T): T {
  if (typeof value === "string") return (cleanReadingText(value) ?? "") as T;
  if (Array.isArray(value)) return value.map(cleanDeep) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cleanDeep(item)])) as T;
  if (typeof value === "number") return (safeReadingInt(value) ?? null) as T;
  return value;
}

/** Garante que nenhum valor lido do PDF (local ou IA) impeça a gravação no banco. */
export function sanitizeReading(reading: CommercialGradeReading): CommercialGradeReading {
  const clean = {
    ...reading,
    courseName: cleanReadingText(reading.courseName, 180),
    modality: cleanReadingText(reading.modality, 80),
    curriculumTerm: cleanReadingText(reading.curriculumTerm, 40),
    degree: cleanReadingText(reading.degree, 80),
    knowledgeArea: cleanReadingText(reading.knowledgeArea, 80),
    durationSemesters: safeReadingInt(reading.durationSemesters),
    totalInternshipHours: safeReadingInt(reading.totalInternshipHours),
    totalCourseHours: safeReadingInt(reading.totalCourseHours),
    internshipInfo: cleanReadingText(reading.internshipInfo),
    courseTracks: cleanDeep(reading.courseTracks),
  };
  // O resumo é remontado só com os valores já validados: um total descartado nunca pode reaparecer no texto.
  return { ...clean, whatsappSummary: whatsappText({ ...clean, certain: reading.source === "AI" }) };
}

/** `pdfFirst`: os campos lidos do layout do SIAA são exatos; a IA só preenche o que o PDF não trouxe. */
function presentReading(value: GradeReading, fallback: CommercialGradeReading, source: "AI" | "LOCAL", pdfFirst = false): CommercialGradeReading {
  const pick = <T>(pdf: T | null | undefined, ai: T | null | undefined): T | null => (pdfFirst ? (pdf ?? ai) : (ai ?? pdf)) ?? null;
  const aiInternships = value.internships.length ? value.internships.sort((a, b) => a.semester - b.semester) : parseBullets(fallback.internshipInfo);
  const internships = pdfFirst && fallback.internshipInfo ? parseBullets(fallback.internshipInfo) : aiInternships;
  const internshipInfo = internships.length ? internships.map((item) => `- ${item.semester}º sem.: ${item.name}${item.workload ? ` (${item.workload}h)` : ""}`).join("\n") : fallback.internshipInfo;
  const courseName = pick(fallback.courseName, value.courseName?.trim() || null) ?? fallback.courseName;
  const totalInternshipHours = pick(fallback.totalInternshipHours, value.totalInternshipHours);
  const totalCourseHours = pick(fallback.totalCourseHours, value.totalCourseHours);
  const metadata = normalizeCatalogMetadata({ courseName, degree: value.degree, knowledgeArea: value.knowledgeArea, durationSemesters: pick(fallback.durationSemesters, value.durationSemesters) });
  const courseTracks = pdfFirst && fallback.courseTracks.length ? fallback.courseTracks : value.tracks.map((track) => ({ ...track, internships: track.internships.sort((a, b) => a.semester - b.semester) }));
  return { courseName, modality: pick(fallback.modality, value.modality?.trim() || null), curriculumTerm: pick(fallback.curriculumTerm, value.curriculumTerm?.trim() || null), hasTcc: value.hasTcc || fallback.hasTcc, totalInternshipHours, totalCourseHours, degree: metadata.degree, knowledgeArea: metadata.knowledgeArea, durationSemesters: metadata.durationSemesters, courseTracks, internshipInfo, whatsappSummary: whatsappText({ courseName, hasTcc: value.hasTcc || fallback.hasTcc, totalInternshipHours, totalCourseHours, internshipInfo, certain: true }), source };
}

function localReading(text: string, filename: string): CommercialGradeReading {
  const courseName = text.match(/Matriz Curricular\s*-\s*\d+\s*-\s*([^\n]+)/i)?.[1]?.replace(/[-–]\s*$/g, "").trim() ?? filename.replace(/\.pdf$/i, "").trim();
  const totalInternshipHours = numberAfter(text, /Total de horas de Est[aá]gio/i, 5_000);
  const totalCourseHours = numberAfter(text, /Total em Horas Rel[oó]gio/i, 20_000);
  const hasTcc = /\bTCC\b|TRABALHO DE CURSO|TRABALHO DE CONCLUSÃO/i.test(text);
  const internshipInfo = localInternships(text);
  const metadata = normalizeCatalogMetadata({ courseName, durationSemesters: largestSemester(text) });
  return { courseName, modality: /GRADUAÇÃO\s+EAD/i.test(text) ? "EAD" : null, curriculumTerm: text.match(/(20\d{2}\s*\/\s*[12])/i)?.[1] ?? text.match(/\b(20\d{2}\.[12])\b/)?.[1] ?? null, hasTcc, totalInternshipHours, totalCourseHours, degree: metadata.degree, knowledgeArea: metadata.knowledgeArea, durationSemesters: metadata.durationSemesters, courseTracks: [], internshipInfo, whatsappSummary: whatsappText({ courseName, hasTcc, totalInternshipHours, totalCourseHours, internshipInfo, certain: false }), source: "LOCAL" };
}

function localInternships(text: string): string | null {
  const pages = text.split(/(?=\n(?:[1-9]|1\d)\tDescrição)/);
  const rows: Array<{ semester: number; name: string }> = [];
  for (const page of pages) {
    const semester = Number(page.match(/\n(\d{1,2})\tDescrição/)?.[1]);
    if (!semester) continue;
    const normalized = page.replace(/\s+/g, " ");
    const matches = normalized.matchAll(/(EST[ÁA]GIO(?:\s+CURRICULAR)?\s+SUPERVISIONADO\s+EM\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ ]+?(?:\s+[IVX]+)?)(?=PLANO DE|PR[ÁA]TICAS|AVALIAÇÃO|ATIVIDADES|\d{4,}|$)/gi);
    for (const match of matches) rows.push({ semester, name: match[1].replace(/\s+/g, " ").trim() });
  }
  const unique = rows.filter((row, index) => rows.findIndex((other) => other.semester === row.semester && other.name === row.name) === index);
  return unique.length ? unique.map((item) => `- ${item.semester}º sem.: ${titleCase(item.name)}`).join("\n") : null;
}

function parseBullets(value: string | null): Array<{ semester: number; name: string; workload: number | null }> { return (value ?? "").split("\n").flatMap((line) => { const match = line.match(/-\s*(\d+)º\s*sem\.?:\s*(.+?)(?:\s*\((\d+)h\))?$/i); return match ? [{ semester: Number(match[1]), name: match[2], workload: match[3] ? Number(match[3]) : null }] : []; }); }
/**
 * Número que vem logo depois do rótulo, em formato brasileiro (2.880 / 2880 / 2.880,00). Se o texto colado ao rótulo não for um
 * número plausível (ex.: colunas da tabela coladas), devolve null em vez de inventar um valor.
 */
function numberAfter(text: string, label: RegExp, max: number): number | null {
  const found = text.match(new RegExp(`${label.source}[\\s:.-]*((?:\\d{1,3}(?:\\.\\d{3})+|\\d+)(?:,\\d{1,2})?)(?![\\d.,])`, "i"))?.[1];
  if (!found) return null;
  const value = Math.round(Number(found.replace(/\./g, "").replace(",", ".")));
  return Number.isFinite(value) && value >= 0 && value <= max ? value : null;
}
function largestSemester(text: string): number | null { const values = [...text.matchAll(/(?:^|\n)(\d{1,2})\s*\t\s*Descrição/gm)].map((match) => Number(match[1])).filter((value) => value > 0 && value < 30); return values.length ? Math.max(...values) : null; }
function titleCase(value: string) { return value.toLocaleLowerCase("pt-BR").replace(/\b\p{L}/gu, (char) => char.toLocaleUpperCase("pt-BR")); }
/** `certain`: a IA leu o curso inteiro. Sem ela, só um total de estágio declarado como 0 no PDF permite afirmar que não há estágio. */
function whatsappText(input: { courseName: string | null; hasTcc: boolean; totalInternshipHours: number | null; totalCourseHours: number | null; internshipInfo: string | null; certain: boolean }) { const lines = [`Matriz curricular: ${input.courseName ?? "curso selecionado"}.`]; if (input.internshipInfo) { lines.push("", "Estágios previstos:", input.internshipInfo); if (input.totalInternshipHours) lines.push("", `Ao todo, a matriz prevê ${input.totalInternshipHours.toLocaleString("pt-BR")} horas de estágio durante o curso.`); } else if (input.certain || input.totalInternshipHours === 0) { lines.push("", "Uma praticidade deste curso: ele não possui estágio obrigatório, trazendo mais flexibilidade para organizar a rotina de estudos."); } if (input.hasTcc) lines.push("A matriz também prevê TCC / Trabalho de Curso."); if (input.totalCourseHours) lines.push(`Carga horária total: ${input.totalCourseHours.toLocaleString("pt-BR")} horas.`); return lines.join("\n"); }
