/** Sugere a matriz oficial a partir de "Grade: 20221/2023-2" e do nome do curso do documento. */
export function suggestMatrix(
  matrices: Array<{ id: string; label: string; course: string; year: number; version: string }>,
  doc: { courseName: string | null; matrixLabel: string | null },
): string | null {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const label = doc.matrixLabel ? norm(doc.matrixLabel) : "";
  const course = doc.courseName ? norm(doc.courseName) : "";
  const scored = matrices.map((m) => {
    let score = 0;
    const ml = norm(m.label);
    if (label && (ml === label || ml.includes(label) || label.includes(ml))) score += 3;
    if (label && (label.includes(String(m.year)) || label.includes(norm(m.version)))) score += 1;
    if (course && norm(m.course).split(" ")[0] && course.includes(norm(m.course).split(" ")[0]!)) score += 2;
    return { id: m.id, score };
  });
  const best = scored.sort((a, b) => b.score - a.score)[0];
  return best && best.score >= 2 ? best.id : null;
}
