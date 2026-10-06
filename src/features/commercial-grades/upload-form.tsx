"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, CircleDashed, FileSearch, FileUp, Loader2, RefreshCw, Upload, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sendCommercialGradePdf } from "@/features/commercial-grades/upload-client";

type ItemStatus = "pending" | "sending" | "created" | "updated" | "unchanged" | "error";
interface QueueItem {
  id: number;
  file: File;
  status: ItemStatus;
  message?: string;
  /** Algo para o time conferir (divergência da IA, dado faltando). */
  warning?: boolean;
}

const STATUS_LABEL: Record<ItemStatus, string> = {
  pending: "Aguardando",
  sending: "Lendo…",
  created: "Criada",
  updated: "Atualizada",
  unchanged: "Sem mudança",
  error: "Erro",
};

let nextId = 1;

export function CommercialGradeUploadForm({ maxMb }: { maxMb: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);
  // Ligado: a IA lê e confere cada grade (gasta a API). Desligado: só o PDF é lido, sem custo.
  const [useAi, setUseAi] = useState(true);
  const pending = items.filter((item) => item.status === "pending" || item.status === "error");

  function add(candidates: FileList | File[] | null | undefined) {
    if (!candidates || sending) return;
    const accepted: QueueItem[] = [];
    let rejected = 0;
    for (const file of Array.from(candidates)) {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf || file.size > maxMb * 1024 * 1024) {
        rejected += 1;
        continue;
      }
      accepted.push({ id: nextId++, file, status: "pending" });
    }
    if (rejected) toast.error(`${rejected} ${rejected === 1 ? "arquivo ignorado" : "arquivos ignorados"}: só PDFs de até ${maxMb} MB.`);
    // Repetir o mesmo arquivo (nome e tamanho) não duplica a fila.
    setItems((current) => [...current, ...accepted.filter((item) => !current.some((other) => other.file.name === item.file.name && other.file.size === item.file.size))]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function clear() {
    setItems([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  const patch = (id: number, changes: Partial<QueueItem>) => setItems((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)));

  async function submit() {
    if (!pending.length || sending) return;
    setSending(true);
    const counts = { created: 0, updated: 0, unchanged: 0, error: 0 };
    // Um PDF por vez: a leitura pela IA de cada grade é independente e o servidor limita o tempo de cada envio.
    for (const item of pending) {
      patch(item.id, { status: "sending", message: undefined });
      const result = await sendCommercialGradePdf("/api/commercial-grades/upload", item.file, { upsert: true, useAi });
      if (!result.ok) {
        counts.error += 1;
        patch(item.id, { status: "error", message: result.error });
        continue;
      }
      const status = result.action ?? "created";
      counts[status] += 1;
      patch(item.id, { status, message: result.message, warning: result.warning });
    }
    setSending(false);
    router.refresh();
    const done = counts.created + counts.updated + counts.unchanged;
    const summary = [counts.created && `${counts.created} ${counts.created === 1 ? "criada" : "criadas"}`, counts.updated && `${counts.updated} ${counts.updated === 1 ? "atualizada" : "atualizadas"}`, counts.unchanged && `${counts.unchanged} sem mudança`, counts.error && `${counts.error} com erro`].filter(Boolean).join(" · ");
    (counts.error ? toast.warning : toast.success)(`${done} de ${done + counts.error} grades prontas: ${summary}.`, { duration: 12_000 });
  }

  const finished = items.length - pending.length - items.filter((item) => item.status === "sending").length;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-brand-cyan-200 bg-brand-cyan-50/50 p-4">
        <div className="flex gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center self-start rounded-lg bg-brand-navy text-white"><FileSearch className="size-5" /></span>
          <div>
            <p className="font-medium text-brand-navy">Leitura automática do PDF</p>
            <p className="mt-1 text-sm text-muted-foreground">A IA lê a matriz (com a IA ligada nas configurações) e o sistema confere com as colunas do PDF: curso, grau, área, duração, estágios obrigatórios (com as horas), TCC e carga horária. Se discordarem, vale o PDF e o aviso mostra o que conferir. Você pode enviar vários PDFs de uma vez: as grades que já existem são atualizadas e as demais são criadas.</p>
          </div>
        </div>
      </div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Selecionar ou arrastar as matrizes curriculares em PDF"
        aria-busy={sending}
        aria-disabled={sending}
        onClick={() => { if (!sending) inputRef.current?.click(); }}
        onKeyDown={(event) => { if (!sending && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(event) => { event.preventDefault(); if (!sending) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); add(event.dataTransfer.files); }}
        className={cn("flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-card px-6 py-7 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2", dragging ? "border-brand-cyan-600 bg-brand-cyan-50/40" : "border-brand-cyan-300 hover:border-brand-cyan-600 hover:bg-brand-cyan-50/30", sending && "cursor-wait opacity-70")}
      >
        <input ref={inputRef} type="file" multiple accept="application/pdf,.pdf" className="hidden" onChange={(event) => add(event.target.files)} />
        <span className="rounded-full bg-brand-cyan-50 p-3 text-brand-cyan-700"><FileUp className="size-6" /></span>
        <strong className="mt-3 font-medium">{items.length ? "Adicionar mais PDFs" : "Selecione ou arraste as matrizes curriculares em PDF"}</strong>
        <span className="mt-1 text-sm text-muted-foreground">Um ou vários arquivos · cada PDF de até {maxMb} MB</span>
      </div>

      {items.length > 0 && (
        <section aria-label="Fila de envio" className="rounded-xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 text-sm">
            <span className="font-medium text-slate-900">{items.length} {items.length === 1 ? "PDF" : "PDFs"} na fila{sending || finished > 0 ? ` · ${finished} de ${items.length} concluídos` : ""}</span>
            {sending && <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Lendo cada grade, isso pode levar alguns minutos…</span>}
          </div>
          {sending && (
            <div className="h-1 bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={finished} aria-label="Progresso do envio">
              <div className="h-full bg-gradient-to-r from-[#003B71] to-[#0693E3] transition-all" style={{ width: `${(finished / items.length) * 100}%` }} />
            </div>
          )}
          <ul className="max-h-80 divide-y overflow-y-auto">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                <StatusIcon status={item.status} warning={item.warning} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-900" title={item.file.name}>{item.file.name.replace(/\.pdf$/i, "")}</div>
                  <div className={cn("text-xs", item.status === "error" ? "text-status-danger" : item.warning ? "text-status-warning" : "text-muted-foreground")}>
                    <span className="font-medium">{STATUS_LABEL[item.status]}</span>{item.message ? ` · ${item.message}` : ` · ${(item.file.size / 1024).toFixed(0)} KB`}
                  </div>
                </div>
                {!sending && (item.status === "pending" || item.status === "error") && (
                  <button type="button" aria-label={`Remover ${item.file.name}`} onClick={() => setItems((current) => current.filter((other) => other.id !== item.id))} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="size-4" /></button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors", useAi ? "bg-card" : "border-status-success/40 bg-status-success-bg/50", sending && "pointer-events-none opacity-70")}>
        <input type="checkbox" className="mt-0.5 size-4 accent-[#003B71]" checked={!useAi} disabled={sending} onChange={(event) => setUseAi(!event.target.checked)} />
        <span>
          <span className="font-medium text-slate-900">Ler só pelo PDF, sem usar a IA</span>
          <span className="block text-xs text-muted-foreground">Não consome a API da OpenAI. As matrizes do SIAA são lidas direto das colunas do PDF; use &ldquo;Reler com IA&rdquo; depois, se quiser a conferência da IA.</span>
        </span>
      </label>
      <div className="flex justify-end gap-2">
        {items.length > 0 && <Button type="button" variant="ghost" disabled={sending} onClick={clear}>Limpar lista</Button>}
        <Button type="button" onClick={submit} disabled={!pending.length || sending}>
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} {sending ? "Lendo as grades..." : pending.length > 1 ? `Ler e disponibilizar ${pending.length} grades` : "Ler e disponibilizar grade"}
        </Button>
      </div>
    </div>
  );
}

function StatusIcon({ status, warning }: { status: ItemStatus; warning?: boolean }) {
  const cls = "mt-0.5 size-4 shrink-0";
  if (status === "sending") return <Loader2 className={cn(cls, "animate-spin text-brand-cyan-700")} aria-hidden="true" />;
  if (status === "error") return <XCircle className={cn(cls, "text-status-danger")} aria-hidden="true" />;
  if (status === "pending") return <CircleDashed className={cn(cls, "text-slate-400")} aria-hidden="true" />;
  if (warning) return <AlertTriangle className={cn(cls, "text-status-warning")} aria-hidden="true" />;
  if (status === "updated") return <RefreshCw className={cn(cls, "text-status-success")} aria-hidden="true" />;
  return <CheckCircle2 className={cn(cls, status === "unchanged" ? "text-slate-400" : "text-status-success")} aria-hidden="true" />;
}
