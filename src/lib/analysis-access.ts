import "server-only";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, type SessionUser } from "@/lib/session";

/**
 * Garante que análises e documentos só sejam acessados pelo autor ou por um
 * administrador. Essa regra é aplicada tanto nas páginas quanto nas ações.
 */
export async function requireAnalysisAccess(analysisId: string, user: SessionUser) {
  const analysis = await prisma.curricularAnalysis.findUniqueOrThrow({ where: { id: analysisId } });
  if (user.role !== "ADMIN" && analysis.createdById !== user.id) {
    throw new ForbiddenError("Você só pode acessar as suas próprias análises.");
  }
  return analysis;
}
