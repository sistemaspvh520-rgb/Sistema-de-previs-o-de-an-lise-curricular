import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Rótulo de origem de um dado (§54). */
export function SourceBadge({ label, detail, className }: { label: string; detail?: string; className?: string }) {
  const chip = (
    <span className={cn("inline-flex items-center rounded border border-dashed px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground", className)}>
      {label}
    </span>
  );
  if (!detail) return chip;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent>{detail}</TooltipContent>
    </Tooltip>
  );
}
