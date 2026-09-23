import "server-only";

import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { parsePdf } from "@/services/pdf/parser";
import { getOpenAIClient } from "@/services/openai/client-factory";
import { logger } from "@/lib/logger";
import { normalizeCatalogMetadata, type CommercialTrack } from "@/services/commercial-grades/course-metadata";

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

/** Lê o PDF pela IA; se houver indisponibilidade, preserva informações seguras encontradas no texto local. */
export async function readCommercialGrade(bytes: Buffer, filename: string): Promise<CommercialGradeReading> {
  const local = await parsePdf(bytes, { maxPages: 80 });
  const fallback = localReading(local.textByPage.join("\n"), filename);
  try {
    const { client, config } = await getOpenAIClient({ timeoutMs: 90_000, maxRetries: 1 });
    const response = await client.responses.parse({
      model: config.extractionModel,
      instructions: INSTRUCTIONS,
      input: [{ role: "user", content: [
        { type: "input_text", text: "Leia a matriz curricular anexada. Use o texto extraído abaixo como apoio para localizar totais e semestres.\n\n" + local.textByPage.join("\n\n") },
        { type: "input_file", filename, file_data: `data:application/pdf;base64,${bytes.toString("base64")}` },
      ] }],
      text: { format: zodTextFormat(gradeReadingSchema, "commercial_grade_reading") },
      max_output_tokens: 2_500,
    });
    const parsed = response.output_parsed ? gradeReadingSchema.parse(response.output_parsed) : null;
    if (!parsed) return fallback;
    return presentReading(parsed, fallback, "AI");
  } catch (error) {
    logger.warn("commercial_grade.ai_read_failed", { filename, error: String(error) });
    return fallback;
  }
}

function presentReading(value: GradeReading, fallback: CommercialGradeReading, source: "AI" | "LOCAL"): CommercialGradeReading {
  const internships = value.internships.length ? value.internships.sort((a, b) => a.semester - b.semester) : parseBullets(fallback.internshipInfo);
  const internshipInfo = internships.length ? internships.map((item) => `- ${item.semester}º sem.: ${item.name}${item.workload ? ` (${item.workload}h)` : ""}`).join("\n") : fallback.internshipInfo;
  const courseName = value.courseName?.trim() || fallback.courseName;
  const totalInternshipHours = value.totalInternshipHours ?? fallback.totalInternshipHours;
  const totalCourseHours = value.totalCourseHours ?? fallback.totalCourseHours;
  const metadata = normalizeCatalogMetadata({ courseName, degree: value.degree, knowledgeArea: value.knowledgeArea, durationSemesters: value.durationSemesters });
  const courseTracks = value.tracks.map((track) => ({ ...track, internships: track.internships.sort((a, b) => a.semester - b.semester) }));
  return { courseName, modality: value.modality?.trim() || fallback.modality, curriculumTerm: value.curriculumTerm?.trim() || fallback.curriculumTerm, hasTcc: value.hasTcc || fallback.hasTcc, totalInternshipHours, totalCourseHours, degree: metadata.degree, knowledgeArea: metadata.knowledgeArea, durationSemesters: metadata.durationSemesters, courseTracks, internshipInfo, whatsappSummary: whatsappText({ courseName, hasTcc: value.hasTcc || fallback.hasTcc, totalInternshipHours, totalCourseHours, internshipInfo }), source };
}

function localReading(text: string, filename: string): CommercialGradeReading {
  const courseName = text.match(/Matriz Curricular\s*-\s*\d+\s*-\s*([^\n]+)/i)?.[1]?.replace(/[-–]\s*$/g, "").trim() ?? filename.replace(/\.pdf$/i, "").trim();
  const totalInternshipHours = numberAfter(text, /Total de horas de Est[aá]gio\s*([\d.,]+)/i);
  const totalCourseHours = numberAfter(text, /Total em Horas Rel[oó]gio\s*([\d.,]+)/i);
  const hasTcc = /\bTCC\b|TRABALHO DE CURSO|TRABALHO DE CONCLUSÃO/i.test(text);
  const internshipInfo = localInternships(text);
  const metadata = normalizeCatalogMetadata({ courseName, durationSemesters: largestSemester(text) });
  return { courseName, modality: /GRADUAÇÃO\s+EAD/i.test(text) ? "EAD" : null, curriculumTerm: text.match(/(20\d{2}\s*\/\s*[12])/i)?.[1] ?? null, hasTcc, totalInternshipHours, totalCourseHours, degree: metadata.degree, knowledgeArea: metadata.knowledgeArea, durationSemesters: metadata.durationSemesters, courseTracks: [], internshipInfo, whatsappSummary: whatsappText({ courseName, hasTcc, totalInternshipHours, totalCourseHours, internshipInfo }), source: "LOCAL" };
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
function numberAfter(text: string, pattern: RegExp): number | null { const raw = text.match(pattern)?.[1]; if (!raw) return null; const value = Number(raw.replace(/\./g, "").replace(",", ".")); return Number.isFinite(value) ? Math.round(value) : null; }
function largestSemester(text: string): number | null { const values = [...text.matchAll(/(?:^|\n)(\d{1,2})\s*\t\s*Descrição/gm)].map((match) => Number(match[1])).filter((value) => value > 0 && value < 30); return values.length ? Math.max(...values) : null; }
function titleCase(value: string) { return value.toLocaleLowerCase("pt-BR").replace(/\b\p{L}/gu, (char) => char.toLocaleUpperCase("pt-BR")); }
function whatsappText(input: { courseName: string | null; hasTcc: boolean; totalInternshipHours: number | null; totalCourseHours: number | null; internshipInfo: string | null }) { const lines = [`Matriz curricular: ${input.courseName ?? "curso selecionado"}.`]; if (input.internshipInfo) { lines.push("", "Estágios previstos:", input.internshipInfo); if (input.totalInternshipHours) lines.push("", `Ao todo, a matriz prevê ${input.totalInternshipHours.toLocaleString("pt-BR")} horas de estágio durante o curso.`); } else { lines.push("", "Uma praticidade deste curso: ele não possui estágio obrigatório, trazendo mais flexibilidade para organizar a rotina de estudos."); } if (input.hasTcc) lines.push("A matriz também prevê TCC / Trabalho de Curso."); if (input.totalCourseHours) lines.push(`Carga horária total: ${input.totalCourseHours.toLocaleString("pt-BR")} horas.`); return lines.join("\n"); }
