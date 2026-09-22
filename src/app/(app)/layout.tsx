import { requireUser } from "@/lib/session";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <div className="flex min-h-screen overflow-x-clip">
      <div className="hidden md:block md:sticky md:top-0 md:h-screen md:self-start md:bg-sidebar">
        <Sidebar role={user.role} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={{ name: user.name, email: user.email, role: user.role, impersonator: user.impersonator }} />
        <main className="min-w-0 flex-1 animate-in fade-in-0 duration-300 px-4 py-5 md:px-6 md:py-7 xl:px-8 xl:py-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
