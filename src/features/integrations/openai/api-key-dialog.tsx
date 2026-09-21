"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { connectOpenAIAction, replaceOpenAIKeyAction } from "@/features/integrations/openai/actions";

type Phase = "idle" | "testing" | "success" | "error";

export function ApiKeyDialog({
  open,
  onOpenChange,
  mode,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: "connect" | "replace";
}) {
  const [apiKey, setApiKey] = useState("");
  const [show, setShow] = useState(false);
  const [projectLabel, setProjectLabel] = useState("Analise Curricular - Cruzeiro do Sul");
  const [serviceAccountLabel, setServiceAccountLabel] = useState("analise-curricular-web");
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    setApiKey("");
    setShow(false);
    setPhase("idle");
    setMessage(null);
  }

  function close(o: boolean) {
    if (!o) reset();
    onOpenChange(o);
  }

  function submit() {
    setPhase("testing");
    setMessage(null);
    start(async () => {
      const res =
        mode === "connect"
          ? await connectOpenAIAction({ apiKey, projectLabel, serviceAccountLabel })
          : await replaceOpenAIKeyAction({ apiKey });
      // a chave em memória do cliente é descartada imediatamente após o envio
      setApiKey("");
      if (res.ok) {
        setPhase("success");
        setMessage(res.message ?? "Conexão estabelecida.");
        toast.success(res.message ?? "Conexão estabelecida.");
        setTimeout(() => close(false), 900);
      } else {
        setPhase("error");
        setMessage(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "connect" ? "Conectar OpenAI" : "Atualizar API Key"}</DialogTitle>
          <DialogDescription>
            Insira a API Key do projeto OpenAI dedicado à aplicação. A credencial será utilizada exclusivamente pelo
            servidor e armazenada criptografada. Ela nunca é devolvida ao navegador.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key do projeto</Label>
            <div className="relative">
              <Input
                id="apiKey"
                type={show ? "text" : "password"}
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="pr-10 font-mono"
                disabled={pending}
                required
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                aria-label={show ? "Ocultar chave" : "Mostrar chave"}
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Use uma chave de Service Account do projeto dedicado. Nunca utilize chave pessoal ou de produção em desenvolvimento.
            </p>
          </div>

          {mode === "connect" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="projectLabel">Projeto (rótulo)</Label>
                <Input id="projectLabel" value={projectLabel} onChange={(e) => setProjectLabel(e.target.value)} disabled={pending} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="serviceAccountLabel">Service Account (rótulo)</Label>
                <Input id="serviceAccountLabel" value={serviceAccountLabel} onChange={(e) => setServiceAccountLabel(e.target.value)} disabled={pending} />
              </div>
            </div>
          )}

          {phase === "testing" && (
            <div className="flex items-center gap-2 rounded-md bg-status-info-bg px-3 py-2 text-sm text-status-info" role="status">
              <Loader2 className="size-4 animate-spin" /> Testando conexão...
            </div>
          )}
          {phase === "success" && (
            <div className="flex items-center gap-2 rounded-md bg-status-success-bg px-3 py-2 text-sm text-status-success" role="status">
              <CheckCircle2 className="size-4" /> {message}
            </div>
          )}
          {phase === "error" && (
            <div className="space-y-1 rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger" role="alert">
              <div className="flex items-center gap-2 font-medium">
                <XCircle className="size-4" /> Não foi possível conectar à OpenAI.
              </div>
              <p>{message}</p>
              <p className="text-xs opacity-80">
                Verifique se a chave está ativa, possui acesso à API e se o projeto possui faturamento/configuração adequada.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || apiKey.trim().length < 20}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Validar e conectar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
