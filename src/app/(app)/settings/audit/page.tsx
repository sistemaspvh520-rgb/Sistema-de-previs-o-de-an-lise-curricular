import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Auditoria" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

export default async function AuditPage({ searchParams }: PageProps<"/settings/audit">) {
  await requirePagePermission("audit:read");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const where: Prisma.AuditLogWhereInput = q
    ? { OR: [{ action: { contains: q, mode: "insensitive" } }, { entityType: { contains: q, mode: "insensitive" } }, { entityId: { contains: q } }, { user: { email: { contains: q, mode: "insensitive" } } }] }
    : {};
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { user: { select: { name: true, email: true } } } }),
    prisma.auditLog.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader eyebrow="Configurações" title="Auditoria" description={`${total} evento(s). Registro imutável de ações no sistema; metadados passam por redação.`} />
      <form className="mb-4 flex gap-2">
        <Input name="q" defaultValue={q} placeholder="Filtrar por ação, entidade, ID ou e-mail" className="max-w-md" />
        <Button type="submit" variant="outline">Filtrar</Button>
      </form>
      <Card className="overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/hora</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Entidade</TableHead>
              <TableHead>Detalhes</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Nenhum evento.</TableCell></TableRow>}
            {logs.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(l.createdAt)}</TableCell>
                <TableCell>{l.user ? <div><div className="text-sm">{l.user.name}</div><div className="text-xs text-muted-foreground">{l.user.email}</div></div> : <span className="text-muted-foreground">sistema</span>}</TableCell>
                <TableCell><Badge variant="secondary" className="font-mono text-[11px]">{l.action}</Badge></TableCell>
                <TableCell className="text-sm">
                  {l.entityType}
                  {l.entityId && (
                    l.entityType === "CurricularAnalysis" ? <Link href={`/analyses/${l.entityId}`} className="ml-1 font-mono text-xs text-brand-cyan-700 underline">{l.entityId.slice(0, 8)}</Link> : <span className="ml-1 font-mono text-xs text-muted-foreground">{l.entityId.slice(0, 8)}</span>
                  )}
                </TableCell>
                <TableCell className="max-w-md truncate font-mono text-[11px] text-muted-foreground" title={l.metadata ? JSON.stringify(l.metadata) : ""}>{l.metadata ? JSON.stringify(l.metadata) : "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{l.ip ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {pages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>Página {page} de {pages}</span>
            <div className="flex gap-2">
              {page > 1 && <Button asChild variant="outline" size="sm"><Link href={{ pathname: "/settings/audit", query: { ...(q ? { q } : {}), page: page - 1 } }}>Anterior</Link></Button>}
              {page < pages && <Button asChild variant="outline" size="sm"><Link href={{ pathname: "/settings/audit", query: { ...(q ? { q } : {}), page: page + 1 } }}>Próxima</Link></Button>}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
