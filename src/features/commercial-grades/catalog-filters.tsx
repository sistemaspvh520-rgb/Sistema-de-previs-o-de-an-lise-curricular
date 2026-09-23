import { ChevronDown, Filter, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Filters = { degree?: string; area?: string; duration?: string; q?: string };

export function CommercialGradeCatalogFilters({ filters, degrees, areas, durations }: { filters: Filters; degrees: string[]; areas: string[]; durations: number[] }) {
  const active = Boolean(filters.degree || filters.area || filters.duration);
  return <form className="mb-6 rounded-xl border bg-card p-4 shadow-sm" method="get">{filters.q && <input type="hidden" name="q" value={filters.q} />}
    <div className="mb-3 flex items-center gap-2 text-sm font-medium"><SlidersHorizontal className="size-4 text-brand-cyan-700" /> Organizar catálogo</div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <SelectField label="Grau" name="degree" value={filters.degree} emptyLabel="Todos os graus" options={degrees} />
      <SelectField label="Área" name="area" value={filters.area} emptyLabel="Todas as áreas" options={areas} />
      <SelectField label="Duração" name="duration" value={filters.duration} emptyLabel="Todas as durações" options={durations.map((duration) => ({ value: String(duration), label: `${duration} semestres` }))} />
      <div className="flex items-end gap-2"><Button className="flex-1" size="sm" type="submit"><Filter className="size-4" /> Filtrar</Button>{active && <Button asChild size="sm" variant="ghost"><Link href="/commercial-grades"><X className="size-4" /> Limpar</Link></Button>}</div>
    </div>
  </form>;
}

function SelectField({ label, name, value, emptyLabel, options }: { label: string; name: string; value?: string; emptyLabel: string; options: Array<string | { value: string; label: string }> }) {
  return <label className="grid gap-1 text-xs font-medium text-muted-foreground">{label}<span className="relative"><select name={name} defaultValue={value ?? ""} className="h-10 w-full appearance-none rounded-md border bg-background px-3 pr-10 text-sm text-foreground outline-none transition-colors hover:border-brand-cyan-400 focus:border-brand-cyan-600 focus:ring-2 focus:ring-brand-cyan-100"><option value="">{emptyLabel}</option>{options.map((option) => { const item = typeof option === "string" ? { value: option, label: option } : option; return <option key={item.value} value={item.value}>{item.label}</option>; })}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-brand-navy" /></span></label>;
}
