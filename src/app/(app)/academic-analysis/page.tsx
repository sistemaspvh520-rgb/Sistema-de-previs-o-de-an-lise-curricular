import { CampaignBanner } from "@/components/shared/campaign-banner";
import type { Metadata } from "next";
import { PortalHeroArtwork } from "@/components/shared/portal-hero-artwork";
import Link from "next/link";
import { requirePagePermission } from "@/lib/session";
import { getSystemSettings } from "@/repositories/settings-repository";
import { listAcademicGridReviews } from "@/repositories/academic-analysis-repository";
import { AcademicGridUploadForm } from "@/features/academic-analysis/upload-form";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AcademicGridSnapshot } from "@/domain/academic-analysis/types";
import { DeleteAcademicGridReviewButton } from "@/features/academic-analysis/delete-review-button";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, Search } from "lucide-react";
import { listAcademicGridReviewOwners } from "@/repositories/academic-analysis-repository";
import type { AcademicGridReviewStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Análise acadêmica" };
export const dynamic = "force-dynamic";

const statusLabel: Record<AcademicGridReviewStatus, string> = {
  NO_PENDING: "Sem pendências",
  CAN_ADD: "Há vagas",
  NEAR_LIMIT: "Próximo do limite",
  LIMIT_REACHED: "Limite atingido",
  MANUAL_REVIEW_REQUIRED: "Revisão manual",
};

const periods = Array.from({ length: 20 }, (_, index) => index + 1);

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AcademicAnalysisPage({ searchParams }: PageProps<"/academic-analysis">) {
  const user = await requirePagePermission("academic:manage");
  const params = await searchParams;
  const query = firstParam(params.q)?.trim().slice(0, 100) ?? "";
  const responsibleCandidate = firstParam(params.responsavel) ?? "";
  const responsibleId = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(responsibleCandidate) ? responsibleCandidate : "";
  const statusValue = firstParam(params.status) ?? "";
  const periodValue = Number(firstParam(params.periodo));
  const period = Number.isInteger(periodValue) && periodValue >= 1 && periodValue <= 20 ? periodValue : undefined;
  const status = Object.hasOwn(statusLabel, statusValue) ? statusValue as AcademicGridReviewStatus : undefined;
  const isAdmin = user.role === "ADMIN";
  const [settings, reviewResult, owners] = await Promise.all([
    getSystemSettings(),
    listAcademicGridReviews(user.id, isAdmin, { query, responsibleId: isAdmin ? responsibleId : undefined, status, period }),
    isAdmin ? listAcademicGridReviewOwners() : Promise.resolve([]),
  ]);
  const reviews = reviewResult.items;
  const hasFilters = Boolean(query || (isAdmin && responsibleId) || status || period);
  return <div className="academic-analysis-shell mx-auto max-w-[1440px] space-y-6 pb-8">
    <section className="relative isolate overflow-hidden rounded-2xl bg-brand-navy shadow-sm sm:rounded-3xl md:min-h-[260px] lg:min-h-[280px]">
      {/* No celular a foto é um banner livre e o texto vem abaixo; a partir do tablet o texto fica sobre a área escura. */}
      <div className="relative aspect-[16/7] w-full md:absolute md:inset-0 md:aspect-auto">
        <PortalHeroArtwork className="z-0 object-[70%_30%] md:object-center" />
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-brand-navy md:hidden" />
        <div aria-hidden="true" className="absolute inset-0 hidden bg-[linear-gradient(90deg,rgba(7,53,99,0.98)_0%,rgba(7,53,99,0.96)_28%,rgba(7,53,99,0.86)_38%,rgba(7,53,99,0.68)_48%,rgba(7,53,99,0.42)_58%,rgba(7,53,99,0.16)_68%,rgba(7,53,99,0.04)_76%,transparent_84%)] md:block" />
      </div>
      <div className="relative z-10 flex px-5 pb-6 text-white sm:px-8 md:min-h-[260px] md:items-center md:px-10 md:py-10 lg:min-h-[280px] lg:px-14">
        <div className="w-full max-w-xl text-left">
          <p className="shimmer-text text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-gold sm:text-xs">Acompanhamento acadêmico</p>
          <h1 className="mt-2 text-[clamp(1.45rem,6.4vw,2.25rem)] font-semibold leading-[1.1] tracking-tight md:mt-3 md:text-4xl"><span className="block whitespace-nowrap">Uma jornada mais clara</span><span className="block whitespace-nowrap">até a formatura.</span></h1>
          <p className="mt-3 max-w-lg text-sm leading-6 text-white/85 md:mt-4 md:text-base">Organize a trajetória do aluno com uma leitura objetiva do documento acadêmico, das disciplinas e das próximas etapas.</p>
        </div>
      </div>
    </section>
    <section className="shine-border animate-blur-fade rounded-2xl border bg-card p-4 shadow-[0_24px_50px_-36px_rgba(0,59,113,0.55)] sm:p-6 lg:p-8">
      <div className="mb-4">
        <h2 className="text-base font-semibold tracking-tight text-slate-900">Nova análise acadêmica</h2>
        <p className="mt-1 text-sm text-slate-600">Envie um Histórico Oficial, Histórico Simples ou Extrato/Grade Curricular em PDF para organizar as disciplinas, identificar pendências e estimar os próximos passos do aluno.</p>
      </div>
      <AcademicGridUploadForm maxMb={Math.min(settings.maxUploadMb, 20)} />
    </section>
    <details open className="rounded-2xl border border-slate-300/70 bg-white/75 p-4 shadow-[0_18px_45px_-40px_rgba(15,42,66,0.55)] backdrop-blur-sm sm:p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-2 py-1 [&::-webkit-details-marker]:hidden">
        <span><span className="block text-lg font-semibold tracking-tight text-slate-900">Histórico de análises</span><span className="mt-0.5 block text-sm text-slate-600">Os dados e correções ficam vinculados ao responsável pela análise.</span></span>
        <span className="shrink-0 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700">{reviews.length < reviewResult.total ? `${reviews.length} de ${reviewResult.total}` : reviewResult.total} {reviewResult.total === 1 ? "registro" : "registros"}</span>
      </summary>
      <section className="mt-4 border-t border-slate-200/80 pt-4">
      <form method="get" action="/academic-analysis" className="mb-5 rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50/90 via-white to-slate-50 p-3 sm:p-4">
        <div className={`grid gap-3 ${isAdmin ? "sm:grid-cols-2 xl:grid-cols-[minmax(240px,1.6fr)_minmax(205px,1fr)_minmax(175px,.8fr)_minmax(205px,1fr)_auto]" : "sm:grid-cols-[minmax(240px,1.6fr)_minmax(175px,.8fr)_minmax(205px,1fr)_auto]"}`}>
          <label className="block min-w-0 text-xs font-semibold text-slate-600">Buscar aluno
            <span className="relative mt-1.5 block"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input name="q" defaultValue={query} placeholder="Nome, RGM ou curso" className="h-10 border-slate-200 bg-white pl-9" /></span>
          </label>
          {isAdmin && <label className="block min-w-0 text-xs font-semibold text-slate-600">Responsável
            <span className="relative mt-1.5 block"><select name="responsavel" defaultValue={responsibleId} className="h-10 w-full appearance-none whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 pr-10 text-sm font-normal text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">Todos os responsáveis</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}{owner.isActive ? "" : " (inativo)"}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /></span>
          </label>}
          <label className="block min-w-0 text-xs font-semibold text-slate-600">Período
            <span className="relative mt-1.5 block"><select name="periodo" defaultValue={period ?? ""} className="h-10 w-full appearance-none whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 pr-10 text-sm font-normal text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">Todos os períodos</option>{periods.map((item) => <option key={item} value={item}>{item}º período</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /></span>
          </label>
          <label className="block min-w-0 text-xs font-semibold text-slate-600">Situação
            <span className="relative mt-1.5 block"><select name="status" defaultValue={status ?? ""} className="h-10 w-full appearance-none whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 pr-10 text-sm font-normal text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">Todas as situações</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /></span>
          </label>
          <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-1"><Button type="submit" className="h-10 flex-1 xl:flex-none"><Search aria-hidden="true" className="mr-2 size-4" />Buscar</Button>{hasFilters && <Link href="/academic-analysis" className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Limpar</Link>}</div>
        </div>
        <p className="mt-2 px-1 text-xs text-slate-500">{isAdmin ? "Pesquise e filtre todas as análises pelo aluno ou responsável." : "Você visualiza somente as análises registradas por você."} Exibindo os 50 resultados mais recentes que correspondem aos filtros.</p>
      </form>
      {reviews.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{reviews.map((review) => {
        const snapshot = review.snapshot as unknown as AcademicGridSnapshot;
        const accent = review.status === "MANUAL_REVIEW_REQUIRED" ? "border-l-amber-500" : review.status === "LIMIT_REACHED" ? "border-l-rose-500" : "border-l-sky-500";
        return <Card key={review.id} className={`group relative h-full overflow-hidden rounded-2xl border border-slate-200 border-l-4 ${accent} bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-t-sky-200 hover:shadow-lg`}><CardContent className="flex h-full flex-col p-4 sm:p-5"><Link href={`/academic-analysis/${review.id}`} className="group/link min-w-0 flex-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"><div className="truncate font-semibold text-slate-900 group-hover/link:text-brand-navy">{review.studentName ?? review.sourceFilename}</div><div className="mt-1 truncate text-sm text-slate-600">{review.courseName ?? "Curso não identificado"}{review.rgm ? ` · RGM ${review.rgm}` : ""}</div><div className="mt-3 flex flex-wrap items-center gap-2"><Badge variant="outline" className="border-slate-300 bg-slate-50">{review.currentPeriod ? `${review.currentPeriod}º período` : "Período a confirmar"}</Badge><Badge variant={review.status === "MANUAL_REVIEW_REQUIRED" ? "destructive" : "secondary"}>{statusLabel[review.status]}</Badge></div><div className="mt-3 text-xs leading-5 text-slate-600">{snapshot.result.previousPending} pendências · {snapshot.disciplines.length} componentes{isAdmin ? ` · ${review.createdBy.name}` : ""}</div><span className="mt-3 inline-block text-sm font-semibold text-brand-navy">{review.status === "MANUAL_REVIEW_REQUIRED" ? "Abrir conferência →" : "Abrir análise →"}</span></Link><div className="mt-3 flex justify-end border-t border-slate-100 pt-3"><DeleteAcademicGridReviewButton reviewId={review.id} compact /></div></CardContent></Card>;
      })}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center"><p className="font-medium text-slate-800">{hasFilters ? "Nenhum aluno encontrado com esses filtros." : "Nenhuma análise acadêmica registrada ainda."}</p>{hasFilters && <p className="mt-1 text-sm text-slate-500">Experimente buscar pelo nome completo, RGM ou limpar os filtros.</p>}</div>}
      </section>
    </details>
    <CampaignBanner />
  </div>;
}
