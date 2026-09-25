import { handleAcademicUpload } from "@/services/student-portal/upload-handler";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) { return handleAcademicUpload(request, true); }
