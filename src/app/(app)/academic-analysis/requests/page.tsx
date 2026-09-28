import { RequestLiveUpdates } from "@/features/student-portal/request-live-updates";
import { DeleteRequestButton } from "@/features/student-portal/delete-request-button";
import Link from "next/link";
import type {
  Prisma,
  AcademicDocumentType,
  AcademicRequestStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { enrollmentScope } from "@/services/student-portal/access";
import { documentLabels } from "@/services/academic-documents/classifier";
import { requestLabels } from "@/features/student-portal/request-labels";
import { getTeamInsights } from "@/services/student-portal/team-insights";
import { TeamPanel } from "@/features/team/team-panel";
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
    ...(can(user.role, "academic:all") && q.tutor
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
  const [requests, count, statuses, insights] = await Promise.all([
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
    getTeamInsights(scope, new Date(), { deletionRequests: can(user.role, "academic:all") }),
  ]);
  const totalRequests = statuses.reduce((n, s) => n + s._count, 0);
  const statusCount = (status: string) =>
    statuses.find((s) => s.status === status)?._count ?? 0;
  const doneRequests = statusCount("COMPLETED") + statusCount("NO_CHANGES");
  const openRequests = ["RECEIVED", "PROCESSING", "UNDER_REVIEW", "WAITING_NEW_DOCUMENT"].reduce((n, st) => n + statusCount(st), 0);
  const issueRequests = statusCount("FAILED") + statusCount("REJECTED");
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
          {can(user.role, "academic:all")
            ? "Central Acadêmica"
            : "Solicitações Acadêmicas"}
        </h1>
        <p className="mt-2 text-sm text-sky-100">
          O que precisa da equipe hoje, quem pode avançar e quem está perto de
          se formar.
        </p>
      </header>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-600">
        <span><strong className="text-slate-900 tabular-nums">{totalRequests}</strong> {totalRequests === 1 ? "documento recebido" : "documentos recebidos"}</span>
        <span><strong className="text-emerald-700 tabular-nums">{totalRequests ? Math.round((doneRequests / totalRequests) * 100) : 0}%</strong> concluídos automaticamente</span>
        {openRequests > 0 && <span><strong className="text-sky-700 tabular-nums">{openRequests}</strong> em processamento</span>}
        {issueRequests > 0 && <span><strong className="text-rose-700 tabular-nums">{issueRequests}</strong> com falha ou recusa</span>}
      </p>
      <TeamPanel insights={insights} showTutor={can(user.role, "academic:all")} />
      <h2 className="pt-2 text-lg font-semibold text-[#003B71]">Histórico de solicitações</h2>
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
        {can(user.role, "academic:all") && (
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
              {([
                ["Protocolo", ""],
                ["Aluno / RGM", ""],
                ["Documento / tipo", "hidden md:table-cell"],
                ["Status", ""],
                ["Tutor", "hidden lg:table-cell"],
                ["Enviado / última atividade", "hidden xl:table-cell"],
                ["", "w-12"],
              ] as const).map(([label, cls]) => (
                <th key={label || "acoes"} className={`p-4 ${cls}`}>
                  {label || <span className="sr-only">Ações</span>}
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
                <td className="hidden max-w-64 p-4 md:table-cell">
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
                <td className="hidden p-4 lg:table-cell">
                  {r.sourceDocument.enrollment.owner.name}
                </td>
                <td className="hidden whitespace-nowrap p-4 text-xs xl:table-cell">
                  {r.createdAt.toLocaleString("pt-BR", {
                    timeZone: "America/Porto_Velho",
                  })}
                  <span className="mt-1 block text-slate-500">
                    {r.updatedAt.toLocaleString("pt-BR", {
                      timeZone: "America/Porto_Velho",
                    })}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <DeleteRequestButton requestId={r.id} protocol={r.protocol} iconOnly />
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
        <span>{count} {count === 1 ? "solicitação" : "solicitações"}</span>
        {page > 1 && <Link href={href(page - 1)}>Anterior</Link>}
        {page * 30 < count && <Link href={href(page + 1)}>Próxima</Link>}
      </nav>
    </div>
  );
}
