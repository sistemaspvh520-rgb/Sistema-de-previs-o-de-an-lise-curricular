import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { requestLabels } from "./request-labels";
import { documentLabels } from "@/services/academic-documents/classifier";
/** Caller must first authorize enrollment through requireEnrollment. */
export async function StudentRequestsList({
  enrollmentId,
  support,
  page = 1,
}: {
  enrollmentId: string;
  support: boolean;
  page?: number;
}) {
  const where = { sourceDocument: { enrollmentId } };
  const [requests, count] = await Promise.all([
    prisma.academicRequest.findMany({
      where,
      include: { sourceDocument: true },
      orderBy: { createdAt: "desc" },
      take: 20,
      skip: (page - 1) * 20,
    }),
    prisma.academicRequest.count({ where }),
  ]);
  const base = support ? `/portal?student=${enrollmentId}&` : "/portal?";
  return (
    <section
      id="minhas-solicitacoes"
      className="rounded-2xl border bg-white p-5 sm:p-6"
    >
      <h2 className="text-lg font-semibold text-[#003B71]">
        Minhas solicitações
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Acompanhe cada documento enviado e o resultado da conferência.
      </p>
      <ol className="mt-4 divide-y">
        {requests.map((r) => (
          <li key={r.id} className="py-4">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="text-sm font-semibold">
                #{r.protocol} · {documentLabels[r.sourceDocument.documentType]}
              </p>
              <span className="rounded-full bg-brand-cyan-50 px-3 py-1 text-xs text-brand-cyan-700">
                {requestLabels[r.status]}
              </span>
            </div>
            <p className="mt-2 break-all text-xs text-slate-500">
              {r.createdAt.toLocaleDateString("pt-BR", {
                timeZone: "America/Porto_Velho",
              })}{" "}
              · {r.sourceDocument.filename}
            </p>
            <p className="mt-2 text-sm">
              {r.result ?? "Estamos conferindo seu documento."}
            </p>
            {["WAITING_NEW_DOCUMENT", "REJECTED", "FAILED"].includes(
              r.status,
            ) && (
              <a
                href="#atualizar-analise"
                className="mt-3 inline-block text-sm font-semibold text-brand-cyan-700 underline"
              >
                Enviar novo PDF
              </a>
            )}
            {support && (
              <Link
                href={`/academic-analysis/requests/${r.id}`}
                className="mt-3 ml-3 inline-block text-sm text-brand-cyan-700 underline"
              >
                Abrir solicitação
              </Link>
            )}
          </li>
        ))}
      </ol>
      {!count && (
        <p className="mt-4 text-sm text-slate-500">
          Seus envios aparecerão aqui.
        </p>
      )}
      <nav className="mt-3 flex justify-between text-sm">
        {page > 1 && (
          <Link
            href={`${base}requests=${page - 1}#minhas-solicitacoes`}
            className="font-medium text-brand-cyan-700 hover:underline"
          >
            Mais recentes
          </Link>
        )}
        {page * 20 < count && (
          <Link
            href={`${base}requests=${page + 1}#minhas-solicitacoes`}
            className="font-medium text-brand-cyan-700 hover:underline"
          >
            Anteriores
          </Link>
        )}
      </nav>
    </section>
  );
}
