import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { logger } from "@/lib/logger";
import { detectTables, type DetectedTable } from "@/services/pdf/table-detector";

export interface TextPart {
  x: number;
  w: number;
  text: string;
}

export interface TextLine {
  /** Coordenadas no espaço do PDF (origem no canto inferior esquerdo), em pontos. */
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  /** Fragmentos com posição X real (usados pelo detector de tabela). */
  parts: TextPart[];
}

export interface ParsedPage {
  page: number;
  width: number;
  height: number;
  lines: TextLine[];
}

export interface LocalExtraction {
  pageCount: number;
  pages: ParsedPage[];
  /** Texto corrido por página (linhas separadas por \n). */
  textByPage: string[];
  parserVersion: string;
  /** Tabela reconstruída deterministicamente (ver table-detector.ts). */
  table?: DetectedTable;
  /** Campos "Chave: valor" encontrados fora da tabela (ex.: Curso, Série, Grade). */
  headerFields?: Record<string, string>;
}

export const PARSER_VERSION = "pdfjs-table-1.1";

const Y_TOLERANCE = 3.5;

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsPromise: Promise<PdfJs> | null = null;

/** Diretório real do pacote pdfjs-dist (funciona local e em serverless, onde caminhos relativos ao módulo falham). */
function pdfjsDir(): string {
  const req = createRequire(import.meta.url);
  return path.dirname(req.resolve("pdfjs-dist/package.json"));
}

async function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((mod) => {
    // Node: o pdf.js carrega um "fake worker" por import() dinâmico; caminho absoluto garante que exista no bundle.
    const workerPath = path.join(pdfjsDir(), "legacy", "build", "pdf.worker.mjs");
    mod.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
    return mod;
  });
  return pdfjsPromise;
}

function fontOptions() {
  const dir = pdfjsDir();
  return {
    standardFontDataUrl: pathToFileURL(path.join(dir, "standard_fonts") + path.sep).href,
    cMapUrl: pathToFileURL(path.join(dir, "cmaps") + path.sep).href,
    cMapPacked: true,
  };
}

interface RawItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}

function groupIntoLines(items: RawItem[]): TextLine[] {
  const positioned = items
    .filter((i) => i.str && i.str.trim().length > 0)
    .map((i) => ({
      x: i.transform[4],
      y: i.transform[5],
      w: i.width,
      h: i.height || Math.abs(i.transform[3]) || 10,
      text: i.str,
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: Array<{ x: number; y: number; w: number; h: number; parts: Array<{ x: number; w: number; text: string }> }> = [];
  for (const it of positioned) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= Y_TOLERANCE);
    if (line) {
      line.parts.push({ x: it.x, w: it.w, text: it.text });
      line.x = Math.min(line.x, it.x);
      line.w = Math.max(line.x + line.w, it.x + it.w) - line.x;
      line.h = Math.max(line.h, it.h);
    } else {
      lines.push({ x: it.x, y: it.y, w: it.w, h: it.h, parts: [{ x: it.x, w: it.w, text: it.text }] });
    }
  }

  return lines
    .sort((a, b) => b.y - a.y)
    .map((l) => {
      const parts = l.parts.sort((a, b) => a.x - b.x);
      let text = "";
      let cursor: number | null = null;
      for (const p of parts) {
        if (cursor !== null) {
          const gap = p.x - cursor;
          // gap grande = célula/coluna diferente → separador de tabulação
          text += gap > 12 ? "\t" : gap > 1.5 ? " " : "";
        }
        text += p.text;
        cursor = p.x + p.w;
      }
      // funde fragmentos contíguos (mesma célula) em uma única parte
      const merged: TextPart[] = [];
      for (const p of parts) {
        const last = merged[merged.length - 1];
        if (last && p.x - (last.x + last.w) <= 12) {
          const gap = p.x - (last.x + last.w);
          last.text += (gap > 1.5 ? " " : "") + p.text;
          last.w = p.x + p.w - last.x;
        } else {
          merged.push({ x: p.x, w: p.w, text: p.text });
        }
      }
      return { x: l.x, y: l.y, w: l.w, h: l.h, text: text.replace(/[ \t]+$/g, ""), parts: merged.map((m) => ({ ...m, text: m.text.trim() })).filter((m) => m.text) };
    });
}

/** Extrai texto com posições de todas as páginas usando pdf.js (sem canvas). */
export async function parsePdf(bytes: Buffer, opts?: { maxPages?: number }): Promise<LocalExtraction> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
    ...fontOptions(),
  });
  const doc = await task.promise;

  try {
    const pageCount = doc.numPages;
    const limit = opts?.maxPages ? Math.min(pageCount, opts.maxPages) : pageCount;
    const pages: ParsedPage[] = [];
    const textByPage: string[] = [];
    for (let p = 1; p <= limit; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const lines = groupIntoLines(content.items as unknown as RawItem[]);
      pages.push({ page: p, width: viewport.width, height: viewport.height, lines });
      textByPage.push(lines.map((l) => l.text).join("\n"));
      page.cleanup();
    }
    const table = detectTables(pages);
    const headerFields = extractHeaderFields(Object.values(table.freeText).flat());
    return { pageCount, pages, textByPage, parserVersion: PARSER_VERSION, table, headerFields };
  } finally {
    await task.destroy().catch((e: unknown) => logger.debug("pdf.destroy", { err: String(e) }));
  }
}

/** Extrai pares "Chave: valor" de linhas de texto livre (cabeçalho do documento). */
export function extractHeaderFields(lines: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  // "Chave: valor" — várias chaves podem dividir a mesma linha ("Curso: X   Matriz: Y   RGM: Z")
  const re = /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ./ ]{0,30}?):\s*(.+?)(?=\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ./]{2,30}:\s|\t|$)/g;
  for (const raw of lines) {
    for (const piece of raw.split("\t")) {
      for (const m of piece.matchAll(re)) {
        const key = m[1]
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim()
          .toLowerCase();
        const value = m[2].trim();
        if (key && value && !(key in out)) out[key] = value;
      }
    }
  }
  return out;
}

/** Apenas a contagem de páginas (rápido, usado na validação do upload). */
export async function countPdfPages(bytes: Buffer): Promise<number> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0, ...fontOptions() });
  const doc = await task.promise;
  try {
    return doc.numPages;
  } finally {
    await task.destroy().catch(() => undefined);
  }
}
