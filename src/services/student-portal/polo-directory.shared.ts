import type { Polo } from "@/domain/polos";

export interface DirectoryContact {
  name: string;
  phone: string | null;
  email: string | null;
}

export interface PoloDirectoryEntry {
  code: string;
  city: string;
  area: string | null;
  tutors: DirectoryContact[];
  coordination: DirectoryContact[];
}

/**
 * "Porto Velho - Centro - RO" → { city: "Porto Velho", area: "Centro" };
 * "Porto Velho (Juscelino Kubitschek) - RO" → { city: "Porto Velho", area: "Juscelino Kubitschek" }.
 */
export function splitPoloName(name: string) {
  const parts = name.split(" - ").map((part) => part.trim()).filter((part) => part && part !== "RO");
  const first = parts[0] ?? name;
  const inner = first.match(/^(.*?)\s*\((.+)\)$/);
  const city = inner ? inner[1] : first;
  const area = [inner?.[2], ...parts.slice(1)].filter(Boolean).join(" · ");
  return { city, area: area || null };
}

const clean = (value: string | null | undefined) => value?.trim() || null;

/** Monta, para cada polo, os tutores dele e a coordenação acadêmica (do polo + coordenadores gerais). */
export function buildPoloDirectory(input: {
  polos: Polo[];
  tutors: Array<{ name: string; phone: string | null; email: string; poloCode: string | null }>;
  coordinators: Array<{ name: string; phone: string | null; email: string }>;
  poloCoordination: Record<string, { nome: string; email: string; telefone: string } | undefined>;
}): PoloDirectoryEntry[] {
  return input.polos.map((polo) => {
    const own = input.poloCoordination[polo.code];
    const coordination: DirectoryContact[] = [
      ...(own?.nome.trim() ? [{ name: own.nome.trim(), phone: clean(own.telefone), email: clean(own.email) }] : []),
      ...input.coordinators.map((person) => ({ name: person.name, phone: clean(person.phone), email: clean(person.email) })),
    ];
    return {
      code: polo.code,
      ...splitPoloName(polo.name),
      tutors: input.tutors
        .filter((tutor) => tutor.poloCode === polo.code)
        .map((tutor) => ({ name: tutor.name, phone: clean(tutor.phone), email: clean(tutor.email) })),
      coordination,
    };
  });
}
