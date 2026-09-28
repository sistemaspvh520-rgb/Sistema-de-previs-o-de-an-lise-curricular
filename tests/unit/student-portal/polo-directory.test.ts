import { describe, expect, it } from "vitest";
import { buildPoloDirectory, splitPoloName } from "@/services/student-portal/polo-directory.shared";

describe("splitPoloName", () => {
  it("separa cidade e bairro e descarta a UF", () => {
    expect(splitPoloName("Porto Velho - Centro - RO")).toEqual({ city: "Porto Velho", area: "Centro" });
    expect(splitPoloName("Porto Velho (Juscelino Kubitschek) - RO")).toEqual({ city: "Porto Velho", area: "Juscelino Kubitschek" });
  });
});

describe("buildPoloDirectory", () => {
  const polos = [
    { code: "2085", name: "Porto Velho - Centro - RO" },
    { code: "1959", name: "Cerejeiras - Jardim Liberdade - RO" },
  ];

  it("agrupa tutores por polo e junta a coordenação do polo com os coordenadores gerais", () => {
    const directory = buildPoloDirectory({
      polos,
      tutors: [
        { name: "Ana", phone: "69999990000", email: "ana@x.br", poloCode: "2085" },
        { name: "Sem polo", phone: null, email: "s@x.br", poloCode: null },
      ],
      coordinators: [{ name: "Laura", phone: null, email: "laura@x.br" }],
      poloCoordination: { "2085": { nome: "Carla", email: "", telefone: "69 3333-0000" } },
    });
    expect(directory[0]).toMatchObject({
      code: "2085",
      city: "Porto Velho",
      tutors: [{ name: "Ana", phone: "69999990000", email: "ana@x.br" }],
      coordination: [
        { name: "Carla", phone: "69 3333-0000", email: null },
        { name: "Laura", phone: null, email: "laura@x.br" },
      ],
    });
    expect(directory[1].tutors).toEqual([]);
    expect(directory[1].coordination).toEqual([{ name: "Laura", phone: null, email: "laura@x.br" }]);
  });

  it("ignora coordenação do polo sem nome", () => {
    const [entry] = buildPoloDirectory({ polos, tutors: [], coordinators: [], poloCoordination: { "2085": { nome: " ", email: "a@b", telefone: "" } } });
    expect(entry.coordination).toEqual([]);
  });
});
