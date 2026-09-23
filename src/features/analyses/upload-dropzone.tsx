"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, ExternalLink, FileUp, FileText, Loader2, Search, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TermSelect } from "@/components/shared/term-select";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { formatCourseFormat } from "@/domain/course-formats";
import type { Polo } from "@/domain/polos";
import type { CourseFormat } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { lookupStudentAction, type StudentMatch } from "@/features/analyses/lookup-actions";
import { normalizeStudentName } from "@/domain/student-name";

function describeTerm(term: string): string {
  return term.endsWith(".1") ? `${term} (1º semestre de ${term.slice(0, 4)})` : `${term} (2º semestre de ${term.slice(0, 4)})`;
}

export function UploadDropzone({ maxMb, defaultStartTerm, currentYear, polos, courseFormats }: { maxMb: number; defaultStartTerm: string; currentYear: number; polos: Polo[]; courseFormats: CourseFormat[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [entryTerm, setEntryTerm] = useState(defaultStartTerm);
  const [confirming, setConfirming] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [poloCode, setPoloCode] = useState("");
  const [courseFormat, setCourseFormat] = useState("");
  const formatReady = courseFormats.includes(courseFormat as CourseFormat);
  // Consulta análises anteriores do aluno enquanto o nome é digitado; se existir, exige declarar reanálise.
  const [matches, setMatches] = useState<StudentMatch[]>([]);
  const [looking, setLooking] = useState(false);
  const [reanalysis, setReanalysis] = useState<"" | "yes" | "no">("");
  const [reanalysisOf, setReanalysisOf] = useState("");
  const exactMatches = matches.filter((m) => normalizeStudentName(m.studentName) === normalizeStudentName(studentName));
  const hasPrevious = exactMatches.length > 0;
  function changeStudentName(value: string) {
    setStudentName(value);
    setReanalysis("");
    const ready = value.trim().length >= 3;
    setLooking(ready);
    if (!ready) setMatches([]);
  }
  useEffect(() => {
    const name = studentName.trim();
    if (name.length < 3) return;
    const handle = setTimeout(async () => {
      let found: StudentMatch[] = [];
      try { found = await lookupStudentAction(name); } catch { found = []; }
      setMatches(found);
      setReanalysisOf(found.find((m) => normalizeStudentName(m.studentName) === normalizeStudentName(name))?.id ?? "");
      setLooking(false);
    }, 450);
    return () => clearTimeout(handle);
  }, [studentName]);
  const reanalysisReady = !hasPrevious || (reanalysis === "yes" && Boolean(reanalysisOf));
  const termReady = /^\d{4}\.[12]$/.test(entryTerm);
  const nameReady = studentName.trim().length >= 3;
  const selectedPolo = polos.find((polo) => polo.code === poloCode);
  const poloReady = Boolean(selectedPolo);
  const entryReady = termReady && nameReady && poloReady && formatReady && reanalysisReady;

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
    fd.append("studentName", studentName.trim());
    fd.append("poloCode", poloCode);
    fd.append("courseFormat", courseFormat);
    if (hasPrevious && reanalysis === "yes" && reanalysisOf) fd.append("reanalysisOf", reanalysisOf);
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
        } else if (xhr.status === 409 && body.existingId) {
          toast.error(body.error, {
            duration: 15000,
            action: { label: "Abrir análise existente", onClick: () => router.push(`/analyses/${body.existingId}`) },
          });
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
            <div className="min-w-0 max-w-full">
              <div className="break-all font-medium">{file.name}</div>
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
            <h2 className="font-semibold text-brand-navy">Antes de iniciar, identifique o atendimento</h2>
            <p className="text-sm text-muted-foreground">Aluno, polo e formato identificam o atendimento. O período de ingresso será lido diretamente do PDF.</p>
          </div>
          {entryReady && <span className="inline-flex items-center gap-1.5 text-sm font-medium text-status-success"><CircleCheck className="size-4" /> Dados prontos</span>}
        </div>
        <div className="grid gap-4 md:grid-cols-2 md:items-end">
          <div className="space-y-2">
            <Label htmlFor="studentName">Nome do aluno <span className="text-status-danger">*</span></Label>
            <Input id="studentName" value={studentName} onChange={(e) => changeStudentName(e.target.value)} placeholder="Nome completo do candidato" autoComplete="off" maxLength={120} className={cn(!nameReady && "border-status-warning/50")} />
            {nameReady ? <p className="text-xs text-muted-foreground">Aparece na análise, nos relatórios e no resumo para o candidato.</p> : <p className="text-xs font-medium text-status-warning">Obrigatório: informe o nome completo do aluno.</p>}
          </div>
          {(looking || matches.length > 0) && nameReady && (
            <div className={cn("rounded-lg border p-3 text-sm md:col-span-2", hasPrevious ? "border-status-warning/40 bg-status-warning-bg" : "bg-card")}>
              <div className="flex items-center gap-2 font-medium">
                {looking ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : <Search className="size-4 text-muted-foreground" />}
                {looking ? "Consultando análises anteriores…" : hasPrevious ? `Este aluno já tem ${exactMatches.length === 1 ? "uma análise" : `${exactMatches.length} análises`} registrada${exactMatches.length === 1 ? "" : "s"}` : "Alunos com nome parecido"}
              </div>
              {!looking && matches.length > 0 && (
                <ul className="mt-2 divide-y rounded-md border bg-card">
                  {matches.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{m.studentName}</div>
                        <div className="truncate text-xs text-muted-foreground">{m.courseName ?? "Curso não identificado"}{m.poloName ? ` · ${m.poloName}` : ""} · {m.statusLabel} · {m.createdAtLabel} · {m.createdByName}</div>
                      </div>
                      {m.canOpen && <a href={`/analyses/${m.id}`} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs text-brand-cyan-700 underline"><ExternalLink className="size-3" /> Abrir</a>}
                    </li>
                  ))}
                </ul>
              )}
              {!looking && hasPrevious && (
                <div className="mt-3 space-y-2">
                  <p className="font-medium text-status-warning">É uma reanálise deste aluno?</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant={reanalysis === "yes" ? "default" : "outline"} onClick={() => setReanalysis("yes")}>Sim, reanálise com novo PDF</Button>
                    <Button type="button" size="sm" variant={reanalysis === "no" ? "default" : "outline"} onClick={() => setReanalysis("no")}>Não</Button>
                  </div>
                  {reanalysis === "yes" && (
                    <div className="space-y-1">
                      {exactMatches.length > 1 && (
                        <Select value={reanalysisOf} onValueChange={setReanalysisOf}>
                          <SelectTrigger className="w-full bg-card"><SelectValue placeholder="Qual análise anterior?" /></SelectTrigger>
                          <SelectContent>{exactMatches.map((m) => <SelectItem key={m.id} value={m.id}>{m.courseName ?? "Curso não identificado"} · {m.createdAtLabel}</SelectItem>)}</SelectContent>
                        </Select>
                      )}
                      <p className="text-xs text-muted-foreground">A reanálise fica vinculada à anterior e exige um PDF diferente — o mesmo arquivo é recusado.</p>
                    </div>
                  )}
                  {reanalysis === "no" && <p className="text-xs font-medium text-status-danger">Sem reanálise não é possível iniciar outra análise para este aluno. Abra a análise existente acima.</p>}
                  {reanalysis === "" && <p className="text-xs text-muted-foreground">Responda para liberar o envio.</p>}
                </div>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="poloCode">Polo <span className="text-status-danger">*</span></Label>
            <Select value={poloCode} onValueChange={setPoloCode}>
              <SelectTrigger id="poloCode" className={cn("w-full", !poloReady && "border-status-warning/50")}><SelectValue placeholder="Selecionar polo" /></SelectTrigger>
              <SelectContent>{polos.map((polo) => <SelectItem key={polo.code} value={polo.code}>{polo.code} · {polo.name}</SelectItem>)}</SelectContent>
            </Select>
            {poloReady ? <p className="text-xs text-muted-foreground">Polo de atendimento do candidato.</p> : <p className="text-xs font-medium text-status-warning">Obrigatório: selecione o polo.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="courseFormat">Formato do curso <span className="text-status-danger">*</span></Label>
            <Select value={courseFormat} onValueChange={setCourseFormat}>
              <SelectTrigger id="courseFormat" className={cn("w-full", !formatReady && "border-status-warning/50")}><SelectValue placeholder="Selecionar formato" /></SelectTrigger>
              <SelectContent>{courseFormats.map((code) => <SelectItem key={code} value={code}>{formatCourseFormat(code)}</SelectItem>)}</SelectContent>
            </Select>
            {formatReady ? <p className="text-xs text-muted-foreground">EAD Digital ou Semipresencial.</p> : <p className="text-xs font-medium text-status-warning">Obrigatório: selecione o formato do curso.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="entryTerm">Primeiro semestre da previsão</Label>
            <TermSelect id="entryTerm" value={entryTerm} onChange={setEntryTerm} currentYear={currentYear} className="w-full" />
            {termReady ? <p className="text-xs text-muted-foreground">Usamos este semestre para iniciar a previsão; o período da grade vem do PDF.</p> : <p className="text-xs font-medium text-status-warning">Escolha quando a previsão deve começar.</p>}
          </div>
          <div className="flex flex-col gap-2 md:col-span-2 md:flex-row md:items-center md:justify-end">
            {!file && <p className="text-xs text-muted-foreground md:mr-auto">Selecione o PDF acima para continuar.</p>}
            <Button size="lg" className="w-full md:w-auto" onClick={() => setConfirming(true)} disabled={!file || !entryReady || uploading}>
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
              {uploading ? `Enviando ${progress}%` : "Gerar análise"}
            </Button>
          </div>
        </div>
      </section>

      {/* O período acadêmico é extraído do PDF; o analista só confirma os dados do atendimento. */}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirme os dados do atendimento</AlertDialogTitle>
            <AlertDialogDescription>
              O período de ingresso será identificado no PDF. Confira os dados do atendimento e quando a previsão deve começar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <dl className="grid gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">Arquivo</dt><dd className="break-all font-medium">{file?.name}</dd></div>
            <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">Aluno</dt><dd className="break-words font-medium">{studentName.trim() || "—"}</dd></div>
            <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">Polo</dt><dd className="break-words font-medium">{poloReady ? `${poloCode} · ${selectedPolo?.name}` : "—"}</dd></div>
            {hasPrevious && reanalysis === "yes" && <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">Reanálise</dt><dd className="font-medium text-status-warning">Sim — vinculada à análise anterior</dd></div>}
            <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">Formato</dt><dd className="font-medium">{formatReady ? formatCourseFormat(courseFormat as CourseFormat) : "—"}</dd></div>
            <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">Período</dt><dd className="font-medium">Será lido do PDF</dd></div>
            <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">Previsão a partir de</dt><dd className="font-medium">{termReady ? describeTerm(entryTerm) : "—"}</dd></div>
          </dl>
          <AlertDialogFooter>
            <AlertDialogCancel>Revisar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirming(false); submit(); }}>Confirmar e iniciar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
