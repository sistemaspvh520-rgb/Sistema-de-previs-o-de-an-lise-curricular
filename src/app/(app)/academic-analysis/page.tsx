import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { requirePagePermission } from "@/lib/session";
import { getSystemSettings } from "@/repositories/settings-repository";
import { listAcademicGridReviews } from "@/repositories/academic-analysis-repository";
import { AcademicGridUploadForm } from "@/features/academic-analysis/upload-form";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AcademicGridSnapshot } from "@/domain/academic-analysis/types";
import { DeleteAcademicGridReviewButton } from "@/features/academic-analysis/delete-review-button";

export const metadata: Metadata = { title: "Análise acadêmica" };
export const dynamic = "force-dynamic";

const statusLabel: Record<string, string> = {
  NO_PENDING: "Sem pendências",
  CAN_ADD: "Há vagas",
  NEAR_LIMIT: "Próximo do limite",
  LIMIT_REACHED: "Limite atingido",
  MANUAL_REVIEW_REQUIRED: "Revisão manual",
};

export default async function AcademicAnalysisPage() {
  const user = await requirePagePermission("analysis:review");
  const [settings, reviews] = await Promise.all([
    getSystemSettings(),
    listAcademicGridReviews(user.id, user.role === "ADMIN"),
  ]);
  return <div className="academic-analysis-shell mx-auto max-w-[1440px] space-y-6 pb-8">
    <Card className="academic-photo-card relative isolate gap-0 overflow-hidden rounded-2xl border-0 bg-brand-navy py-0 shadow-[0_28px_70px_-34px_rgba(5,35,60,0.8)] sm:rounded-3xl">
      <div className="relative flex min-h-[390px] items-end p-5 sm:min-h-[360px] sm:items-center sm:p-10">
        <Image
          src="/brand/foto_03-academic.jpg"
          alt="Formanda comemorando sua conquista acadêmica"
          fill
          sizes="(max-width: 768px) 100vw, 1200px"
          className="absolute inset-0 -z-20 object-cover object-[68%_25%] sm:object-[64%_34%]"
          preload
        />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(0deg,rgba(4,20,35,0.96)_0%,rgba(7,38,66,0.78)_27%,rgba(7,38,66,0.18)_53%,transparent_72%)] sm:inset-y-0 sm:right-auto sm:w-[58%] sm:bg-[linear-gradient(90deg,rgba(4,20,35,0.98)_0%,rgba(7,38,66,0.9)_55%,rgba(7,38,66,0.42)_83%,transparent_100%)]" />
        <div className="relative z-10 w-full max-w-[28rem] text-left text-white [filter:drop-shadow(0_3px_18px_rgba(0,0,0,0.72))]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Acompanhamento acadêmico</p>
          <CardTitle className="mt-3 max-w-[24rem] text-[2rem] font-semibold leading-[1.08] tracking-tight text-white [text-shadow:0_2px_20px_rgba(0,0,0,0.32)] sm:text-[2.25rem]">Uma jornada mais clara até a formatura.</CardTitle>
          <p className="mt-3 max-w-[27rem] text-sm leading-6 text-slate-100 sm:text-base">Organize a trajetória do aluno com uma leitura objetiva do extrato, das disciplinas e das próximas etapas.</p>
        </div>
      </div>
      <CardContent className="border-t border-white/60 bg-gradient-to-br from-slate-50 via-white to-cyan-50/80 p-4 sm:p-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">Nova análise de grade</h2>
          <p className="mt-1 text-sm text-slate-600">Envie o PDF atualizado do extrato para organizar as disciplinas, identificar pendências e estimar os próximos passos do aluno.</p>
        </div>
        <AcademicGridUploadForm maxMb={Math.min(settings.maxUploadMb, 20)} />
      </CardContent>
    </Card>
    <details open className="rounded-2xl border border-slate-300/60 bg-white/45 p-4 shadow-[0_18px_45px_-40px_rgba(15,42,66,0.55)] backdrop-blur-sm sm:p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span><span className="block text-lg font-semibold tracking-tight text-slate-900">Histórico de análises</span><span className="mt-0.5 block text-sm text-slate-600">Os dados e correções ficam vinculados ao responsável pela análise.</span></span>
        <span className="shrink-0 rounded-full border border-slate-300 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700">{reviews.length} registros</span>
      </summary>
      <section className="mt-4 border-t border-slate-200/80 pt-4">
      {reviews.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{reviews.map((review) => {
        const snapshot = review.snapshot as unknown as AcademicGridSnapshot;
        return <Card key={review.id} className="h-full transition duration-200 hover:-translate-y-0.5 hover:shadow-lg"><CardContent className="flex h-full flex-col p-4"><Link href={`/academic-analysis/${review.id}`} className="group min-w-0 flex-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"><div className="truncate font-semibold text-slate-900">{review.studentName ?? review.sourceFilename}</div><div className="mt-1 truncate text-sm text-muted-foreground">{review.courseName ?? "Curso não identificado"}{review.rgm ? ` · RGM ${review.rgm}` : ""}</div><div className="mt-3 flex flex-wrap items-center gap-2"><Badge variant="outline">{review.currentPeriod ? `${review.currentPeriod}º período` : "Período a confirmar"}</Badge><Badge variant={review.status === "MANUAL_REVIEW_REQUIRED" ? "destructive" : "secondary"}>{statusLabel[review.status] ?? review.status}</Badge></div><div className="mt-2 text-xs text-muted-foreground">{snapshot.result.previousPending} A CURSAR · {snapshot.disciplines.length} componentes · {review.createdBy.name}</div><span className="mt-3 inline-block text-xs font-medium text-brand-navy">{review.status === "MANUAL_REVIEW_REQUIRED" ? "Abrir conferência" : "Abrir análise"}</span></Link>{user.role === "ADMIN" && <div className="mt-3 flex justify-end border-t pt-3"><DeleteAcademicGridReviewButton reviewId={review.id} compact /></div>}</CardContent></Card>;
      })}</div> : <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma análise acadêmica registrada ainda.</div>}
      </section>
    </details>
  </div>;
}
