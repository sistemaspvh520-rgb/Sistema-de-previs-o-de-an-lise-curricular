import { describe, expect, it } from "vitest";
import type { ParsedPage, TextLine } from "@/services/pdf/parser";
import { parseMatrixNumber, readMatrixLayout } from "@/services/commercial-grades/matrix-layout";

/** Linha já endireitada pelo parser (coordenadas como na matriz do SIAA em paisagem). */
function line(y: number, parts: Array<[number, string]>): TextLine {
  const withWidth = parts.map(([x, text]) => ({ x, w: text.length * 4.5, text }));
  return { x: withWidth[0].x, y, w: 700, h: 8, text: withWidth.map((part) => part.text).join("\t"), parts: withWidth };
}
const page = (number: number, lines: TextLine[]): ParsedPage => ({ page: number, width: 745, height: 595, lines });
const header = (y: number) => [
  line(y, [[6, "Cod. Disc."], [288, "Hora Aula"], [368, "Qtde. Aula"], [486, "C.H. Rel."], [700, "Tipo Prova"]]),
  line(y - 4, [[43, "Descrição"], [260, "Grp"], [327, "H. Relogio"], [414, "Teoria"], [451, "Prática"], [528, "Prática % EAD Tipo de Disciplina"], [673, "Falta"]]),
];
const row = (y: number, code: string, name: string | null, workload: string, type: string) =>
  line(y, [[13, code], ...(name ? [[48, name] as [number, string]] : []), [265, "-"], [303, "0"], [339, workload], [384, "4"], [569, "100"], [615, type], [674, "Não"]]);

const nutrition = [
  page(1, [
    line(579, [[5, "GRADUAÇÃO EAD (UCS/UNC/UNF)"], [665, "02/07/2025"]]),
    line(559, [[254, "Matriz Curricular - 91 - NUTRIÇÃO (BACHARELADO) (4.0)"]]),
    line(548, [[321, "Prazo Min. 8 - Prazo Max. 16"]]),
    line(519, [[5, "Série: 1"], [79, "Seq.: 20252"], [149, "Descrição"], [200, "Grade:"]]),
    ...header(499),
    row(473, "886", "LÍNGUA BRASILEIRA DE SINAIS", "40", "Facultativa"),
    line(430, [[48, "PLANO DE ACOMPANHAMENTO DE"]]),
    row(426, "14025", null, "10", "Especial EAD"),
    line(420, [[48, "CARREIRA I"]]),
    line(358, [[5, "Total:"], [303, "0"], [339, "340"]]),
  ]),
  page(3, [
    line(421, [[5, "Série: 8"], [79, "Seq.: 20252"], [149, "Descrição"], [200, "Grade:"]]),
    ...header(401),
    line(377, [[48, "ESTÁGIO CURRICULAR SUPERVISIONADO"]]),
    row(373, "12999", null, "214", "Estágio"),
    line(367, [[48, "EM NUTRIÇÃO CLÍNICA"]]),
    line(357, [[48, "TRABALHO DE CONCLUSÃO DE CURSO EM"]]),
    row(353, "14265", null, "40", "TCC"),
    line(347, [[48, "NUTRIÇÃO: PRODUÇÃO"]]),
    line(304, [[5, "Total:"], [303, "0"], [339, "254"]]),
    line(289, [[5, "Total em Hora Relógio:"], [340, "254"]]),
  ]),
  page(4, [
    line(579, [[9, "Resumo da Matriz Curricular do Curso"]]),
    line(546, [[21, "Disciplinas do curso"], [279, "-"], [360, "-"], [434, "1610"], [517, "380"]]),
    line(534, [[21, "Estágio Curricular Supervisionado"], [279, "-"], [360, "-"], [441, "-"], [517, "640"]]),
    line(522, [[21, "Trabalho de Conclusão de Curso"], [279, "-"], [360, "-"], [441, "-"], [519, "80"]]),
    line(438, [[21, "Total em Horas Relógio"], [393, "3200"]]),
  ]),
];

describe("leitura do layout da Matriz Curricular do SIAA", () => {
  it("lê curso, modalidade, vigência, duração, estágios com horas, TCC e totais do resumo", () => {
    const reading = readMatrixLayout(nutrition);
    expect(reading).toMatchObject({
      courseName: "NUTRIÇÃO (BACHARELADO)",
      modality: "EAD",
      curriculumTerm: "2025.2",
      durationSemesters: 8,
      totalInternshipHours: 640,
      totalCourseHours: 3200,
      hasTcc: true,
      componentCount: 4,
      tracks: [],
    });
    expect(reading?.internships).toEqual([{ semester: 8, name: "ESTÁGIO CURRICULAR SUPERVISIONADO EM NUTRIÇÃO CLÍNICA", workload: 214 }]);
  });

  it("não confunde o nome 'ESTÁGIO CURRICULAR SUPERVISIONADO' (coluna da descrição) com o rótulo do resumo", () => {
    const withoutSummary = nutrition.slice(0, 2);
    const reading = readMatrixLayout(withoutSummary);
    expect(reading?.totalCourseHours).toBeNull();
    // Sem resumo, o total de estágio vem da soma das disciplinas de estágio.
    expect(reading?.totalInternshipHours).toBe(214);
  });

  it("aceita o resumo antigo ('Total de horas de Estágio', '3.240,00') e estágio zerado", () => {
    const pages = [
      page(1, [line(559, [[257, "Matriz Curricular - 489 - CST EM GESTÃO"]]), line(519, [[5, "Série: 1"], [79, "Seq.: 20222"]]), ...header(499), row(470, "100", "GESTÃO DE PESSOAS", "80", "Normal")]),
      page(2, [
        line(540, [[20, "Total de horas de Estágio"], [513, "-"]]),
        line(444, [[20, "Total em Horas Relógio"], [454, "3.240,00"]]),
      ]),
    ];
    expect(readMatrixLayout(pages)).toMatchObject({ curriculumTerm: "2022.2", totalInternshipHours: 0, totalCourseHours: 3240, durationSemesters: 1, internships: [] });
  });

  it("separa as trilhas de Bacharelado e Licenciatura da área básica de ingresso", () => {
    const pages = [page(1, [
      line(559, [[216, "Matriz Curricular - 332 - EDUCAÇÃO FÍSICA (ÁREA BÁSICA DE INGRESSO)"]]),
      line(519, [[5, "Série: 6"], [79, "Seq.: 20252"], [198, "2025/2 -"]]),
      ...header(499),
      line(475, [[48, "ESTÁGIO CURRICULAR SUPERVISIONADO"]]),
      row(471, "14313", null, "320", "Estágio"),
      line(465, [[48, "EM EDUCAÇÃO FÍSICA I (BACHAREL)"]]),
      line(445, [[48, "ESTÁGIO CURRICULAR SUPERVISIONADO"]]),
      row(441, "14324", null, "320", "Estágio"),
      line(435, [[48, "EM EDUCAÇÃO FÍSICA I (LICENCIATURA)"]]),
    ])];
    const reading = readMatrixLayout(pages);
    expect(reading?.tracks.map((track) => [track.name, track.internships])).toEqual([
      ["Bacharelado", [{ semester: 6, name: "ESTÁGIO CURRICULAR SUPERVISIONADO EM EDUCAÇÃO FÍSICA I", workload: 320 }]],
      ["Licenciatura", [{ semester: 6, name: "ESTÁGIO CURRICULAR SUPERVISIONADO EM EDUCAÇÃO FÍSICA I", workload: 320 }]],
    ]);
    expect(reading?.tracks[0].decisionSemester).toBeNull();
  });

  it("ignora PDFs que não seguem o layout (sem título nem séries)", () => {
    expect(readMatrixLayout(undefined)).toBeNull();
    expect(readMatrixLayout([page(1, [line(500, [[10, "Declaração de matrícula"]])])])).toBeNull();
  });

  it("lê números no formato brasileiro", () => {
    expect(parseMatrixNumber("3.240,00")).toBe(3240);
    expect(parseMatrixNumber("16,5")).toBe(16.5);
    expect(parseMatrixNumber("1280")).toBe(1280);
    expect(parseMatrixNumber("-")).toBeNull();
  });
});
