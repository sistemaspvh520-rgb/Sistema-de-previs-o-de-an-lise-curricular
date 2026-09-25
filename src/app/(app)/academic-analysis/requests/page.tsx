import { RequestLiveUpdates } from "@/features/student-portal/request-live-updates";
import Link from "next/link";
import type {
  Prisma,
  AcademicDocumentType,
  AcademicRequestStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/session";
import { enrollmentScope } from "@/services/student-portal/access";
import { documentLabels } from "@/services/academic-documents/classifier";
import { requestLabels } from "@/features/student-portal/request-labels";
export const dynamic = "force-dynamic";
export default async function AcademicRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePagePermission("students:manage");
  const q = await searchParams;
  const page = Math.max(1, Math.min(10000, Math.floor(Number(q.page) || 1)));
  const scope = enrollmentScope(user);
  const enrollment: Prisma.StudentEnrollmentWhereInput = {
    ...scope,
    ...(q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: "insensitive" } },
            { rgm: { contains: q.q } },
          ],
        }
      : {}),
    ...(q.course
      ? { courseName: { contains: q.course, mode: "insensitive" } }
      : {}),
    ...(user.role === "ADMIN" && q.tutor
      ? { owner: { name: { contains: q.tutor, mode: "insensitive" } } }
      : {}),
  };
  const where: Prisma.AcademicRequestWhereInput = {
    sourceDocument: {
      enrollment,
      ...(q.type && Object.hasOwn(documentLabels, q.type)
        ? { documentType: q.type as AcademicDocumentType }
        : {}),
    },
    ...(q.status && Object.hasOwn(requestLabels, q.status)
      ? { status: q.status as AcademicRequestStatus }
      : {}),
  };
  const [requests, count, statuses, types, metrics] = await Promise.all([
    prisma.academicRequest.findMany({
      where,
      include: {
        sourceDocument: {
          include: {
            enrollment: { include: { owner: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      skip: (page - 1) * 30,
    }),
    prisma.academicRequest.count({ where }),
    prisma.academicRequest.groupBy({
      by: ["status"],
      where: { sourceDocument: { enrollment: scope } },
      _count: true,
    }),
    prisma.academicAnalysisSource.groupBy({
      by: ["documentType"],
      where: { enrollment: scope },
      _count: true,
    }),
    prisma.academicRequest.groupBy({
      by: ["aiUsed", "createdVersion"],
      where: { sourceDocument: { enrollment: scope } },
      _count: true,
    }),
  ]);
  const total = types.reduce((n, t) => n + t._count, 0);
  const statusCount = (status: string) =>
    statuses.find((s) => s.status === status)?._count ?? 0;
  const href = (n: number) =>
    `/academic-analysis/requests?${new URLSearchParams({ ...Object.fromEntries(Object.entries(q).filter((entry): entry is [string, string] => typeof entry[1] === "string")), page: String(n) })}`;
  return (
    <div className="space-y-6">
      <RequestLiveUpdates
        active={requests.some((r) => r.status === "PROCESSING")}
      />
      <header className="rounded-2xl bg-gradient-to-br from-[#003B71] to-sky-700 p-6 text-white">
        <p className="text-xs uppercase tracking-widest text-sky-100">
          Acompanhamento acadêmico
        </p>
        <h1 className="mt-2 text-2xl font-semibold">
          {user.role === "ADMIN"
            ? "Central Acadêmica"
            : "Solicitações Acadêmicas"}
        </h1>
        <p className="mt-2 text-sm text-sky-100">
          Um documento por solicitação. Todas as atualizações, da chegada à
          conferência.
        </p>
      </header>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          [
            "Abertas",
            [
              "RECEIVED",
              "PROCESSING",
              "UNDER_REVIEW",
              "WAITING_NEW_DOCUMENT",
            ].reduce((n, s) => n + statusCount(s), 0),
          ],
          ["Novas", statusCount("RECEIVED")],
          [
            "Em análise",
            statusCount("PROCESSING") + statusCount("UNDER_REVIEW"),
          ],
          ["Sem alterações / reutilizadas", statusCount("NO_CHANGES")],
          ["Concluídas", statusCount("COMPLETED")],
          [
            "Necessitam revisão",
            statusCount("UNDER_REVIEW") + statusCount("FAILED"),
          ],
          [
            "Documentos recusados",
            statusCount("REJECTED") + statusCount("WAITING_NEW_DOCUMENT"),
          ],
          ["Sem responsável", 0],
          [
            "Processadas sem IA",
            metrics.filter((m) => !m.aiUsed).reduce((n, m) => n + m._count, 0),
          ],
          ["IA necessária", 0],
          [
            "Nova versão criada",
            metrics
              .filter((m) => m.createdVersion)
              .reduce((n, m) => n + m._count, 0),
          ],
        ].map(([label, value]) => (
          <article key={label} className="rounded-xl border bg-white p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-[#003B71]">
              {value}
            </p>
          </article>
        ))}
      </section>
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="font-semibold">Documentos recebidos</h2>
        <div className="mt-4 flex flex-wrap gap-5 text-sm">
          {types.map((t) => (
            <p key={t.documentType}>
              {documentLabels[t.documentType]} <strong>{t._count}</strong> ·{" "}
              {total ? Math.round((t._count / total) * 100) : 0}%
            </p>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Toda matrícula possui um responsável. A identificação e extração
          destes formatos são locais.
        </p>
      </section>
      <form className="grid gap-3 rounded-2xl border bg-white p-5 sm:grid-cols-2 lg:grid-cols-3">
        <input
          name="q"
          defaultValue={q.q}
          aria-label="Aluno ou RGM"
          placeholder="Aluno ou RGM"
          className="rounded-lg border p-3 text-sm"
        />
        <input
          name="course"
          defaultValue={q.course}
          aria-label="Curso"
          placeholder="Curso"
          className="rounded-lg border p-3 text-sm"
        />
        {user.role === "ADMIN" && (
          <input
            name="tutor"
            defaultValue={q.tutor}
            aria-label="Tutor"
            placeholder="Tutor responsável"
            className="rounded-lg border p-3 text-sm"
          />
        )}
        <select
          name="type"
          aria-label="Tipo de documento"
          defaultValue={q.type ?? ""}
          className="rounded-lg border p-3 text-sm"
        >
          <option value="">Todos os documentos</option>
          {Object.entries(documentLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="status"
          aria-label="Status"
          defaultValue={q.status ?? ""}
          className="rounded-lg border p-3 text-sm"
        >
          <option value="">Todos os status</option>
          {Object.entries(requestLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <button className="rounded-lg bg-[#003B71] p-3 text-sm font-semibold text-white">
          Filtrar solicitações
        </button>
      </form>
      <div className="overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              {[
                "Protocolo",
                "Aluno / RGM",
                "Documento / tipo",
                "Status",
                "Tutor",
                "Enviado / última atividade",
              ].map((s) => (
                <th key={s} className="p-4">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className="border-t hover:bg-sky-50/50">
                <td className="p-4">
                  <Link
                    className="font-semibold text-sky-800 underline"
                    href={`/academic-analysis/requests/${r.id}`}
                  >
                    #{r.protocol}
                  </Link>
                </td>
                <td className="p-4">
                  {r.sourceDocument.enrollment.name}
                  <small className="block text-slate-500">
                    {r.sourceDocument.enrollment.rgm}
                  </small>
                </td>
                <td className="max-w-64 p-4">
                  <p className="truncate">{r.sourceDocument.filename}</p>
                  <small className="text-sky-700">
                    {documentLabels[r.sourceDocument.documentType]}
                  </small>
                </td>
                <td className="p-4">
                  {requestLabels[r.status]}
                  <small className="block text-slate-500">
                    {r.sourceDocument.reused
                      ? "Reutilizada"
                      : "Processamento local"}
                  </small>
                </td>
                <td className="p-4">
                  {r.sourceDocument.enrollment.owner.name}
                </td>
                <td className="whitespace-nowrap p-4 text-xs">
                  {r.createdAt.toLocaleString("pt-BR", {
                    timeZone: "America/Porto_Velho",
                  })}
                  <span className="mt-1 block text-slate-500">
                    {r.updatedAt.toLocaleString("pt-BR", {
                      timeZone: "America/Porto_Velho",
                    })}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!count && (
          <p className="p-8 text-center text-sm text-slate-500">
            Nenhuma solicitação encontrada.
          </p>
        )}
      </div>
      <nav className="flex justify-between text-sm">
        <span>{count} solicitações</span>
        {page > 1 && <Link href={href(page - 1)}>Anterior</Link>}
        {page * 30 < count && <Link href={href(page + 1)}>Próxima</Link>}
      </nav>
    </div>
  );
}
