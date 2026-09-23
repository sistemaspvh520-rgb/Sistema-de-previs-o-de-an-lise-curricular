import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { appUrl, isEmailConfigured, sendMail } from "@/services/email/mailer";
import { followUpEmail } from "@/services/email/templates";
import { getSystemSettings } from "@/repositories/settings-repository";
import { sendPushToUser } from "@/services/push/web-push";
import {
  businessDaysSince,
  isBusinessHours,
  isSameNotificationPeriod,
  isSameZonedDate,
  notificationPeriod,
} from "@/lib/time";

/** Depois do primeiro aviso, cobra novamente no próximo dia útil enquanto não houver retorno. */
const dueWhere = (now: Date) => ({
  status: "COMPLETED" as const,
  enrollmentStatus: "PENDING" as const,
  followUpDueAt: { lte: now },
});

/** Retornos de matrícula vencidos (para o sino do consultor; ADMIN sem userId vê todos). */
export async function listDueFollowUps(userId: string | undefined, take = 20) {
  const now = new Date();
  return prisma.curricularAnalysis.findMany({
    where: { ...dueWhere(now), ...(userId ? { createdById: userId } : {}) },
    orderBy: { followUpDueAt: "asc" },
    take,
    select: {
      id: true,
      studentName: true,
      courseName: true,
      poloName: true,
      followUpDueAt: true,
      completedAt: true,
      enrollmentReanalysisAt: true,
      createdBy: { select: { id: true, name: true } },
    },
  });
}

export async function countDueFollowUps(
  userId: string | undefined,
): Promise<number> {
  return prisma.curricularAnalysis.count({
    where: {
      ...dueWhere(new Date()),
      ...(userId ? { createdById: userId } : {}),
    },
  });
}

/**
 * Cobra os retornos vencidos por e-mail (um por consultor, com a lista) e push (um por consultor).
 * Cada dia elegível tem duas janelas independentes: manhã e tarde. A marcação por
 * período torna reexecuções do cron idempotentes para o mesmo aviso.
 */
export async function notifyDueFollowUps(now = new Date()) {
  const settings = await getSystemSettings();
  const due = await prisma.curricularAnalysis.findMany({
    where: {
      ...dueWhere(now),
    },
    orderBy: { followUpDueAt: "asc" },
    select: {
      id: true,
      studentName: true,
      courseName: true,
      poloName: true,
      completedAt: true,
      enrollmentReanalysisAt: true,
      followUpNotifiedAt: true,
      followUpNotificationCount: true,
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
          followUpEmailEnabled: true,
          followUpPushEnabled: true,
          followUpRepeatBusinessDays: true,
          followUpMaxReminders: true,
          followUpBusinessStartHour: true,
          followUpBusinessEndHour: true,
          followUpCadence: true,
        },
      },
    },
  });
  const byUser = new Map<string, typeof due>();
  for (const a of due) {
    if (!a.createdBy.isActive) continue;
    if (!a.createdBy.followUpCadence) continue;
    if (
      a.createdBy.followUpCadence === "ONCE_DAILY" &&
      notificationPeriod(now) === "afternoon"
    )
      continue;
    const startHour =
      a.createdBy.followUpBusinessStartHour ??
      settings.followUpBusinessStartHour;
    const endHour =
      a.createdBy.followUpBusinessEndHour ?? settings.followUpBusinessEndHour;
    if (!isBusinessHours(now, startHour, endHour)) continue;
    if (
      a.followUpNotifiedAt &&
      isSameNotificationPeriod(a.followUpNotifiedAt, now)
    )
      continue;
    // A frequência é medida entre dias úteis. Dentro de um mesmo dia elegível,
    // manhã e tarde são sempre avisos distintos.
    if (
      a.followUpNotifiedAt &&
      !isSameZonedDate(a.followUpNotifiedAt, now) &&
      businessDaysSince(a.followUpNotifiedAt, now) <
        a.createdBy.followUpRepeatBusinessDays
    )
      continue;
    byUser.set(a.createdBy.id, [...(byUser.get(a.createdBy.id) ?? []), a]);
  }
  let emails = 0;
  let pushes = 0;
  for (const [userId, items] of byUser) {
    const user = items[0].createdBy;
    const list = items.map((a) => ({
      id: a.id,
      student: a.studentName ?? "Aluno não identificado",
      course: a.courseName ?? "Curso não identificado",
      polo: a.poloName ?? "—",
      url: appUrl(`/analyses/${a.id}`),
      completedAt: a.completedAt,
      reanalysis: a.enrollmentReanalysisAt !== null,
      businessDaysOpen: businessDaysSince(
        a.enrollmentReanalysisAt ?? a.completedAt,
        now,
      ),
    }));
    let emailDelivered = false;
    if (user.followUpEmailEnabled && isEmailConfigured()) {
      try {
        await sendMail({
          to: user.email,
          kind: "FOLLOW_UP",
          targetUserId: userId,
          content: followUpEmail({
            name: user.name,
            items: list,
            listUrl: appUrl("/analyses?followUp=due"),
            institution: settings.institutionName,
          }),
        });
        emails += 1;
        emailDelivered = true;
      } catch (err) {
        logger.warn("follow_up.email_failed", { userId, err: String(err) });
      }
    }
    const urgent = list.some((item) => item.businessDaysOpen > 2);
    const title = urgent
      ? `URGENTE: ${list.length} resultado(s) sem atualização`
      : items.length === 1
        ? "Verifique o resultado do atendimento"
        : `${items.length} resultados aguardando atualização`;
    const body =
      items.length === 1
        ? `${list[0].student} · ${list[0].course}. Verifique o resultado e atualize a situação.`
        : `Verifique e atualize a situação de ${list
            .map((i) => i.student)
            .slice(0, 3)
            .join(
              ", ",
            )}${items.length > 3 ? " e outros" : ""} se matricularam.`;
    const result = user.followUpPushEnabled
      ? await sendPushToUser(userId, {
          title,
          body,
          url:
            items.length === 1
              ? `/analyses/${items[0].id}`
              : "/analyses?followUp=due",
          tag: "follow-up",
        })
      : { sent: 0, removed: 0 };
    pushes += result.sent;
    // Só registra o aviso se algum canal o aceitou. Assim uma falha de e-mail
    // ou push volta a ser tentada na próxima execução útil.
    if (emailDelivered || result.sent > 0) {
      await prisma.curricularAnalysis.updateMany({
        where: { id: { in: items.map((a) => a.id) } },
        data: {
          followUpNotifiedAt: now,
          followUpNotificationCount: { increment: 1 },
        },
      });
    }
  }
  return {
    analyses: due.length,
    users: byUser.size,
    emails,
    pushes,
    skippedOutsideBusinessHours: false,
  };
}
