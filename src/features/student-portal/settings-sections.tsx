import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-slate-100 pb-6 last:border-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-cyan-50 text-brand-cyan-700">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold text-[#003B71]">{title}</h3>
          {description && <p className="mt-0.5 text-sm leading-5 text-slate-500">{description}</p>}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
