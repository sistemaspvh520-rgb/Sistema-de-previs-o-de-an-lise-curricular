import Link from "next/link";
import type { GradeUsageReport } from "@/services/usage/grade-usage";
import { ByGradeView, ByPersonView, LogView } from "@/features/usage/grade-usage-views";
import { cn } from "@/lib/utils";

const SUBVIEWS = [
  { key: "pessoas", label: "Por pessoa" },
  { key: "grades", label: "Por grade" },
  { key: "registro", label: "Registro" },
] as const;
type SubView = (typeof SUBVIEWS)[number]["key"];

export const isSubView = (value: string | undefined): value is SubView => SUBVIEWS.some((item) => item.key === value);

/** Visão "Grades" do Uso da equipe: quem usou qual grade e quando. Usa o cabeçalho, o filtro e a faixa de resumo da página. */
export function GradesView({
  report,
  sub,
  onlyUnused,
  query,
}: {
  report: GradeUsageReport;
  sub: SubView;
  onlyUnused: boolean;
  /** Filtros comuns da página (período, perfil, polo, pessoa, grade) + view=grades, sem gv/sem/page. */
  query: URLSearchParams;
}) {
  const href = (extra: Record<string, string | undefined> = {}) => {
    const next = new URLSearchParams(query);
    for (const [key, value] of Object.entries(extra)) if (value) next.set(key, value);
    return `/management/team-usage?${next.toString()}`;
  };
  const teamQuery = new URLSearchParams();
  for (const key of ["period", "from", "to"]) if (query.get(key)) teamQuery.set(key, query.get(key)!);
  const personHref = (id: string) => `/management/team-usage/${id}${teamQuery.size ? `?${teamQuery.toString()}` : ""}`;
  const { totals } = report;
  const people = onlyUnused ? report.byPerson.filter((person) => person.total === 0) : report.byPerson;
  const kpis = [
    { label: "Pessoas que usaram", value: `${totals.people} de ${totals.accounts}` },
    { label: "Grades usadas", value: `${totals.gradesUsed} de ${totals.gradesTotal}` },
    { label: "Cópias para WhatsApp", value: String(totals.copies), strong: true },
    { label: "Mensagens abertas", value: String(totals.opens) },
    { label: "PDFs baixados", value: String(totals.downloads) },
  ];
  return (
    <>
      <dl aria-label="Resumo do uso das grades" className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((item) => (
          <div key={item.label} className="rounded-xl border bg-card p-3 shadow-sm">
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className={cn("mt-1 text-2xl font-bold tabular-nums", item.strong ? "text-status-success" : "text-slate-900")}>{item.value}</dd>
          </div>
        ))}
      </dl>
      <nav aria-label="Visões das grades" className="mt-6 flex flex-wrap items-center gap-2 border-b">
        {SUBVIEWS.map((item) => (
          <Link
            key={item.key}
            href={href({ gv: item.key === "pessoas" ? undefined : item.key })}
            aria-current={sub === item.key ? "page" : undefined}
            scroll={false}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors", sub === item.key ? "border-brand-navy text-brand-navy" : "border-transparent text-slate-500 hover:text-slate-900")}
          >
            {item.label}
            {item.key === "pessoas" && report.notUsing.length > 0 && <span className="ml-1.5 rounded-full bg-status-warning-bg px-1.5 py-0.5 text-[10px] text-status-warning">{report.notUsing.length} sem uso</span>}
            {item.key === "registro" && <span className="ml-1.5 text-xs text-muted-foreground">{report.logTotal}</span>}
          </Link>
        ))}
      </nav>
      <div className="mt-4">
        {sub === "pessoas" && (
          <>
            {onlyUnused && (
              <p className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-status-warning-bg px-3 py-2 text-sm text-status-warning">
                <span>Mostrando só quem não usou nenhuma grade no período ({people.length}).</span>
                <Link href={href()} scroll={false} className="font-medium underline">Ver todos</Link>
              </p>
            )}
            <ByPersonView people={people} personHref={personHref} />
          </>
        )}
        {sub === "grades" && <ByGradeView grades={report.byGrade} unused={report.unusedGrades} />}
        {sub === "registro" && <LogView items={report.log} page={report.logPage} pages={report.logPages} total={report.logTotal} pageHref={(target) => href({ gv: "registro", page: String(target) })} />}
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Conta como uso de uma grade: abrir a mensagem pronta para WhatsApp, copiar a mensagem ou baixar o PDF. Sessões de &quot;Acessar como&quot; não contam. O registro começou em 06/10/2026.
      </p>
    </>
  );
}
