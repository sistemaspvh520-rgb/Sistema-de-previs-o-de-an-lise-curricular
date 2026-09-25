import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/session";
import {
  accessStatus,
  enrollmentScope,
} from "@/services/student-portal/access";
import { CreateStudentForm } from "@/features/student-portal/student-access-panel";
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
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const user = await requirePagePermission("students:manage");
  const params = await searchParams;
  const query = params.q?.trim().slice(0, 100) ?? "";
  const page = Math.max(1, Math.floor(Number(params.page) || 1));
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
  const [students, count, legacy] = await Promise.all([
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
    !params.status || params.status === "none"
      ? prisma.academicGridReview.findMany({
          where: {
            enrollmentId: null,
            rgm: { not: null },
            ...(user.role === "ADMIN" ? {} : { createdById: user.id }),
            ...(query
              ? {
                  OR: [
                    { studentName: { contains: query, mode: "insensitive" } },
                    { rgm: { contains: query } },
                  ],
                }
              : {}),
          },
          distinct: ["rgm"],
          orderBy: { createdAt: "desc" },
          take: 30,
          select: { id: true, studentName: true, rgm: true, courseName: true },
        })
      : [],
  ]);
  const pagination = (number: number) =>
    `/academic-analysis/students?${new URLSearchParams({ q: query, status: params.status ?? "", page: String(number) })}`;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/academic-analysis"
            className="text-sm text-slate-500 hover:underline"
          >
            Análise Acadêmica
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#003B71]">
            Alunos
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Acompanhe a situação acadêmica e gerencie o acesso ao portal.
          </p>
        </div>
        <a
          href="#criar-acesso"
          className="rounded-xl bg-[#003B71] px-5 py-3 text-sm font-semibold text-white"
        >
          Criar acesso
        </a>
      </div>
      <form className="flex flex-wrap gap-3 rounded-2xl border bg-white p-4">
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
            className="mt-2 block h-10 rounded-md border bg-white px-3 text-sm"
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
      <section className="overflow-hidden rounded-2xl border bg-white">
        <div className="flex items-center justify-between border-b p-5">
          <h2 className="font-semibold">Acessos dos alunos</h2>
          <span className="text-sm text-slate-500">{count} aluno(s)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {[
                  "Aluno / RGM",
                  "Curso",
                  "E-mail",
                  "Acesso",
                  "Última análise",
                  "Período / situação",
                  "Ações",
                ].map((label) => (
                  <th
                    key={label}
                    className="whitespace-nowrap px-5 py-3 font-medium"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {students.map((student) => {
                const snapshot = student.currentVersion?.snapshot as unknown as
                  AcademicGridSnapshot | undefined;
                return (
                  <tr key={student.id} className="hover:bg-sky-50/40">
                    <td className="min-w-48 px-5 py-4 font-medium">
                      {student.name}
                      <span className="mt-1 block text-xs font-normal text-slate-500">
                        {student.rgm}
                      </span>
                    </td>
                    <td className="min-w-40 px-5 py-4">
                      {student.courseName ?? "—"}
                    </td>
                    <td className="px-5 py-4">
                      {student.studentUser?.email ?? "—"}
                    </td>
                    <td className="px-5 py-4">
                      <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-1 text-xs font-medium">
                        {accessStatus(student.studentUser)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">
                      {student.currentVersion?.createdAt.toLocaleDateString(
                        "pt-BR",
                        { timeZone: "America/Porto_Velho" },
                      ) ?? "—"}
                    </td>
                    <td className="px-5 py-4">
                      {snapshot
                        ? `${snapshot.result.currentPeriod ?? "—"}º · ${snapshot.result.previousPending} pendências`
                        : "Aguardando extrato"}
                    </td>
                    <td className="px-5 py-4">
                      <Link
                        className="inline-block whitespace-nowrap rounded-lg border px-3 py-2 font-medium text-[#003B71]"
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
        <section className="rounded-2xl border bg-white p-5">
          <h2 className="font-semibold text-[#003B71]">
            Análises existentes · sem acesso
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Vincule o cadastro pelo RGM para disponibilizar as análises já
            realizadas.
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
        </section>
      )}
      <section
        id="criar-acesso"
        className="rounded-2xl border bg-white p-5 sm:p-6"
      >
        <h2 className="mb-5 text-lg font-semibold text-[#003B71]">
          Criar acesso do aluno
        </h2>
        <CreateStudentForm />
      </section>
    </div>
  );
}
