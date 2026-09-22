"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveGeneralSettingsAction } from "@/features/settings/general-actions";
import { TermSelect } from "@/components/shared/term-select";
import type { Polo } from "@/domain/polos";
import type { CourseFormat } from "@/generated/prisma/enums";

export function GeneralSettingsForm({
  initial,
  readOnly,
}: {
  initial: { institutionName: string; maxUploadMb: number; maxPdfPages: number; defaultStartTerm: string | null; polos: Polo[]; courseFormats: CourseFormat[]; followUpBusinessStartHour: number; followUpBusinessEndHour: number; followUpRepeatBusinessDays: number };
  readOnly: boolean;
}) {
  const [pending, start] = useTransition();
  const [defaultStartTerm, setDefaultStartTerm] = useState(initial.defaultStartTerm ?? "");
  const [polos, setPolos] = useState(initial.polos);
  const [courseFormats, setCourseFormats] = useState<CourseFormat[]>(initial.courseFormats);
  function submit(fd: FormData) {
    start(async () => {
      const res = await saveGeneralSettingsAction({
        institutionName: fd.get("institutionName"),
        maxUploadMb: fd.get("maxUploadMb"),
        maxPdfPages: fd.get("maxPdfPages"),
        defaultStartTerm: fd.get("defaultStartTerm"),
        polos,
        courseFormats,
        followUpBusinessStartHour: fd.get("followUpBusinessStartHour"),
        followUpBusinessEndHour: fd.get("followUpBusinessEndHour"),
        followUpRepeatBusinessDays: fd.get("followUpRepeatBusinessDays"),
      });
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }
  return (
    <form action={submit} className="grid gap-5">
      <div className="space-y-2">
        <Label htmlFor="institutionName">Nome da instituição</Label>
        <Input id="institutionName" name="institutionName" defaultValue={initial.institutionName} disabled={readOnly} />
      </div>
      <fieldset className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:grid-cols-3">
        <legend className="px-1 text-sm font-semibold">Lembretes de matrícula</legend>
        <div className="space-y-2"><Label htmlFor="followUpBusinessStartHour">Início do expediente</Label><Input id="followUpBusinessStartHour" name="followUpBusinessStartHour" type="number" min={0} max={22} defaultValue={initial.followUpBusinessStartHour} disabled={readOnly} /><p className="text-xs text-muted-foreground">Hora local.</p></div>
        <div className="space-y-2"><Label htmlFor="followUpBusinessEndHour">Fim do expediente</Label><Input id="followUpBusinessEndHour" name="followUpBusinessEndHour" type="number" min={1} max={23} defaultValue={initial.followUpBusinessEndHour} disabled={readOnly} /><p className="text-xs text-muted-foreground">Hora local.</p></div>
        <div className="space-y-2"><Label htmlFor="followUpRepeatBusinessDays">Repetir a cada</Label><Input id="followUpRepeatBusinessDays" name="followUpRepeatBusinessDays" type="number" min={1} max={5} defaultValue={initial.followUpRepeatBusinessDays} disabled={readOnly} /><p className="text-xs text-muted-foreground">Dias úteis sem resposta.</p></div>
      </fieldset>
      <fieldset className="space-y-3 rounded-xl border bg-muted/20 p-4">
        <legend className="px-1 text-sm font-semibold">Escopo do atendimento</legend>
        <p className="text-xs text-muted-foreground">Polos e formatos liberados para novos atendimentos. Alterações não modificam análises já criadas.</p>
        <div className="space-y-2">
          {polos.map((polo, index) => <div key={`${polo.code}-${index}`} className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto]"><Input aria-label={`Código do polo ${index + 1}`} value={polo.code} maxLength={12} disabled={readOnly} onChange={(event) => setPolos((rows) => rows.map((row, i) => i === index ? { ...row, code: event.target.value.replace(/\D/g, "") } : row))} /><Input aria-label={`Nome do polo ${index + 1}`} value={polo.name} maxLength={120} disabled={readOnly} onChange={(event) => setPolos((rows) => rows.map((row, i) => i === index ? { ...row, name: event.target.value } : row))} /><Button type="button" size="icon" variant="ghost" aria-label={`Remover ${polo.name}`} disabled={readOnly || polos.length === 1} onClick={() => setPolos((rows) => rows.filter((_, i) => i !== index))}><Trash2 className="size-4" /></Button></div>)}
          {!readOnly && <Button type="button" variant="outline" size="sm" onClick={() => setPolos((rows) => [...rows, { code: "", name: "" }])}><Plus className="size-4" /> Adicionar polo</Button>}
        </div>
        <div className="flex flex-wrap gap-4">{(["EAD_DIGITAL", "SEMIPRESENCIAL"] as const).map((format) => <label key={format} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={courseFormats.includes(format)} disabled={readOnly} onChange={(event) => setCourseFormats((items) => event.target.checked ? [...items, format] : items.filter((item) => item !== format))} />{format === "EAD_DIGITAL" ? "EAD Digital" : "Semipresencial"}</label>)}</div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="maxUploadMb">Tamanho máximo do PDF (MB)</Label>
          <Input id="maxUploadMb" name="maxUploadMb" type="number" min={1} max={50} defaultValue={initial.maxUploadMb} disabled={readOnly} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maxPdfPages">Máximo de páginas</Label>
          <Input id="maxPdfPages" name="maxPdfPages" type="number" min={1} max={300} defaultValue={initial.maxPdfPages} disabled={readOnly} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="defaultStartTerm">Semestre padrão de ingresso</Label>
        <TermSelect id="defaultStartTerm" name="defaultStartTerm" value={defaultStartTerm} onChange={setDefaultStartTerm} disabled={readOnly} />
        <p className="text-xs text-muted-foreground">Preenche o semestre de ingresso — o mesmo usado para iniciar a previsão. Continua editável no envio.</p>
      </div>
      {!readOnly && (
        <div>
          <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
        </div>
      )}
    </form>
  );
}
