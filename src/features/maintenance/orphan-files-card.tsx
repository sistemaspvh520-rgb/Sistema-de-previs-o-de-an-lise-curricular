"use client";

import { useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActionResult } from "@/lib/action-result";

/** PDFs de grades comerciais que ficaram no armazenamento sem grade correspondente (envios que falharam). */
export function OrphanFilesCard({ count, action }: { count: number | null; action: () => Promise<ActionResult<{ removed: number }>> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function run() {
    start(async () => {
      try {
        const result = await action();
        if (result.ok) { toast.success(result.message); router.refresh(); } else toast.error(result.error);
      } catch { toast.error("Não foi possível limpar os arquivos. Tente novamente."); }
    });
  }
  return (
    <Card className="mt-6 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Arquivos de grades sem registro</CardTitle>
        <CardDescription>PDFs de grades comerciais que ficaram no armazenamento porque o envio falhou. Arquivos enviados nos últimos 10 minutos são preservados.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        {count === null
          ? <p className="text-sm text-muted-foreground">Não foi possível consultar o armazenamento agora.</p>
          : <p className={count ? "text-sm font-medium" : "rounded-lg bg-status-success-bg px-3 py-2 text-sm text-status-success"}>{count ? `${count} arquivo(s) órfão(s) encontrado(s).` : "Nenhum arquivo órfão."}</p>}
        <Button type="button" variant="outline" disabled={pending || !count} onClick={run}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Remover arquivos sem grade
        </Button>
      </CardContent>
    </Card>
  );
}
