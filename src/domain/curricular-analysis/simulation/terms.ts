/** Termos letivos no formato "YYYY.S" (S = 1 ou 2). */
export interface Term {
  year: number;
  semester: 1 | 2;
}

export function parseTerm(term: string): Term {
  const m = /^(\d{4})\.([12])$/.exec(term.trim());
  if (!m) throw new Error(`Termo letivo inválido: "${term}". Use o formato YYYY.1 ou YYYY.2.`);
  return { year: Number(m[1]), semester: Number(m[2]) as 1 | 2 };
}

export function formatTerm(t: Term): string {
  return `${t.year}.${t.semester}`;
}

export function nextTerm(t: Term): Term {
  return t.semester === 1 ? { year: t.year, semester: 2 } : { year: t.year + 1, semester: 1 };
}

/** Sequência de n termos a partir de start (inclusive). */
export function termSequence(start: string, n: number): string[] {
  const out: string[] = [];
  let t = parseTerm(start);
  for (let i = 0; i < n; i++) {
    out.push(formatTerm(t));
    t = nextTerm(t);
  }
  return out;
}

/** Próximo semestre letivo a partir de uma data (padrão sugerido para startTerm). */
export function suggestStartTerm(now = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  // Jan–Jun: ainda cabe ingressar em X.2; Jul–Dez: próximo é (X+1).1
  return month <= 6 ? `${year}.2` : `${year + 1}.1`;
}

export function isValidTerm(term: string): boolean {
  return /^\d{4}\.[12]$/.test(term.trim());
}
