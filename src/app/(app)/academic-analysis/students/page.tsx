import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import {
  accessStatus,
  enrollmentScope,
} from "@/services/student-portal/access";
import { CreateStudentDialog } from "@/features/student-portal/student-access-panel";
import { LinkLegacyStudent } from "@/features/student-portal/link-legacy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AcademicGridSnapshot } from "@/domain/academic-analysis/types";
import type { Prisma } from "@/generated/prisma/client";
export const dynamic = "force-dynamic";
export const metadata = { title: "Alunos · Análise Acadêmica" };
export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; lpage?: string }>;
}) {
  const user = await requirePagePermission("students:manage");
  const params = await searchParams;
  const query = params.q?.trim().slice(0, 100) ?? "";
  const page = Math.max(1, Math.floor(Number(params.page) || 1));
  const legacyPage = Math.max(1, Math.floor(Number(params.lpage) || 1));
  const filters: Record<string, Prisma.StudentEnrollmentWhereInput> = {
    active: { studentUser: { isActive: true, mustChangePassword: false } },
    pending: { studentUser: { isActive: true, mustChangePassword: true } },
    blocked: { studentUser: { isActive: false } },
    none: { studentUserId: null },
  };
  const where: Prisma.StudentEnrollmentWhereInput = {
    ...enrollmentScope(user),
    ...filters[params.status ?? ""],
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { rgm: { contains: query } },
            {
              studentUser: { email: { contains: query, mode: "insensitive" } },
            },
          ],
        }
      : {}),
  };
  const legacyWhere: Prisma.AcademicGridReviewWhereInput = {
    enrollmentId: null,
    rgm: { not: null },
    ...(can(user.role, "academic:all") ? {} : { createdById: user.id }),
    ...(query
      ? {
          OR: [
            { studentName: { contains: query, mode: "insensitive" } },
            { rgm: { contains: query } },
          ],
        }
      : {}),
  };
  const showLegacy = !params.status || params.status === "none";
  const [students, count, legacy, legacyGroups] = await Promise.all([
    prisma.studentEnrollment.findMany({
      where,
      include: {
        studentUser: {
          select: { email: true, isActive: true, mustChangePassword: true },
        },
        currentVersion: true,
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * 30,
      take: 30,
    }),
    prisma.studentEnrollment.count({ where }),
    showLegacy
      ? prisma.academicGridReview.findMany({
          where: legacyWhere,
          distinct: ["rgm"],
          orderBy: { createdAt: "desc" },
          skip: (legacyPage - 1) * 30,
          take: 30,
          select: { id: true, studentName: true, rgm: true, courseName: true },
        })
      : [],
    showLegacy
      ? prisma.academicGridReview.groupBy({ by: ["rgm"], where: legacyWhere, _count: true })
      : [],
  ]);
  const legacyCount = legacyGroups.length;
  const pagination = (number: number) =>
    `/academic-analysis/students?${new URLSearchParams({ q: query, status: params.status ?? "", page: String(number) })}`;
  const legacyPagination = (number: number) =>
    `/academic-analysis/students?${new URLSearchParams({ q: query, status: params.status ?? "", lpage: String(number) })}#analises-sem-acesso`;
  return (
    <div className="space-y-6">
      <div className="flex animate-blur-fade flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/academic-analysis"
            className="text-sm text-slate-500 hover:underline"
          >
            Análise Acadêmica
          </Link>
          <h1 className="mt-2 bg-gradient-to-r from-[#003B71] via-[#0a5a9a] to-[#0693e3] bg-clip-text text-3xl font-semibold tracking-tight text-transparent">
            Alunos
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Acompanhe a situação acadêmica e gerencie o acesso ao portal.
          </p>
        </div>
        <CreateStudentDialog />
      </div>
      <form className="flex animate-blur-fade flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_14px_36px_-30px_rgba(15,42,66,0.5)] backdrop-blur [animation-delay:60ms]">
        <label className="min-w-40 flex-1 text-xs font-medium">
          Buscar aluno
          <Input
            name="q"
            defaultValue={query}
            placeholder="Nome, RGM ou e-mail"
            className="mt-2"
          />
        </label>
        <label className="text-xs font-medium">
          Status do acesso
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="mt-2 block h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">Todos</option>
            <option value="active">Ativos</option>
            <option value="pending">Convite pendente</option>
            <option value="none">Sem acesso</option>
            <option value="blocked">Bloqueados</option>
          </select>
        </label>
        <Button className="self-end">Pesquisar</Button>
      </form>
      <section className="animate-blur-fade overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_44px_-34px_rgba(15,42,66,0.55)] [animation-delay:120ms]">
        <div className="flex items-center justify-between border-b p-5">
          <h2 className="font-semibold">Acessos dos alunos</h2>
          <span className="rounded-full bg-brand-cyan-50 px-3 py-1 text-xs font-semibold text-brand-cyan-700">{count.toLocaleString("pt-BR")} aluno(s)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gradient-to-r from-slate-50 to-sky-50/60 text-xs text-slate-500">
              <tr>
                <th className="whitespace-nowrap px-5 py-3 font-medium">Aluno / RGM</th>
                <th className="hidden whitespace-nowrap px-5 py-3 font-medium md:table-cell">Curso</th>
                <th className="hidden whitespace-nowrap px-5 py-3 font-medium md:table-cell">E-mail</th>
                <th className="whitespace-nowrap px-5 py-3 font-medium">Acesso</th>
                <th className="hidden whitespace-nowrap px-5 py-3 font-medium lg:table-cell">Última análise</th>
                <th className="hidden whitespace-nowrap px-5 py-3 font-medium xl:table-cell">Período / situação</th>
                <th className="whitespace-nowrap px-5 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {students.map((student) => {
                const snapshot = student.currentVersion?.snapshot as unknown as
                  AcademicGridSnapshot | undefined;
                return (
                  <tr key={student.id} className="group transition-colors hover:bg-sky-50/60">
                    <td className="min-w-48 px-5 py-4 font-medium">
                      <span className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#003B71] to-[#0693e3] text-xs font-semibold text-white shadow-sm transition-transform group-hover:scale-105">
                          {student.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          {student.name}
                          <span className="mt-0.5 block text-xs font-normal text-slate-500">
                            RGM {student.rgm}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="hidden min-w-40 px-5 py-4 md:table-cell">
                      {student.courseName ?? "—"}
                    </td>
                    <td className="hidden px-5 py-4 md:table-cell">
                      {student.studentUser?.email ?? "—"}
                    </td>
                    <td className="px-5 py-4">
                      <AccessPill status={accessStatus(student.studentUser)} />
                    </td>
                    <td className="hidden whitespace-nowrap px-5 py-4 lg:table-cell">
                      {student.currentVersion?.createdAt.toLocaleDateString(
                        "pt-BR",
                        { timeZone: "America/Porto_Velho" },
                      ) ?? "—"}
                    </td>
                    <td className="hidden px-5 py-4 xl:table-cell">
                      {snapshot
                        ? `${snapshot.result.currentPeriod ?? "—"}º · ${snapshot.result.previousPending} pendências`
                        : "Aguardando extrato"}
                    </td>
                    <td className="px-5 py-4">
                      <Link
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-brand-cyan/25 px-3 py-2 font-medium text-[#003B71] transition-all hover:border-brand-cyan hover:bg-brand-cyan hover:text-white hover:shadow-[0_8px_20px_-10px_rgb(6_147_227)]"
                        href={`/academic-analysis/students/${student.id}`}
                      >
                        Abrir aluno
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {students.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-500">
            Nenhum aluno encontrado com esses filtros.
          </p>
        )}
        <div className="flex justify-between p-4 text-sm">
          {page > 1 && <Link href={pagination(page - 1)}>Anterior</Link>}
          {page * 30 < count && (
            <Link href={pagination(page + 1)}>Próxima</Link>
          )}
        </div>
      </section>
      {legacy.length > 0 && (
        <section id="analises-sem-acesso" className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-[#003B71]">
              Análises existentes · sem acesso
            </h2>
            <span className="text-sm text-slate-500">{legacyCount} registro(s)</span>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Vincule o cadastro pelo RGM para disponibilizar as análises já
            realizadas. {legacyCount > 30 && "Refine a busca acima para encontrar um registro específico mais rápido."}
          </p>
          <ul className="mt-4 divide-y">
            {legacy.map((review) => (
              <li
                key={review.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div>
                  <p className="text-sm font-medium">
                    {review.studentName ?? "Nome não identificado"} ·{" "}
                    {review.rgm}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {review.courseName}
                  </p>
                </div>
                <LinkLegacyStudent reviewId={review.id} />
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between text-sm">
            {legacyPage > 1 && <Link href={legacyPagination(legacyPage - 1)}>Anterior</Link>}
            {legacyPage * 30 < legacyCount && (
              <Link href={legacyPagination(legacyPage + 1)}>Próxima</Link>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

const ACCESS_PILL: Record<string, string> = {
  ATIVO: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "CONVITE PENDENTE": "bg-amber-50 text-amber-700 ring-amber-200",
  BLOQUEADO: "bg-rose-50 text-rose-700 ring-rose-200",
  "SEM ACESSO": "bg-slate-100 text-slate-600 ring-slate-200",
};

function AccessPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${ACCESS_PILL[status] ?? ACCESS_PILL["SEM ACESSO"]}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}
