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
    <div className="mb-6 flex animate-blur-fade flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        {eyebrow && <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-cyan-700"><span aria-hidden="true" className="h-px w-6 bg-gradient-to-r from-brand-cyan to-transparent" />{eyebrow}</div>}
        <h1 className="break-words bg-gradient-to-r from-[#003B71] via-[#0a5a9a] to-[#0693e3] bg-clip-text text-2xl font-semibold tracking-tight text-transparent [overflow-wrap:anywhere] sm:text-3xl">{title}</h1>
        {description && <p className="max-w-2xl break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
