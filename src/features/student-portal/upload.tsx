"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function StudentUpload({
  enrollmentId,
  maxMb,
  support = false,
  initialProcessing = false,
}: {
  enrollmentId: string;
  maxMb: number;
  support?: boolean;
  initialProcessing?: boolean;
}) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [processing, setProcessing] = useState(initialProcessing);
  const [stage, setStage] = useState("Conferindo documento");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [open, setOpen] = useState(false);
  const inFlight = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selection = useRef(0);
  const [duplicate, setDuplicate] = useState(false);
  const [dragging, setDragging] = useState(false);
  async function choose(files: FileList | null) {
    if (processing || sending) return;
    if (!files || files.length !== 1) {
      toast.error("Envie apenas 1 arquivo PDF.");
      return;
    }
    const candidate = files[0];
    if (
      !/\.pdf$/i.test(candidate.name) ||
      candidate.size > maxMb * 1024 * 1024
    ) {
      toast.error(`Selecione um PDF de até ${maxMb} MB.`);
      return;
    }
    const selected = ++selection.current;
    setFile(candidate);
    setConfirmed(false);
    setDuplicate(false);
    setMessage("");
    try {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await candidate.arrayBuffer(),
      );
      const hash = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const response = await fetch(
        `/api/portal/document-check?${new URLSearchParams({ enrollmentId, hash })}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (selected !== selection.current) return;
      if (result.duplicate) {
        setDuplicate(true);
        setMessage(
          "Este documento já foi analisado anteriormente. Sua análise atual continua disponível.",
        );
      }
      if (result.rejected) {
        setMessage(
          "Este documento foi recusado. Selecione um novo PDF válido.",
        );
        setFile(null);
      }
    } catch {
      /* Server repeats the authoritative check on submission. */
    }
  }
  const selectedJob = useRef<string | null>(null);
  useEffect(() => {
    if (!processing) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const query = new URLSearchParams({
          enrollmentId,
          ...(selectedJob.current ? { jobId: selectedJob.current } : {}),
        });
        const response = await fetch(`/api/portal/status?${query}`, {
          cache: "no-store",
        });
        if (stopped) return;
        if (!response.ok) {
          setProcessing(false);
          setMessage(
            "Sua sessão expirou ou o acesso foi bloqueado. Entre novamente.",
          );
          return;
        }
        const data = await response.json();
        if (stopped) return;
        if (data.status === "COMPLETED" || data.status === "FAILED") {
          setProcessing(false);
          setFailed(data.status === "FAILED");
          inFlight.current = false;
          setMessage(
            data.status === "FAILED"
              ? data.error
              : data.reused
                ? "Nenhuma alteração acadêmica foi identificada. Exibindo seu resultado atual."
                : "Sua análise foi atualizada. Veja o resultado e acompanhe a solicitação abaixo.",
          );
          router.refresh();
          return;
        }
        setStage(data.stage ?? "Conferindo documento");
      } catch {
        /* Preserve state; the persistent job continues after disconnection. */
      }
      if (!stopped) timer = setTimeout(poll, 2000);
    }
    timer = setTimeout(poll, 1000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [processing, enrollmentId, router]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !confirmed || duplicate || inFlight.current) return;
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`O limite é ${maxMb} MB.`);
      return;
    }
    inFlight.current = true;
    setMessage("");
    setFailed(false);
    setSending(true);
    selectedJob.current = null;
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("enrollmentId", enrollmentId);
      form.set("confirmUpdatedTranscript", "true");
      const response = await fetch("/api/portal/upload", {
        method: "POST",
        body: form,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Não foi possível enviar o documento.");
      selectedJob.current = body.jobId;
      if (body.status !== "COMPLETED") setProcessing(true);
      if (body.status === "COMPLETED") {
        setProcessing(false);
        setMessage(body.message);
        router.refresh();
      }
      setOpen(false);
    } catch (error) {
      setProcessing(false);
      setMessage(
        error instanceof Error
          ? error.message
          : "Falha ao enviar. Tente novamente.",
      );
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }
  return (
    <section
      className="rounded-2xl border border-brand-cyan/20 bg-white p-5 shadow-[0_16px_40px_-36px_rgba(6,147,227,0.45)] sm:p-6"
      id="atualizar-analise"
      aria-labelledby="update-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="update-title" className="font-semibold text-[#003B71]">
            Atualizar minha análise
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            Envie um documento acadêmico atualizado para verificarmos se houve
            mudanças na sua situação.
          </p>
        </div>
        <Button
          className="min-h-11 w-full bg-brand-cyan text-white hover:bg-brand-cyan/90 sm:w-auto"
          onClick={() => setOpen(!open)}
          disabled={processing || sending}
        >
          <UploadCloud className="size-4" />
          {support ? "Atualizar análise" : "Atualizar minha análise"}
        </Button>
      </div>
      {(processing || sending) && (
        <div
          role="status"
          className="mt-5 flex items-center gap-3 rounded-xl bg-brand-cyan-50 p-4 text-sm text-[#003B71]"
        >
          <Loader2 className="size-5 shrink-0 animate-spin" />
          <div>
            <strong>Estamos atualizando sua análise.</strong>
            <p className="mt-1">
              {stage}. Você pode sair desta página e voltar depois.
            </p>
          </div>
        </div>
      )}
      {message && (
        <p
          role="status"
          className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6"
        >
          {message}
        </p>
      )}
      {failed && !open && (
        <Button
          className="mt-3"
          variant="outline"
          onClick={() => {
            setFile(null);
            setConfirmed(false);
            setOpen(true);
          }}
        >
          Tentar outro arquivo
        </Button>
      )}
      {open && (
        <form onSubmit={submit} className="mt-5 space-y-4 border-t pt-5">
          <div className="text-sm leading-7 text-slate-600">
            <p className="font-semibold">Documentos aceitos:</p>
            <ul>
              <li>✓ Histórico Escolar Oficial</li>
              <li>✓ Histórico Escolar — Simples Conferência</li>
              <li>✓ Extrato / Grade Curricular</li>
            </ul>
          </div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void choose(e.dataTransfer.files);
            }}
            className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${dragging ? "border-brand-cyan bg-brand-cyan-50" : "border-brand-cyan/30 bg-brand-cyan-50/50"}`}
          >
            <UploadCloud className="mx-auto size-8 text-brand-cyan-700" />
            <p className="mt-3 font-semibold text-[#003B71]">
              Arraste seu PDF aqui
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Envie apenas 1 arquivo PDF · até {maxMb} MB
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              aria-label="Selecionar PDF"
              disabled={processing || sending}
              className="mt-4 block w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-white file:p-3 file:text-[#003B71]"
              onChange={(e) => {
                void choose(e.target.files);
              }}
            />
            {file && (
              <div className="mt-4 rounded-xl bg-white p-3">
                <p className="break-all text-sm font-medium">{file.name}</p>
                <div className="mt-2 flex justify-center gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => inputRef.current?.click()}
                  >
                    Substituir arquivo
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      selection.current++;
                      setFile(null);
                      setConfirmed(false);
                      setDuplicate(false);
                      setMessage("");
                      if (inputRef.current) inputRef.current.value = "";
                    }}
                  >
                    Remover
                  </Button>
                </div>
              </div>
            )}
          </div>
          {duplicate && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                router.refresh();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              Ver análise atual
            </Button>
          )}
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              required
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-1 size-4 accent-[#003B71]"
            />
            <span>
              Confirmo que o documento está atualizado, completo e pertence a
              esta matrícula.
            </span>
          </label>
          <Button
            type="submit"
            disabled={!file || !confirmed || duplicate || processing || sending}
            className="min-h-11 w-full bg-brand-cyan text-white hover:bg-brand-cyan/90 sm:w-auto"
          >
            Enviar PDF
          </Button>
        </form>
      )}
    </section>
  );
}
