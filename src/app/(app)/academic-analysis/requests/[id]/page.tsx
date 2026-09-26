import { DeleteRequestButton } from "@/features/student-portal/delete-request-button";
import { RequestLiveUpdates } from "@/features/student-portal/request-live-updates";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/session";
import { enrollmentScope } from "@/services/student-portal/access";
import { documentLabels } from "@/services/academic-documents/classifier";
import { requestLabels } from "@/features/student-portal/request-labels";
import { RequestControls } from "@/features/student-portal/request-controls";
export const dynamic = "force-dynamic";
export default async function AcademicRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePagePermission("students:manage");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const request = await prisma.academicRequest.findFirst({
    where: { id, sourceDocument: { enrollment: enrollmentScope(user) } },
    include: {
      actor: true,
      sourceDocument: {
        include: {
          version: true,
          enrollment: { include: { currentVersion: true, owner: true } },
        },
      },
      previousRequest: true,
    },
  });
  if (!request) notFound();
  const source = request.sourceDocument,
    student = source.enrollment;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <RequestLiveUpdates active={request.status === "PROCESSING"} />
      <Link href="/academic-analysis/requests" className="text-sm text-sky-700">
        ← Solicitações acadêmicas
      </Link>
      <header className="rounded-2xl border bg-white p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-sky-700">
          Protocolo #{request.protocol}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-[#003B71]">
          {student.name}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          RGM {student.rgm} · {student.courseName}
        </p>
        <p className="mt-4 inline-block rounded-full bg-sky-50 px-3 py-1 text-sm">
          {requestLabels[request.status]}
        </p>
      </header>
      <section className="grid gap-4 rounded-2xl border bg-white p-6 sm:grid-cols-2">
        {[
          ["Documento", source.filename],
          ["Tipo identificado", documentLabels[source.documentType]],
          ["Enviado por", `${request.actor.name} · ${request.actorRole}`],
          [
            "Enviado em",
            request.createdAt.toLocaleString("pt-BR", {
              timeZone: "America/Porto_Velho",
            }),
          ],
          ["Tutor responsável", student.owner.name],
          [
            "Validação",
            source.validationResult ??
              source.errorMessage ??
              "Conferindo documento",
          ],
          ["Parser", source.parserName ?? "Não identificado"],
          [
            "Processamento",
            source.reused
              ? "Reutilizada · sem IA"
              : request.aiUsed
                ? "Com IA"
                : "Processamento local · sem IA",
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 break-words text-sm font-medium">{value}</p>
          </div>
        ))}
      </section>
      <nav className="flex flex-wrap gap-3 text-sm text-sky-800">
        {source.storageKey && !source.deletedAt ? (
          <a
            className="rounded-xl border bg-white p-3"
            href={`/api/portal/document/${source.id}`}
            target="_blank"
            rel="noreferrer"
          >
            Visualizar documento
          </a>
        ) : (
          <p className="p-3 text-slate-500">
            Original indisponível conforme a política de retenção.
          </p>
        )}
        {student.currentVersion && (
          <>
            <Link
              className="rounded-xl border bg-white p-3"
              href={`/academic-analysis/${student.currentVersion.reviewId}`}
            >
              Visualizar análise atual / corrigir extração
            </Link>
          </>
        )}
        <Link
          className="rounded-xl border bg-white p-3"
          href={`/portal?student=${student.id}`}
        >
          Acessar portal do aluno
        </Link>
        <Link
          className="rounded-xl border bg-white p-3"
          href={`/academic-analysis/students/${student.id}#atualizar`}
        >
          Enviar novo documento
        </Link>
        <span className="ml-auto self-center">
          <DeleteRequestButton requestId={request.id} protocol={request.protocol} redirectTo="/academic-analysis/requests" />
        </span>
      </nav>
      <section className="rounded-2xl border bg-white p-6">
        <h2 className="font-semibold text-[#003B71]">Resultado e alterações</h2>
        <p className="mt-3 text-sm">
          {request.result ?? "Aguardando processamento."}
        </p>
        <ul className="mt-3 space-y-2 text-sm text-slate-600">
          {(request.createdVersion
            ? ((source.version?.changeSummary as string[] | undefined) ?? [])
            : []
          ).map((change, i) => (
            <li key={i}>{change}</li>
          ))}
        </ul>
        {request.previousRequest && (
          <Link
            className="mt-4 block text-sm text-sky-700"
            href={`/academic-analysis/requests/${request.previousRequestId}`}
          >
            Tentativa anterior · #{request.previousRequest.protocol}
          </Link>
        )}
      </section>
      <section className="rounded-2xl border bg-white p-6">
        <RequestControls
          id={id}
          processing={request.status === "PROCESSING"}
          closed={["REJECTED", "WAITING_NEW_DOCUMENT"].includes(request.status)}
        />
      </section>
    </div>
  );
}
