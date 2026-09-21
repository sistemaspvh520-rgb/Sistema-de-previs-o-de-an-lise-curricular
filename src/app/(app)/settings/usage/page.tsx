import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyUSD, formatDateTime, formatNumber, pluralize } from "@/lib/utils";

export const metadata: Metadata = { title: "Uso de IA" };
export const dynamic = "force-dynamic";

const OP_LABEL: Record<string, string> = {
  DOCUMENT_EXTRACTION: "Extração do documento",
  CURRICULUM_EXTRACTION: "Extração da grade",
  AUDIT: "Auditoria",
  FINAL_EXPLANATION: "Explicação",
  CONNECTION_TEST: "Teste de conexão",
};

export default async function UsagePage() {
  await requirePagePermission("usage:read");
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [month, all, byModel, byOperation, recent] = await Promise.all([
    prisma.aIUsage.aggregate({ _sum: { estimatedCost: true, totalTokens: true }, _count: true, where: { createdAt: { gte: startOfMonth } } }),
    prisma.aIUsage.aggregate({ _sum: { estimatedCost: true, totalTokens: true }, _count: true }),
    prisma.aIUsage.groupBy({ by: ["model"], _sum: { estimatedCost: true, totalTokens: true, inputTokens: true, outputTokens: true }, _count: true, orderBy: { _sum: { estimatedCost: "desc" } } }),
    prisma.aIUsage.groupBy({ by: ["operation"], _sum: { estimatedCost: true, totalTokens: true }, _count: true }),
    prisma.aIUsage.findMany({ orderBy: { createdAt: "desc" }, take: 40, include: { analysis: { select: { id: true, courseName: true } } } }),
  ]);

  return (
    <>
      <PageHeader eyebrow="Configurações" title="Uso de IA" description="Consumo de tokens e custo estimado por chamada à OpenAI. Valores estimados a partir da tabela de preços configurada em src/services/openai/pricing.ts." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Custo estimado no mês" value={formatCurrencyUSD(Number(month._sum.estimatedCost ?? 0))} hint={pluralize(month._count, "chamada")} />
        <Stat label="Tokens no mês" value={formatNumber(month._sum.totalTokens ?? 0)} />
        <Stat label="Custo estimado total" value={formatCurrencyUSD(Number(all._sum.estimatedCost ?? 0))} hint={pluralize(all._count, "chamada")} />
        <Stat label="Tokens totais" value={formatNumber(all._sum.totalTokens ?? 0)} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-base">Por modelo</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Modelo</TableHead><TableHead>Chamadas</TableHead><TableHead>Entrada</TableHead><TableHead>Saída</TableHead><TableHead className="text-right">Custo est.</TableHead></TableRow></TableHeader>
              <TableBody>
                {byModel.length === 0 && <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">Sem uso registrado.</TableCell></TableRow>}
                {byModel.map((m) => (
                  <TableRow key={m.model}>
                    <TableCell className="font-mono text-xs">{m.model}</TableCell>
                    <TableCell>{m._count}</TableCell>
                    <TableCell>{formatNumber(m._sum.inputTokens ?? 0)}</TableCell>
                    <TableCell>{formatNumber(m._sum.outputTokens ?? 0)}</TableCell>
                    <TableCell className="text-right">{formatCurrencyUSD(Number(m._sum.estimatedCost ?? 0))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-base">Por operação</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Operação</TableHead><TableHead>Chamadas</TableHead><TableHead>Tokens</TableHead><TableHead className="text-right">Custo est.</TableHead></TableRow></TableHeader>
              <TableBody>
                {byOperation.length === 0 && <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">Sem uso registrado.</TableCell></TableRow>}
                {byOperation.map((o) => (
                  <TableRow key={o.operation}>
                    <TableCell>{OP_LABEL[o.operation] ?? o.operation}</TableCell>
                    <TableCell>{o._count}</TableCell>
                    <TableCell>{formatNumber(o._sum.totalTokens ?? 0)}</TableCell>
                    <TableCell className="text-right">{formatCurrencyUSD(Number(o._sum.estimatedCost ?? 0))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <Card className="mt-6 overflow-hidden shadow-sm">
        <CardHeader><CardTitle className="text-base">Chamadas recentes</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Data/hora</TableHead><TableHead>Operação</TableHead><TableHead>Modelo</TableHead><TableHead>Análise</TableHead><TableHead>Tokens</TableHead><TableHead className="text-right">Custo est.</TableHead></TableRow></TableHeader>
            <TableBody>
              {recent.length === 0 && <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">Nenhuma chamada.</TableCell></TableRow>}
              {recent.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(u.createdAt)}</TableCell>
                  <TableCell><Badge variant="secondary">{OP_LABEL[u.operation] ?? u.operation}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{u.model}</TableCell>
                  <TableCell>{u.analysis ? <Link className="text-brand-cyan-700 underline" href={`/analyses/${u.analysis.id}`}>{u.analysis.courseName ?? u.analysis.id.slice(0, 8)}</Link> : "—"}</TableCell>
                  <TableCell>{formatNumber(u.totalTokens)} <span className="text-xs text-muted-foreground">({formatNumber(u.inputTokens)}+{formatNumber(u.outputTokens)})</span></TableCell>
                  <TableCell className="text-right">{formatCurrencyUSD(Number(u.estimatedCost))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="shadow-sm">
      <CardContent>
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
