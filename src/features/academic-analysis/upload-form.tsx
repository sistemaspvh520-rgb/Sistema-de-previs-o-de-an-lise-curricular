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

  function choose(candidate?: File) {
    if (!candidate) return;
    if (candidate.type !== "application/pdf" && !candidate.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Selecione um documento PDF.");
      return;
    }
    if (candidate.size > maxMb * 1024 * 1024) {
      toast.error(`O arquivo excede ${maxMb} MB.`);
      return;
    }
    setFile(candidate);
  }

  async function submit() {
    if (!file || sending) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/academic-analysis/upload", { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.id) {
        toast.error(body.error ?? "Não foi possível analisar o documento.");
        return;
      }
      if (body.warnings?.length) toast.warning("Análise criada com dados que precisam de conferência.");
      else toast.success("Extrato analisado.");
      router.push(`/academic-analysis/${body.id}`);
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
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && inputRef.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files?.[0]); }}
        className={cn("flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center shadow-inner transition duration-200 sm:min-h-64 sm:p-10", dragging ? "scale-[1.01] border-brand-cyan bg-gradient-to-br from-brand-cyan-50 to-white" : "border-slate-300 bg-gradient-to-br from-white via-slate-50 to-cyan-50/70 hover:border-brand-cyan/70 hover:from-white hover:to-cyan-50")}
      >
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => choose(event.target.files?.[0])} />
        <span className="rounded-lg border bg-brand-navy-50 px-3 py-1 text-xs font-bold tracking-[0.16em] text-brand-navy">PDF</span>
        <strong className="mt-3 max-w-full break-all text-base">{file?.name ?? "Envie o extrato ou a grade curricular"}</strong>
        <span aria-live="polite" className="mt-1 text-sm text-muted-foreground">{sending ? "PDF recebido · extraindo e analisando as páginas…" : file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · clique para trocar` : `Arraste o PDF para cá ou selecione um arquivo · até ${maxMb} MB`}</span>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-xs leading-5 text-slate-600">PDF do extrato do SIAA · até {maxMb} MB</p>
        <Button onClick={submit} disabled={!file || sending} className="w-full sm:w-auto">
          {sending ? "Lendo documento…" : "Analisar extrato"}
        </Button>
      </div>
    </div>
  );
}
