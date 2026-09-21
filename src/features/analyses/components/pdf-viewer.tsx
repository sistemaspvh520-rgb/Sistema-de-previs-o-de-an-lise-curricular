"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export interface HighlightBox {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  pageWidth: number;
  pageHeight: number;
}

export function PdfViewer({ url, page, onPageChange, highlight }: { url: string; page: number; onPageChange: (p: number) => void; highlight: HighlightBox | null }) {
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [width, setWidth] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Observa o contêiner externo (sem barra de rolagem) para evitar loop de redimensionamento.
    const ro = new ResizeObserver(([entry]) => {
      // Enquanto o Suspense oculta a árvore (display:none) a largura é 0: ignorar para não entrar em loop.
      if (entry.contentRect.width < 50) return;
      const next = Math.max(280, Math.floor(entry.contentRect.width) - 40);
      setWidth((prev) => (Math.abs(prev - next) < 8 ? prev : next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Baixa o PDF via fetch (cookies de sessão) e trata 401/410 com mensagem amigável, sem exceções não capturadas.
  // O PDF vira uma URL de blob estável: passar bytes diretamente faz o pdf.js transferir (e invalidar)
  // o buffer, o que dispara recargas em loop no react-pdf.
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let created: string | null = null;
    fetch(url, { credentials: "same-origin", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Não foi possível carregar o PDF (${res.status}).`);
        }
        return res.arrayBuffer();
      })
      .then((buf) => {
        if (!alive) return;
        created = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
        setError(null);
        setBlobUrl(created);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url]);
  const file = useMemo(() => (blobUrl ? { url: blobUrl } : null), [blobUrl]);
  const hl = highlight && highlight.page === page ? highlight : null;

  return (
    <div ref={containerRef} className="flex h-full flex-col rounded-xl border bg-muted/40">
      <div className="flex items-center justify-between gap-2 border-b bg-card px-3 py-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1} aria-label="Página anterior"><ChevronLeft className="size-4" /></Button>
          <span className="min-w-[90px] text-center text-sm">Página {page}{numPages ? ` / ${numPages}` : ""}</span>
          <Button variant="ghost" size="icon" onClick={() => onPageChange(Math.min(numPages || page, page + 1))} disabled={numPages > 0 && page >= numPages} aria-label="Próxima página"><ChevronRight className="size-4" /></Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setScale((s) => Math.max(0.5, s - 0.1))} aria-label="Reduzir"><ZoomOut className="size-4" /></Button>
          <span className="w-12 text-center text-xs text-muted-foreground">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="icon" onClick={() => setScale((s) => Math.min(2.5, s + 0.1))} aria-label="Ampliar"><ZoomIn className="size-4" /></Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-scroll overflow-x-auto p-3">
        {error ? (
          <div className="p-6 text-center text-sm text-status-danger">{error}</div>
        ) : !file ? (
          <div className="flex justify-center p-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <Document
            file={file}
            suspense={false}
            onLoadSuccess={(d) => setNumPages(d.numPages)}
            onLoadError={() => setError("Não foi possível carregar o PDF.")}
            loading={<div className="flex justify-center p-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>}
          >
            <div className="relative mx-auto w-fit shadow-md">
              <Page pageNumber={page} width={width * scale} renderTextLayer renderAnnotationLayer={false} />
              {hl && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute rounded-sm bg-brand-cyan/25 ring-2 ring-brand-cyan transition-all"
                  style={{
                    left: `${(hl.x / hl.pageWidth) * 100}%`,
                    width: `${Math.min(100, (hl.w / hl.pageWidth) * 100 + 1)}%`,
                    top: `${((hl.pageHeight - hl.y - hl.h) / hl.pageHeight) * 100}%`,
                    height: `${((hl.h + 4) / hl.pageHeight) * 100}%`,
                  }}
                />
              )}
            </div>
          </Document>
        )}
      </div>
    </div>
  );
}
