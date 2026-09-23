"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveGeneralSettingsAction } from "@/features/settings/general-actions";
import { TermSelect } from "@/components/shared/term-select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Polo } from "@/domain/polos";
import type { CourseFormat } from "@/generated/prisma/enums";

export function GeneralSettingsForm({
  initial,
  readOnly,
}: {
  initial: {
    institutionName: string;
    maxUploadMb: number;
    maxPdfPages: number;
    defaultStartTerm: string | null;
    polos: Polo[];
    courseFormats: CourseFormat[];
    followUpBusinessStartHour: number;
    followUpBusinessEndHour: number;
    followUpRepeatBusinessDays: number;
    followUpDefaultCadence: "ONCE_DAILY" | "TWICE_DAILY";
  };
  readOnly: boolean;
}) {
  const [pending, start] = useTransition();
  const [defaultStartTerm, setDefaultStartTerm] = useState(
    initial.defaultStartTerm ?? "",
  );
  const [polos, setPolos] = useState(initial.polos);
  const [courseFormats, setCourseFormats] = useState<CourseFormat[]>(
    initial.courseFormats,
  );
  const [scopeOpen, setScopeOpen] = useState(false);
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
        followUpDefaultCadence: fd.get("followUpDefaultCadence"),
      });
      if (res.ok) {
        toast.success(res.message);
        setScopeOpen(false);
      } else toast.error(res.error);
    });
  }
  return (
    <form action={submit} className="grid gap-5">
      <div className="space-y-2">
        <Label htmlFor="institutionName">Nome da instituição</Label>
        <Input
          id="institutionName"
          name="institutionName"
          defaultValue={initial.institutionName}
          disabled={readOnly}
        />
      </div>
      <fieldset className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:grid-cols-4">
        <legend className="px-1 text-sm font-semibold">
          Lembretes de matrícula
        </legend>
        <HourSelect
          id="followUpBusinessStartHour"
          name="followUpBusinessStartHour"
          label="Início do expediente"
          value={initial.followUpBusinessStartHour}
          disabled={readOnly}
        />
        <HourSelect
          id="followUpBusinessEndHour"
          name="followUpBusinessEndHour"
          label="Fim do expediente"
          value={initial.followUpBusinessEndHour}
          disabled={readOnly}
          startAt={1}
        />
        <div className="space-y-2">
          <Label htmlFor="followUpRepeatBusinessDays">Repetir a cada</Label>
          <Select
            name="followUpRepeatBusinessDays"
            defaultValue={String(initial.followUpRepeatBusinessDays)}
            disabled={readOnly}
          >
            <SelectTrigger id="followUpRepeatBusinessDays">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5].map((days) => (
                <SelectItem key={days} value={String(days)}>
                  {days} {days === 1 ? "dia útil" : "dias úteis"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Padrão para novas contas.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="followUpDefaultCadence">Frequência padrão</Label>
          <Select
            name="followUpDefaultCadence"
            defaultValue={initial.followUpDefaultCadence}
            disabled={readOnly}
          >
            <SelectTrigger id="followUpDefaultCadence">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ONCE_DAILY">1 vez ao dia</SelectItem>
              <SelectItem value="TWICE_DAILY">2 vezes ao dia</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            O usuário confirma no primeiro acesso.
          </p>
        </div>
      </fieldset>
      <Collapsible
        open={scopeOpen}
        onOpenChange={setScopeOpen}
        className="rounded-xl border bg-muted/20"
      >
        <CollapsibleTrigger className="flex w-full items-center justify-between p-4 text-left text-sm font-semibold">
          Polos, formatos e limites{" "}
          <ChevronDown
            className={`size-4 transition-transform ${scopeOpen ? "rotate-180" : ""}`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <fieldset className="space-y-3 border-t p-4">
            <legend className="sr-only">Escopo do atendimento</legend>
            <p className="text-xs text-muted-foreground">
              Polos e formatos liberados para novos atendimentos. Alterações não
              modificam análises já criadas.
            </p>
            <div className="space-y-2">
              {polos.map((polo, index) => (
                <div
                  key={`${polo.code}-${index}`}
                  className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto]"
                >
                  <Input
                    aria-label={`Código do polo ${index + 1}`}
                    value={polo.code}
                    maxLength={12}
                    disabled={readOnly}
                    onChange={(event) =>
                      setPolos((rows) =>
                        rows.map((row, i) =>
                          i === index
                            ? {
                                ...row,
                                code: event.target.value.replace(/\D/g, ""),
                              }
                            : row,
                        ),
                      )
                    }
                  />
                  <Input
                    aria-label={`Nome do polo ${index + 1}`}
                    value={polo.name}
                    maxLength={120}
                    disabled={readOnly}
                    onChange={(event) =>
                      setPolos((rows) =>
                        rows.map((row, i) =>
                          i === index
                            ? { ...row, name: event.target.value }
                            : row,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Remover ${polo.name}`}
                    disabled={readOnly || polos.length === 1}
                    onClick={() =>
                      setPolos((rows) => rows.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              {!readOnly && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPolos((rows) => [...rows, { code: "", name: "" }])
                  }
                >
                  <Plus className="size-4" /> Adicionar polo
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-4">
              {(["EAD_DIGITAL", "SEMIPRESENCIAL"] as const).map((format) => (
                <label key={format} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={courseFormats.includes(format)}
                    disabled={readOnly}
                    onChange={(event) =>
                      setCourseFormats((items) =>
                        event.target.checked
                          ? [...items, format]
                          : items.filter((item) => item !== format),
                      )
                    }
                  />
                  {format === "EAD_DIGITAL" ? "EAD Digital" : "Semipresencial"}
                </label>
              ))}
            </div>
          </fieldset>
        </CollapsibleContent>
      </Collapsible>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="maxUploadMb">Tamanho máximo do PDF (MB)</Label>
          <Input
            id="maxUploadMb"
            name="maxUploadMb"
            type="number"
            min={1}
            max={50}
            defaultValue={initial.maxUploadMb}
            disabled={readOnly}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maxPdfPages">Máximo de páginas</Label>
          <Input
            id="maxPdfPages"
            name="maxPdfPages"
            type="number"
            min={1}
            max={300}
            defaultValue={initial.maxPdfPages}
            disabled={readOnly}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="defaultStartTerm">Semestre padrão de ingresso</Label>
        <TermSelect
          id="defaultStartTerm"
          name="defaultStartTerm"
          value={defaultStartTerm}
          onChange={setDefaultStartTerm}
          disabled={readOnly}
        />
        <p className="text-xs text-muted-foreground">
          Preenche o semestre de ingresso — o mesmo usado para iniciar a
          previsão. Continua editável no envio.
        </p>
      </div>
      {!readOnly && (
        <div>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />} Salvar
          </Button>
        </div>
      )}
    </form>
  );
}

function HourSelect({
  id,
  name,
  label,
  value,
  disabled,
  startAt = 0,
}: {
  id: string;
  name: string;
  label: string;
  value: number;
  disabled: boolean;
  startAt?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select name={name} defaultValue={String(value)} disabled={disabled}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Array.from(
            { length: 24 - startAt },
            (_, index) => index + startAt,
          ).map((hour) => (
            <SelectItem key={hour} value={String(hour)}>
              {String(hour).padStart(2, "0")}:00
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">Horário de Rondônia.</p>
    </div>
  );
}
