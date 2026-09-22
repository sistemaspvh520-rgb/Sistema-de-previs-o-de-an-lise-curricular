/** Polos de atendimento (Cruzeiro do Sul Virtual — Rondônia). Código = identificador oficial da planilha da equipe. */
export interface Polo {
  code: string;
  name: string;
}

export const POLOS: readonly Polo[] = [
  { code: "1893", name: "Buritis - Setor 02 - RO" },
  { code: "1959", name: "Cerejeiras - Jardim Liberdade - RO" },
  { code: "2027", name: "Alto Alegre dos Parecis - Centro - RO" },
  { code: "2042", name: "Mirante da Serra - Centro - RO" },
  { code: "2085", name: "Porto Velho - Centro - RO" },
  { code: "8251", name: "Chupinguaia - Centro - RO" },
  { code: "8311", name: "Vilhena - Centro (S-01) - RO" },
  { code: "8809", name: "Porto Velho (Juscelino Kubitschek) - RO" },
];

export function findPolo(code: string | null | undefined): Polo | null {
  if (!code) return null;
  return POLOS.find((p) => p.code === code) ?? null;
}

export function isPoloCode(code: string): boolean {
  return findPolo(code) !== null;
}

/** "2085 · Porto Velho - Centro - RO" */
export function formatPolo(code: string | null | undefined, name?: string | null): string {
  if (!code) return "—";
  return `${code} · ${name ?? findPolo(code)?.name ?? "Polo não cadastrado"}`;
}
