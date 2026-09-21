import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { requirePagePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Segurança" };
export const dynamic = "force-dynamic";

const CONTROLS = [
  { label: "Autenticação por credenciais com argon2id", detail: "Senhas nunca armazenadas em texto puro." },
  { label: "Sessão JWT em cookie HttpOnly · SameSite=Lax · Secure em produção", detail: "Expira em 8h; renovação a cada 30 min de uso." },
  { label: "RBAC em três camadas", detail: "Proxy de rotas, server actions e interface." },
  { label: "Rate limiting", detail: "Login 5/min por IP · upload 10/min · teste OpenAI 3/min · reauditoria 5/min." },
  { label: "Validação de upload", detail: "Assinatura %PDF-, tipo real por magic bytes, tamanho e número de páginas." },
  { label: "Documentos fora de /public", detail: "Entrega somente via rota autenticada com Content-Disposition inline e nosniff." },
  { label: "API Key OpenAI cifrada (AES-256-GCM)", detail: "Chave mestra em variável de ambiente; nunca devolvida ao navegador." },
  { label: "Headers de segurança", detail: "CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, HSTS em produção." },
  { label: "Logs com redação", detail: "sk-…, CPF, RG e telefones mascarados; nunca PDF ou prompt completo." },
];

export default async function SecurityPage() {
  await requirePagePermission("privacy:manage");
  const [users, admins, recentLogins, lastKeyEvent] = await Promise.all([
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.count({ where: { isActive: true, role: "ADMIN" } }),
    prisma.auditLog.findMany({ where: { action: "auth.login" }, orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { name: true, email: true } } } }),
    prisma.auditLog.findFirst({ where: { action: { in: ["openai.connect", "openai.key_rotated", "openai.disconnect"] } }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <>
      <PageHeader eyebrow="Configurações" title="Segurança" description="Controles ativos nesta instalação e atividade recente de acesso." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Controles implementados</CardTitle>
            <CardDescription>Ver docs/SECURITY.md para o detalhamento.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {CONTROLS.map((c) => (
                <li key={c.label} className="flex items-start gap-3 text-sm">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-success" />
                  <div>
                    <div className="font-medium">{c.label}</div>
                    <div className="text-xs text-muted-foreground">{c.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-base">Contas</CardTitle></CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Usuários ativos</dt><dd className="font-semibold">{users}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Administradores</dt><dd className="font-semibold">{admins}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Último evento de chave OpenAI</dt><dd className="text-right text-xs">{lastKeyEvent ? `${lastKeyEvent.action} · ${formatDateTime(lastKeyEvent.createdAt)}` : "—"}</dd></div>
              </dl>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-base">Logins recentes</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm">
                {recentLogins.length === 0 && <li className="text-muted-foreground">Nenhum registro.</li>}
                {recentLogins.map((l) => (
                  <li key={l.id} className="flex justify-between gap-2">
                    <span className="truncate">{l.user?.name ?? "—"}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(l.createdAt)}{l.ip ? ` · ${l.ip}` : ""}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
