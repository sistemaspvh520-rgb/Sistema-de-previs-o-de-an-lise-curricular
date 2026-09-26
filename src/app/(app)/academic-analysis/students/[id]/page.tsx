import { presentAcademicSnapshot } from "@/services/academic-documents/presentation";
import { StudentRequestsList } from "@/features/student-portal/requests-list";
import { isProcessingFresh } from "@/services/student-portal/processing";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, FilePenLine, UploadCloud, Sparkles, CalendarClock, MapPin } from "lucide-react";
import { findPolo } from "@/domain/polos";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/session";
import { requireEnrollment, accessStatus } from "@/services/student-portal/access";
import { PortalAccessCard } from "@/features/student-portal/student-access-panel";
import { viewStudentPortalAction } from "@/features/student-portal/actions";
import { StudentUpload } from "@/features/student-portal/upload";
import { StudentAnalysisView } from "@/features/student-portal/analysis-view";
import { Button } from "@/components/ui/button";
import { getSystemSettings } from "@/repositories/settings-repository";
import { academicStatusOutcome } from "@/domain/academic-analysis/rules";
import { documentLabels } from "@/services/academic-documents/classifier";
import { BlurFade } from "@/components/magic/blur-fade";
import { DotPattern } from "@/components/magic/dot-pattern";
import { NumberTicker } from "@/components/magic/number-ticker";

export const dynamic = "force-dynamic";

const dateTime = (date: Date) =>
  date.toLocaleString("pt-BR", { timeZone: "America/Porto_Velho", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission("students:manage");
  const { id } = await params;
  const student = await requireEnrollment(user, id).catch(() => null);
  if (!student) notFound();
  const [settings, history, job, requests, reused] = await Promise.all([
    getSystemSettings(),
    prisma.academicAnalysisVersion.findMany({
      where: { enrollmentId: id },
      orderBy: { version: "desc" },
      take: 50,
      include: { actor: { select: { name: true } } },
    }),
    prisma.academicAnalysisSource.findFirst({ where: { enrollmentId: id }, orderBy: { updatedAt: "desc" } }),
    prisma.auditLog.count({
      where: { entityType: "StudentEnrollment", entityId: id, action: { in: ["STUDENT_UPLOAD", "TUTOR_UPLOAD", "ANALYSIS_REUSED"] } },
    }),
    prisma.auditLog.count({ where: { entityType: "StudentEnrollment", entityId: id, action: "ANALYSIS_REUSED" } }),
  ]);

  const snapshot = student.currentVersion ? presentAcademicSnapshot(student.currentVersion) : null;
  const mainGrid = snapshot?.disciplines.filter((row) => row.inMainCurriculum) ?? [];
  const completed = mainGrid.filter((row) => ["COMPLETED", "EXEMPT"].includes(academicStatusOutcome(row.normalizedStatus))).length;
  const progress = snapshot?.plannedWorkload && snapshot.integralizedWorkload != null
    ? Math.round((snapshot.integralizedWorkload / snapshot.plannedWorkload) * 100)
    : mainGrid.length ? Math.round((completed / mainGrid.length) * 100) : 0;
  const mappingPending = Boolean(snapshot && (!snapshot.result.currentPeriodConfirmed || mainGrid.some((row) => row.period === null)));
  const initials = student.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const stats = snapshot
    ? [
        { label: "Período atual", value: snapshot.result.currentPeriod ?? 0, suffix: "º", empty: !snapshot.result.currentPeriod },
        { label: "Pendências", value: snapshot.result.previousPending, empty: mappingPending },
        { label: "Em andamento", value: snapshot.result.previousAlreadyAdded, empty: mappingPending },
        { label: "Progresso", value: progress, suffix: "%", empty: false },
      ]
    : [];

  return (
    <div className="space-y-6">
      <Link href="/academic-analysis/students" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-[#003B71]">
        <ArrowLeft className="size-4" /> Voltar aos alunos
      </Link>

      <BlurFade as="section" className="relative isolate overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#003B71_0%,#06508c_58%,#0a78b4_100%)] p-5 text-white shadow-[0_30px_60px_-40px_rgba(0,59,113,0.9)] sm:p-7">
        <DotPattern className="-z-10 text-white/15" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 -z-10 size-80 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="min-w-0">
            <div className="flex items-start gap-4">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/15 text-lg font-semibold ring-1 ring-white/25 backdrop-blur sm:size-16 sm:text-xl">
                {initials}
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold tracking-[0.18em] text-cyan-100 uppercase">Aluno</p>
                <h1 className="mt-1 break-words text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{student.name}</h1>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-white/10 px-2.5 py-1 ring-1 ring-white/15">RGM {student.rgm}</span>
                  <span className="max-w-full truncate rounded-full bg-white/10 px-2.5 py-1 ring-1 ring-white/15">{student.courseName ?? "Curso ainda não identificado"}</span>
                  {snapshot?.documentType && (
                    <span className="rounded-full bg-brand-gold/15 px-2.5 py-1 text-brand-gold ring-1 ring-brand-gold/30">{documentLabels[snapshot.documentType]}</span>
                  )}
                </div>
                {student.owner && (
                  <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-white/75">
                    <MapPin className="size-3.5 shrink-0" />
                    Responsável: {student.owner.name}
                    {student.owner.poloCode ? (
                      <> · Polo {findPolo(student.owner.poloCode)?.name ?? student.owner.poloCode}</>
                    ) : can(user.role, "users:manage") ? (
                      <Link href="/settings/users" className="text-brand-gold underline-offset-2 hover:underline">· sem polo — o aluno vê os contatos de todos os polos (definir polo)</Link>
                    ) : (
                      <span className="text-brand-gold">· sem polo — o aluno vê os contatos de todos os polos</span>
                    )}
                  </p>
                )}
              </div>
            </div>

            {snapshot ? (
              <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {stats.map((stat) => (
                  <div key={stat.label} className="glass-surface rounded-2xl px-4 py-3">
                    <p className="text-[11px] font-medium text-white/65">{stat.label}</p>
                    <p className="mt-1 text-2xl font-semibold">
                      {stat.empty ? "—" : <NumberTicker value={stat.value} suffix={stat.suffix} />}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-6 rounded-2xl bg-white/10 p-4 text-sm text-white/80 ring-1 ring-white/15">
                Nenhuma análise ainda. Envie o histórico ou extrato abaixo para gerar o resultado.
              </p>
            )}

            {mappingPending && student.currentVersion && (
              <Link
                href={`/academic-analysis/${student.currentVersion.reviewId}`}
                className="mt-3 flex items-center gap-2 rounded-xl bg-brand-gold/15 px-3 py-2 text-sm text-brand-gold ring-1 ring-brand-gold/30 transition-colors hover:bg-brand-gold/25"
              >
                <Sparkles className="size-4 shrink-0" /> Períodos ainda não mapeados — abra a análise para o mapeamento automático.
              </Link>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <form action={viewStudentPortalAction}>
                <input name="enrollmentId" type="hidden" value={id} />
                <Button className="h-10 bg-white text-[#003B71] shadow-lg hover:bg-cyan-50">
                  <Eye className="size-4" /> Visualizar como aluno
                </Button>
              </form>
              {student.currentVersion && (
                <Button asChild variant="outline" className="h-10 border-white/25 bg-white/5 text-white hover:bg-white/15 hover:text-white">
                  <Link href={`/academic-analysis/${student.currentVersion.reviewId}`}>
                    <FilePenLine className="size-4" /> Análise completa e correções
                  </Link>
                </Button>
              )}
              <Button asChild variant="outline" className="h-10 border-white/25 bg-white/5 text-white hover:bg-white/15 hover:text-white">
                <a href="#atualizar">
                  <UploadCloud className="size-4" /> Enviar novo documento
                </a>
              </Button>
            </div>
            {student.currentVersion && (
              <p className="mt-4 flex items-center gap-1.5 text-xs text-white/65">
                <CalendarClock className="size-3.5" />
                Última análise em {dateTime(student.currentVersion.createdAt)} ·{" "}
                {student.currentVersion.actorRole === "STUDENT" ? "enviada pelo aluno" : "atualizada pela equipe acadêmica"}
              </p>
            )}
          </div>

          <PortalAccessCard
            student={{ id: student.id, name: student.name, rgm: student.rgm, courseName: student.courseName }}
            access={{
              status: accessStatus(student.studentUser) as "ATIVO" | "CONVITE PENDENTE" | "BLOQUEADO" | "SEM ACESSO",
              email: student.studentUser?.email ?? null,
              active: student.studentUser?.isActive ?? false,
              invited: student.studentUser?.mustChangePassword ?? false,
              lastLogin: student.studentUser?.lastLoginAt ? dateTime(student.studentUser.lastLoginAt) : null,
            }}
          />
        </div>
      </BlurFade>

      {snapshot && student.currentVersion && (
        <BlurFade delay={0.08}>
          <StudentAnalysisView snapshot={snapshot} createdAt={student.currentVersion.createdAt} />
        </BlurFade>
      )}

      <BlurFade delay={0.14} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start">
        <div className="min-w-0 space-y-6">
          <div id="atualizar" className="scroll-mt-24">
            {job?.status === "FAILED" && (
              <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                {job.errorMessage}
              </p>
            )}
            <StudentUpload enrollmentId={id} maxMb={Math.min(settings.maxUploadMb, 20)} support initialProcessing={isProcessingFresh(job)} />
          </div>
          <StudentRequestsList enrollmentId={id} support />
        </div>

        <section id="historico" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_16px_40px_-36px_rgba(15,42,66,0.62)] sm:p-6">
          <h2 className="text-lg font-semibold text-[#003B71]">Linha do tempo</h2>
          <p className="mt-1 text-xs text-slate-500">
            {requests} envio(s) · {reused} reaproveitamento(s) sem nova análise
          </p>
          <ol className="relative mt-5 space-y-5 border-l-2 border-brand-cyan/20 pl-5">
            {history.map((version, index) => (
              <li key={version.id} className="relative">
                <span
                  aria-hidden="true"
                  className={index === 0
                    ? "absolute -left-[27px] top-1 size-3 rounded-full bg-brand-cyan ring-4 ring-brand-cyan-50 animate-pulse-ring"
                    : "absolute -left-[26px] top-1.5 size-2.5 rounded-full bg-slate-300 ring-4 ring-white"}
                />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    Versão {version.version}
                    {index === 0 && <span className="ml-2 rounded-full bg-brand-cyan px-2 py-0.5 text-[10px] font-semibold text-white">Atual</span>}
                  </p>
                  <Link href={`/portal?student=${id}&version=${version.id}`} className="text-xs font-medium text-brand-cyan-700 hover:underline">
                    Ver versão
                  </Link>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {dateTime(version.createdAt)} · {version.actor.name} ·{" "}
                  {version.origin === "TUTOR_MANUAL_CORRECTION" ? "Correção" : version.origin === "LEGACY_IMPORT" ? "Análise vinculada" : "Documento atualizado"}
                </p>
                {(version.changeSummary as string[]).length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-600">
                    {(version.changeSummary as string[]).slice(0, 4).map((change, i) => (
                      <li key={i}>• {change}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
          {history.length === 0 && <p className="mt-4 text-sm text-slate-500">As versões aparecerão após a primeira análise.</p>}
        </section>
      </BlurFade>
    </div>
  );
}
