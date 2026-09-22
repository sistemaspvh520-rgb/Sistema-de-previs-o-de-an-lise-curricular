"use client";

import { useMemo, useState } from "react";
import { Check, HelpCircle, Pencil, Search, X, FileSearch, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SubjectStatusBadge } from "@/components/shared/status-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { SubjectVM } from "@/features/analyses/view-model";
import type { SubjectStatus } from "@/generated/prisma/enums";

type Filter = "ALL" | SubjectStatus;

export function GradeTable({
  subjects,
  canEdit,
  onEdit,
  onLocate,
  selectedId,
}: {
  subjects: SubjectVM[];
  canEdit: boolean;
  onEdit: (s: SubjectVM) => void;
  onLocate?: (s: SubjectVM) => void;
  selectedId?: string | null;
}) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [period, setPeriod] = useState<string>("ALL");
  const [q, setQ] = useState("");

  const periods = useMemo(() => [...new Set(subjects.map((s) => s.period))].sort((a, b) => a - b), [subjects]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return subjects.filter(
      (s) =>
        (filter === "ALL" || s.status === filter) &&
        (period === "ALL" || s.period === Number(period)) &&
        (!needle || s.name.toLowerCase().includes(needle) || (s.usedSubject ?? "").toLowerCase().includes(needle)),
    );
  }, [subjects, filter, period, q]);

  const FILTERS: Array<{ v: Filter; label: string }> = [
    { v: "ALL", label: "Todas" },
    { v: "EXEMPTED", label: "Dispensadas" },
    { v: "PENDING", label: "Pendentes" },
    { v: "REVIEW", label: "Revisar" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.v}
              onClick={() => setFilter(f.v)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === f.v ? "border-brand-navy bg-brand-navy text-white" : "bg-card hover:bg-muted",
              )}
            >
              {f.label}
              <span className="ml-1 opacity-70">{f.v === "ALL" ? subjects.length : subjects.filter((s) => s.status === f.v).length}</span>
            </button>
          ))}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos os períodos</SelectItem>
              {periods.map((p) => (
                <SelectItem key={p} value={String(p)}>{p}º período</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar disciplina" className="pl-9" />
          </div>
        </div>
      </div>

      <div className="hidden min-h-72 max-h-[calc(100dvh-21rem)] overflow-y-auto rounded-xl border bg-card lg:block">
        <Table className="table-fixed">
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--border)]">
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead className="w-[40%]">Disciplina</TableHead>
              <TableHead className="w-20">C.H.</TableHead>
              <TableHead className="w-24">Período</TableHead>
              <TableHead className="w-[28%] whitespace-normal">Disciplina utilizada</TableHead>
              <TableHead className="hidden w-32 xl:table-cell">Status</TableHead>
              <TableHead className="hidden w-32 2xl:table-cell">Fonte</TableHead>
              <TableHead className="w-14 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Nenhuma disciplina para este filtro.</TableCell></TableRow>
            )}
            {rows.map((s) => (
              <TableRow
                key={s.id}
                className={cn("cursor-pointer", selectedId === s.id && "bg-brand-cyan-50")}
                onClick={() => onLocate?.(s)}
              >
                <TableCell><StatusIcon status={s.status} /></TableCell>
                <TableCell className="whitespace-normal align-top">
                  <div className="break-words font-medium">
                    {s.name}
                    {s.code && <span className="ml-2 font-mono text-[11px] font-normal text-muted-foreground">#{s.code}</span>}
                  </div>
                  {s.note && <div className="text-xs text-status-warning">{s.note}</div>}
                  {s.scheduledTerm && (
                    <div className="text-[11px] text-muted-foreground">
                      {s.scheduledKind === "BACKLOG" ? "Adaptação" : "Regular"} em {s.scheduledTerm}
                    </div>
                  )}
                  {s.inRemainingBacklog && <div className="text-[11px] text-status-danger">Sem vaga na previsão atual</div>}
                </TableCell>
                <TableCell className="align-top">{s.workload}h</TableCell>
                <TableCell className="align-top">{s.period}º</TableCell>
                <TableCell className={cn("whitespace-normal break-words align-top", !s.usedSubject && "text-muted-foreground")}>{s.usedSubject ?? "—"}</TableCell>
                <TableCell className="hidden align-top xl:table-cell"><SubjectStatusBadge status={s.status} /></TableCell>
                <TableCell className="hidden align-top 2xl:table-cell">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        {s.origin === "USER" ? <UserRound className="size-3.5" /> : <FileSearch className="size-3.5" />}
                        {s.origin === "USER" ? "Usuário" : `PDF · p.${s.sourcePage}`}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {s.origin === "USER" ? "Corrigido manualmente" : `PDF · página ${s.sourcePage} · linha ${s.sourceRow} · legibilidade ${s.readability}`}
                      <div className="font-mono text-[10px] opacity-70">{s.rowHash}</div>
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className="align-top text-right">
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Corrigir"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(s);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 lg:hidden">
        {rows.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">Nenhuma disciplina para este filtro.</div>
        ) : rows.map((s) => (
          <article key={s.id} onClick={() => onLocate?.(s)} className={cn("cursor-pointer rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-muted/50", selectedId === s.id && "bg-brand-cyan-50 ring-1 ring-brand-cyan") }>
            <div className="flex items-start gap-3">
              <div className="mt-0.5"><StatusIcon status={s.status} /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0"><h3 className="break-words text-sm font-medium">{s.name}</h3>{s.code && <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">#{s.code}</p>}</div>
                  <SubjectStatusBadge status={s.status} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{s.period}º período · {s.workload}h · {s.origin === "USER" ? "Alterada manualmente" : `PDF · página ${s.sourcePage}`}</p>
                {s.usedSubject && <p className="mt-1 break-words text-xs text-muted-foreground">Utilizada: <span className="text-foreground">{s.usedSubject}</span></p>}
                {s.note && <p className="mt-1 text-xs text-status-warning">{s.note}</p>}
                {(s.scheduledTerm || s.inRemainingBacklog) && <p className={cn("mt-1 text-xs", s.inRemainingBacklog ? "text-status-danger" : "text-muted-foreground")}>{s.inRemainingBacklog ? "Sem vaga na previsão atual" : `${s.scheduledKind === "BACKLOG" ? "Adaptação" : "Regular"} em ${s.scheduledTerm}`}</p>}
              </div>
              {canEdit && <Button variant="ghost" size="icon" aria-label={`Corrigir ${s.name}`} onClick={(event) => { event.stopPropagation(); onEdit(s); }}><Pencil className="size-4" /></Button>}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function StatusIcon({ status }: { status: SubjectStatus }) {
  if (status === "EXEMPTED") return <Check className="size-4 text-status-success" aria-label="Dispensada" />;
  if (status === "PENDING") return <X className="size-4 text-status-danger" aria-label="Pendente" />;
  return <HelpCircle className="size-4 text-status-warning" aria-label="Revisar" />;
}
