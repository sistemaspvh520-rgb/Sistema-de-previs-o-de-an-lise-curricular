import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, FilePlus2, Search, UserRound } from "lucide-react";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { listAnalyses } from "@/repositories/analysis-repository";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AnalysisStatusBadge, ReliabilityBadge, ANALYSIS_STATUS_LABELS } from "@/components/shared/status-badge";
import { formatDateTime, ordinal, pluralize } from "@/lib/utils";
import type { AnalysisStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { getSystemSettings } from "@/repositories/settings-repository";
import { formatCourseFormat } from "@/domain/course-formats";
import { countDueFollowUps } from "@/services/follow-up/follow-up";

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
  const settings = await getSystemSettings();
  const poloCode = typeof params.polo === "string" && settings.polos.some((polo) => polo.code === params.polo) ? params.polo : undefined;
  const followUpDue = params.followUp === "due";
  // Gestor pode filtrar por responsável; demais perfis só veem as próprias análises.
  const isAdmin = user.role === "ADMIN";
  const userFilter = isAdmin && typeof params.user === "string" && /^[0-9a-f-]{36}$/.test(params.user) ? params.user : undefined;
  const page = Number(params.page ?? 1) || 1;
  const [team, listed, dueTotal] = await Promise.all([
    isAdmin ? prisma.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
    listAnalyses({ status, statusGroup, q, page, poloCode, followUpDue, createdById: isAdmin ? userFilter : user.id }),
    countDueFollowUps(isAdmin ? userFilter : user.id),
  ]);
  const { items, total, pageSize } = listed;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const showDiagnostics = can(user.role, "audit:read");
  const showOwner = user.role === "ADMIN";

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
      <div className="mb-4 grid gap-3">
        <div className="flex min-w-0 flex-wrap gap-1.5">
          <Link href={{ pathname: "/analyses", query: { followUp: "due", ...(userFilter ? { user: userFilter } : {}) } }} className={cn("shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-medium leading-none transition-colors", followUpDue ? dueTotal > 0 ? "animate-pulse border-status-danger bg-status-danger font-semibold text-white shadow-sm motion-reduce:animate-none" : "border-status-warning bg-status-warning text-white" : dueTotal > 0 ? "animate-pulse border-status-danger bg-status-danger-bg font-semibold text-status-danger shadow-sm motion-reduce:animate-none" : "border-status-warning/40 bg-status-warning-bg text-status-warning hover:bg-status-warning/20")}>Retorno pendente{dueTotal > 0 ? ` (${dueTotal})` : ""}</Link>
          {STATUS_FILTERS.map((f) => (
            <Link
              key={f.id}
              href={{ pathname: "/analyses", query: { ...(q ? { q } : {}), ...(poloCode ? { polo: poloCode } : {}), ...(userFilter ? { user: userFilter } : {}), ...(f.group ? { filter: f.group } : f.value !== "ALL" ? { status: f.value } : {}) } }}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-medium leading-none transition-colors",
                !followUpDue && (f.group ? statusGroup === f.group : !statusGroup && status === f.value) ? "border-brand-navy bg-brand-navy text-white" : "bg-card hover:bg-muted",
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <form className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {statusGroup ? <input type="hidden" name="filter" value={statusGroup} /> : status !== "ALL" && <input type="hidden" name="status" value={status} />}
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={q} placeholder="Buscar por aluno, curso ou arquivo" className="pl-9" aria-label="Buscar por aluno, curso ou arquivo" />
          </div>
          <div className="relative w-full sm:w-64">
            <select name="polo" defaultValue={poloCode ?? ""} aria-label="Filtrar por polo" className="h-10 w-full appearance-none rounded-lg border border-input bg-card py-2 pr-10 pl-3 text-sm shadow-xs outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/50">
              <option value="">Todos os polos</option>
              {settings.polos.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
          </div>
          {isAdmin && (
            <div className="relative w-full sm:w-60">
              <select name="user" defaultValue={userFilter ?? ""} aria-label="Filtrar por responsável" className="h-10 w-full appearance-none rounded-lg border border-input bg-card py-2 pr-10 pl-3 text-sm shadow-xs outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/50">
                <option value="">Todos os responsáveis</option>
                {team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
              <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          )}
          <Button type="submit" variant="outline" className="h-10 sm:shrink-0">Filtrar</Button>
        </form>
      </div>
      <Card className="overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Análise</TableHead>
              <TableHead className="hidden sm:table-cell">Ingresso</TableHead>
              <TableHead className="hidden md:table-cell">Disciplinas</TableHead>
              {showOwner && <TableHead className="hidden xl:table-cell">Responsável</TableHead>}
              <TableHead>Status</TableHead>
              {showDiagnostics && <TableHead className="hidden lg:table-cell">Verificação</TableHead>}
              <TableHead className="hidden sm:table-cell">Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={(showDiagnostics ? 6 : 5) + (showOwner ? 1 : 0)} className="py-10 text-center text-sm text-muted-foreground">
                  Nenhuma análise encontrada{statusGroup ? " neste filtro" : status !== "ALL" ? ` com status "${ANALYSIS_STATUS_LABELS[status]}"` : ""}.
                </TableCell>
              </TableRow>
            )}
            {items.map((a) => (
              <TableRow key={a.id} className="cursor-pointer animate-in fade-in slide-in-from-bottom-1 duration-300">
                <TableCell className="w-full max-w-0 whitespace-normal">
                  <Link href={`/analyses/${a.id}`} className="block min-w-0">
                    <div className="font-medium">{a.studentName ?? a.courseName ?? "Curso não identificado"}</div>
                    {a.studentName && <div className="truncate text-xs text-foreground/80">{a.courseName ?? "Curso não identificado"}{a.courseFormat ? ` · ${formatCourseFormat(a.courseFormat)}` : ""}{a.poloCode ? ` · Polo ${a.poloCode}` : ""}</div>}
                    <div className="truncate text-xs text-muted-foreground" title={a.document?.originalName ?? undefined}>{a.document?.originalName ?? "Arquivo não disponível"}</div>
                    {a.candidateLabel && <div className="mt-0.5 truncate text-xs text-muted-foreground">Candidato: {a.candidateLabel}</div>}
                    {showOwner && <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground xl:hidden"><UserRound className="size-3" /> Responsável: {a.createdBy.name}</div>}
                  </Link>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{ordinal(a.entryPeriod)}</TableCell>
                <TableCell className="hidden md:table-cell">{a._count.subjects || "—"}</TableCell>
                {showOwner && <TableCell className="hidden xl:table-cell"><div className="flex min-w-0 items-center gap-2"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-navy-50 text-xs font-semibold text-brand-navy">{a.createdBy.name.split(" ").filter(Boolean).slice(0, 2).map((name) => name[0]).join("").toUpperCase() || "—"}</span><span className="min-w-0 truncate text-sm" title={a.createdBy.name}>{a.createdBy.name}</span></div></TableCell>}
                <TableCell>
                  <AnalysisStatusBadge status={a.status} />
                  {a.status === "COMPLETED" && <div className={cn("mt-1 text-[11px]", a.enrollmentStatus === "ENROLLED" ? "text-status-success" : a.enrollmentStatus === "NOT_ENROLLED" ? "text-muted-foreground" : a.followUpIsDue ? "font-medium text-status-warning" : "text-muted-foreground")}>{a.enrollmentStatus === "ENROLLED" ? "Matriculado" : a.enrollmentStatus === "NOT_ENROLLED" ? "Não matriculado" : a.followUpIsDue ? "Retorno pendente" : "Aguardando retorno"}</div>}
                </TableCell>
                {showDiagnostics && <TableCell className="hidden lg:table-cell">
                  <ReliabilityBadge level={a.reliability} />
                  {a.reviewItemsCount > 0 && <div className="mt-1 text-[11px] text-muted-foreground">{pluralize(a.reviewItemsCount, "observação", "observações")}</div>}
                </TableCell>}
                <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">{formatDateTime(a.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {pages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>Página {page} de {pages}</span>
            <div className="flex gap-2">
              {page > 1 && <Button asChild variant="outline" size="sm"><Link href={{ pathname: "/analyses", query: { ...(q ? { q } : {}), ...(poloCode ? { polo: poloCode } : {}), ...(userFilter ? { user: userFilter } : {}), ...(followUpDue ? { followUp: "due" } : statusGroup ? { filter: statusGroup } : status !== "ALL" ? { status } : {}), page: page - 1 } }}>Anterior</Link></Button>}
              {page < pages && <Button asChild variant="outline" size="sm"><Link href={{ pathname: "/analyses", query: { ...(q ? { q } : {}), ...(poloCode ? { polo: poloCode } : {}), ...(userFilter ? { user: userFilter } : {}), ...(followUpDue ? { followUp: "due" } : statusGroup ? { filter: statusGroup } : status !== "ALL" ? { status } : {}), page: page + 1 } }}>Próxima</Link></Button>}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
