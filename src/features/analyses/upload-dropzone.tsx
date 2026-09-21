"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, FileUp, FileText, Loader2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TermSelect } from "@/components/shared/term-select";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function UploadDropzone({ maxMb, defaultStartTerm }: { maxMb: number; defaultStartTerm: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [entryTerm, setEntryTerm] = useState(defaultStartTerm);
  const [entryPeriod, setEntryPeriod] = useState("");
  const entryReady = Boolean(entryPeriod) && /^\d{4}\.[12]$/.test(entryTerm);

  const pick = useCallback(
    (f: File | undefined) => {
      if (!f) return;
      if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
        toast.error("Selecione um arquivo PDF.");
        return;
      }
      if (f.size > maxMb * 1024 * 1024) {
        toast.error(`O arquivo excede ${maxMb} MB.`);
        return;
      }
      setFile(f);
    },
    [maxMb],
  );

  function submit() {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("entryTerm", entryTerm);
    fd.append("entryPeriod", entryPeriod);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/analyses/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setUploading(false);
      try {
        const body = JSON.parse(xhr.responseText || "{}");
        if (xhr.status === 201 && body.id) {
          toast.success("Arquivo recebido. Processamento iniciado.");
          router.push(`/analyses/${body.id}`);
        } else {
          toast.error(body.error ?? "Falha no envio.");
        }
      } catch {
        toast.error("Resposta inválida do servidor.");
      }
    };
    xhr.onerror = () => {
      setUploading(false);
      toast.error("Falha de rede durante o envio.");
    };
    xhr.send(fd);
  }

  return (
    <div className="space-y-6">
      <div
        role="button"
        tabIndex={0}
        aria-label="Área para envio do PDF"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-card p-10 text-center transition-all",
          dragging ? "border-brand-cyan bg-brand-cyan-50 scale-[1.01]" : "border-border hover:border-brand-cyan/60 hover:bg-muted/40",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        {file ? (
          <div className="flex flex-col items-center gap-3">
            <div className="flex size-14 items-center justify-center rounded-xl bg-brand-navy-50 text-brand-navy">
              <FileText className="size-7" />
            </div>
            <div>
              <div className="font-medium">{file.name}</div>
              <div className="text-sm text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setFile(null);
              }}
            >
              <X className="size-4" /> Trocar arquivo
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="flex size-14 items-center justify-center rounded-xl bg-brand-cyan-50 text-brand-cyan-700">
              <UploadCloud className="size-7" />
            </div>
            <div className="text-lg font-semibold tracking-tight">ARRASTE O PDF AQUI</div>
            <div className="text-sm text-muted-foreground">ou</div>
            <Button type="button" variant="outline">
              <FileUp className="size-4" /> Selecionar PDF
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">Somente PDF · até {maxMb} MB</p>
          </div>
        )}
      </div>

      <section className="rounded-xl border bg-brand-navy-50/45 p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-brand-navy">Antes de iniciar, informe o ingresso</h2>
            <p className="text-sm text-muted-foreground">São dois dados obrigatórios para entregar a previsão completa, sem etapas pendentes.</p>
          </div>
          {entryReady && <span className="inline-flex items-center gap-1.5 text-sm font-medium text-status-success"><CircleCheck className="size-4" /> Dados prontos</span>}
        </div>
        <div className="grid gap-4 md:grid-cols-2 md:items-end">
          <div className="space-y-2">
            <Label htmlFor="entryPeriod">Período de ingresso <span className="text-status-danger">*</span></Label>
            <Select value={entryPeriod} onValueChange={setEntryPeriod}>
              <SelectTrigger id="entryPeriod" className={!entryPeriod ? "border-status-warning/50" : undefined}><SelectValue placeholder="Selecionar" /></SelectTrigger>
            <SelectContent>{Array.from({ length: 20 }, (_, i) => i + 1).map((period) => <SelectItem key={period} value={String(period)}>{period}º período</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Em qual período o candidato começa a grade.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="entryTerm">Semestre de ingresso <span className="text-status-danger">*</span></Label>
            <TermSelect id="entryTerm" value={entryTerm} onChange={setEntryTerm} />
            <p className="text-xs text-muted-foreground">Também define o primeiro semestre da previsão.</p>
          </div>
          <div className="flex md:col-span-2 md:justify-end">
            <Button size="lg" onClick={submit} disabled={!file || !entryReady || uploading}>
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
              {uploading ? `Enviando ${progress}%` : "Gerar análise"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
