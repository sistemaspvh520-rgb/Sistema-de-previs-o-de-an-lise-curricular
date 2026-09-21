import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/rbac";
import { formatDateTime } from "@/lib/utils";
import { UserFormDialog } from "@/features/users/user-form-dialog";
import { UserRowActions } from "@/features/users/user-row-actions";
import { isEmailConfigured } from "@/services/email/mailer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MailWarning } from "lucide-react";

export const metadata: Metadata = { title: "Usuários" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const admin = await requirePagePermission("users:manage");
  const users = await prisma.user.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] });
  const emailEnabled = isEmailConfigured();

  return (
    <>
      <PageHeader
        eyebrow="Configurações"
        title="Usuários"
        description="Contas e perfis. Senhas temporárias ficam visíveis ao administrador até o primeiro acesso; depois, só a própria pessoa conhece a senha."
        actions={<UserFormDialog />}
      />
      {!emailEnabled && (
        <Alert className="mb-4 border-status-warning/30 bg-status-warning-bg text-status-warning">
          <MailWarning className="size-4" />
          <AlertTitle>Envio de e-mail não configurado</AlertTitle>
          <AlertDescription>Convites e links de redefinição ficam desativados. Configure EMAIL_USER e EMAIL_APP_PASSWORD (ver docs/DEPLOY.md). Enquanto isso, repasse a senha temporária.</AlertDescription>
        </Alert>
      )}
      <Card className="overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Senha</TableHead>
              <TableHead>Último acesso</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell><Badge variant="secondary">{ROLE_LABELS[u.role]}</Badge></TableCell>
                <TableCell>
                  {u.isActive ? (
                    <Badge variant="outline" className="border-transparent bg-status-success-bg text-status-success">Ativo</Badge>
                  ) : (
                    <Badge variant="outline" className="border-transparent bg-status-neutral-bg text-status-neutral">Inativo</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {u.mustChangePassword ? (
                    <div>
                      <Badge variant="outline" className="border-transparent bg-status-warning-bg text-status-warning">Temporária · aguardando 1º acesso</Badge>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{u.inviteSentAt ? `Convite enviado em ${formatDateTime(u.inviteSentAt)}` : "Convite não enviado"}</div>
                    </div>
                  ) : (
                    <Badge variant="outline" className="border-transparent bg-status-success-bg text-status-success">Definida pelo usuário</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDateTime(u.lastLoginAt)}</TableCell>
                <TableCell>
                  <UserRowActions user={{ id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive, mustChangePassword: u.mustChangePassword, inviteSentAt: u.inviteSentAt?.toISOString() ?? null }} isSelf={u.id === admin.id} emailEnabled={emailEnabled} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
