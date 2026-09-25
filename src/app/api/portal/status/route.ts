import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { requireEnrollment } from "@/services/student-portal/access";
import { STALE_JOB_MS } from "@/services/student-portal/processing";
export async function GET(request: Request) {
  const user = await getSessionUser({ allowStudent: true });
  if (!user)
    return NextResponse.json(
      { error: "Faça login para continuar." },
      { status: 401 },
    );
  try {
    const params = new URL(request.url).searchParams;
    const enrollment = await requireEnrollment(
      user,
      params.get("enrollmentId") ?? undefined,
    );
    const job = await prisma.academicAnalysisSource.findFirst({
      where: {
        enrollmentId: enrollment.id,
        ...(params.get("jobId") ? { id: params.get("jobId")! } : {}),
      },
      orderBy: { updatedAt: "desc" },
    });
    const stale =
      job?.status === "PROCESSING" &&
      job.updatedAt.getTime() < Date.now() - STALE_JOB_MS;
    return NextResponse.json(
      {
        status: stale ? "FAILED" : (job?.status ?? null),
        stage: job?.stage,
        error: stale
          ? "O processamento foi interrompido. Envie o extrato novamente."
          : job?.errorMessage,
        reused: job?.reused,
        currentReviewId:
          user.role === "STUDENT"
            ? undefined
            : enrollment.currentVersion?.reviewId,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }
}
