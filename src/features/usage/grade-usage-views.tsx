import Link from "next/link";
import { BookOpen, Copy, Download, MessageCircle, TriangleAlert } from "lucide-react";
import { ROLE_LABELS } from "@/lib/rbac";
import { formatDateTime } from "@/lib/time";
import { GRADE_ACTION_SHORT, type GradeActionName } from "@/domain/usage/actions";
import type { GradeUsageLogItem, GradeUsageSummary, PersonGradeUsage, PersonGradeUse } from "@/services/usage/grade-usage";
import { initials } from "@/features/usage/format";
import { cn } from "@/lib/utils";

/** Visões do "Uso das grades" (componentes de servidor: só marcação, sem estado). */

const ACTION_ICON: Record<GradeActionName, typeof Copy> = {
  "grade.whatsapp_open": MessageCircle,
  "grade.whatsapp_copy": Copy,
  "grade.download": Download,
};

const USE_KINDS = [
  { key: "copies", icon: Copy, one: "cópia", many: "cópias", full: "cópia p/ WhatsApp", fullMany: "cópias p/ WhatsApp", meaning: "copiou a mensagem para enviar no WhatsApp", strong: true },
  { key: "opens", icon: MessageCircle, one: "aberta", many: "abertas", full: "mensagem aberta", fullMany: "mensagens abertas", meaning: "abriu a mensagem pronta, sem necessariamente copiar", strong: false },
  { key: "downloads", icon: Download, one: "PDF", many: "PDFs", full: "PDF baixado", fullMany: "PDFs baixados", meaning: "baixou o PDF da matriz", strong: false },
] as const;

/** Contadores de uso: ícone + número + palavra (nunca só ícone). `compact` usa a palavra curta e esconde o que for zero. */
export function UseCounters({ opens, copies, downloads, compact = false }: { opens: number; copies: number; downloads: number; compact?: boolean }) {
  const values = { copies, opens, downloads };
  return (
    <ul className={cn("flex flex-wrap gap-1.5", compact && "gap-1")}>
      {USE_KINDS.filter((kind) => !compact || values[kind.key] > 0).map((kind) => {
        const value = values[kind.key];
        const Icon = kind.icon;
        return (
          <li
            key={kind.key}
            title={`${value} ${value === 1 ? kind.full : kind.fullMany}: ${kind.meaning}`}
            className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]", value ? (kind.strong ? "bg-status-success-bg text-status-success" : "bg-slate-100 text-slate-700") : "bg-slate-50 text-slate-400")}
          >
            <Icon className="size-3" aria-hidden="true" />
            <span className="font-semibold tabular-nums">{value}</span>
            <span>{compact ? (value === 1 ? kind.one : kind.many) : value === 1 ? kind.full : kind.fullMany}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Explica uma vez só o que cada ícone significa (cópia, mensagem aberta, PDF baixado). */
export function UseLegend() {
  return (
    <ul aria-label="Legenda dos ícones" className="flex flex-wrap gap-x-5 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
      {USE_KINDS.map((kind) => {
        const Icon = kind.icon;
        return (
          <li key={kind.key} className="flex items-center gap-1.5">
            <Icon className={cn("size-3.5", kind.strong ? "text-status-success" : "text-slate-500")} aria-hidden="true" />
            <span><strong className="font-semibold text-slate-800">{kind.fullMany.replace(" p/ WhatsApp", "")}</strong> — {kind.meaning}</span>
          </li>
        );
      })}
    </ul>
  );
}

function GradeName({ label, exists }: { label: string; exists: boolean }) {
  return (
    <span className="min-w-0">
      <span className="font-medium text-slate-900">{label}</span>
      {!exists && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">excluída</span>}
    </span>
  );
}

/** Grades usadas por uma pessoa: o que fez em cada uma (abriu/copiou/baixou) e a primeira e a última vez. */
export function PersonGradeTable({ grades }: { grades: PersonGradeUse[] }) {
  if (!grades.length) return null;
  return (
    <ul className="divide-y rounded-xl border">
      {grades.map((use) => (
        <li key={use.gradeId} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <GradeName label={use.label} exists={use.exists} />
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {use.firstAt.getTime() === use.lastAt.getTime() ? (
                <>em {formatDateTime(use.lastAt)}</>
              ) : (
                <>1ª vez {formatDateTime(use.firstAt)} · <span className="font-medium text-slate-700">última {formatDateTime(use.lastAt)}</span></>
              )}
            </div>
          </div>
          <UseCounters opens={use.opens} copies={use.copies} downloads={use.downloads} compact />
        </li>
      ))}
    </ul>
  );
}

export function ByPersonView({ people, personHref }: { people: PersonGradeUsage[]; personHref: (id: string) => string }) {
  if (!people.length) return <Empty text="Ninguém encontrado com esses filtros." />;
  return (
    <ul className="grid gap-4 xl:grid-cols-2">
      {people.map((person) => (
        <li key={person.id} className={cn("rounded-2xl border bg-card p-4 shadow-sm sm:p-5", person.total === 0 && "border-status-warning/40")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <Link href={personHref(person.id)} className="flex min-w-0 items-center gap-3 rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-navy text-xs font-semibold text-white">{initials(person.name)}</span>
              <span className="min-w-0">
                <span className="block truncate font-semibold text-slate-900">{person.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{ROLE_LABELS[person.role]}{person.poloName ? ` · ${person.poloName}` : ""}</span>
              </span>
            </Link>
            {person.total === 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-status-warning-bg px-2.5 py-1 text-xs font-medium text-status-warning"><TriangleAlert className="size-3.5" /> Não usou nenhuma grade</span>
            ) : (
              <div className="text-right text-xs text-muted-foreground">
                <div><span className="text-base font-bold tabular-nums text-slate-900">{person.grades.length}</span> {person.grades.length === 1 ? "grade" : "grades"}</div>
                <div>última vez {person.lastAt ? formatDateTime(person.lastAt) : "—"}</div>
              </div>
            )}
          </div>
          {person.total > 0 && <div className="mt-3"><PersonGradeTable grades={person.grades} /></div>}
        </li>
      ))}
    </ul>
  );
}

export function ByGradeView({ grades, unused }: { grades: GradeUsageSummary[]; unused: Array<{ id: string; label: string; detail: string | null }> }) {
  const max = Math.max(...grades.map((grade) => grade.total), 1);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section aria-label="Grades usadas">
        {grades.length ? (
          <ol className="space-y-3">
            {grades.map((grade, index) => (
              <li key={grade.gradeId} className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-navy-50 text-xs font-bold text-brand-navy">{index + 1}</span>
                    <div className="min-w-0">
                      <GradeName label={grade.label} exists={grade.exists} />
                      <div className="mt-0.5 text-xs text-muted-foreground">última vez {formatDateTime(grade.lastAt)}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold tabular-nums text-slate-900">{grade.total}</div>
                    <div className="text-[11px] text-muted-foreground">{grade.total === 1 ? "uso" : "usos"}</div>
                  </div>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-slate-100" aria-hidden="true">
                  <div className="h-full rounded-full bg-[#eda100]" style={{ width: `${(grade.total / max) * 100}%` }} />
                </div>
                <div className="mt-3"><UseCounters opens={grade.opens} copies={grade.copies} downloads={grade.downloads} /></div>
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Quem usou">
                  {grade.people.map((person) => (
                    <li key={person.id} className="inline-flex items-center gap-1.5 rounded-full border bg-white py-0.5 pl-0.5 pr-2 text-xs" title={`Última vez: ${formatDateTime(person.lastAt)}`}>
                      <span className="flex size-5 items-center justify-center rounded-full bg-brand-navy text-[9px] font-semibold text-white">{initials(person.name)}</span>
                      <span className="max-w-32 truncate text-slate-700">{person.name.split(" ")[0]}</span>
                      <span className="font-semibold tabular-nums text-slate-900">{person.count}×</span>
                      {person.copies > 0 && <span className="text-status-success">· {person.copies} cópia{person.copies === 1 ? "" : "s"}</span>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        ) : (
          <Empty text="Nenhuma grade foi usada no período." />
        )}
      </section>
      <section aria-label="Grades sem uso" className="rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="flex items-center gap-2 font-semibold text-slate-900"><BookOpen className="size-4 text-muted-foreground" /> Grades sem uso no período <span className="text-sm font-normal text-muted-foreground">· {unused.length}</span></h3>
        <p className="mt-1 text-xs text-muted-foreground">Ninguém abriu, copiou ou baixou estas grades no período.</p>
        {unused.length ? (
          <ul className="mt-3 divide-y rounded-lg border">
            {unused.map((grade) => (
              <li key={grade.id} className="px-3 py-2 text-sm">
                <div className="font-medium text-slate-800">{grade.label}</div>
                {grade.detail && <div className="text-[11px] text-muted-foreground">{grade.detail}</div>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-status-success">Todas as grades foram usadas.</p>
        )}
      </section>
    </div>
  );
}

export function LogView({ items, page, pages, total, pageHref }: { items: GradeUsageLogItem[]; page: number; pages: number; total: number; pageHref: (page: number) => string }) {
  if (!items.length) return <Empty text="Nenhum uso de grade registrado no período." />;
  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="border-b bg-slate-50/80 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5 text-left font-medium">Quando</th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">Pessoa</th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">Grade</th>
              <th scope="col" className="px-4 py-2.5 text-left font-medium">O que fez</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item, index) => {
              const Icon = ACTION_ICON[item.action];
              return (
                <tr key={`${item.at.toISOString()}-${index}`} className="hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-slate-700">{formatDateTime(item.at)}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-900">{item.userName}</td>
                  <td className="px-3 py-2.5"><GradeName label={item.label} exists={item.exists} /></td>
                  <td className="px-4 py-2.5">
                    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs", item.action === "grade.whatsapp_copy" ? "font-semibold text-status-success" : "text-slate-600")}>
                      <Icon className="size-3.5" aria-hidden="true" /> {GRADE_ACTION_SHORT[item.action]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <nav aria-label="Páginas do registro" className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
        <span>{total} {total === 1 ? "registro" : "registros"} · página {page} de {pages}</span>
        <span className="flex gap-2">
          {page > 1 ? <Link href={pageHref(page - 1)} className="rounded-md border px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Anterior</Link> : <span className="rounded-md border px-3 py-1.5 opacity-40">Anterior</span>}
          {page < pages ? <Link href={pageHref(page + 1)} className="rounded-md border px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Próxima</Link> : <span className="rounded-md border px-3 py-1.5 opacity-40">Próxima</span>}
        </span>
      </nav>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">{text}</p>;
}
