import { CampaignBanner } from "@/components/shared/campaign-banner";
import type { AcademicGridSnapshot } from "@/domain/academic-analysis/types";
import { presentAcademicSnapshot } from "@/services/academic-documents/presentation";
import { StudentRequestsList } from "@/features/student-portal/requests-list";
import { PortalEffects } from "@/features/student-portal/effects";
import Image from "next/image";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { requireEnrollment } from "@/services/student-portal/access";
import { recordAudit } from "@/services/audit-log/audit-log";
import { StudentAnalysisView } from "@/features/student-portal/analysis-view";
import { StudentUpload } from "@/features/student-portal/upload";
import { ChangePasswordForm } from "@/features/account/change-password-form";
import { portalLogoutAction } from "@/features/auth/actions";
import { dismissWelcomeAction } from "@/features/student-portal/actions";
import { getSystemSettings } from "@/repositories/settings-repository";
import { isProcessingFresh } from "@/services/student-portal/processing";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Minha Análise Acadêmica",
  referrer: "no-referrer" as const,
};
const dateLabel = (date: Date) =>
  date.toLocaleDateString("pt-BR", {
    timeZone: "America/Porto_Velho",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
export default async function StudentPortalPage({
  searchParams,
}: {
  searchParams: Promise<{
    student?: string;
    version?: string;
    history?: string;
    requests?: string;
  }>;
}) {
  const user = await getSessionUser({ allowStudent: true });
  if (!user) redirect("/portal/login");
  const params = await searchParams;
  const support = user.role !== "STUDENT";
  if (support && !params.student) redirect("/academic-analysis/students");
  const enrollment = await requireEnrollment(user, params.student).catch(
    () => null,
  );
  if (!enrollment) notFound();
  if (support)
    await recordAudit({
      userId: user.id,
      action: "TUTOR_VIEWED_AS_STUDENT",
      entityType: "StudentEnrollment",
      entityId: enrollment.id,
    });
  const page = Math.max(
    1,
    Math.min(10000, Math.floor(Number(params.history) || 1)),
  );
  const [history, job, settings, historyCount] = await Promise.all([
    prisma.academicAnalysisVersion.findMany({
      where: { enrollmentId: enrollment.id },
      orderBy: { version: "desc" },
      skip: (page - 1) * 20,
      take: 20,
    }),
    prisma.academicAnalysisSource.findFirst({
      where: { enrollmentId: enrollment.id },
      orderBy: { updatedAt: "desc" },
    }),
    getSystemSettings(),
    prisma.academicAnalysisVersion.count({
      where: { enrollmentId: enrollment.id },
    }),
  ]);
  if (params.version && !z.string().uuid().safeParse(params.version).success)
    notFound();
  const selected = params.version
    ? await prisma.academicAnalysisVersion.findFirst({
        where: { id: params.version, enrollmentId: enrollment.id },
        include: { preferredSource: true },
      })
    : enrollment.currentVersion;
  if (params.version && !selected) notFound();
  const previous = selected && selected.id !== enrollment.currentVersionId;
  const base = support ? `/portal?student=${enrollment.id}` : "/portal";
  const withParam = (key: string, value: string) =>
    `${base}${base.includes("?") ? "&" : "?"}${key}=${value}`;
  const processing = isProcessingFresh(job);
  const snapshot = selected ? presentAcademicSnapshot(selected) : undefined;
  return (
    <PortalEffects>
      <div className="portal-dashboard min-h-dvh bg-[#f5f8fc] text-slate-900">
        {support && (
          <div className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-b border-yellow-300 bg-[#FEF84C] px-4 py-3 text-center text-sm text-[#003B71]">
            <strong>
              Você está visualizando o portal de {enrollment.name} como tutor.
            </strong>
            <Link
              href={`/academic-analysis/students/${enrollment.id}`}
              className="min-h-10 rounded-lg border border-[#003B71]/25 px-3 py-2 font-semibold"
            >
              Sair da visualização
            </Link>
          </div>
        )}
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
            <Link href={base}>
              <Image
                src="/brand/logo-cruzeiro-do-sul-virtual.png"
                alt="Cruzeiro do Sul Virtual"
                width={200}
                height={67}
                className="h-auto w-36 sm:w-48"
                priority
              />
            </Link>
            <div className="flex items-center gap-3">
              <a
                href="#minha-conta"
                className="flex min-h-11 items-center gap-2 text-sm font-medium"
              >
                <span className="grid size-9 place-items-center rounded-full bg-sky-100 text-[#003B71]">
                  {enrollment.name[0]}
                </span>
                <span className="max-w-24 truncate sm:max-w-40">
                  {enrollment.name.split(" ")[0]}
                </span>
              </a>
              {!support && (
                <form action={portalLogoutAction}>
                  <button className="min-h-11 px-2 text-sm text-slate-500">
                    Sair
                  </button>
                </form>
              )}
            </div>
          </div>
          <nav
            aria-label="Portal do aluno"
            className="mx-auto flex max-w-6xl justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs font-semibold text-[#003B71] sm:justify-start sm:gap-8 sm:px-6 sm:text-sm"
          >
            <Link href={base}>Minha análise</Link>
            <a href="#minhas-solicitacoes">Minhas solicitações</a>
            <a href="#minha-conta">Conta</a>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl space-y-6 px-4 py-7 sm:px-6 sm:py-10">
          {!support && !enrollment.welcomedAt && (
            <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
              <h2 className="font-semibold text-[#003B71]">
                Bem-vindo ao seu Portal Acadêmico.
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Neste espaço você acompanha sua análise acadêmica e pode enviar
                um documento acadêmico atualizado quando houver mudanças.
              </p>
              <form action={dismissWelcomeAction}>
                <button className="mt-3 min-h-11 rounded-xl bg-[#003B71] px-4 text-sm font-medium text-white">
                  Acessar minha análise
                </button>
              </form>
            </section>
          )}
          <div>
            <p className="text-sm text-slate-500">
              Olá, {enrollment.name.split(" ")[0]}.
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#003B71] sm:text-3xl">
              Minha Análise Acadêmica
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {enrollment.courseName ?? "Curso aguardando documento"}{" "}
              <span className="mx-2 text-slate-300">/</span> RGM{" "}
              {enrollment.rgm}
            </p>
            {selected && (
              <p className="mt-1 text-xs text-slate-500">
                {selected.actorRole === "STUDENT"
                  ? "Atualizado por você"
                  : "Atualizado pela equipe acadêmica"}{" "}
                em {dateLabel(selected.createdAt)}.
              </p>
            )}
          </div>
          {previous && (
            <div
              role="status"
              className="flex flex-wrap justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"
            >
              <strong>Esta é uma versão anterior.</strong>
              <Link href={base} className="underline">
                Voltar à análise atual
              </Link>
            </div>
          )}
          {job?.status === "FAILED" && (
            <p
              role="alert"
              className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"
            >
              {job.errorMessage} Você pode tentar novamente em “Atualizar minha
              análise”.
            </p>
          )}
          {snapshot && selected ? (
            <StudentAnalysisView
              snapshot={snapshot}
              createdAt={selected.createdAt}
            />
          ) : (
            <section className="rounded-2xl border border-dashed bg-white p-8 text-center">
              <h2 className="text-lg font-semibold text-[#003B71]">
                Sua jornada começa aqui
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">
                Ainda não há uma análise disponível. Envie um documento acadêmico
                atualizado ou aguarde a atualização pela equipe acadêmica.
              </p>
            </section>
          )}
          {!previous && (
            <StudentUpload
              enrollmentId={enrollment.id}
              maxMb={Math.min(settings.maxUploadMb, 20)}
              support={support}
              initialProcessing={Boolean(processing)}
            />
          )}
          <section
            id="historico"
            className="rounded-2xl border bg-white p-5 sm:p-6"
          >
            <h2 className="text-lg font-semibold text-[#003B71]">
              Atualizações da sua análise
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Somente as mudanças na sua situação acadêmica aparecem aqui.
            </p>
            <ol className="mt-5 divide-y">
              {history.map((version) => {
                const value =
                  version.snapshot as unknown as AcademicGridSnapshot;
                return (
                  <li key={version.id} className="py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <Link
                          href={withParam("version", version.id)}
                          className="font-medium text-[#003B71] underline-offset-4 hover:underline"
                        >
                          {dateLabel(version.createdAt)}
                        </Link>
                        {version.id === enrollment.currentVersionId && (
                          <span className="ml-3 rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800">
                            Atual
                          </span>
                        )}
                        <p className="mt-2 text-sm text-slate-500">
                          {value.result.previousPending} pendências ·{" "}
                          {value.result.currentPeriod ?? "—"}º período
                        </p>
                      </div>
                      <Link
                        href={withParam("version", version.id)}
                        className="min-h-11 rounded-lg border px-4 py-3 text-sm"
                      >
                        Ver análise
                      </Link>
                    </div>
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer py-2 font-medium text-slate-600">
                        Ver o que mudou
                      </summary>
                      <ul className="space-y-2 border-l-2 border-sky-100 pl-4 text-slate-600">
                        {(version.changeSummary as string[]).map(
                          (change, index) => (
                            <li key={index}>{change}</li>
                          ),
                        )}
                      </ul>
                    </details>
                  </li>
                );
              })}
            </ol>
            {history.length === 0 && (
              <p className="mt-4 text-sm text-slate-500">
                As atualizações aparecerão após sua primeira análise.
              </p>
            )}
            <div className="flex justify-between text-sm">
              {page > 1 && (
                <Link href={withParam("history", String(page - 1))}>
                  Mais recentes
                </Link>
              )}
              {page * 20 < historyCount && (
                <Link href={withParam("history", String(page + 1))}>
                  Atualizações anteriores
                </Link>
              )}
            </div>
          </section>
          <StudentRequestsList
            enrollmentId={enrollment.id}
            support={support}
            page={Math.max(
              1,
              Math.min(10000, Math.floor(Number(params.requests) || 1)),
            )}
          />
          <details
            id="minha-conta"
            className="rounded-2xl border bg-white p-5 sm:p-6"
          >
            <summary className="cursor-pointer font-semibold text-[#003B71]">
              Minha conta
            </summary>
            <p className="my-4 break-all text-sm text-slate-600">
              {enrollment.name}
              <br />
              {enrollment.studentUser?.email ?? "Acesso ainda não criado"}
              <br />
              RGM {enrollment.rgm}
            </p>
            {support ? (
              <p className="text-sm text-slate-500">
                A senha é pessoal. Envie um link de recuperação pelo perfil do
                aluno.
              </p>
            ) : (
              <ChangePasswordForm />
            )}
          </details>
          <CampaignBanner />
          <footer className="pb-3 pt-2 text-center text-xs text-slate-400">
            Cruzeiro do Sul Virtual · Portal Acadêmico
          </footer>
        </main>
      </div>
    </PortalEffects>
  );
}
