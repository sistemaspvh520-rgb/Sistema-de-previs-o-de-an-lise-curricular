import Link from "next/link";
import { Download, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { pluralize } from "@/lib/utils";

export interface PoloReportRow {
  code: string;
  name: string;
  total: number;
  month: number;
  completed: number;
}

/** Relatório "Análises por polo": contagens + atalhos para a lista filtrada e exportação CSV. */
export function PoloReportCard({ rows, title = "Análises por polo", description, className, exportQuery = "" }: { rows: PoloReportRow[]; title?: string; description?: string; className?: string; exportQuery?: string }) {
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><MapPin className="size-4 text-brand-cyan-700" /> {title}</CardTitle>
          {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={`/api/reports/analyses${exportQuery}`} download><Download className="size-4" /> Exportar CSV</a>
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">Ainda não há análises com polo informado.</p>
        ) : (
          <div className="divide-y">
            <div className="hidden grid-cols-[minmax(0,1fr)_5rem_5rem_5rem_6rem] gap-3 px-6 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:grid">
              <span>Polo</span><span className="text-right">Total</span><span className="text-right">No mês</span><span className="text-right">Prontas</span><span />
            </div>
            {rows.map((row) => (
              <div key={row.code} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_5rem_5rem_5rem_6rem] sm:items-center sm:gap-3 sm:px-6">
                <div className="min-w-0">
                  <Link href={`/analyses?polo=${row.code}`} className="block truncate font-medium hover:underline">{row.name}</Link>
                  <div className="text-xs text-muted-foreground">Código {row.code}</div>
                </div>
                <div className="flex gap-4 text-xs sm:contents">
                  <span className="sm:text-right"><span className="sm:hidden">Total: </span><span className="font-semibold text-brand-navy sm:text-sm">{row.total}</span></span>
                  <span className="sm:text-right"><span className="sm:hidden">No mês: </span>{row.month}</span>
                  <span className="text-status-success sm:text-right"><span className="sm:hidden">Prontas: </span>{row.completed}</span>
                </div>
                <a href={`/api/reports/analyses?polo=${row.code}${exportQuery ? `&${exportQuery.slice(1)}` : ""}`} download className="text-xs text-brand-cyan-700 underline sm:text-right">Exportar</a>
              </div>
            ))}
            <div className="px-6 py-3 text-xs text-muted-foreground">{pluralize(total, "análise com polo informado", "análises com polo informado")} · {rows.length} {rows.length === 1 ? "polo" : "polos"}.</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
