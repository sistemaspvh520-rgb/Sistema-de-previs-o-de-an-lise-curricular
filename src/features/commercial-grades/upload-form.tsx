"use client";

import { useRef, useState, useTransition } from "react";
import { Bot, CheckCircle2, FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadCommercialGradeAction } from "@/features/commercial-grades/actions";

export function CommercialGradeUploadForm() {
  const ref = useRef<HTMLFormElement>(null); const [pending, start] = useTransition(); const [filename, setFilename] = useState<string | null>(null);
  function submit(data: FormData) { start(async () => { const result = await uploadCommercialGradeAction(data); if (result.ok) { toast.success(result.message); ref.current?.reset(); setFilename(null); } else toast.error(result.error); }); }
  return <form ref={ref} action={submit} className="space-y-4"><div className="rounded-xl border border-brand-cyan-200 bg-brand-cyan-50/50 p-4"><div className="flex gap-3"><span className="rounded-lg bg-brand-navy p-2 text-white"><Bot className="size-5" /></span><div><p className="font-medium text-brand-navy">Leitura automática da grade</p><p className="mt-1 text-sm text-muted-foreground">A IA identifica curso, estágios obrigatórios, TCC, carga horária e prepara a mensagem comercial.</p></div></div></div><label className="group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-brand-cyan-300 bg-card px-6 py-8 text-center transition-colors hover:border-brand-cyan-600 hover:bg-brand-cyan-50/40"><input className="sr-only" id="file" name="file" type="file" accept="application/pdf" required onChange={(event) => setFilename(event.target.files?.[0]?.name ?? null)} /><span className="rounded-full bg-brand-cyan-50 p-3 text-brand-cyan-700"><FileUp className="size-6" /></span><span className="mt-3 font-medium">{filename ?? "Selecione a matriz curricular em PDF"}</span><span className="mt-1 text-sm text-muted-foreground">PDF de até 20 MB</span>{filename && <span className="mt-3 inline-flex items-center gap-1 text-sm text-status-success"><CheckCircle2 className="size-4" /> Arquivo pronto para leitura</span>}</label><div className="flex justify-end"><Button type="submit" disabled={pending || !filename}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} {pending ? "Lendo grade com IA..." : "Ler e disponibilizar grade"}</Button></div></form>;
}
