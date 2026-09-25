import Link from "next/link";
import { Download, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { pluralize } from "@/lib/utils";

export interface PoloReportRow {
  code: string;
  name: string;
  total: number;
  month: number;
  completed: number;
}

/** Relatório "Análises por polo": contagens + atalhos para a lista filtrada e exportação CSV. */
export function PoloReportCard({
  rows,
  title = "Análises por polo",
  description,
  className,
  variant = "default",
  exportQuery = "",
}: {
  rows: PoloReportRow[];
  title?: string;
  description?: string;
  className?: string;
  variant?: "default" | "glass" | "flat";
  exportQuery?: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  return (
    <Card
      className={cn(
        className,
        variant === "flat" &&
          "w-full gap-0 overflow-visible rounded-none border-0 bg-transparent py-0 shadow-none ring-0 [--card-spacing:0px]",
        variant === "glass" &&
          "border border-white/15 bg-white/[0.08] text-white shadow-none backdrop-blur-xl [--card-spacing:0px]",
      )}
    >
      <CardHeader
        className={cn(
          "flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b border-brand-cyan/20 bg-brand-cyan-50/70 px-6 py-4",
          variant === "flat" && "rounded-none border-b border-slate-200 bg-transparent px-0 py-3",
          variant === "glass" && "border-white/10 bg-white/[0.05]",
        )}
      >
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin
              className={cn(
                "size-4 text-brand-cyan-700",
                variant === "glass" && "text-cyan-200",
              )}
            />{" "}
            {title}
          </CardTitle>
          {description && (
            <p
              className={cn(
                "mt-1 text-xs text-muted-foreground",
                variant === "glass" && "text-slate-200",
              )}
            >
              {description}
            </p>
          )}
        </div>
        <Button
          asChild
          variant="outline"
          size="sm"
          className={cn(
            variant === "glass" &&
              "border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white",
          )}
        >
          <a href={`/api/reports/analyses${exportQuery}`} download>
            <Download className="size-4" /> Exportar CSV
          </a>
        </Button>
      </CardHeader>
      <CardContent className={cn("p-0", variant === "flat" && "px-0")}>
        {rows.length === 0 ? (
          <p
            className={cn(
              "px-6 pb-6 text-sm text-muted-foreground",
              variant === "glass" && "text-slate-200",
            )}
          >
            Ainda não há análises com polo informado.
          </p>
        ) : (
          <div
            className={cn("divide-y", variant === "glass" && "divide-white/10")}
          >
            <div
              className={cn(
                "hidden grid-cols-[minmax(0,1fr)_5rem_5rem_5rem_6rem] gap-3 px-6 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:grid",
                variant === "glass" && "text-slate-300",
              )}
            >
              <span>Polo</span>
              <span className="text-right">Total</span>
              <span className="text-right">No mês</span>
              <span className="text-right">Prontas</span>
              <span />
            </div>
            {rows.map((row) => (
              <div
                key={row.code}
                className={cn(
                  "grid gap-2 border-l-4 border-transparent px-4 py-3 text-sm transition-colors hover:border-brand-cyan hover:bg-white/70 sm:grid-cols-[minmax(0,1fr)_5rem_5rem_5rem_6rem] sm:items-center sm:gap-3 sm:px-6",
                  variant === "glass" && "hover:bg-white/[0.08]",
                )}
              >
                <div className="min-w-0">
                  <Link
                    href={`/analyses?polo=${row.code}`}
                    className={cn(
                      "block truncate font-medium hover:underline",
                      variant === "glass" && "text-white",
                    )}
                  >
                    {row.name}
                  </Link>
                  <div
                    className={cn(
                      "text-xs text-muted-foreground",
                      variant === "glass" && "text-slate-300",
                    )}
                  >
                    Código {row.code}
                  </div>
                </div>
                <div className="flex gap-4 text-xs sm:contents">
                  <span className="sm:text-right">
                    <span className="sm:hidden">Total: </span>
                    <span
                      className={cn(
                        "font-semibold text-brand-navy sm:text-sm",
                        variant === "glass" && "text-cyan-200",
                      )}
                    >
                      {row.total}
                    </span>
                  </span>
                  <span className="sm:text-right">
                    <span className="sm:hidden">No mês: </span>
                    {row.month}
                  </span>
                  <span
                    className={cn(
                      "text-status-success sm:text-right",
                      variant === "glass" && "text-emerald-300",
                    )}
                  >
                    <span className="sm:hidden">Prontas: </span>
                    {row.completed}
                  </span>
                </div>
                <a
                  href={`/api/reports/analyses?polo=${row.code}${exportQuery ? `&${exportQuery.slice(1)}` : ""}`}
                  download
                  className={cn(
                    "text-xs text-brand-cyan-700 underline sm:text-right",
                    variant === "glass" && "text-cyan-200",
                  )}
                >
                  Exportar
                </a>
              </div>
            ))}
            <div
              className={cn(
                "px-6 py-3 text-xs text-muted-foreground",
                variant === "glass" && "text-slate-300",
              )}
            >
              {pluralize(
                total,
                "análise com polo informado",
                "análises com polo informado",
              )}{" "}
              · {rows.length} {rows.length === 1 ? "polo" : "polos"}.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
