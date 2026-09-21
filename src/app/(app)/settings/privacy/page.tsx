import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getSystemSettings } from "@/repositories/settings-repository";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PrivacyForm } from "@/features/settings/privacy-form";

export const metadata: Metadata = { title: "Privacidade" };
export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  await requirePagePermission("privacy:manage");
  const settings = await getSystemSettings();
  const [stored, due, deleted] = await Promise.all([
    prisma.uploadedDocument.count({ where: { deletedAt: null } }),
    prisma.uploadedDocument.count({ where: { deletedAt: null, deleteAfter: { lte: new Date() } } }),
    prisma.uploadedDocument.count({ where: { deletedAt: { not: null } } }),
  ]);

  return (
    <>
      <PageHeader eyebrow="Configurações" title="Privacidade (LGPD)" description="Minimização de dados, retenção dos documentos e o que é compartilhado com a IA." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Política</CardTitle>
            <CardDescription>Alterações são registradas na auditoria.</CardDescription>
          </CardHeader>
          <CardContent>
            <PrivacyForm initial={{ retentionPolicy: settings.retentionPolicy, aiPrivacyMode: settings.aiPrivacyMode }} />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-base">Documentos</CardTitle></CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Armazenados</dt><dd className="font-semibold">{stored}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Vencidos (a remover)</dt><dd className="font-semibold text-status-warning">{due}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Já removidos</dt><dd className="font-semibold">{deleted}</dd></div>
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              Rotina automática: agende <code className="font-mono">GET /api/cron/retention</code> com <code className="font-mono">Authorization: Bearer CRON_SECRET</code> ou execute <code className="font-mono">npm run retention:run</code>.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
