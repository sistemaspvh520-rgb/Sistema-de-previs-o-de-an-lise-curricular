"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Mostra uma senha temporária recém-gerada (ou consultada) com botão de copiar. */
export function TemporaryPasswordDialog({ open, onOpenChange, name, login, password, note }: { open: boolean; onOpenChange: (o: boolean) => void; name: string; login: string; password: string | null; note?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(`Acesso ao sistema de Análise Curricular\nLogin: ${login}\nSenha temporária: ${password}\nTroque a senha no primeiro acesso.`);
      setCopied(true);
      toast.success("Copiado.");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Senha temporária — {name}</DialogTitle>
          <DialogDescription>
            Válida até a pessoa fazer o primeiro acesso e definir a própria senha. Depois disso ela deixa de ser visível; use “Redefinir senha” para gerar outra.
          </DialogDescription>
        </DialogHeader>
        {note && <p className={`rounded-md px-3 py-2 text-sm ${note.startsWith("Convite enviado") ? "bg-status-success-bg text-status-success" : "bg-status-warning-bg text-status-warning"}`}>{note}</p>}
        {password ? (
          <dl className="space-y-2 rounded-lg border bg-muted/40 p-4 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Login</dt><dd className="font-mono">{login}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Senha temporária</dt><dd className="font-mono text-base font-semibold tracking-wide">{password}</dd></div>
          </dl>
        ) : (
          <p className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">Este usuário já definiu a própria senha — não há senha temporária para exibir.</p>
        )}
        <DialogFooter>
          {password && <Button onClick={copy}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />} Copiar acesso</Button>}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
