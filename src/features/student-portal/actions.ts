"use server";
import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission, getSessionUser } from "@/lib/session";
import {
  fail,
  ok,
  toActionError,
  type ActionResult,
} from "@/lib/action-result";
import { rateLimit } from "@/services/rate-limit/rate-limit";
import { requireEnrollment } from "@/services/student-portal/access";
import {
  ensureEnrollment,
  PortalInputError,
} from "@/services/student-portal/enrollments";
import { issuePasswordToken } from "@/features/users/password-tokens";
import { appUrl, isEmailConfigured, sendMail } from "@/services/email/mailer";
import { inviteEmail, resetEmail } from "@/services/email/templates";
import { recordAudit } from "@/services/audit-log/audit-log";
import { lockEnrollment } from "@/services/student-portal/versions";

const createSchema = z.object({
  name: z.string().trim().min(2).max(160),
  rgm: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[\p{L}\p{N}.\/-]+$/u, "RGM inválido."),
  email: z.string().trim().email().toLowerCase().optional(),
  courseName: z.string().trim().max(200).optional(),
});
type AccessResult = {
  enrollmentId: string;
  link?: string;
  expiresAt?: string;
  duplicate?: boolean;
};

async function deliverLink(
  enrollmentId: string,
  purpose: "INVITE" | "RESET",
  actor: { id: string; name: string },
) {
  const enrollment = await prisma.studentEnrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    include: { studentUser: true },
  });
  const user = enrollment.studentUser;
  if (!user?.isActive)
    throw new PortalInputError("Ative o acesso antes de enviar um link.");
  const issued = await issuePasswordToken(user.id, purpose, actor.id);
  const url = appUrl(`/portal/definir-senha?token=${issued.token}`);
  let sent = false;
  if (isEmailConfigured()) {
    try {
      await sendMail({
        to: user.email,
        kind: purpose,
        actorUserId: actor.id,
        targetUserId: user.id,
        content:
          purpose === "INVITE"
            ? inviteEmail({
                name: user.name,
                login: user.email,
                url,
                invitedBy: actor.name,
                validDays: 7,
                institution: "Cruzeiro do Sul Virtual · Portal Acadêmico",
              })
            : resetEmail({
                name: user.name,
                login: user.email,
                url,
                validMinutes: 60,
                institution: "Cruzeiro do Sul Virtual · Portal Acadêmico",
              }),
      });
      sent = true;
    } catch {
      /* The same short-lived link can be copied by the authorized tutor. */
    }
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { inviteSentAt: new Date() },
  });
  await recordAudit({
    userId: actor.id,
    action: purpose === "INVITE" ? "INVITE_SENT" : "PASSWORD_RESET_REQUESTED",
    entityType: "StudentEnrollment",
    entityId: enrollmentId,
    metadata: { deliveredByEmail: sent },
  });
  return {
    enrollmentId,
    ...(sent ? {} : { link: url }),
    expiresAt: issued.expiresAt.toISOString(),
  };
}

export async function createStudentAction(
  input: unknown,
): Promise<ActionResult<AccessResult>> {
  try {
    const actor = await requirePermission("students:manage");
    if (
      !rateLimit(`student-create:${actor.id}`, {
        capacity: 10,
        refillPerMinute: 2,
      }).allowed
    )
      return fail("Aguarde antes de criar outro acesso.");
    const data = createSchema.parse(input);
    const existing = await prisma.studentEnrollment.findFirst({
      where: {
        rgm: data.rgm,
        ...(actor.role === "ADMIN" ? {} : { ownerId: actor.id }),
      },
    });
    if (existing?.studentUserId)
      return ok(
        { enrollmentId: existing.id, duplicate: true },
        "Parece que este aluno já possui cadastro.",
      );
    if (data.email) {
      const emailUser = await prisma.user.findUnique({
        where: { email: data.email },
        include: {
          studentEnrollments: {
            where: actor.role === "ADMIN" ? {} : { ownerId: actor.id },
            select: { id: true },
          },
        },
      });
      if (emailUser) {
        const linked = emailUser.studentEnrollments[0];
        return linked
          ? ok(
              { enrollmentId: linked.id, duplicate: true },
              "Parece que este aluno já possui cadastro.",
            )
          : fail(
              "Este e-mail já está cadastrado. Confira o vínculo com a administração.",
            );
      }
    }
    const enrollment = await ensureEnrollment(actor, data);
    if (!data.email) {
      revalidatePath("/academic-analysis/students");
      return ok(
        { enrollmentId: enrollment.id },
        "Aluno vinculado às análises existentes.",
      );
    }
    const passwordHash = await hash(randomBytes(48).toString("base64url")); // Unusable random credential, never exposed or stored reversibly.
    await prisma.$transaction(async (tx) => {
      await lockEnrollment(tx, enrollment.id);
      const current = await tx.studentEnrollment.findUniqueOrThrow({
        where: { id: enrollment.id },
      });
      if (current.studentUserId)
        throw new PortalInputError(
          "Este aluno já possui acesso. Abra o cadastro existente.",
        );
      const account = await tx.user.create({
        data: {
          name: enrollment.name,
          email: data.email!,
          passwordHash,
          role: "STUDENT",
          mustChangePassword: true,
          followUpEmailEnabled: false,
          followUpPushEnabled: false,
        },
      });
      await tx.studentEnrollment.update({
        where: { id: enrollment.id },
        data: { studentUserId: account.id },
      });
    });
    const result = await deliverLink(enrollment.id, "INVITE", actor);
    revalidatePath("/academic-analysis/students");
    return ok(
      result,
      result.link
        ? "Acesso criado. Compartilhe o convite temporário com o aluno."
        : "Convite enviado ao aluno.",
    );
  } catch (error) {
    if (error instanceof PortalInputError) return fail(error.message);
    if (error instanceof z.ZodError)
      return fail(error.issues[0]?.message ?? "Dados inválidos.");
    return toActionError(
      error,
      "Não foi possível criar o acesso. Confira se o RGM ou e-mail já estão cadastrados.",
    );
  }
}

export async function studentAccessAction(
  input: unknown,
): Promise<ActionResult<AccessResult>> {
  try {
    const actor = await requirePermission("students:manage");
    const data = z
      .object({
        enrollmentId: z.string().uuid(),
        action: z.enum(["INVITE", "RESET", "BLOCK", "ACTIVATE", "CONTACT"]),
        email: z.string().trim().email().toLowerCase().optional(),
        confirmed: z.literal(true),
      })
      .parse(input);
    if (
      !rateLimit(`student-access:${actor.id}`, {
        capacity: 8,
        refillPerMinute: 2,
      }).allowed
    )
      return fail("Aguarde antes de solicitar outro envio.");
    const enrollment = await requireEnrollment(actor, data.enrollmentId);
    if (!enrollment.studentUser)
      return fail("Crie o acesso deste aluno primeiro.");
    if (data.action === "INVITE" || data.action === "RESET") {
      const purpose = enrollment.studentUser.mustChangePassword
        ? "INVITE"
        : "RESET";
      const result = await deliverLink(enrollment.id, purpose, actor);
      return ok(
        result,
        result.link
          ? "Link temporário pronto para compartilhar."
          : "Instruções enviadas ao aluno.",
      );
    }
    if (data.action === "CONTACT" && !data.email)
      return fail("Informe um e-mail válido.");
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${enrollment.studentUserId}::uuid FOR UPDATE`;
      await tx.user.update({
        where: { id: enrollment.studentUserId! },
        data: {
          ...(data.action === "BLOCK"
            ? { isActive: false }
            : data.action === "ACTIVATE"
              ? { isActive: true }
              : { email: data.email }),
          sessionVersion: { increment: 1 },
        },
      });
      await tx.passwordToken.updateMany({
        where: { userId: enrollment.studentUserId!, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action:
            data.action === "BLOCK"
              ? "ACCESS_DISABLED"
              : data.action === "ACTIVATE"
                ? "ACCESS_ACTIVATED"
                : "CONTACT_UPDATED",
          entityType: "StudentEnrollment",
          entityId: enrollment.id,
        },
      });
    });
    revalidatePath("/academic-analysis/students");
    revalidatePath("/portal");
    if (
      data.action === "CONTACT" &&
      enrollment.studentUser.isActive &&
      enrollment.studentUser.mustChangePassword
    ) {
      return ok(
        await deliverLink(enrollment.id, "INVITE", actor),
        "Contato atualizado. Um novo convite foi gerado para o e-mail corrigido.",
      );
    }
    return ok({ enrollmentId: enrollment.id }, "Acesso atualizado.");
  } catch (error) {
    if (error instanceof PortalInputError) return fail(error.message);
    return toActionError(
      error,
      "Não foi possível atualizar o acesso. Verifique se o e-mail já está em uso.",
    );
  }
}

export async function viewStudentPortalAction(form: FormData) {
  const user = await requirePermission("students:manage");
  const id = z.string().uuid().parse(form.get("enrollmentId"));
  await requireEnrollment(user, id);
  await recordAudit({
    userId: user.id,
    action: "TUTOR_VIEWED_AS_STUDENT",
    entityType: "StudentEnrollment",
    entityId: id,
  });
  redirect(`/portal?student=${id}`);
}

export async function dismissWelcomeAction() {
  const user = await getSessionUser({ allowStudent: true });
  if (!user || user.role !== "STUDENT") return;
  await prisma.studentEnrollment.updateMany({
    where: { studentUserId: user.id, welcomedAt: null },
    data: { welcomedAt: new Date() },
  });
  revalidatePath("/portal");
}

export async function linkLegacyStudentAction(
  reviewId: string,
): Promise<ActionResult<{ enrollmentId: string }>> {
  try {
    const actor = await requirePermission("students:manage");
    const id = z.string().uuid().parse(reviewId);
    const review = await prisma.academicGridReview.findFirst({
      where: {
        id,
        ...(actor.role === "ADMIN" ? {} : { createdById: actor.id }),
      },
    });
    if (!review?.rgm || !review.studentName)
      return fail("Confira o nome e RGM desta análise antes de vinculá-la.");
    const enrollment = await ensureEnrollment(actor, {
      rgm: review.rgm,
      name: review.studentName,
      courseName: review.courseName,
    });
    revalidatePath("/academic-analysis/students");
    return ok({ enrollmentId: enrollment.id });
  } catch (error) {
    return error instanceof PortalInputError
      ? fail(error.message)
      : toActionError(error);
  }
}
