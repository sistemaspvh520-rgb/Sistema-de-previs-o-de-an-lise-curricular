export type GradeSendResult = { ok: true; message: string; warning: boolean; action?: "created" | "updated" | "unchanged" } | { ok: false; error: string };

/** Envia o PDF de uma grade comercial à API e devolve a mensagem do servidor (ou o motivo real da falha). */
export async function sendCommercialGradePdf(url: string, file: File, options: { upsert?: boolean } = {}): Promise<GradeSendResult> {
  const form = new FormData();
  form.append("file", file);
  // Envio em lote: o mesmo PDF vira "sem mudança" e uma grade do mesmo curso é atualizada em vez de recusada.
  if (options.upsert) form.append("mode", "upsert");
  return postGrade(url, form);
}

/** Pede ao servidor para reler, com a IA, o PDF já guardado da grade. */
export function rereadCommercialGrade(id: string): Promise<GradeSendResult> {
  return postGrade(`/api/commercial-grades/${id}/reread`);
}

async function postGrade(url: string, body?: FormData): Promise<GradeSendResult> {
  try {
    const response = await fetch(url, { method: "POST", body });
    const data = await response.json().catch(() => ({}) as { error?: string; message?: string; warning?: boolean; action?: "created" | "updated" | "unchanged" });
    if (response.ok) return { ok: true, message: data.message ?? "Grade publicada.", warning: Boolean(data.warning), action: data.action };
    if (response.status === 413) return { ok: false, error: "O PDF é maior do que o servidor aceita. Envie um arquivo de até 4 MB." };
    return { ok: false, error: data.error ?? "Não foi possível enviar a grade. Tente novamente." };
  } catch {
    return { ok: false, error: "Falha de rede durante o envio. Verifique a conexão e tente novamente." };
  }
}
