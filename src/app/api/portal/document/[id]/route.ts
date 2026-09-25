import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { enrollmentScope } from "@/services/student-portal/access";
import { getStorage } from "@/services/storage/storage";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser({ allowStudent: true });
  if (!user)
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return new Response(null, { status: 404 });
  try {
    const source = await prisma.academicAnalysisSource.findFirst({
      where: { id, enrollment: enrollmentScope(user) },
    });
    if (!source?.storageKey || source.deletedAt)
      return new Response(null, { status: 404 });
    return new Response(
      new Uint8Array(await getStorage().read(source.storageKey)),
      {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": "inline; filename=documento-academico.pdf",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch {
    return new Response(null, { status: 404 });
  }
}
