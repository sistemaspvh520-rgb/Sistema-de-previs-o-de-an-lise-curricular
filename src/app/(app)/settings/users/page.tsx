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

export const metadata: Metadata = { title: "Usuários" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const admin = await requirePagePermission("users:manage");
  const users = await prisma.user.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] });

  return (
    <>
      <PageHeader
        eyebrow="Configurações"
        title="Usuários"
        description="Gerencie contas e perfis de acesso: Administrador, Analista e Visualizador."
        actions={<UserFormDialog />}
      />
      <Card className="overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Status</TableHead>
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
                <TableCell className="text-muted-foreground">{formatDateTime(u.lastLoginAt)}</TableCell>
                <TableCell>
                  <UserRowActions user={{ id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive }} isSelf={u.id === admin.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
