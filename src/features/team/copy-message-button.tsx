"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";

export function CopyMessageButton({ message }: { message: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Mensagem copiada. Cole no WhatsApp ou no e-mail do aluno.");
    } catch {
      toast.error("Não foi possível copiar a mensagem.");
    }
  }
  return (
    <button type="button" onClick={copy} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-[#003B71] transition-colors hover:border-brand-cyan/40 hover:bg-brand-cyan-50">
      <Copy className="size-3.5" /> Copiar mensagem
    </button>
  );
}
