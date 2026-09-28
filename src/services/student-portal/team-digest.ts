import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getSystemSettings } from "@/repositories/settings-repository";
import { appUrl, isEmailConfigured, sendMail } from "@/services/email/mailer";
import { teamDigestEmail } from "@/services/email/templates";
import { readableName } from "@/lib/text";
import { getTeamInsights } from "./team-insights";

/** Resumo semanal (segunda de manhã) para cada tutor com alunos: só envia quando há algo a fazer. */
export async function sendWeeklyTeamDigests(now = new Date()) {
  if (!isEmailConfigured()) return { sent: 0, skipped: 0, reason: "email-not-configured" };
  const settings = await getSystemSettings();
  const owners = await prisma.user.findMany({
    where: { isActive: true, followUpEmailEnabled: true, role: { in: ["ADMIN", "TUTOR", "ACADEMIC_COORDINATOR"] }, managedStudents: { some: {} } },
    select: { id: true, name: true, email: true },
  });
  let sent = 0;
  let skipped = 0;
  for (const owner of owners) {
    const insights = await getTeamInsights({ ownerId: owner.id }, now);
    const total = insights.actions.length + insights.canAdvance.length + insights.graduating.length + insights.attention.length;
    if (!total) {
      skipped += 1;
      continue;
    }
    const highlights = insights.canAdvance.slice(0, 3).map((item) => `${readableName(item.name)} pode incluir ${item.canAddNow}`);
    try {
      await sendMail({
        to: owner.email,
        kind: "TEAM_DIGEST",
        targetUserId: owner.id,
        content: teamDigestEmail({
          name: owner.name,
          actions: insights.actions.length,
          canAdvance: insights.canAdvance.length,
          graduating: insights.graduating.length,
          attention: insights.attention.length,
          highlights,
          url: appUrl("/academic-analysis/requests"),
          institution: settings.institutionName,
        }),
      });
      sent += 1;
    } catch (error) {
      logger.warn("team_digest.failed", { userId: owner.id, errorName: error instanceof Error ? error.name : "unknown" });
    }
  }
  return { sent, skipped };
}
