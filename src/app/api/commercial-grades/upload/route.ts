import { handleCommercialGradeUpload } from "@/services/commercial-grades/upload-handler";

export const runtime = "nodejs";
// A leitura pela IA pode levar até ~90 s.
export const maxDuration = 120;

export async function POST(request: Request) {
  return handleCommercialGradeUpload(request);
}
