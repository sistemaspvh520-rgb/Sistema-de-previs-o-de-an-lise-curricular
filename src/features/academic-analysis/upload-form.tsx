"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AcademicGridUploadForm({ maxMb }: { maxMb: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  function choose(candidate?: File) {
    if (!candidate || sending) return;
    if (candidate.type !== "application/pdf" && !candidate.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Selecione um documento PDF.");
      return;
    }
    if (candidate.size > maxMb * 1024 * 1024) {
      toast.error(`O arquivo excede ${maxMb} MB.`);
      return;
    }
    setFile(candidate);
    setConfirmed(false);
  }

  async function submit() {
    if (!file || sending) return;
    if (!confirmed) {
      toast.error("Confirme que o documento está atualizado antes de iniciar a análise.");
      return;
    }
    setSending(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("confirmUpdatedTranscript", "true");
      const response = await fetch("/api/academic-analysis/upload", { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.enrollmentId) {
        toast.error(body.error ?? "Não foi possível analisar o documento.");
        return;
      }
      toast.success(body.message ?? "Extrato recebido.");
      router.push(body.status === "COMPLETED" && body.id ? `/academic-analysis/${body.id}` : `/academic-analysis/students/${body.enrollmentId}#atualizar`);
    } catch {
      toast.error("Falha de rede durante a análise.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        aria-label="Selecionar ou arrastar extrato acadêmico em PDF"
        aria-busy={sending}
        aria-disabled={sending}
        onClick={() => { if (!sending) inputRef.current?.click(); }}
        onKeyDown={(event) => {
          if (!sending && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => { event.preventDefault(); if (!sending) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); if (event.dataTransfer.files.length !== 1) toast.error("Envie apenas 1 arquivo PDF."); else choose(event.dataTransfer.files[0]); }}
        className={cn("flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center shadow-inner transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 motion-reduce:transition-none sm:min-h-64 sm:p-10", dragging ? "scale-[1.01] border-brand-cyan bg-gradient-to-br from-brand-cyan-50 to-white" : "border-slate-300 bg-gradient-to-br from-white via-slate-50 to-cyan-50/70 hover:border-brand-cyan/70 hover:from-white hover:to-cyan-50")}
      >
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => { if (event.target.files?.length !== 1) toast.error("Envie apenas 1 arquivo PDF."); else choose(event.target.files[0]); }} />
        <span className="rounded-lg border bg-brand-navy-50 px-3 py-1 text-xs font-bold tracking-[0.16em] text-brand-navy">PDF</span>
        <strong className="mt-3 max-w-full break-all text-base">{file?.name ?? "Envie 1 documento acadêmico"}</strong>
        <span aria-live="polite" className="mt-1 text-sm text-muted-foreground">{sending ? "PDF recebido · extraindo e analisando as páginas…" : file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · clique para trocar` : `Arraste o PDF para cá ou selecione um arquivo · até ${maxMb} MB`}</span>
        {sending && <div className="mt-5 w-full max-w-sm text-left" role="status" aria-live="polite" aria-label="Análise do PDF em andamento">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600"><span>Leitura do extrato</span><span>Processando páginas</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Processamento do PDF em andamento"><div className="h-full w-2/5 rounded-full bg-gradient-to-r from-[#003B71] to-[#0693E3] motion-safe:animate-pulse" /></div>
          <p className="mt-2 text-center text-xs text-slate-500">Isso pode levar alguns instantes. Após o envio, o processamento continua mesmo que você saia.</p>
        </div>}
      </div>
      {file && <Button variant="ghost" disabled={sending} onClick={() => { setFile(null); setConfirmed(false); if (inputRef.current) inputRef.current.value = ""; }}>Remover arquivo</Button>}
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-sky-200 bg-sky-50/80 p-4 text-sm leading-5 text-slate-700">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={!file || sending}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[#003B71]"
        />
        <span>
          <span className="font-semibold text-slate-900">Confirmação necessária</span>
          <span className="mt-1 block">Confirmo que este é o documento acadêmico atualizado, com identificação do aluno, curso e histórico completo, e autorizo iniciar a análise curricular. Se o período atual não estiver legível, vou informá-lo na conferência.</span>
        </span>
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-xs leading-5 text-slate-600">Envie apenas 1 PDF: Histórico Oficial, Histórico Simples para Conferência ou Extrato/Grade Curricular · até {maxMb} MB.</p>
        <Button onClick={submit} disabled={!file || !confirmed || sending} className="w-full sm:w-auto">
          {sending ? "Lendo documento…" : "Analisar documento"}
        </Button>
      </div>
    </div>
  );
}
