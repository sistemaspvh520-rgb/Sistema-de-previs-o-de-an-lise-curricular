import "server-only";
import { prisma } from "@/lib/prisma";
import { appUrl, isEmailConfigured, sendMail } from "@/services/email/mailer";
import { academicUpdateEmail } from "@/services/email/templates";
import { getSystemSettings } from "@/repositories/settings-repository";
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
    const settings = await getSystemSettings();
    await sendMail({
      to: enrollment.studentUser.email,
      kind: "ACADEMIC_UPDATE",
      actorUserId,
      targetUserId: enrollment.studentUser.id,
      content: academicUpdateEmail({ url, institution: settings.institutionName }),
    });
  } catch {
    logger.warn("portal.notification_failed", { enrollmentId });
  }
}
