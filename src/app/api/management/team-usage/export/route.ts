import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { can, ROLE_LABELS, STAFF_ROLES } from "@/lib/rbac";
import { formatDateTime } from "@/lib/time";
import { POLOS } from "@/domain/polos";
import { MODULE_LABELS, WORK_MODULES, type WorkModule } from "@/domain/usage/modules";
import { resolveUsagePeriod } from "@/domain/usage/metrics";
import { getTeamUsage, type StaffRole } from "@/services/usage/team-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const minutes = (seconds: number) => Math.round(seconds / 60);

function cell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Uso da equipe em CSV (separador ";" e BOM, para abrir direto no Excel em pt-BR). Só administradores. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!can(user.role, "audit:read")) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  const url = new URL(req.url);
  const get = (key: string) => url.searchParams.get(key) ?? undefined;
  const period = resolveUsagePeriod({ period: get("period"), from: get("from"), to: get("to") });
  const role = (STAFF_ROLES as readonly string[]).includes(get("role") ?? "") ? (get("role") as StaffRole) : undefined;
  const polo = POLOS.some((item) => item.code === get("polo")) ? get("polo") : undefined;
  const focus = (WORK_MODULES as readonly string[]).includes(get("module") ?? "") ? (get("module") as WorkModule) : undefined;
  const report = await getTeamUsage({ from: period.from, to: period.to, role, polo, module: focus });

  const header = [
    "Pessoa", "Perfil", "Polo", "Situação", "Último acesso", "Dias com uso", "Tempo ativo total (min)",
    ...WORK_MODULES.map((module) => `Tempo · ${MODULE_LABELS[module]} (min)`),
    "Tempo · Gestão e configurações (min)",
    ...WORK_MODULES.map((module) => `Ações · ${MODULE_LABELS[module]}`),
    "Logins", "Principais ações",
  ];
  const lines = report.people.map((person) => {
    const total = Object.values(person.moduleSeconds).reduce((sum, value) => sum + value, 0);
    return [
      person.name,
      ROLE_LABELS[person.role],
      person.poloName ?? "",
      person.status.label,
      person.lastSeenAt ? formatDateTime(person.lastSeenAt) : "nunca",
      person.activeDays,
      minutes(total),
      ...WORK_MODULES.map((module) => minutes(person.moduleSeconds[module])),
      minutes(person.moduleSeconds.MANAGEMENT + person.moduleSeconds.SETTINGS + person.moduleSeconds.OTHER),
      ...WORK_MODULES.map((module) => person.moduleActions[module]),
      person.logins,
      person.highlights.join(" · "),
    ].map(cell).join(";");
  });
  const csv = "﻿" + [header.map(cell).join(";"), ...lines].join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="uso-da-equipe-${period.fromDay}-a-${period.toDay}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
