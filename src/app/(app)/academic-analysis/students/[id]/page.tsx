import { presentAcademicSnapshot } from "@/services/academic-documents/presentation";
import { StudentRequestsList } from "@/features/student-portal/requests-list";
import { isProcessingFresh } from "@/services/student-portal/processing";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/session";
import {
  requireEnrollment,
  accessStatus,
} from "@/services/student-portal/access";
import {
  CreateStudentForm,
  StudentAccessPanel,
} from "@/features/student-portal/student-access-panel";
import { viewStudentPortalAction } from "@/features/student-portal/actions";
import { StudentUpload } from "@/features/student-portal/upload";
import { StudentAnalysisView } from "@/features/student-portal/analysis-view";
import { Button } from "@/components/ui/button";
import { getSystemSettings } from "@/repositories/settings-repository";
export const dynamic = "force-dynamic";
export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
    prisma.academicAnalysisSource.findFirst({
      where: { enrollmentId: id },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.auditLog.count({
      where: {
        entityType: "StudentEnrollment",
        entityId: id,
        action: { in: ["STUDENT_UPLOAD", "TUTOR_UPLOAD", "ANALYSIS_REUSED"] },
      },
    }),
    prisma.auditLog.count({
      where: {
        entityType: "StudentEnrollment",
        entityId: id,
        action: "ANALYSIS_REUSED",
      },
    }),
  ]);
  return (
    <div className="space-y-6">
      <Link
        href="/academic-analysis/students"
        className="text-sm text-slate-500 underline"
      >
        Voltar aos alunos
      </Link>
      <header className="rounded-2xl border bg-white p-5 sm:p-6">
        <h1 className="text-2xl font-semibold text-[#003B71]">
          {student.name}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          RGM {student.rgm} ·{" "}
          {student.courseName ?? "Curso ainda não identificado"}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <form action={viewStudentPortalAction}>
            <input name="enrollmentId" type="hidden" value={id} />
            <Button>Visualizar como aluno</Button>
          </form>
          {student.currentVersion && (
            <Button asChild variant="outline">
              <Link
                href={`/academic-analysis/${student.currentVersion.reviewId}`}
              >
                Visualizar análise / corrigir dados
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <a href="#atualizar">Atualizar análise / enviar PDF</a>
          </Button>
          <Button asChild variant="outline">
            <a href="#historico">Histórico</a>
          </Button>
        </div>
      </header>
      <section className="rounded-2xl border bg-white p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[#003B71]">
              Acesso ao portal
            </h2>
            <p className="mt-2 text-sm">{accessStatus(student.studentUser)}</p>
            <p className="mt-1 break-all text-sm text-slate-500">
              {student.studentUser?.email ?? "Nenhum e-mail vinculado"}
            </p>
          </div>
          <p className="text-xs text-slate-500">
            Último login:{" "}
            {student.studentUser?.lastLoginAt?.toLocaleString("pt-BR", {
              timeZone: "America/Porto_Velho",
            }) ?? "Ainda não acessou"}
          </p>
        </div>
        <CreateStudentForm
          key={student.id}
          student={student}
          hasAccess={Boolean(student.studentUser)}
        />
        {student.studentUser && (
          <StudentAccessPanel
            enrollmentId={id}
            email={student.studentUser.email}
            active={student.studentUser.isActive}
            invited={student.studentUser.mustChangePassword}
          />
        )}
      </section>
      {student.currentVersion && (
        <>
          <p className="text-sm text-slate-500">
            Última análise em{" "}
            {student.currentVersion.createdAt.toLocaleString("pt-BR", {
              timeZone: "America/Porto_Velho",
            })}{" "}
            ·{" "}
            {student.currentVersion.actorRole === "STUDENT"
              ? "Enviada pelo aluno"
              : "Atualizada pela equipe acadêmica"}
          </p>
          <StudentAnalysisView
            snapshot={
              presentAcademicSnapshot(student.currentVersion)
            }
            createdAt={student.currentVersion.createdAt}
          />
        </>
      )}
      <div id="atualizar">
        {job?.status === "FAILED" && (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"
          >
            {job.errorMessage}
          </p>
        )}
        <StudentUpload
          enrollmentId={id}
          maxMb={Math.min(settings.maxUploadMb, 20)}
          support
          initialProcessing={isProcessingFresh(job)}
        />
      </div>
      <StudentRequestsList enrollmentId={id} support />
      <section
        id="historico"
        className="rounded-2xl border bg-white p-5 sm:p-6"
      >
        <h2 className="text-lg font-semibold text-[#003B71]">
          Histórico de atualizações
        </h2>
        <p className="mt-2 text-xs text-slate-500">
          {requests} eventos de solicitação/reutilização · {reused}{" "}
          reutilizações · processamento local sem IA
        </p>
        <ol className="mt-5 divide-y">
          {history.map((version) => (
            <li key={version.id} className="py-4">
              <div className="flex flex-wrap justify-between gap-3">
                <p className="text-sm font-medium">
                  Versão {version.version} ·{" "}
                  {version.createdAt.toLocaleString("pt-BR", {
                    timeZone: "America/Porto_Velho",
                  })}
                </p>
                <Link
                  href={`/portal?student=${id}&version=${version.id}`}
                  className="text-sm text-[#003B71] underline"
                >
                  Visualizar versão
                </Link>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {version.actor.name} ·{" "}
                {version.origin === "TUTOR_MANUAL_CORRECTION"
                  ? "Correção manual"
                  : version.origin === "LEGACY_IMPORT"
                    ? "Análise existente vinculada"
                    : "Extrato atualizado"}
              </p>
              <ul className="mt-3 space-y-1 text-sm text-slate-600">
                {(version.changeSummary as string[]).map((change, index) => (
                  <li key={index}>{change}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
