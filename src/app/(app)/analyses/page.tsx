import type { Metadata } from "next";
import Link from "next/link";
import { FilePlus2, Search } from "lucide-react";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { listAnalyses } from "@/repositories/analysis-repository";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AnalysisStatusBadge, ReliabilityBadge, ANALYSIS_STATUS_LABELS } from "@/components/shared/status-badge";
import { formatDateTime, ordinal, pluralize } from "@/lib/utils";
import type { AnalysisStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Análises" };
export const dynamic = "force-dynamic";

const STATUS_FILTERS: Array<{ id: string; value: AnalysisStatus | "ALL"; group?: "PROCESSING" | "ATTENTION"; label: string }> = [
  { id: "all", value: "ALL", label: "Todas" },
  { id: "processing", value: "ALL", group: "PROCESSING", label: "Em andamento" },
  { id: "attention", value: "ALL", group: "ATTENTION", label: "Precisam de atenção" },
  { id: "waiting-review", value: "WAITING_REVIEW", label: "Dados pendentes" },
  { id: "completed", value: "COMPLETED", label: "Prontas" },
  { id: "ai-error", value: "AI_ERROR", label: "Falha de processamento" },
  { id: "failed", value: "FAILED", label: "Não concluídas" },
];

export default async function AnalysesPage({ searchParams }: PageProps<"/analyses">) {
  const user = await requireUser();
  const params = await searchParams;
  const status = (typeof params.status === "string" ? params.status : "ALL") as AnalysisStatus | "ALL";
  const statusGroup = params.filter === "PROCESSING" || params.filter === "ATTENTION" ? params.filter : undefined;
  const q = typeof params.q === "string" ? params.q : "";
  const page = Number(params.page ?? 1) || 1;
  const { items, total, pageSize } = await listAnalyses({ status, statusGroup, q, page, createdById: user.role === "ADMIN" ? undefined : user.id });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const showDiagnostics = can(user.role, "audit:read");

  return (
    <>
      <PageHeader
        title="Análises"
        description={pluralize(total, "análise registrada", "análises registradas") + "."}
        actions={
          can(user.role, "analysis:create") && (
            <Button asChild>
              <Link href="/analyses/new"><FilePlus2 className="size-4" /> Nova análise</Link>
            </Button>
          )
        }
      />
      <div className="mb-4 grid gap-3 2xl:grid-cols-[minmax(0,1fr)_16rem] 2xl:items-center">
        <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-1">
          {STATUS_FILTERS.map((f) => (
            <Link
              key={f.id}
              href={{ pathname: "/analyses", query: { ...(q ? { q } : {}), ...(f.group ? { filter: f.group } : f.value !== "ALL" ? { status: f.value } : {}) } }}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-medium leading-none transition-colors",
                (f.group ? statusGroup === f.group : !statusGroup && status === f.value) ? "border-brand-navy bg-brand-navy text-white" : "bg-card hover:bg-muted",
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <form className="relative w-full max-w-sm 2xl:max-w-none 2xl:justify-self-end">
          {statusGroup ? <input type="hidden" name="filter" value={statusGroup} /> : status !== "ALL" && <input type="hidden" name="status" value={status} />}
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Buscar por curso ou arquivo" className="pl-9" aria-label="Buscar por curso ou arquivo" />
        </form>
      </div>
      <Card className="overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Análise</TableHead>
              <TableHead className="hidden sm:table-cell">Ingresso</TableHead>
              <TableHead className="hidden md:table-cell">Disciplinas</TableHead>
              <TableHead>Status</TableHead>
              {showDiagnostics && <TableHead className="hidden lg:table-cell">Verificação</TableHead>}
              <TableHead className="hidden sm:table-cell">Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={showDiagnostics ? 6 : 5} className="py-10 text-center text-sm text-muted-foreground">
                  Nenhuma análise encontrada{statusGroup ? " neste filtro" : status !== "ALL" ? ` com status "${ANALYSIS_STATUS_LABELS[status]}"` : ""}.
                </TableCell>
              </TableRow>
            )}
            {items.map((a) => (
              <TableRow key={a.id} className="cursor-pointer animate-in fade-in slide-in-from-bottom-1 duration-300">
                <TableCell>
                  <Link href={`/analyses/${a.id}`} className="block">
                    <div className="font-medium">{a.courseName ?? "Curso não identificado"}</div>
                    <div className="max-w-[42rem] truncate text-xs text-muted-foreground" title={a.document?.originalName ?? undefined}>{a.document?.originalName ?? "Arquivo não disponível"}</div>
                  </Link>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{ordinal(a.entryPeriod)}</TableCell>
                <TableCell className="hidden md:table-cell">{a._count.subjects || "—"}</TableCell>
                <TableCell><AnalysisStatusBadge status={a.status} /></TableCell>
                {showDiagnostics && <TableCell className="hidden lg:table-cell">
                  <ReliabilityBadge level={a.reliability} />
                  {a.reviewItemsCount > 0 && <div className="mt-1 text-[11px] text-muted-foreground">{pluralize(a.reviewItemsCount, "observação", "observações")}</div>}
                </TableCell>}
                <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">{formatDateTime(a.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>Página {page} de {pages}</span>
            <div className="flex gap-2">
              {page > 1 && <Button asChild variant="outline" size="sm"><Link href={{ pathname: "/analyses", query: { ...(q ? { q } : {}), ...(statusGroup ? { filter: statusGroup } : status !== "ALL" ? { status } : {}), page: page - 1 } }}>Anterior</Link></Button>}
              {page < pages && <Button asChild variant="outline" size="sm"><Link href={{ pathname: "/analyses", query: { ...(q ? { q } : {}), ...(statusGroup ? { filter: statusGroup } : status !== "ALL" ? { status } : {}), page: page + 1 } }}>Próxima</Link></Button>}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
