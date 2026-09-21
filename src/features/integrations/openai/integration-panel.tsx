"use client";

import { useState, useTransition } from "react";
import { KeyRound, Loader2, PlugZap, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { IntegrationStatusDot } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/utils";
import { ApiKeyDialog } from "@/features/integrations/openai/api-key-dialog";
import {
  disconnectOpenAIAction,
  testStoredOpenAIConnectionAction,
  updateOpenAIModelsAction,
  type OpenAIIntegrationView,
} from "@/features/integrations/openai/actions";
import { SUGGESTED_MODELS } from "@/services/openai/pricing";
import { OPENAI_ERROR_MESSAGES } from "@/services/openai/error-messages";

export function OpenAIIntegrationPanel({ view }: { view: OpenAIIntegrationView }) {
  const [dialog, setDialog] = useState<null | "connect" | "replace">(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [pending, start] = useTransition();
  const [extractionModel, setExtractionModel] = useState(view.extractionModel);
  const [auditModel, setAuditModel] = useState(view.auditModel);
  const [futureExplanationModel, setFutureExplanationModel] = useState(view.futureExplanationModel ?? "");
  const [projectLabel, setProjectLabel] = useState(view.projectLabel ?? "");
  const [serviceAccountLabel, setServiceAccountLabel] = useState(view.serviceAccountLabel ?? "");

  const connected = view.status !== "DISCONNECTED";

  function test() {
    start(async () => {
      const res = await testStoredOpenAIConnectionAction();
      if (res.ok) toast.success(`${res.message} (${res.data.durationMs} ms)`);
      else toast.error(res.error);
    });
  }

  function disconnect() {
    start(async () => {
      const res = await disconnectOpenAIAction();
      setConfirmDisconnect(false);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }

  function saveModels() {
    start(async () => {
      const res = await updateOpenAIModelsAction({ extractionModel, auditModel, futureExplanationModel, projectLabel, serviceAccountLabel });
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="shadow-sm lg:col-span-2">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">OpenAI</CardTitle>
              <CardDescription>
                Configure a inteligência artificial utilizada para leitura e auditoria das análises curriculares.
              </CardDescription>
            </div>
            <IntegrationStatusDot status={view.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {!connected ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <PlugZap className="mx-auto size-8 text-brand-cyan" />
              <p className="mt-3 text-sm text-muted-foreground">
                Nenhuma API Key cadastrada. Conecte o projeto dedicado da OpenAI para habilitar a leitura automática de PDFs.
              </p>
              <Button className="mt-4" onClick={() => setDialog("connect")}>
                <PlugZap className="size-4" /> Conectar OpenAI
              </Button>
            </div>
          ) : (
            <>
              <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Projeto</dt>
                  <dd className="font-medium">{view.projectLabel ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Service Account</dt>
                  <dd className="font-medium">{view.serviceAccountLabel ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">API Key</dt>
                  <dd className="font-mono">••••••••••••••{view.apiKeyLastFour ?? "????"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Último teste</dt>
                  <dd>{formatDateTime(view.lastTestedAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    {view.status === "CONNECTED" ? (
                      <span className="text-status-success">Operacional</span>
                    ) : (
                      <span className="text-status-danger">
                        Falha no último teste{view.lastErrorCode ? ` — ${OPENAI_ERROR_MESSAGES[view.lastErrorCode as keyof typeof OPENAI_ERROR_MESSAGES] ?? view.lastErrorCode}` : ""}
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={test} disabled={pending}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Testar conexão
                </Button>
                <Button variant="outline" onClick={() => setDialog("replace")} disabled={pending}>
                  <KeyRound className="size-4" /> Atualizar API Key
                </Button>
                <Button variant="destructive" onClick={() => setConfirmDisconnect(true)} disabled={pending}>
                  <Unplug className="size-4" /> Desconectar
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Modelos</CardTitle>
          <CardDescription>Validados na OpenAI antes de salvar quando a integração estiver conectada.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <datalist id="openai-models">
            {SUGGESTED_MODELS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <div className="space-y-2">
            <Label htmlFor="extractionModel">Modelo de extração</Label>
            <Input id="extractionModel" list="openai-models" value={extractionModel} onChange={(e) => setExtractionModel(e.target.value)} className="font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="auditModel">Modelo de auditoria</Label>
            <Input id="auditModel" list="openai-models" value={auditModel} onChange={(e) => setAuditModel(e.target.value)} className="font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="futureExplanationModel">Modelo de explicação (opcional)</Label>
            <Input id="futureExplanationModel" list="openai-models" value={futureExplanationModel} onChange={(e) => setFutureExplanationModel(e.target.value)} className="font-mono text-sm" placeholder="—" />
          </div>
          {connected && (
            <>
              <div className="space-y-2">
                <Label htmlFor="projectLabel2">Projeto (rótulo)</Label>
                <Input id="projectLabel2" value={projectLabel} onChange={(e) => setProjectLabel(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="serviceAccountLabel2">Service Account (rótulo)</Label>
                <Input id="serviceAccountLabel2" value={serviceAccountLabel} onChange={(e) => setServiceAccountLabel(e.target.value)} />
              </div>
            </>
          )}
          <Button onClick={saveModels} disabled={pending} className="w-full">
            {pending && <Loader2 className="size-4 animate-spin" />} Salvar
          </Button>
        </CardContent>
      </Card>

      <ApiKeyDialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)} mode={dialog ?? "connect"} />

      <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar OpenAI?</AlertDialogTitle>
            <AlertDialogDescription>
              A chave criptografada será removida deste sistema e novas análises não poderão usar IA até uma nova conexão.
              Remover a chave daqui <strong>não</strong> a revoga na OpenAI — se necessário, revogue-a também no painel da OpenAI.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); disconnect(); }} disabled={pending} className="bg-destructive text-white hover:bg-destructive/90">
              {pending && <Loader2 className="size-4 animate-spin" />} Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
