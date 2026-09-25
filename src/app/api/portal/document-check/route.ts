import { getSessionUser } from "@/lib/session";
import { requireEnrollment } from "@/services/student-portal/access";
import { prisma } from "@/lib/prisma";
export async function GET(request: Request) {
  const user = await getSessionUser({ allowStudent: true });
  if (!user)
    return Response.json(
      { error: "Faça login para continuar." },
      { status: 401 },
    );
  try {
    const query = new URL(request.url).searchParams;
    const enrollment = await requireEnrollment(
      user,
      query.get("enrollmentId") ?? undefined,
    );
    const hash = query.get("hash");
    if (!hash || !/^[a-f0-9]{64}$/.test(hash))
      return Response.json({ duplicate: false });
    const source = await prisma.academicAnalysisSource.findUnique({
      where: {
        enrollmentId_sourceFileHash: {
          enrollmentId: enrollment.id,
          sourceFileHash: hash,
        },
      },
      include: { requests: { orderBy: { attempt: "desc" }, take: 1 } },
    });
    const rejected =
      source?.requests.some((r) =>
        ["REJECTED", "WAITING_NEW_DOCUMENT"].includes(r.status),
      ) ?? false;
    return Response.json(
      { duplicate: source?.status === "COMPLETED" && !rejected, rejected },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Acesso negado." }, { status: 403 });
  }
}
