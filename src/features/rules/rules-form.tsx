"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveRulesAction } from "@/features/rules/actions";
import type { AcademicRules, AdditionalSemesterCapacityRule } from "@/domain/curricular-analysis/rules/types";

export function RulesForm({ initial, version }: { initial: AcademicRules; version: string }) {
  const [extra, setExtra] = useState(String(initial.extraSubjectsAllowed));
  const [maximum, setMaximum] = useState(initial.maximumSubjectsPerSemester === null ? "" : String(initial.maximumSubjectsPerSemester));
  const [addType, setAddType] = useState<AdditionalSemesterCapacityRule["type"]>(initial.additionalSemesterCapacityRule.type);
  const [fixed, setFixed] = useState(String(initial.additionalSemesterCapacityRule.type === "FIXED_VALUE" ? initial.additionalSemesterCapacityRule.value : 8));
  const [customRegular, setCustomRegular] = useState(String(initial.additionalSemesterCapacityRule.type === "CUSTOM_RULE" ? initial.additionalSemesterCapacityRule.regular : 0));
  const [customExtra, setCustomExtra] = useState(String(initial.additionalSemesterCapacityRule.type === "CUSTOM_RULE" ? initial.additionalSemesterCapacityRule.extra : 3));
  const [periodUnit, setPeriodUnit] = useState(initial.periodUnit);
  const [entryDefault, setEntryDefault] = useState(initial.entryPeriodDefault === null ? "" : String(initial.entryPeriodDefault));
  const [reviewPending, setReviewPending] = useState(initial.reviewCountsAsPending);
  const [maxAdd, setMaxAdd] = useState(String(initial.maxAdditionalSemesters));
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();
  const extraNumber = Math.max(0, Number(extra) || 0);
  const maximumNumber = maximum.trim() === "" ? null : Math.max(0, Number(maximum) || 0);

  function useRecommended() {
    setExtra("3");
    setMaximum("");
    setAddType("SAME_AS_LAST_PERIOD");
    setPeriodUnit("SEMESTER");
    setEntryDefault("");
    setReviewPending(true);
    setMaxAdd("8");
  }

  function save() {
    const additionalSemesterCapacityRule: AdditionalSemesterCapacityRule =
      addType === "FIXED_VALUE"
        ? { type: "FIXED_VALUE", value: Number(fixed) }
        : addType === "CUSTOM_RULE"
          ? { type: "CUSTOM_RULE", regular: Number(customRegular), extra: Number(customExtra) }
          : { type: addType };
    start(async () => {
      const res = await saveRulesAction({
        extraSubjectsAllowed: extra,
        maximumSubjectsPerSemester: maximum.trim() === "" ? null : Number(maximum),
        additionalSemesterCapacityRule,
        periodUnit,
        backlogOrdering: "OLDEST_FIRST",
        entryPeriodDefault: entryDefault.trim() === "" ? null : Number(entryDefault),
        reviewCountsAsPending: reviewPending,
        maxAdditionalSemesters: maxAdd,
        notes,
      });
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-xl border border-brand-cyan/25 bg-brand-cyan-50/50 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-brand-navy"><CheckCircle2 className="size-4" /> Como a previsão funciona</h3>
            <p className="mt-1 text-sm text-muted-foreground">O sistema mantém as disciplinas do período e ocupa apenas as vagas livres com pendências anteriores.</p>
          </div>
          <Button type="button" variant="outline" className="shrink-0 bg-card" onClick={useRecommended}><RotateCcw className="size-4" /> Usar recomendado</Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Explain label="1. Grade normal" value="Disciplinas do período" />
          <Explain label="2. Vagas extras" value={`Até +${extraNumber} por período`} />
          <Explain label="3. Exemplo" value={maximumNumber ? `10 disciplinas → máximo ${Math.max(10, Math.min(10 + extraNumber, maximumNumber))}` : `8 disciplinas → máximo ${8 + extraNumber}`} />
        </div>
      </div>

      <Section title="Limite por semestre" desc="Defina quantas pendências de períodos anteriores podem ser anexadas sem ultrapassar a capacidade da turma.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Vagas extras por período" hint="Ex.: período com 8 disciplinas + 3 vagas = até 11 no total.">
            <Input type="number" min={0} max={20} value={extra} onChange={(e) => setExtra(e.target.value)} />
          </Field>
          <Field label="Limite de semestres adicionais" hint="Quantidade máxima criada se ainda houver pendências após o curso.">
            <Input type="number" min={1} max={30} value={maxAdd} onChange={(e) => setMaxAdd(e.target.value)} />
          </Field>
          <Field label="Máximo total por semestre" hint="Opcional. Ex.: teto 11: período com 10 disciplinas recebe só 1 pendência extra.">
            <Input type="number" min={1} max={40} value={maximum} onChange={(e) => setMaximum(e.target.value)} placeholder="Sem teto" />
          </Field>
        </div>
      </Section>

      <Section title="Se ainda restarem pendências ao final do curso" desc="Escolha como o sistema deve continuar a previsão. Recomendado: repetir a capacidade do último período.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Regra">
            <Select value={addType} onValueChange={(v) => setAddType(v as AdditionalSemesterCapacityRule["type"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SAME_AS_LAST_PERIOD">Recomendado — repetir capacidade do último período</SelectItem>
                <SelectItem value="FIXED_VALUE">Usar um limite fixo</SelectItem>
                <SelectItem value="CUSTOM_RULE">Definir capacidade manualmente</SelectItem>
                <SelectItem value="UNCONFIGURED">Parar previsão e pedir confirmação</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {addType === "FIXED_VALUE" && (
            <Field label="Capacidade fixa"><Input type="number" min={1} max={30} value={fixed} onChange={(e) => setFixed(e.target.value)} /></Field>
          )}
          {addType === "CUSTOM_RULE" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Regulares"><Input type="number" min={0} value={customRegular} onChange={(e) => setCustomRegular(e.target.value)} /></Field>
              <Field label="Extras"><Input type="number" min={0} value={customExtra} onChange={(e) => setCustomExtra(e.target.value)} /></Field>
            </div>
          )}
        </div>
      </Section>

      <Section title="Leitura do documento" desc="O período de ingresso é informado antes do envio. Deixe o padrão vazio para evitar que o sistema assuma um período sozinho.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Período padrão (opcional)" hint="Normalmente deixe vazio; o analista informa no envio.">
            <Input type="number" min={1} max={20} value={entryDefault} onChange={(e) => setEntryDefault(e.target.value)} placeholder="—" />
          </Field>
          <Field label="Unidade da coluna SÉRIE">
            <Select value={periodUnit} onValueChange={(v) => setPeriodUnit(v as AcademicRules["periodUnit"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SEMESTER">Semestre</SelectItem>
                <SelectItem value="YEAR">Ano (pendente de confirmação institucional)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">REVISAR conta como pendente</div>
              <div className="text-xs text-muted-foreground">Na simulação, até ser resolvida.</div>
            </div>
            <Switch checked={reviewPending} onCheckedChange={setReviewPending} />
          </div>
        </div>
      </Section>

      <Section title="Aplicar alterações" desc={`Salvar cria a versão ${nextLabel(version)} para as próximas análises. As análises anteriores continuam com a versão ${version}.`}>
        <Field label="Notas da versão (opcional)">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: aprovado pela coordenação em ..." />
        </Field>
        <div className="mt-4">
          <Button onClick={save} disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar como nova versão</Button>
        </div>
      </Section>
    </div>
  );
}

function nextLabel(v: string) {
  const [a, b = "0"] = v.split(".");
  return `${a}.${Number(b) + 1}`;
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <h3 className="font-semibold">{title}</h3>
      {desc && <p className="mb-4 text-sm text-muted-foreground">{desc}</p>}
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Explain({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-brand-cyan/20 bg-card px-3 py-2"><div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-0.5 text-sm font-semibold text-brand-navy">{value}</div></div>;
}
