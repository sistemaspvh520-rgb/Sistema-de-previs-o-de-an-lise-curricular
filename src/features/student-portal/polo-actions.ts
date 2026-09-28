"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { getSessionUser, requirePermission } from "@/lib/session";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";
import { recordAudit } from "@/services/audit-log/audit-log";
import { getSystemSettings } from "@/repositories/settings-repository";

const codeSchema = z.string().trim().min(1).max(20);

async function validPolo(code: string) {
  const { polos } = await getSystemSettings();
  return polos.find((polo) => polo.code === code) ?? null;
}

/** O aluno confirma o próprio polo uma única vez (só quando o tutor que liberou o acesso não tinha polo). */
export async function confirmStudentPoloAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await getSessionUser({ allowStudent: true });
    if (!user || user.role !== "STUDENT") return fail("Somente o aluno pode confirmar o próprio polo.");
    const parsed = z.object({ code: codeSchema }).safeParse(input);
    if (!parsed.success) return fail("Escolha um polo.");
    const polo = await validPolo(parsed.data.code);
    if (!polo) return fail("Polo não encontrado.");
    const enrollment = await prisma.studentEnrollment.findFirst({ where: { studentUserId: user.id }, select: { id: true } });
    if (!enrollment) return fail("Cadastro não encontrado.");
    // updateMany com poloCode nulo: se o polo já foi definido, nada muda.
    const { count } = await prisma.studentEnrollment.updateMany({ where: { id: enrollment.id, poloCode: null }, data: { poloCode: polo.code } });
    if (!count) return fail("Seu polo já foi definido. Para alterar, fale com seu tutor.");
    await recordAudit({ userId: user.id, action: "student.polo_confirmed", entityType: "StudentEnrollment", entityId: enrollment.id, metadata: { poloCode: polo.code } });
    revalidatePath("/portal");
    return ok(undefined, `Polo confirmado: ${polo.name}.`);
  } catch (error) {
    return toActionError(error, "Não foi possível confirmar o polo. Tente novamente.");
  }
}

/** A equipe define ou corrige o polo do aluno (tutor responsável, Administração ou Coordenação). */
export async function setStudentPoloAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("students:manage");
    const parsed = z.object({ enrollmentId: z.string().uuid(), code: codeSchema.nullable() }).safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    const enrollment = await prisma.studentEnrollment.findUnique({ where: { id: parsed.data.enrollmentId }, select: { id: true, ownerId: true, rgm: true, poloCode: true } });
    if (!enrollment || (!can(user.role, "academic:all") && enrollment.ownerId !== user.id)) return fail("Aluno não encontrado.");
    const polo = parsed.data.code ? await validPolo(parsed.data.code) : null;
    if (parsed.data.code && !polo) return fail("Polo não encontrado.");
    await prisma.studentEnrollment.update({ where: { id: enrollment.id }, data: { poloCode: polo?.code ?? null } });
    await recordAudit({ userId: user.id, action: "student.polo_changed", entityType: "StudentEnrollment", entityId: enrollment.id, metadata: { rgm: enrollment.rgm, from: enrollment.poloCode, to: polo?.code ?? null } });
    revalidatePath(`/academic-analysis/students/${enrollment.id}`);
    revalidatePath("/academic-analysis/students");
    revalidatePath("/portal");
    return ok(undefined, polo ? `Polo definido: ${polo.name}.` : "Polo removido; o aluno confirmará no próximo acesso.");
  } catch (error) {
    return toActionError(error, "Não foi possível alterar o polo. Tente novamente.");
  }
}
