const LOWER_WORDS = new Set(["a", "à", "ao", "aos", "as", "às", "o", "os", "e", "de", "da", "das", "do", "dos", "em", "na", "nas", "no", "nos", "para", "por", "com", "sem"]);
const ROMAN = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)$/;
const ACRONYMS = new Set(["ti", "ead", "ux", "ui", "rh", "sql", "api", "ia", "tcc", "libras"]);

/**
 * Nome de disciplina para leitura: "GESTÃO DA TECNOLOGIA DA INFORMAÇÃO I" → "Gestão da Tecnologia
 * da Informação I". Só converte textos inteiramente em maiúsculas; o resto fica como veio.
 */
export function readableName(value: string): string {
  const text = value.trim().replace(/\s+/g, " ");
  if (!text || text !== text.toLocaleUpperCase("pt-BR")) return text;
  return text
    .split(" ")
    .map((word, index) => {
      const lower = word.toLocaleLowerCase("pt-BR");
      const bare = lower.replace(/[^\p{L}]/gu, "");
      if (ROMAN.test(bare) || ACRONYMS.has(bare)) return word;
      if (index > 0 && LOWER_WORDS.has(lower)) return lower;
      return lower.replace(/\p{L}/u, (char) => char.toLocaleUpperCase("pt-BR"));
    })
    .join(" ");
}

/** Nome curto para espaços apertados: "João Vitor Cardoso Cabral" → "João Cabral". */
export function shortPersonName(value: string): string {
  const words = readableName(value).split(" ").filter(Boolean);
  if (words.length <= 2) return words.join(" ");
  return `${words[0]} ${words[words.length - 1]}`;
}
