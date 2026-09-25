"use client";

import { useMemo, useState, useTransition } from "react";
import { Bot, CalendarClock, Check, FileUp, Loader2, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AcademicCalendarTerm } from "@/domain/academic-calendar/calendar";
import { saveAcademicCalendarAction } from "@/features/settings/academic-calendar-actions";

export function AcademicCalendarForm({ initialTerms, currentYear }: { initialTerms: AcademicCalendarTerm[]; currentYear: number }) {
  const [terms, setTerms] = useState(initialTerms);
  const [evidenceByTerm, setEvidenceByTerm] = useState<Record<string, { start: string; end: string }>>({});
  const [targetYear, setTargetYear] = useState(String(currentYear));
  const [file, setFile] = useState<File | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [pending, start] = useTransition();
  const years = useMemo(() => [...new Set(terms.map((term) => Number(term.term.slice(0, 4))))], [terms]);

  function updateTerm(termCode: string, patch: Partial<AcademicCalendarTerm>) {
    const dateChanged = Boolean(patch.startsOn || patch.endsOn);
    setTerms((current) => current.map((term) => term.term === termCode ? {
      ...term,
      ...patch,
      ...(dateChanged ? { confidence: "ESTIMATED" as const, basisYear: Number(termCode.slice(0, 4)), source: null } : {}),
    } : term));
    if (dateChanged) setEvidenceByTerm((current) => {
      const next = { ...current };
      delete next[termCode];
      return next;
    });
  }

  async function suggestWithAI() {
    if (!file) { toast.error("Selecione o PDF oficial do calendário."); return; }
    setAiBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("year", targetYear);
      const response = await fetch("/api/settings/academic-calendar/parse", { method: "POST", body: form });
      const result = await response.json() as { error?: string; terms?: Array<{ term: string; startsOn: string; endsOn: string; startEvidence: string; endEvidence: string }>; usage?: { totalTokens: number } };
      if (!response.ok || !result.terms) { toast.error(result.error ?? "Não foi possível analisar o calendário."); return; }
      const suggestions = result.terms;
      setTerms((current) => current.map((term) => {
        const suggestion = suggestions.find((item) => item.term === term.term);
        return suggestion ? { ...term, startsOn: suggestion.startsOn, endsOn: suggestion.endsOn, confidence: "ESTIMATED", basisYear: Number(targetYear), source: null } : term;
      }));
      setEvidenceByTerm((current) => ({
        ...current,
        ...Object.fromEntries(suggestions.map((term) => [term.term, { start: term.startEvidence, end: term.endEvidence }])),
      }));
      toast.success(`Datas sugeridas pela IA. Revise o PDF e confirme antes de marcar como oficial. (${result.usage?.totalTokens ?? 0} tokens)`);
      setFile(null);
    } catch {
      toast.error("Falha ao conectar à IA. Verifique a conexão e tente novamente.");
    } finally {
      setAiBusy(false);
    }
  }

  function save() {
    start(async () => {
      const res = await saveAcademicCalendarAction(terms);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }

  return <div className="space-y-6">
    <section className="rounded-xl border border-brand-cyan/25 bg-brand-cyan-50/25 p-4 sm:p-5" aria-labelledby="calendar-ai-title">
      <div className="flex items-start gap-3"><div className="rounded-lg bg-white p-2 text-brand-navy"><Bot className="size-5" /></div><div className="min-w-0 flex-1"><h3 id="calendar-ai-title" className="font-semibold">Importar datas com IA</h3><p className="mt-1 text-sm text-muted-foreground">A IA procura apenas início e término dos semestres. Enviamos um pequeno trecho de texto extraído localmente — não o PDF completo — e você confere antes de salvar.</p></div><Badge variant="outline" className="shrink-0"><Sparkles className="mr-1 size-3" />até 500 tokens de saída</Badge></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-end">
        <label className="space-y-1.5 text-sm font-medium">Ano do documento<Select value={targetYear} onValueChange={setTargetYear}><SelectTrigger aria-label="Ano do calendário a extrair"><SelectValue /></SelectTrigger><SelectContent>{years.map((year) => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent></Select></label>
        <label className="space-y-1.5 text-sm font-medium">Calendário em PDF<Input type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="h-auto min-h-10 file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm" />{file && <span className="block truncate text-xs font-normal text-muted-foreground">{file.name}</span>}</label>
        <Button type="button" onClick={suggestWithAI} disabled={aiBusy || pending || !file}>{aiBusy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}{aiBusy ? "Lendo PDF…" : "Sugerir datas"}</Button>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">A chave e o modelo vêm da configuração existente em “Configurações → OpenAI”. A IA associa as linhas aos semestres; o sistema confere ano, semestre, mês e dia com as linhas do PDF antes de aceitar a sugestão.</p>
    </section>

    <div className="space-y-3">{years.map((year) => <details key={year} open={year === currentYear || year === 2026} className="rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4"><span className="flex items-center gap-2 font-semibold"><CalendarClock className="size-4 text-brand-navy" />{year}</span><span className="text-xs text-muted-foreground">{terms.filter((term) => term.term.startsWith(`${year}.`) && term.confidence === "OFFICIAL").length} de 2 oficiais</span></summary>
      <div className="grid gap-3 border-t p-3 sm:grid-cols-2 sm:p-4">{terms.filter((term) => term.term.startsWith(`${year}.`)).map((term) => <fieldset key={term.term} className="min-w-0 space-y-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-semibold">{term.term.endsWith(".1") ? "1º semestre" : "2º semestre"}</legend>
        <div className="grid grid-cols-2 gap-2"><label className="space-y-1 text-xs font-medium text-muted-foreground">Início<Input type="date" value={term.startsOn} onChange={(event) => updateTerm(term.term, { startsOn: event.target.value })} /></label><label className="space-y-1 text-xs font-medium text-muted-foreground">Término<Input type="date" value={term.endsOn} onChange={(event) => updateTerm(term.term, { endsOn: event.target.value })} /></label></div>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">Confirmação das datas<Select value={term.confidence} onValueChange={(value: "OFFICIAL" | "ESTIMATED") => updateTerm(term.term, { confidence: value, basisYear: value === "OFFICIAL" ? year : term.basisYear, source: value === "OFFICIAL" ? (term.source ?? (year === 2026 ? "CALENDÁRIO ACADÊMICO GRADUAÇÃO EAD - 2026.pdf" : "Calendário oficial conferido pela gestão")) : null })}><SelectTrigger aria-label={`Confirmação das datas de ${term.term}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ESTIMATED">Projeção · não oficial</SelectItem><SelectItem value="OFFICIAL">Oficial · conferido no PDF</SelectItem></SelectContent></Select></label>
        <p className="text-xs text-muted-foreground">{term.confidence === "OFFICIAL" ? <><Check className="mr-1 inline size-3 text-status-success" />{term.source ?? "Calendário oficial conferido pela gestão"}</> : term.basisYear < year ? `Projeção baseada no calendário oficial de ${term.basisYear}; confira o documento do ano.` : "Datas sugeridas ou alteradas; ainda não confirmadas como oficiais."}</p>
        {evidenceByTerm[term.term] && <p className="rounded-md bg-muted/50 p-2 text-xs leading-5 text-muted-foreground"><strong>Linhas que sustentaram a sugestão da IA:</strong> início “{evidenceByTerm[term.term].start}”; término “{evidenceByTerm[term.term].end}”. Compare-as com o PDF antes de confirmar.</p>}
      </fieldset>)}</div>
    </details>)}</div>

    <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-muted-foreground">Salvar grava a configuração local no sistema e registra a alteração na auditoria. Só marque como oficial após conferir o documento institucional.</p><Button type="button" onClick={save} disabled={pending || aiBusy} className="shrink-0"><Save className="size-4" />{pending ? "Salvando…" : "Salvar calendário"}</Button></div>
  </div>;
}
