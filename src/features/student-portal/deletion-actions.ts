"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission, ForbiddenError } from "@/lib/session";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";
import { recordAudit } from "@/services/audit-log/audit-log";
import { logger } from "@/lib/logger";
import { DeletionBlockedError, deleteStudentEnrollment } from "@/services/student-portal/deletion";

const idSchema = z.string().uuid();
const requestSchema = z.object({ enrollmentId: idSchema, reason: z.string().trim().min(3, "Explique o motivo da exclusão.").max(500) });
const decisionSchema = z.object({ requestId: idSchema, decision: z.enum(["APPROVE", "REJECT"]), note: z.string().trim().max(500).optional() });

function invalidate() {
  revalidatePath("/academic-analysis/students");
  revalidatePath("/academic-analysis/requests");
  revalidatePath("/academic-analysis");
  revalidatePath("/management");
}

function accountNote(account: "deleted" | "deactivated" | "none") {
  return account === "deleted" ? " A conta do portal também foi apagada." : account === "deactivated" ? " A conta do portal foi desativada." : "";
}

/** Administração e Coordenação acadêmica excluem o aluno diretamente. */
export async function deleteStudentAction(enrollmentIdInput: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("students:manage");
    const result = await deleteStudentEnrollment(user, idSchema.parse(enrollmentIdInput));
    invalidate();
    return ok(undefined, `${result.name} (RGM ${result.rgm}) foi excluído.${accountNote(result.account)}`);
  } catch (error) {
    if (error instanceof DeletionBlockedError || error instanceof ForbiddenError) return fail(error.message);
    logger.error("student.delete.failed", { errorName: error instanceof Error ? error.name : "unknown" });
    return toActionError(error, "Não foi possível excluir o aluno. Tente novamente.");
  }
}

/** O tutor responsável pede a exclusão; a decisão fica com a administração ou a coordenação. */
export async function requestStudentDeletionAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("students:manage");
    if (can(user.role, "academic:all")) return fail("Você pode excluir o aluno diretamente.");
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    const enrollment = await prisma.studentEnrollment.findFirst({ where: { id: parsed.data.enrollmentId, ownerId: user.id }, select: { id: true, name: true, rgm: true } });
    if (!enrollment) return fail("Você só pode pedir a exclusão dos seus alunos.");
    const pending = await prisma.studentDeletionRequest.findFirst({ where: { enrollmentId: enrollment.id, status: "PENDING" }, select: { id: true } });
    if (pending) return fail("Já existe um pedido de exclusão aguardando aprovação.");
    await prisma.studentDeletionRequest.create({ data: { enrollmentId: enrollment.id, studentName: enrollment.name, rgm: enrollment.rgm, requestedById: user.id, reason: parsed.data.reason } });
    await recordAudit({ userId: user.id, action: "student.deletion_requested", entityType: "StudentEnrollment", entityId: enrollment.id, metadata: { rgm: enrollment.rgm, reason: parsed.data.reason } });
    invalidate();
    return ok(undefined, "Pedido enviado. A administração ou a coordenação acadêmica vai analisar.");
  } catch (error) {
    logger.error("student.deletion_request.failed", { errorName: error instanceof Error ? error.name : "unknown" });
    return toActionError(error, "Não foi possível enviar o pedido. Tente novamente.");
  }
}

/** Aprovar exclui o aluno; recusar mantém tudo e registra a observação. */
export async function decideStudentDeletionAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("students:manage");
    if (!can(user.role, "academic:all")) return fail("Só a administração ou a coordenação acadêmica decidem pedidos de exclusão.");
    const parsed = decisionSchema.safeParse(input);
    if (!parsed.success) return fail("Dados inválidos para a decisão.");
    const request = await prisma.studentDeletionRequest.findUnique({ where: { id: parsed.data.requestId }, include: { requestedBy: { select: { name: true } } } });
    if (!request) return fail("Pedido não encontrado.");
    if (request.status !== "PENDING") return fail("Este pedido já foi decidido.");
    if (parsed.data.decision === "REJECT") {
      await prisma.studentDeletionRequest.update({ where: { id: request.id }, data: { status: "REJECTED", reviewedById: user.id, reviewedAt: new Date(), decisionNote: parsed.data.note || null } });
      await recordAudit({ userId: user.id, action: "student.deletion_rejected", entityType: "StudentEnrollment", entityId: request.enrollmentId, metadata: { rgm: request.rgm, requestedBy: request.requestedBy.name, note: parsed.data.note || null } });
      invalidate();
      return ok(undefined, "Pedido recusado. O aluno foi mantido.");
    }
    if (!request.enrollmentId) {
      await prisma.studentDeletionRequest.update({ where: { id: request.id }, data: { status: "APPROVED", reviewedById: user.id, reviewedAt: new Date(), decisionNote: parsed.data.note || "Aluno já havia sido excluído" } });
      invalidate();
      return ok(undefined, "O aluno já havia sido excluído.");
    }
    await prisma.studentDeletionRequest.update({ where: { id: request.id }, data: { reviewedById: user.id, reviewedAt: new Date(), decisionNote: parsed.data.note || null } });
    const result = await deleteStudentEnrollment(user, request.enrollmentId);
    await recordAudit({ userId: user.id, action: "student.deletion_approved", entityType: "StudentEnrollment", entityId: null, metadata: { rgm: request.rgm, requestedBy: request.requestedBy.name, note: parsed.data.note || null } });
    invalidate();
    return ok(undefined, `Pedido aprovado: ${result.name} foi excluído.${accountNote(result.account)}`);
  } catch (error) {
    if (error instanceof DeletionBlockedError || error instanceof ForbiddenError) return fail(error.message);
    logger.error("student.deletion_decision.failed", { errorName: error instanceof Error ? error.name : "unknown" });
    return toActionError(error, "Não foi possível concluir a decisão. Tente novamente.");
  }
}

const reassignSchema = z.object({ enrollmentId: idSchema, ownerId: idSchema });

/** Administração e Coordenação trocam (ou atribuem) o tutor responsável pelo aluno. */
export async function reassignStudentTutorAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("students:manage");
    if (!can(user.role, "academic:all")) return fail("Só a administração ou a coordenação acadêmica podem trocar o tutor.");
    const parsed = reassignSchema.safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    const [enrollment, tutor] = await Promise.all([
      prisma.studentEnrollment.findUnique({ where: { id: parsed.data.enrollmentId }, select: { id: true, rgm: true, ownerId: true, poloCode: true, owner: { select: { name: true } } } }),
      prisma.user.findFirst({ where: { id: parsed.data.ownerId, isActive: true, role: { in: ["ADMIN", "ACADEMIC_COORDINATOR", "TUTOR"] } }, select: { id: true, name: true, poloCode: true } }),
    ]);
    if (!enrollment) return fail("Aluno não encontrado.");
    if (!tutor) return fail("Escolha um tutor ativo.");
    if (enrollment.ownerId === tutor.id) return ok(undefined, `${tutor.name} já é o tutor deste aluno.`);
    // Aluno ainda sem polo herda o do novo tutor; polo já definido não muda com a troca.
    await prisma.studentEnrollment.update({ where: { id: enrollment.id }, data: { ownerId: tutor.id, ...(!enrollment.poloCode && tutor.poloCode ? { poloCode: tutor.poloCode } : {}) } });
    await recordAudit({ userId: user.id, action: "student.tutor_changed", entityType: "StudentEnrollment", entityId: enrollment.id, metadata: { rgm: enrollment.rgm, from: enrollment.owner.name, to: tutor.name } });
    invalidate();
    revalidatePath(`/academic-analysis/students/${enrollment.id}`);
    revalidatePath("/portal");
    return ok(undefined, `Tutor alterado para ${tutor.name}.`);
  } catch (error) {
    logger.error("student.tutor_change.failed", { errorName: error instanceof Error ? error.name : "unknown" });
    return toActionError(error, "Não foi possível trocar o tutor. Tente novamente.");
  }
}
