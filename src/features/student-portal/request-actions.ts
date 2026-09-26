"use server";
import { requirePermission } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { reviewAcademicRequest } from "@/services/academic-documents/requests";
import { deleteAcademicRequest, DeletionBlockedError } from "@/services/student-portal/deletion";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";
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

/** Exclui a solicitação, o documento enviado e a versão da análise que ele gerou. */
export async function deleteAcademicRequestAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("students:manage");
    const parsed = z.object({ requestId: z.string().uuid() }).safeParse(input);
    if (!parsed.success) return fail("Solicitação inválida.");
    const result = await deleteAcademicRequest(user, parsed.data.requestId);
    revalidatePath("/academic-analysis");
    revalidatePath("/academic-analysis/requests");
    revalidatePath(`/academic-analysis/students/${result.enrollmentId}`);
    revalidatePath("/portal");
    return ok(undefined, `Solicitação #${result.protocol} excluída.`);
  } catch (error) {
    if (error instanceof DeletionBlockedError) return fail(error.message);
    return toActionError(error, "Não foi possível excluir a solicitação.");
  }
}
