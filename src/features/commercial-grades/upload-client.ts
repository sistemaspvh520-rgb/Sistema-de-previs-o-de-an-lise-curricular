/** Envia o PDF de uma grade comercial à API e devolve a mensagem do servidor (ou o motivo real da falha). */
export async function sendCommercialGradePdf(url: string, file: File): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(url, { method: "POST", body: form });
    const body = await response.json().catch(() => ({}) as { error?: string; message?: string });
    if (response.ok) return { ok: true, message: body.message ?? "Grade publicada." };
    if (response.status === 413) return { ok: false, error: "O PDF é maior do que o servidor aceita. Envie um arquivo de até 4 MB." };
    return { ok: false, error: body.error ?? "Não foi possível enviar a grade. Tente novamente." };
  } catch {
    return { ok: false, error: "Falha de rede durante o envio. Verifique a conexão e tente novamente." };
  }
}
