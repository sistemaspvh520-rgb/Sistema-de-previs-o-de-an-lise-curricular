import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        {eyebrow && <div className="text-xs font-medium uppercase tracking-wider text-brand-cyan-700">{eyebrow}</div>}
        <h1 className="break-words text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">{title}</h1>
        {description && <p className="max-w-2xl break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
