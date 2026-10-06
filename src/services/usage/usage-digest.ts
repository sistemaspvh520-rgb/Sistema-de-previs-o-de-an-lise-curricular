import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getSystemSettings } from "@/repositories/settings-repository";
import { appUrl, isEmailConfigured, sendMail } from "@/services/email/mailer";
import { usageDigestEmail } from "@/services/email/templates";
import { formatDuration } from "@/domain/usage/metrics";
import { getTeamUsage } from "@/services/usage/team-usage";
import { getGradeUsage } from "@/services/usage/grade-usage";

const WEEK_MS = 7 * 24 * 60 * 60_000;

/** Toda segunda (cron team-digest): resumo de uso dos últimos 7 dias para cada administrador. */
export async function sendWeeklyUsageDigests(now = new Date()) {
  if (!isEmailConfigured()) return { sent: 0, reason: "email-not-configured" };
  const admins = await prisma.user.findMany({ where: { isActive: true, role: "ADMIN", followUpEmailEnabled: true }, select: { id: true, name: true, email: true } });
  if (!admins.length) return { sent: 0 };
  const [week, previous, grades, settings] = await Promise.all([
    getTeamUsage({ from: new Date(now.getTime() - WEEK_MS), to: now }, now),
    getTeamUsage({ from: new Date(now.getTime() - 2 * WEEK_MS), to: new Date(now.getTime() - WEEK_MS) }, now),
    getGradeUsage({ from: new Date(now.getTime() - WEEK_MS), to: now }),
    getSystemSettings(),
  ]);
  const usedInWeek = (report: typeof week) => report.people.filter((person) => person.activeDays > 0 || person.activeSeconds > 0 || person.actions > 0 || person.logins > 0).length;
  const activeWeek = usedInWeek(week);
  const notUsing = week.people.filter((person) => person.activeDays === 0 && person.actions === 0 && person.logins === 0).map((person) => person.name);
  let sent = 0;
  for (const admin of admins) {
    try {
      await sendMail({
        to: admin.email,
        kind: "USAGE_DIGEST",
        targetUserId: admin.id,
        content: usageDigestEmail({
          name: admin.name,
          accounts: week.accounts,
          activeWeek,
          activeDelta: activeWeek - usedInWeek(previous),
          activeTime: formatDuration(week.activeSeconds),
          modules: week.modules.map((module) => ({ label: module.label, people: module.people, time: formatDuration(module.activeSeconds) })),
          notUsing,
          grades: { people: grades.totals.people, accounts: grades.totals.accounts, copies: grades.totals.copies, notUsing: grades.notUsing.map((person) => person.name) },
          url: appUrl("/management/team-usage"),
          institution: settings.institutionName,
        }),
      });
      sent += 1;
    } catch (error) {
      logger.warn("usage_digest.failed", { userId: admin.id, errorName: error instanceof Error ? error.name : "unknown" });
    }
  }
  return { sent };
}
