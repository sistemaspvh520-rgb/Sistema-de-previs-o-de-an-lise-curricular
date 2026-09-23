import { describe, expect, it } from "vitest";
import { normalizeCatalogMetadata, parseCourseTracks } from "@/services/commercial-grades/course-metadata";

describe("metadados de grades comerciais", () => {
  it("separa os estágios de Bacharelado e Licenciatura sem inventar o semestre da escolha", () => {
    const tracks = parseCourseTracks(null, [
      "- 6º sem.: ESTÁGIO CURRICULAR EM EDUCAÇÃO FÍSICA I (BACHAREL) (320h)",
      "- 6º sem.: ESTÁGIO CURRICULAR EM EDUCAÇÃO FÍSICA I (LICENCIATURA) (320h)",
    ].join("\n"));

    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toMatchObject({ name: "Bacharelado", decisionSemester: null, internships: [{ semester: 6, workload: 320 }] });
    expect(tracks[1]).toMatchObject({ name: "Licenciatura", decisionSemester: null, internships: [{ semester: 6, workload: 320 }] });
  });

  it("oferece metadados úteis para filtrar matrizes legadas", () => {
    expect(normalizeCatalogMetadata({ courseName: "EDUCAÇÃO FÍSICA (ÁREA BÁSICA DE INGRESSO)" })).toMatchObject({ degree: "Área básica de ingresso", knowledgeArea: "Saúde" });
  });
});
