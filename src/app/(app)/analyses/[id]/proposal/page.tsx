import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { getAnalysisDetail } from "@/repositories/analysis-repository";
import { buildAnalysisViewModel } from "@/features/analyses/view-model";
import { getSystemSettings } from "@/repositories/settings-repository";
import { buildCommercialProposal } from "@/domain/commercial/proposal";
import { PrintProposalButton } from "@/features/analyses/components/print-proposal-button";
import { getAcademicCalendar } from "@/repositories/academic-calendar-repository";
import { zonedDateParts } from "@/lib/time";

export const metadata: Metadata = { title: "Proposta de aproveitamento" };
export const dynamic = "force-dynamic";

export default async function CommercialProposalPage({ params }: PageProps<"/analyses/[id]/proposal">) {
  const user = await requireUser();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const detail = await getAnalysisDetail(id);
  if (!detail || (user.role !== "ADMIN" && detail.createdById !== user.id)) notFound();
  const latestProjectionYear = Math.max(0, ...detail.projections.map((projection) => Number(projection.term.slice(0, 4)) || 0));
  const [settings, calendarTerms] = await Promise.all([
    getSystemSettings(),
    getAcademicCalendar(Math.max(zonedDateParts().year + 10, latestProjectionYear)),
  ]);
  const vm = buildAnalysisViewModel(detail, calendarTerms);
  if (vm.status !== "COMPLETED") notFound();
  const proposal = buildCommercialProposal({
    studentName: vm.studentName,
    courseName: vm.courseName,
    totalSubjects: vm.totals.total,
    exemptedSubjects: vm.totals.exempted,
    totalPeriods: Math.max(0, ...vm.totals.periods),
    projectedPeriods: vm.semestersRemaining,
    estimatedCompletionTerm: vm.estimatedCompletionTerm,
  });

  return (
    <main className="proposal-print mx-auto max-w-3xl space-y-8 bg-white p-6 text-slate-900 sm:p-12">
      <header className="border-b-4 border-brand-cyan pb-6">
        <p className="text-sm font-bold uppercase tracking-[.18em] text-brand-cyan">{settings.institutionName}</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Seu aproveitamento curricular</h1>
        <p className="mt-2 text-slate-600">Uma visão simples do caminho que você já percorreu.</p>
      </header>
      <section>
        <p className="text-lg">Olá, <strong>{vm.studentName ?? "candidato(a)"}</strong>.</p>
        <p className="mt-2 text-slate-700">A análise para <strong>{vm.courseName ?? "o curso escolhido"}</strong> identificou avanços importantes na sua jornada.</p>
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        <Metric value={`${vm.totals.exempted}`} label="disciplinas aproveitadas" />
        <Metric value={`${proposal.exemptedPercentage}%`} label="da grade já validada" />
        <Metric value={proposal.savedTerms !== null ? `${proposal.savedTerms} semestres` : "—"} label="redução estimada no percurso" />
      </section>
      <section className="rounded-2xl bg-brand-navy p-6 text-white">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand-gold">Próximo marco</p>
        <p className="mt-2 text-2xl font-bold">{vm.estimatedCompletionTerm ? `Conclusão estimada: ${vm.estimatedCompletionSummary}` : "Previsão em confirmação"}</p>
      </section>
      <section className="space-y-2 text-sm leading-6 text-slate-600">
        <h2 className="font-semibold text-slate-900">Como chegamos a esta previsão</h2>
        <p>Foram consideradas as dispensas identificadas no resultado do SIAA e a organização acadêmica prevista para a sua entrada.</p>
        <p>A projeção é informativa e pode variar conforme oferta de disciplinas, efetivação de matrícula, regras institucionais e condições comerciais vigentes.</p>
      </section>
      <PrintProposalButton />
    </main>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return <div className="rounded-xl border border-slate-200 p-4"><div className="text-2xl font-bold text-brand-navy">{value}</div><div className="mt-1 text-sm text-slate-600">{label}</div></div>;
}
