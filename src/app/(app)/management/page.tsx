import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, CircleAlert, FileText, Trash2, Users } from "lucide-react";
import { requirePagePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import { formatRelativeTime, daysSince, startOfCurrentMonth } from "@/lib/time";
import { countAnalysesByPolo } from "@/repositories/analysis-repository";
import { PoloReportCard } from "@/features/analyses/components/polo-report";

export const metadata: Metadata = { title: "Gestão" };
export const dynamic = "force-dynamic";

export default async function ManagementPage() {
  await requirePagePermission("audit:read");
  const monthStart = startOfCurrentMonth();

  const [activeUsers, users, totalsByUser, completedByUser, monthByUser, deletedByUser, byPolo, totalAnalyses, monthAnalyses, enrolled, returned] = await Promise.all([
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: [{ lastActiveAt: { sort: "desc", nulls: "last" } }, { name: "asc" }], take: 20, select: { id: true, name: true, role: true, lastActiveAt: true, analyses: { select: { courseName: true, studentName: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 } } }),
    prisma.curricularAnalysis.groupBy({ by: ["createdById"], _count: { _all: true } }),
    prisma.curricularAnalysis.groupBy({ by: ["createdById"], where: { status: "COMPLETED" }, _count: { _all: true } }),
    prisma.curricularAnalysis.groupBy({ by: ["createdById"], where: { createdAt: { gte: monthStart } }, _count: { _all: true } }),
    prisma.auditLog.groupBy({ by: ["userId"], where: { action: { in: ["analysis.delete.tracked", "analysis.deletion_approved.tracked"] } }, _count: { _all: true } }),
    countAnalysesByPolo({ monthStart }),
    prisma.curricularAnalysis.count(),
    prisma.curricularAnalysis.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.curricularAnalysis.count({ where: { enrollmentStatus: "ENROLLED" } }),
    prisma.curricularAnalysis.count({ where: { enrollmentStatus: { in: ["ENROLLED", "NOT_ENROLLED"] } } }),
  ]);

  const totalByUser = new Map(totalsByUser.map((item) => [item.createdById, item._count._all]));
  const deliveredByUser = new Map(completedByUser.map((item) => [item.createdById, item._count._all]));
  const monthlyByUser = new Map(monthByUser.map((item) => [item.createdById, item._count._all]));
  const deletedCountByUser = new Map(deletedByUser.flatMap((item) => (item.userId ? [[item.userId, item._count._all] as const] : [])));
  const deletedSinceTracking = deletedByUser.reduce((total, item) => total + item._count._all, 0);
  const cards = [
    { label: "Análises no mês", value: monthAnalyses, icon: FileText, tone: "text-brand-cyan-700", hint: `${totalAnalyses} no histórico`, href: "/analyses" },
    { label: "Usuários ativos", value: activeUsers, icon: Users, tone: "text-brand-navy", hint: "Com acesso ao sistema", href: "#atividade-por-usuario" },
    { label: "Exclusões registradas", value: deletedSinceTracking, icon: Trash2, tone: "text-status-danger", hint: "Desde a ativação do rastreamento", href: "#atividade-por-usuario" },
    { label: "Entregas da equipe", value: Array.from(deliveredByUser.values()).reduce((total, count) => total + count, 0), icon: CheckCircle2, tone: "text-status-success", hint: "Análises concluídas por consultor", href: "#atividade-por-usuario" },
    { label: "Conversão confirmada", value: returned ? `${Math.round((enrolled / returned) * 100)}%` : "—", icon: CircleAlert, tone: "text-status-warning", hint: returned ? `${enrolled} matrículas em ${returned} retornos` : "Aguardando confirmações", href: "/analyses?followUp=due" },
  ];

  return (
    <>
      <PageHeader eyebrow="Gestão" title="Equipe e relatórios" description="Acompanhe a atividade dos consultores e os relatórios por polo. A fila e o status das análises ficam na aba Análises." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.label} href={card.href} className="group rounded-xl focus:outline-none focus:ring-2 focus:ring-ring">
              <Card className="h-full shadow-sm transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle><Icon className={`size-4 ${card.tone}`} /></CardHeader>
                <CardContent><div className="text-2xl font-semibold">{card.value}</div><p className="mt-1 text-xs text-muted-foreground">{card.hint}</p></CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
      <div className="mt-6">
        <Card id="atividade-por-usuario" className="overflow-hidden shadow-sm">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="size-4 text-brand-cyan-700" /> Atividade por usuário</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {users.map((user) => {
                const latest = user.analyses[0];
                return (
                  <div key={user.id} className="grid gap-3 px-4 py-4 text-sm sm:grid-cols-[minmax(150px,1.2fr)_auto_auto] sm:items-center sm:px-6 lg:grid-cols-[minmax(150px,1.2fr)_auto_auto_auto_auto_minmax(170px,1fr)]">
                    <div className="min-w-0">
                      <Link href={`/analyses?user=${user.id}`} className="block truncate font-medium hover:underline">{user.name}</Link>
                      <div className="text-xs text-muted-foreground">{user.role === "ADMIN" ? "Administrador" : user.role === "ANALYST" ? "Analista" : "Visualizador"}</div>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs sm:contents">
                      <span className="whitespace-nowrap">{totalByUser.get(user.id) ?? 0} análises</span>
                      <span className="whitespace-nowrap">{monthlyByUser.get(user.id) ?? 0} no mês</span>
                      <span className="whitespace-nowrap text-status-success">{deliveredByUser.get(user.id) ?? 0} prontas</span>
                      <span className="whitespace-nowrap text-status-danger">{deletedCountByUser.get(user.id) ?? 0} excluídas</span>
                    </div>
                    <div className="min-w-0 text-xs text-muted-foreground">
                      <LastAccess at={user.lastActiveAt} />
                      {latest ? <span className="block truncate">Última análise: {latest.studentName ?? latest.courseName ?? "Curso não identificado"} · {formatDateTime(latest.createdAt)}</span> : <span className="block">Nenhuma análise registrada</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
      <PoloReportCard className="mt-6 shadow-sm" description="Atendimentos por polo em todo o sistema. Clique no polo para filtrar a lista; exporte o relatório completo ou de um polo em CSV." rows={byPolo} />
    </>
  );
}

/** Tempo sem uso do sistema: destaca quem está há mais de 7 (atenção) ou 30 dias (crítico) sem acessar. */
function LastAccess({ at }: { at: Date | null }) {
  const days = daysSince(at);
  const tone = days === null || days > 30 ? "text-status-danger" : days > 7 ? "text-status-warning" : "text-status-success";
  return (
    <span className="block" title={at ? formatDateTime(at) : undefined}>
      Último acesso: <span className={`font-medium ${tone}`}>{at ? formatRelativeTime(at) : "nunca acessou"}</span>
      {at && <span className="text-muted-foreground/80"> · {formatDateTime(at)}</span>}
    </span>
  );
}
