"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileSearch, FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sendCommercialGradePdf } from "@/features/commercial-grades/upload-client";

export function CommercialGradeUploadForm({ maxMb }: { maxMb: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);

  function choose(candidate?: File) {
    if (!candidate || sending) return;
    if (candidate.type !== "application/pdf" && !candidate.name.toLowerCase().endsWith(".pdf")) return void toast.error("Selecione a matriz curricular em PDF.");
    if (candidate.size > maxMb * 1024 * 1024) return void toast.error(`O PDF excede ${maxMb} MB.`);
    setFile(candidate);
  }

  function clear() {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function submit() {
    if (!file || sending) return;
    setSending(true);
    const result = await sendCommercialGradePdf("/api/commercial-grades/upload", file);
    setSending(false);
    if (!result.ok) return void toast.error(result.error);
    (result.warning ? toast.warning : toast.success)(result.message, { duration: 12_000 });
    clear();
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-brand-cyan-200 bg-brand-cyan-50/50 p-4">
        <div className="flex gap-3">
          <span className="rounded-lg bg-brand-navy p-2 text-white"><FileSearch className="size-5" /></span>
          <div>
            <p className="font-medium text-brand-navy">Leitura automática do PDF</p>
            <p className="mt-1 text-sm text-muted-foreground">A IA lê a matriz (com a IA ligada nas configurações) e o sistema confere com as colunas do PDF: curso, grau, área, duração, estágios obrigatórios (com as horas), TCC e carga horária. Se discordarem, vale o PDF e o aviso mostra o que conferir.</p>
          </div>
        </div>
      </div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Selecionar ou arrastar a matriz curricular em PDF"
        aria-busy={sending}
        aria-disabled={sending}
        onClick={() => { if (!sending) inputRef.current?.click(); }}
        onKeyDown={(event) => { if (!sending && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(event) => { event.preventDefault(); if (!sending) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); if (event.dataTransfer.files.length !== 1) toast.error("Envie apenas 1 PDF."); else choose(event.dataTransfer.files[0]); }}
        className={cn("flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-card px-6 py-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2", dragging ? "border-brand-cyan-600 bg-brand-cyan-50/40" : "border-brand-cyan-300 hover:border-brand-cyan-600 hover:bg-brand-cyan-50/40")}
      >
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => { if (event.target.files?.length !== 1) toast.error("Envie apenas 1 PDF."); else choose(event.target.files[0]); }} />
        <span className="rounded-full bg-brand-cyan-50 p-3 text-brand-cyan-700"><FileUp className="size-6" /></span>
        <strong className="mt-3 max-w-full break-all font-medium">{file?.name ?? "Selecione ou arraste a matriz curricular em PDF"}</strong>
        <span aria-live="polite" className="mt-1 text-sm text-muted-foreground">
          {sending ? "Arquivo recebido · lendo a grade, isso pode levar alguns instantes…" : file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · clique para trocar` : `PDF de até ${maxMb} MB`}
        </span>
        {file && !sending && <span className="mt-3 inline-flex items-center gap-1 text-sm text-status-success"><CheckCircle2 className="size-4" /> Arquivo pronto para leitura</span>}
        {sending && <div className="mt-4 h-2 w-full max-w-sm overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Leitura da grade em andamento"><div className="h-full w-2/5 rounded-full bg-gradient-to-r from-[#003B71] to-[#0693E3] motion-safe:animate-pulse" /></div>}
      </div>
      <div className="flex justify-end gap-2">
        {file && <Button type="button" variant="ghost" disabled={sending} onClick={clear}>Remover arquivo</Button>}
        <Button type="button" onClick={submit} disabled={!file || sending}>
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} {sending ? "Lendo a grade..." : "Ler e disponibilizar grade"}
        </Button>
      </div>
    </div>
  );
}
