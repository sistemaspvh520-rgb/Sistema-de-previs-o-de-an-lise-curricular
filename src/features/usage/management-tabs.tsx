import Link from "next/link";
import { Activity, BookOpen, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/management", label: "Gestão à vista", icon: LayoutDashboard },
  { href: "/management/team-usage", label: "Uso da equipe", icon: Activity },
  { href: "/management/team-usage/grades", label: "Uso das grades", icon: BookOpen },
] as const;

/** Abas da área de Gestão. */
export function ManagementTabs({ active }: { active: (typeof TABS)[number]["href"] }) {
  return (
    <nav aria-label="Gestão" className="mb-5 flex w-fit max-w-full overflow-x-auto rounded-xl border bg-card p-1 shadow-sm">
      {TABS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={active === href ? "page" : undefined}
          className={cn(
            "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            active === href ? "bg-brand-navy text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
          )}
        >
          <Icon className="size-4" /> {label}
        </Link>
      ))}
    </nav>
  );
}
