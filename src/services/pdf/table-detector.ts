import type { ParsedPage, TextLine } from "@/services/pdf/parser";

/**
 * Detector determinístico de linhas de tabela de análise curricular.
 *
 * Layout real (impressão do SIAA): cabeçalho "Código | Disciplinas | C.H. | Série | Disciplina Utilizada";
 * o nome da disciplina quebra em várias linhas visuais e os números (código, C.H., série) ficam na linha
 * central ("linha-âncora"). Este módulo reconstrói cada linha lógica a partir das posições X das colunas.
 * Ele NÃO decide nada: só reconstrói texto e coordenadas para apoiar a IA, o bbox e a validação.
 */

export interface DetectedRow {
  page: number;
  /** índice da linha lógica dentro da página (1-based) */
  rowIndex: number;
  code: string | null;
  name: string;
  workload: number | null;
  period: number | null;
  usedSubject: string | null;
  /** caixa no espaço do PDF (origem inferior esquerda) */
  bbox: { x: number; y: number; w: number; h: number };
  /** true quando a linha parece continuação da última linha da página anterior (mesmo código) */
  pageBreakDuplicate: boolean;
}

export interface DetectedTable {
  rows: DetectedRow[];
  /** cabeçalho encontrado por página (x de cada coluna) */
  headers: Record<number, ColumnLayout>;
  /** texto fora da tabela (para claims) por página */
  freeText: Record<number, string[]>;
}

export interface ColumnLayout {
  code: number | null;
  name: number;
  workload: number;
  period: number;
  used: number;
  headerY: number;
}

interface Part {
  x: number;
  w: number;
  text: string;
}

type TableColumn = "code" | "name" | "workload" | "period" | "used";
type CandidateLine = { line: TextLine; parts: Array<Part & { col: TableColumn }> };

const NORMALIZE = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function splitParts(line: TextLine): Part[] {
  return line.parts.length ? line.parts : [{ x: line.x, w: line.w, text: line.text }];
}

function detectHeader(page: ParsedPage): ColumnLayout | null {
  for (const line of page.lines) {
    const n = NORMALIZE(line.text);
    if (n.includes("disciplina") && (n.includes("c.h") || n.includes("serie") || n.includes("utilizada"))) {
      const parts = splitParts(line);
      const find = (pred: (t: string) => boolean) => parts.find((p) => pred(NORMALIZE(p.text)));
      const code = find((t) => t.startsWith("cod"));
      const name = find((t) => t.startsWith("disciplina") && !t.includes("utiliz"));
      const workload = find((t) => t.includes("c.h") || t === "ch");
      const period = find((t) => t.startsWith("serie") || t.startsWith("periodo") || t.startsWith("semestre"));
      const used = find((t) => t.includes("utiliz") || t.includes("aproveit") || t.includes("origem"));
      if (name && workload && period) {
        return {
          code: code?.x ?? null,
          name: name.x,
          workload: workload.x,
          period: period.x,
          used: used?.x ?? period.x + 60,
          headerY: line.y,
        };
      }
    }
  }
  return null;
}

/** Classifica cada parte de texto em uma coluna pelo X mais próximo dos limites entre colunas. */
function columnOf(x: number, layout: ColumnLayout): TableColumn {
  const bounds = [
    layout.code !== null ? (layout.code + layout.name) / 2 : layout.name - 1,
    (layout.name + layout.workload) / 2 + 20, // nomes longos avançam sobre a coluna C.H.; tolerância
    (layout.workload + layout.period) / 2,
    (layout.period + layout.used) / 2,
  ];
  if (layout.code !== null && x < bounds[0]) return "code";
  if (x < bounds[1] - 20) return "name";
  if (x < bounds[2]) return "workload";
  if (x < bounds[3]) return "period";
  return "used";
}

function isAnchor(parts: Array<Part & { col: TableColumn }>): boolean {
  const wl = parts.find((p) => p.col === "workload");
  const pe = parts.find((p) => p.col === "period");
  return !!wl && !!pe && /^\d{1,4}$/.test(wl.text.trim()) && /^\d{1,2}$/.test(pe.text.trim());
}

/**
 * Junta a continuação de um nome quebrado entre páginas removendo a sobreposição:
 * a impressão repete a última linha visual da célula no topo da página seguinte.
 */
export function mergeContinuation(previous: string, continuation: string): string {
  const a = previous.split(" ").filter(Boolean);
  const b = continuation.split(" ").filter(Boolean);
  let overlap = 0;
  for (let k = Math.min(a.length, b.length); k > 0; k--) {
    if (a.slice(a.length - k).join(" ") === b.slice(0, k).join(" ")) {
      overlap = k;
      break;
    }
  }
  return [...a, ...b.slice(overlap)].join(" ");
}

function isEmptyMarker(t: string): boolean {
  const n = t.trim();
  return n === "" || /^[\-–—]+$/.test(n);
}

export function detectTables(pages: ParsedPage[]): DetectedTable {
  const rows: DetectedRow[] = [];
  const headers: Record<number, ColumnLayout> = {};
  const freeText: Record<number, string[]> = {};
  let layout: ColumnLayout | null = null;
  let lastRowOfPrevPage: DetectedRow | null = null;

  for (const page of pages) {
    const header = detectHeader(page);
    if (header) {
      layout = header;
      headers[page.page] = header;
    }
    freeText[page.page] = [];
    if (!layout) {
      freeText[page.page].push(...page.lines.map((l) => l.text));
      continue;
    }
    const L: ColumnLayout = layout;
    // linhas da página abaixo do cabeçalho (se houver cabeçalho nesta página) e acima do rodapé (últimos ~30pt)
    // texto acima do cabeçalho da tabela (título, campos do documento) é texto livre
    if (header) freeText[page.page].push(...page.lines.filter((l) => l.y >= header.headerY - 2 && l.y < page.height - 24 && Math.abs(l.y - header.headerY) > 2).map((l) => l.text));
    const candidates: CandidateLine[] = page.lines
      .filter((l) => (header ? l.y < header.headerY - 2 : true) && l.y > 22 && l.y < page.height - 24)
      .map((l) => ({ line: l, parts: splitParts(l).map((p) => ({ ...p, col: columnOf(p.x, L) })) }));

    // linhas totalmente fora das colunas da tabela (ex.: "Curso: ...", observações) → texto livre
    const inTable: CandidateLine[] = candidates.filter((c) => c.parts.some((p) => p.col !== "name" || p.x >= L.name - 15));
    const outside = candidates.filter((c) => !inTable.includes(c));
    freeText[page.page].push(...outside.map((c) => c.line.text));

    // Agrupa linhas visuais em linhas lógicas pelo espaçamento vertical: dentro de uma célula o
    // espaçamento é ~1 altura de linha; entre linhas da tabela há um salto maior.
    const sorted = [...inTable].sort((a, b) => b.line.y - a.line.y);
    const heights = sorted.map((c) => c.line.h).sort((a, b) => a - b);
    const medianH = heights[Math.floor(heights.length / 2)] ?? 10;
    const gapThreshold = Math.max(18, medianH * 1.8);
    const clusters: CandidateLine[][] = [];
    for (const c of sorted) {
      const cur = clusters[clusters.length - 1];
      if (cur && cur[cur.length - 1].line.y - c.line.y <= gapThreshold) cur.push(c);
      else clusters.push([c]);
    }

    let rowIndex = 0;
    let isFirstCluster = true;
    for (const cluster of clusters) {
      const anchorsIn = cluster.filter((c) => isAnchor(c.parts));
      const pick = (group: CandidateLine[], col: TableColumn): string =>
        group
          .flatMap((g) => g.parts.filter((p) => p.col === col).map((p) => p.text.trim()))
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

      if (anchorsIn.length === 0) {
        const text = pick(cluster, "name");
        // continuação (sem números) no topo da página = resto do nome da última linha da página anterior
        if (isFirstCluster && lastRowOfPrevPage && text && cluster.every((c) => c.parts.every((p) => p.col === "name" || p.col === "used"))) {
          lastRowOfPrevPage.name = mergeContinuation(lastRowOfPrevPage.name, text);
          const usedTail = pick(cluster, "used");
          if (usedTail && !isEmptyMarker(usedTail)) lastRowOfPrevPage.usedSubject = `${lastRowOfPrevPage.usedSubject ?? ""} ${usedTail}`.trim();
        } else {
          freeText[page.page].push(...cluster.map((c) => c.line.text));
        }
        isFirstCluster = false;
        continue;
      }

      // Se um cluster tiver mais de uma âncora (linhas muito próximas), divide nos pontos médios entre âncoras.
      const subgroups: Array<{ anchor: CandidateLine; lines: CandidateLine[] }> = anchorsIn.map((a) => ({ anchor: a, lines: [] }));
      for (const c of cluster) {
        let best = 0;
        let bestD = Infinity;
        anchorsIn.forEach((a, i) => {
          const d = Math.abs(a.line.y - c.line.y);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        });
        subgroups[best].lines.push(c);
      }

      for (const { anchor, lines: group } of subgroups) {
        const codeText = pick(group, "code");
        const workloadText = anchor.parts.find((p) => p.col === "workload")?.text.trim() ?? "";
        const periodText = anchor.parts.find((p) => p.col === "period")?.text.trim() ?? "";
        const usedText = pick(group, "used");
        const ys = group.map((g) => g.line.y);
        const hs = group.map((g) => g.line.h);
        const minY = Math.min(...ys) - 2;
        const maxY = Math.max(...ys.map((y, k) => y + hs[k])) + 2;
        const minX = Math.min(...group.map((g) => g.line.x));
        const maxX = Math.max(...group.map((g) => g.line.x + g.line.w));
        rowIndex++;
        const row: DetectedRow = {
          page: page.page,
          rowIndex,
          code: /^\d+$/.test(codeText) ? codeText : null,
          name: pick(group, "name"),
          workload: /^\d+$/.test(workloadText) ? Number(workloadText) : null,
          period: /^\d+$/.test(periodText) ? Number(periodText) : null,
          usedSubject: isEmptyMarker(usedText) ? null : usedText,
          bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
          pageBreakDuplicate: false,
        };
        // Repetição da última linha da página anterior (artefato de impressão): mesmo código e série.
        if (isFirstCluster && lastRowOfPrevPage && row.code && row.code === lastRowOfPrevPage.code && row.period === lastRowOfPrevPage.period) {
          row.pageBreakDuplicate = true;
          lastRowOfPrevPage.name = mergeContinuation(lastRowOfPrevPage.name, row.name);
          if (!lastRowOfPrevPage.usedSubject && row.usedSubject) lastRowOfPrevPage.usedSubject = row.usedSubject;
        }
        rows.push(row);
      }
      isFirstCluster = false;
    }
    lastRowOfPrevPage = rows[rows.length - 1] ?? null;
  }
  return { rows, headers, freeText };
}

/** Linhas lógicas sem os artefatos de quebra de página. */
export function effectiveRows(table: DetectedTable): DetectedRow[] {
  return table.rows.filter((r) => !r.pageBreakDuplicate);
}

/** Texto compacto para enviar à IA como apoio: uma linha lógica por linha de texto. */
export function tableToText(table: DetectedTable): string {
  const out: string[] = [];
  let currentPage = 0;
  for (const r of table.rows) {
    if (r.page !== currentPage) {
      currentPage = r.page;
      out.push(`=== PÁGINA ${r.page} ===`);
    }
    out.push(
      `[p${r.page} l${r.rowIndex}]${r.pageBreakDuplicate ? " [REPETIÇÃO DA LINHA ANTERIOR — QUEBRA DE PÁGINA]" : ""} código=${r.code ?? "?"} | ${r.name} | C.H.=${r.workload ?? "?"} | série=${r.period ?? "?"} | utilizada=${r.usedSubject ?? "-"}`,
    );
  }
  return out.join("\n");
}
