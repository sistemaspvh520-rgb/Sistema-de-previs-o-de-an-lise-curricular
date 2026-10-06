import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { can, STAFF_ROLES } from "@/lib/rbac";
import { formatDateTime } from "@/lib/time";
import { POLOS } from "@/domain/polos";
import { GRADE_ACTION_SHORT } from "@/domain/usage/actions";
import { resolveUsagePeriod } from "@/domain/usage/metrics";
import type { StaffRole } from "@/services/usage/team-usage";
import { getGradeUsage } from "@/services/usage/grade-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Registro completo de uso das grades em CSV (quando, pessoa, grade, o que fez). Só administradores. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!can(user.role, "audit:read")) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  const url = new URL(req.url);
  const get = (key: string) => url.searchParams.get(key) ?? undefined;
  const period = resolveUsagePeriod({ period: get("period"), from: get("from"), to: get("to") });
  const role = (STAFF_ROLES as readonly string[]).includes(get("role") ?? "") ? (get("role") as StaffRole) : undefined;
  const polo = POLOS.some((item) => item.code === get("polo")) ? get("polo") : undefined;
  const filters = { from: period.from, to: period.to, role, polo, userId: UUID.test(get("user") ?? "") ? get("user") : undefined, gradeId: UUID.test(get("grade") ?? "") ? get("grade") : undefined };

  const report = await getGradeUsage(filters, { logPageSize: Infinity });

  const header = ["Data e hora", "Pessoa", "Grade", "O que fez", "Grade excluída"];
  const lines = report.log.map((item) => [formatDateTime(item.at), item.userName, item.label, GRADE_ACTION_SHORT[item.action], item.exists ? "" : "sim"].map(cell).join(";"));
  const summary = ["", "Sem uso de grades no período", ...report.notUsing.map((person) => person.name)].map(cell);
  const csv = "﻿" + [header.map(cell).join(";"), ...lines, ...summary].join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="uso-das-grades-${period.fromDay}-a-${period.toDay}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
