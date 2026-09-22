import Link from "next/link";
import { AlertTriangle, Cpu } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyBRL, formatCurrencyUSD, formatNumber, pluralize } from "@/lib/utils";
import type { MonthlyAiUsageSummary } from "@/repositories/ai-usage-repository";

function UsageStat({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>;
}

/** Consumo da OpenAI no mês + quem mais consumiu + alertas de reprocessamento. */
export function AiUsageMonthCards({ summary }: { summary: MonthlyAiUsageSummary }) {
  const rate = summary.usdBrlReferenceRate;
  return (
    <div className="grid gap-6 xl:grid-cols-5">
      <Card className="shadow-sm xl:col-span-3">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="flex items-center gap-2 text-base"><Cpu className="size-4 text-brand-cyan-700" /> Consumo da API no mês</CardTitle>
          <Link href="/settings/usage" className="shrink-0 text-sm text-brand-cyan-700 underline">Ver detalhes e filtrar</Link>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
            <UsageStat label="Custo estimado" value={formatCurrencyUSD(summary.monthCostUsd)} />
            <UsageStat label="Em reais" value={formatCurrencyBRL(summary.monthCostUsd * rate)} />
            <UsageStat label="Disponível no orçamento" value={summary.remainingBudgetUsd === null ? "Não definido" : formatCurrencyUSD(summary.remainingBudgetUsd)} />
            <UsageStat label="Chamadas" value={pluralize(summary.monthCalls, "chamada")} />
          </div>
          <div className="mt-5 border-t pt-4">
            <p className="mb-3 text-sm font-medium">Quem mais consumiu</p>
            {summary.topConsumers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ainda não há consumo atribuído a usuários neste mês.</p>
            ) : (
              <ol className="space-y-3">
                {summary.topConsumers.map((c, index) => (
                  <li key={c.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                    <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">{index + 1}</span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{pluralize(c.calls, "chamada")} · {formatNumber(c.tokens)} tokens{c.repeatedCalls > 0 ? ` · ${pluralize(c.repeatedCalls, "chamada adicional", "chamadas adicionais")}` : ""}</p>
                    </div>
                    <span className="whitespace-nowrap text-right font-medium text-brand-navy">{formatCurrencyUSD(c.cost)}<span className="block text-xs font-normal text-muted-foreground">{formatCurrencyBRL(c.cost * rate)}</span></span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </CardContent>
      </Card>
      <Card className="shadow-sm xl:col-span-2">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="size-4 text-status-warning" /> Alertas de repetição</CardTitle></CardHeader>
        <CardContent>
          {summary.repetitionAlerts.length === 0 ? (
            <div className="rounded-lg bg-status-success/10 p-4 text-sm text-status-success">Nenhum reprocessamento acima do padrão foi identificado neste mês.</div>
          ) : (
            <ul className="space-y-3">
              {summary.repetitionAlerts.map((c) => (
                <li key={c.id} className="rounded-lg border border-status-warning/30 bg-status-warning/10 p-3 text-sm">
                  <p className="font-medium">{c.name}</p>
                  <p className="mt-1 text-muted-foreground">{pluralize(c.repeatedCalls, "chamada adicional", "chamadas adicionais")} além das {c.analysesCount * summary.expectedCallsPerAnalysis} esperadas para {pluralize(c.analysesCount, "análise")}. Verifique reprocessamentos e novas auditorias.</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
