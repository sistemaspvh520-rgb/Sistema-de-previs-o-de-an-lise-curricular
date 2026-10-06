import type { Metadata } from "next";
import Link from "next/link";
import { Download, ShieldCheck } from "lucide-react";
import { requirePagePermission } from "@/lib/session";
import { PageHeader } from "@/components/layout/page-header";
import { POLOS } from "@/domain/polos";
import { ROLE_LABELS, STAFF_ROLES } from "@/lib/rbac";
import { resolveUsagePeriod } from "@/domain/usage/metrics";
import type { StaffRole } from "@/services/usage/team-usage";
import { getGradeUsage } from "@/services/usage/grade-usage";
import { ManagementTabs } from "@/features/usage/management-tabs";
import { UsageFilters } from "@/features/usage/usage-filters";
import { ByGradeView, ByPersonView, LogView } from "@/features/usage/grade-usage-views";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Uso das grades" };
export const dynamic = "force-dynamic";

const VIEWS = [
  { key: "pessoas", label: "Por pessoa" },
  { key: "grades", label: "Por grade" },
  { key: "registro", label: "Registro" },
] as const;
type View = (typeof VIEWS)[number]["key"];

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function GradeUsagePage({ searchParams }: PageProps<"/management/team-usage/grades">) {
  await requirePagePermission("audit:read");
  const params = await searchParams;
  const now = new Date();
  const period = resolveUsagePeriod({ period: one(params.period), from: one(params.from), to: one(params.to) }, now);
  const role = (STAFF_ROLES as readonly string[]).includes(one(params.role) ?? "") ? (one(params.role) as StaffRole) : undefined;
  const polo = POLOS.some((item) => item.code === one(params.polo)) ? one(params.polo) : undefined;
  const userId = UUID.test(one(params.user) ?? "") ? one(params.user) : undefined;
  const gradeId = UUID.test(one(params.grade) ?? "") ? one(params.grade) : undefined;
  const view: View = VIEWS.some((item) => item.key === one(params.view)) ? (one(params.view) as View) : "pessoas";
  const page = Number(one(params.page)) || 1;
  const report = await getGradeUsage({ from: period.from, to: period.to, role, polo, userId, gradeId }, { logPage: page });

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ period: one(params.period), from: one(params.from), to: one(params.to), role, polo, user: userId, grade: gradeId })) if (value) query.set(key, value);
  const withQuery = (path: string, extra: Record<string, string | undefined> = {}) => {
    const next = new URLSearchParams(query);
    for (const [key, value] of Object.entries(extra)) if (value) next.set(key, value);
    const text = next.toString();
    return `${path}${text ? `?${text}` : ""}`;
  };
  const teamQuery = new URLSearchParams();
  for (const [key, value] of Object.entries({ period: one(params.period), from: one(params.from), to: one(params.to) })) if (value) teamQuery.set(key, value);
  const personHref = (id: string) => `/management/team-usage/${id}${teamQuery.toString() ? `?${teamQuery.toString()}` : ""}`;
  const { totals } = report;
  const adoption = totals.accounts ? Math.round((totals.people / totals.accounts) * 100) : 0;

  return (
    <>
      <PageHeader
        eyebrow="Gestão"
        title="Uso das grades"
        description="Qual grade cada pessoa usou e quando: abriu a mensagem, copiou para o WhatsApp ou baixou o PDF."
        actions={
          <a href={withQuery("/api/management/team-usage/grades/export")} className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Download className="size-4" /> Exportar CSV
          </a>
        }
      />
      <ManagementTabs active="/management/team-usage/grades" />
      <UsageFilters
        period={period.key}
        fromDay={period.fromDay}
        toDay={period.toDay}
        role={role}
        polo={polo}
        roles={STAFF_ROLES.map((value) => ({ value, label: ROLE_LABELS[value] }))}
        polos={POLOS.map((item) => ({ value: item.code, label: item.name }))}
        modules={[]}
        showModule={false}
        extra={[
          { param: "user", label: "Pessoa", allLabel: "Todas as pessoas", value: userId, options: report.options.people.map((person) => ({ value: person.id, label: person.name })) },
          { param: "grade", label: "Grade", allLabel: "Todas as grades", value: gradeId, options: report.options.grades.map((grade) => ({ value: grade.id, label: grade.label })), width: "sm:w-[18rem]" },
        ]}
      />

      <section aria-label="Resumo do uso das grades" className="relative mt-5 overflow-hidden rounded-2xl border border-brand-cyan/30 bg-[radial-gradient(circle_at_12%_0%,rgba(6,147,227,0.42),transparent_45%),linear-gradient(135deg,#00284d,#071426)] p-5 text-white shadow-xl sm:p-6">
        <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-brand-cyan/15 blur-3xl" />
        <dl className="relative grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Hero label="Pessoas que usaram" value={`${totals.people} de ${totals.accounts}`} detail={`${adoption}% da equipe · ${period.label.toLocaleLowerCase("pt-BR")}`} />
          <Hero label="Grades usadas" value={`${totals.gradesUsed} de ${totals.gradesTotal}`} detail={`${Math.max(0, totals.gradesTotal - totals.gradesUsed)} sem uso no período`} />
          <Hero label="Cópias para WhatsApp" value={String(totals.copies)} detail="mensagens copiadas para enviar" />
          <Hero label="Mensagens abertas" value={String(totals.opens)} detail="grades consultadas" />
          <Hero label="PDFs baixados" value={String(totals.downloads)} detail="matrizes baixadas" />
        </dl>
      </section>

      <nav aria-label="Visões" className="mt-6 flex flex-wrap items-center gap-2 border-b">
        {VIEWS.map((item) => (
          <Link
            key={item.key}
            href={withQuery("/management/team-usage/grades", { view: item.key === "pessoas" ? undefined : item.key })}
            aria-current={view === item.key ? "page" : undefined}
            scroll={false}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors", view === item.key ? "border-brand-navy text-brand-navy" : "border-transparent text-slate-500 hover:text-slate-900")}
          >
            {item.label}
            {item.key === "pessoas" && report.notUsing.length > 0 && <span className="ml-1.5 rounded-full bg-status-warning-bg px-1.5 py-0.5 text-[10px] text-status-warning">{report.notUsing.length} sem uso</span>}
            {item.key === "registro" && <span className="ml-1.5 text-xs text-muted-foreground">{report.logTotal}</span>}
          </Link>
        ))}
      </nav>
      <div className="mt-4">
        {view === "pessoas" && <ByPersonView people={report.byPerson} personHref={personHref} />}
        {view === "grades" && <ByGradeView grades={report.byGrade} unused={report.unusedGrades} />}
        {view === "registro" && (
          <LogView items={report.log} page={report.logPage} pages={report.logPages} total={report.logTotal} pageHref={(target) => withQuery("/management/team-usage/grades", { view: "registro", page: String(target) })} />
        )}
      </div>

      <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-cyan-700" />
        Conta como uso de uma grade: abrir a mensagem pronta para WhatsApp, copiar a mensagem ou baixar o PDF. Sessões de &quot;Acessar como&quot; não contam. O registro começou em 06/10/2026.
      </p>
    </>
  );
}

function Hero({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/7 p-3">
      <dt className="text-xs font-medium text-cyan-100">{label}</dt>
      <dd className="mt-1 text-2xl font-bold tabular-nums text-white">{value}</dd>
      <dd className="mt-0.5 truncate text-[11px] text-slate-300">{detail}</dd>
    </div>
  );
}
