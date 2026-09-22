"use server";

import { z } from "zod";
import { requirePermission } from "@/lib/session";
import { findAnalysesForStudent } from "@/features/analyses/create-analysis";
import { ANALYSIS_STATUS_LABELS } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/time";

export interface StudentMatch {
  id: string;
  studentName: string;
  courseName: string | null;
  poloName: string | null;
  statusLabel: string;
  createdAtLabel: string;
  createdByName: string;
  canOpen: boolean;
}

/** Consulta análises anteriores do aluno enquanto o analista digita o nome (evita trabalho duplicado). */
export async function lookupStudentAction(rawName: unknown): Promise<StudentMatch[]> {
  const user = await requirePermission("analysis:create");
  const name = z.string().max(120).safeParse(rawName);
  if (!name.success) return [];
  const matches = await findAnalysesForStudent(name.data, 5);
  return matches.map((a) => ({
    id: a.id,
    studentName: a.studentName,
    courseName: a.courseName,
    poloName: a.poloName,
    statusLabel: ANALYSIS_STATUS_LABELS[a.status],
    createdAtLabel: formatDateTime(a.createdAt),
    createdByName: a.createdBy.name,
    canOpen: user.role === "ADMIN" || a.createdById === user.id,
  }));
}
