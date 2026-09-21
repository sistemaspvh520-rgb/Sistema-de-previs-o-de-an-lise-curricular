import "server-only";
import { prisma } from "@/lib/prisma";

export async function getDashboardStats() {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [monthCount, waitingReview, completed, usageAgg, recent, integration, failed] = await Promise.all([
    prisma.curricularAnalysis.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.curricularAnalysis.count({ where: { status: "WAITING_REVIEW" } }),
    prisma.curricularAnalysis.count({ where: { status: "COMPLETED" } }),
    prisma.aIUsage.aggregate({ _sum: { estimatedCost: true, totalTokens: true }, where: { createdAt: { gte: startOfMonth } } }),
    prisma.curricularAnalysis.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        status: true,
        courseName: true,
        candidateLabel: true,
        reliability: true,
        reviewItemsCount: true,
        createdAt: true,
        createdBy: { select: { name: true } },
        document: { select: { originalName: true } },
      },
    }),
    prisma.openAIIntegration.findUnique({
      where: { id: "default" },
      select: { status: true, lastTestedAt: true, extractionModel: true, auditModel: true, apiKeyLastFour: true },
    }),
    prisma.curricularAnalysis.count({ where: { status: { in: ["FAILED", "AI_ERROR"] } } }),
  ]);

  return {
    monthCount,
    waitingReview,
    completed,
    failed,
    monthCost: Number(usageAgg._sum.estimatedCost ?? 0),
    monthTokens: usageAgg._sum.totalTokens ?? 0,
    recent,
    integration,
  };
}
