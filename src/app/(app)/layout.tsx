import { requireUser } from "@/lib/session";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { countDueFollowUps, listDueFollowUps } from "@/services/follow-up/follow-up";
import { getVapidPublicKey } from "@/services/push/web-push";
import { formatRelativeTime } from "@/lib/time";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  // ADMIN acompanha os retornos de toda a equipe; consultores veem só os próprios.
  const teamWide = user.role === "ADMIN";
  const scope = teamWide ? undefined : user.id;
  const [dueItems, dueTotal] = await Promise.all([listDueFollowUps(scope, 6), countDueFollowUps(scope)]);
  const followUps = {
    teamWide,
    total: dueTotal,
    items: dueItems.map((a) => ({ id: a.id, student: a.studentName ?? "Aluno não identificado", course: a.courseName ?? "Curso não identificado", dueLabel: formatRelativeTime(a.followUpDueAt), ownerName: teamWide ? a.createdBy.name : undefined })),
  };
  return (
    <div className="flex min-h-screen overflow-x-clip">
      <div className="hidden md:block md:sticky md:top-0 md:h-screen md:self-start md:bg-sidebar">
        <Sidebar role={user.role} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={{ name: user.name, email: user.email, role: user.role, impersonator: user.impersonator }} followUps={followUps} pushPublicKey={getVapidPublicKey()} />
        <main className="min-w-0 flex-1 animate-in fade-in-0 duration-300 px-4 py-5 md:px-6 md:py-7 xl:px-8 xl:py-8">
          <div className="mx-auto w-full min-w-0 max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
