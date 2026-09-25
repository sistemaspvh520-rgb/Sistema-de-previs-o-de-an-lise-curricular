import "server-only";
import { prisma } from "@/lib/prisma";
import { appUrl, isEmailConfigured, sendMail } from "@/services/email/mailer";
import { logger } from "@/lib/logger";

export async function notifyAcademicUpdate(
  enrollmentId: string,
  actorUserId: string,
) {
  try {
    const enrollment = await prisma.studentEnrollment.findUnique({
      where: { id: enrollmentId },
      include: { studentUser: true },
    });
    if (
      !enrollment?.studentUser?.isActive ||
      enrollment.studentUserId === actorUserId ||
      !isEmailConfigured()
    )
      return;
    const url = appUrl("/portal");
    await sendMail({
      to: enrollment.studentUser.email,
      kind: "ACADEMIC_UPDATE",
      actorUserId,
      targetUserId: enrollment.studentUser.id,
      content: {
        subject: "Sua análise acadêmica foi atualizada",
        text: `A equipe acadêmica atualizou sua análise. Acesse seu Portal Acadêmico: ${url}`,
        html: `<p>A equipe acadêmica atualizou sua análise.</p><p><a href="${url}">Acessar meu Portal Acadêmico</a></p>`,
      },
    });
  } catch {
    logger.warn("portal.notification_failed", { enrollmentId });
  }
}
