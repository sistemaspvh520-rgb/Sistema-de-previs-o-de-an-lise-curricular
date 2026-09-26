import { useId } from "react";
import { cn } from "@/lib/utils";

/** Padrão de pontos de fundo (estilo Magic UI "DotPattern"), com máscara radial. */
export function DotPattern({ className, size = 18 }: { className?: string; size?: number }) {
  const id = useId();
  return (
    <svg aria-hidden="true" className={cn("pointer-events-none absolute inset-0 h-full w-full [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]", className)}>
      <defs>
        <pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse">
          <circle cx={1.2} cy={1.2} r={1.2} fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
