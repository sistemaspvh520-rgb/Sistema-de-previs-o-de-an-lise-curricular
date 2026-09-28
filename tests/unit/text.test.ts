import { describe, expect, it } from "vitest";
import { readableName, shortPersonName } from "@/lib/text";

describe("readableName", () => {
  it("converte nomes em maiúsculas para leitura", () => {
    expect(readableName("GESTÃO DA TECNOLOGIA DA INFORMAÇÃO II")).toBe("Gestão da Tecnologia da Informação II");
    expect(readableName("ATIVIDADES DE EXTENSÃO: INTEGRAÇÃO DE COMPETÊNCIAS PARA TRANSFORMAR O EU")).toBe("Atividades de Extensão: Integração de Competências para Transformar o Eu");
    expect(readableName("LÍNGUA BRASILEIRA DE SINAIS - LIBRAS")).toBe("Língua Brasileira de Sinais - LIBRAS");
  });
  it("mantém nomes que já têm maiúsculas e minúsculas", () => {
    expect(readableName("Banco de Dados")).toBe("Banco de Dados");
  });
});

describe("shortPersonName", () => {
  it("usa o primeiro e o último nome", () => {
    expect(shortPersonName("João Vitor Cardoso Cabral")).toBe("João Cabral");
    expect(shortPersonName("ESTHER SULAMITA BATISTA")).toBe("Esther Batista");
    expect(shortPersonName("Ana Souza")).toBe("Ana Souza");
  });
});
