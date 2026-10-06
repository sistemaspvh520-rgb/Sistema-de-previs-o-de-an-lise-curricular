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

  it("classifica grau e área dos cursos do catálogo da UniCSul", () => {
    const meta = (courseName: string) => normalizeCatalogMetadata({ courseName });
    expect(meta("ADMINISTRAÇÃO (BACH P/ EGRESSO CONTAB GESTAO GTI SEG TR)")).toMatchObject({ degree: "Bacharelado", knowledgeArea: "Gestão e negócios" });
    expect(meta("CIÊNCIAS BIOLÓGICAS (LICENCIADOS EM FÍSICA E QUÍMICA)")).toMatchObject({ degree: "Licenciatura", knowledgeArea: "Ciências da natureza" });
    expect(meta("CIÊNCIAS SOCIAIS (LICENCIADOS EM GEO, FILOS E HIST)")).toMatchObject({ degree: "Licenciatura", knowledgeArea: "Humanas e sociais" });
    expect(meta("AGRONOMIA (BACHARELADO)")).toMatchObject({ degree: "Bacharelado", knowledgeArea: "Ciências agrárias" });
    expect(meta("ARQUITETURA E URBANISMO (BACHARELADO)")).toMatchObject({ knowledgeArea: "Engenharia e arquitetura" });
    expect(meta("ARTES VISUAIS (LICENCIATURA)")).toMatchObject({ degree: "Licenciatura", knowledgeArea: "Artes e comunicação" });
    expect(meta("CST EM CRIMINOLOGIA")).toMatchObject({ degree: "Tecnólogo", knowledgeArea: "Direito e segurança" });
    expect(meta("CST EM COMPUTAÇÃO EM NUVEM")).toMatchObject({ knowledgeArea: "Tecnologia" });
    expect(meta("CST EM CIBERSEGURANÇA")).toMatchObject({ knowledgeArea: "Tecnologia" });
    expect(meta("CST EM COMÉRCIO EXTERIOR")).toMatchObject({ knowledgeArea: "Gestão e negócios" });
    expect(meta("CIÊNCIAS ECONÔMICAS (P/ EGRESSO ADMINISTRACAO)")).toMatchObject({ knowledgeArea: "Gestão e negócios" });
    expect(meta("BIOMEDICINA (BACHARELADO)")).toMatchObject({ knowledgeArea: "Saúde" });
    expect(meta("CIÊNCIAS ECONÔMICAS (P EGRESSO ADMINISTRACAO)").degree).toBe("Bacharelado");
    expect(meta("CIÊNCIAS CONTÁBEIS (PARA BACH ADM, ECON, ATUARIAIS").degree).toBe("Bacharelado");
  });

  it("oferece metadados úteis para filtrar matrizes legadas", () => {
    expect(normalizeCatalogMetadata({ courseName: "EDUCAÇÃO FÍSICA (ÁREA BÁSICA DE INGRESSO)" })).toMatchObject({ degree: "Área básica de ingresso", knowledgeArea: "Saúde" });
  });
});
