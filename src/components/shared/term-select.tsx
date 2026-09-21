"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Lista de semestres letivos: do ano anterior até 3 anos à frente. */
export function termOptions(now = new Date()): string[] {
  const year = now.getFullYear();
  const out: string[] = [];
  for (let y = year - 1; y <= year + 3; y++) out.push(`${y}.1`, `${y}.2`);
  return out;
}

export function TermSelect({ value, onChange, id, name, className, disabled }: { value: string; onChange: (v: string) => void; id?: string; name?: string; className?: string; disabled?: boolean }) {
  const options = termOptions();
  if (value && !options.includes(value)) options.unshift(value);
  return (
    <>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className={className}><SelectValue placeholder="Selecionar semestre" /></SelectTrigger>
        <SelectContent>
          {options.map((t) => (
            <SelectItem key={t} value={t}>{t.endsWith(".1") ? `${t} — 1º semestre de ${t.slice(0, 4)}` : `${t} — 2º semestre de ${t.slice(0, 4)}`}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {name && <input type="hidden" name={name} value={value} />}
    </>
  );
}
