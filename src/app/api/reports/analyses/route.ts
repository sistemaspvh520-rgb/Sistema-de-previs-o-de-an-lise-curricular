import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { listAnalysesForReport } from "@/repositories/analysis-repository";
import { ANALYSIS_STATUS_LABELS, RELIABILITY_LABELS } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/time";
import { isPoloCode } from "@/domain/polos";
import { formatCourseFormat } from "@/domain/course-formats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADER = ["Data de envio", "Aluno", "Polo (código)", "Polo", "Curso", "Formato do curso", "Período de ingresso", "Semestre de ingresso", "Status", "Verificação", "Observações", "Total da grade", "Dispensadas", "Pendentes", "Previsão de conclusão", "Concluída em", "Responsável", "Arquivo"];

function cell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Relatório de análises em CSV (separador ";" e BOM, para abrir direto no Excel em pt-BR). */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const url = new URL(req.url);
  const polo = url.searchParams.get("polo");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const rows = await listAnalysesForReport({
    createdById: user.role === "ADMIN" ? undefined : user.id,
    poloCode: polo && isPoloCode(polo) ? polo : undefined,
    from: from && !Number.isNaN(Date.parse(from)) ? new Date(from) : undefined,
    to: to && !Number.isNaN(Date.parse(to)) ? new Date(to) : undefined,
  });
  const lines = rows.map((a) => {
    const exempted = a.subjects.filter((s) => s.status === "EXEMPTED").length;
    const pending = a._count.subjects - exempted;
    return [
      formatDateTime(a.createdAt),
      a.studentName,
      a.poloCode,
      a.poloName,
      a.courseName,
      a.courseFormat ? formatCourseFormat(a.courseFormat) : "",
      a.entryPeriod ? `${a.entryPeriod}º` : "",
      a.entryTerm ?? a.startTerm,
      ANALYSIS_STATUS_LABELS[a.status],
      a.reliability ? RELIABILITY_LABELS[a.reliability] : "",
      a.reviewItemsCount,
      a._count.subjects,
      exempted,
      pending,
      a.status === "COMPLETED" ? (a.projections[0]?.term ?? "") : "",
      a.completedAt ? formatDateTime(a.completedAt) : "",
      a.createdBy.name,
      a.document?.originalName,
    ].map(cell).join(";");
  });
  const csv = "﻿" + [HEADER.map(cell).join(";"), ...lines].join("\r\n");
  const suffix = polo ? `-polo-${polo}` : "";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="analises${suffix}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
