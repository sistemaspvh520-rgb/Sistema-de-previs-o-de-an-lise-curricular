"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function UploadReanalysisDialog({ analysisId }: { analysisId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  async function submit() {
    if (!file) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/analyses/${analysisId}/reanalysis`, { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.id) {
        toast.error(body.error ?? "Não foi possível enviar o PDF atualizado.");
        return;
      }
      toast.success("Nova solicitação criada. O PDF está sendo processado.");
      setOpen(false);
      router.push(`/analyses/${body.id}`);
    } catch {
      toast.error("Falha de rede durante o envio.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="animate-in fade-in slide-in-from-bottom-1 duration-500"><RefreshCw className="size-4" /> Enviar PDF atualizado</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova solicitação com PDF atualizado</DialogTitle>
          <DialogDescription>
            O documento atual será preservado no histórico. Esta ação cria uma nova análise vinculada a ele e lê novamente o período de ingresso do PDF.
          </DialogDescription>
        </DialogHeader>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <button type="button" onClick={() => inputRef.current?.click()} className="flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/30 px-4 text-center transition-colors hover:border-brand-cyan hover:bg-brand-cyan-50">
          <FileUp className="size-6 text-brand-cyan-700" />
          <span className="font-medium">{file ? file.name : "Selecionar PDF atualizado"}</span>
          <span className="text-xs text-muted-foreground">Somente PDF</span>
        </button>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>Cancelar</Button>
          <Button onClick={submit} disabled={!file || sending}>{sending && <Loader2 className="size-4 animate-spin" />} Criar nova solicitação</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
