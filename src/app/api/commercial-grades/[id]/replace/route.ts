import { NextResponse } from "next/server";
import { z } from "zod";
import { handleCommercialGradeUpload } from "@/services/commercial-grades/upload-handler";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Grade inválida." }, { status: 400 });
  return handleCommercialGradeUpload(request, id);
}
