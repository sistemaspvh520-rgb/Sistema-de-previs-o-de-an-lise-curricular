"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { sendSentryTestAction } from "./sentry-actions";

export function SentryCard({ enabled }: { enabled: boolean }) {
  const [pending, start] = useTransition();
  const test = () =>
    start(async () => {
      const result = await sendSentryTestAction();
      if (result.ok) toast.success(`Erro de teste enviado. Confira em Issues no Sentry (evento ${result.data.eventId.slice(0, 8)}).`);
      else toast.error(result.error);
    });
  return (
    <Card className="mt-6 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="size-4" /> Monitoramento de erros (Sentry)
          <span className={enabled ? "rounded-full bg-status-success-bg px-2 py-0.5 text-xs text-status-success" : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"}>
            {enabled ? "Ativo" : "Desligado"}
          </span>
        </CardTitle>
        <CardDescription>
          {enabled
            ? "Erros de páginas, login, envio de documentos e ações do servidor são registrados no Sentry, sem dados pessoais."
            : "Para ligar, cadastre NEXT_PUBLIC_SENTRY_DSN nas variáveis de ambiente da Vercel e faça Redeploy."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={test} disabled={!enabled || pending}>
          {pending ? "Enviando…" : "Enviar erro de teste"}
        </Button>
      </CardContent>
    </Card>
  );
}
