"use server";
import { requirePermission } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { reviewAcademicRequest } from "@/services/academic-documents/requests";
export async function academicRequestAction(
  _state: { error?: string; success?: string },
  form: FormData,
): Promise<{ error?: string; success?: string }> {
  const user = await requirePermission("students:manage");
  const parsed = z
    .object({
      id: z.string().uuid(),
      action: z.enum(["CONCLUDE", "REJECT", "REVIEW"]),
      reason: z.string().max(1000),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Confira os dados da solicitação." };
  try {
    await reviewAcademicRequest(
      user,
      parsed.data.id,
      parsed.data.action,
      parsed.data.reason,
    );
    revalidatePath("/academic-analysis");
    revalidatePath("/academic-analysis/requests");
    revalidatePath(`/academic-analysis/requests/${parsed.data.id}`);
    revalidatePath("/portal");
    return { success: "Solicitação atualizada." };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Não foi possível atualizar.",
    };
  }
}
