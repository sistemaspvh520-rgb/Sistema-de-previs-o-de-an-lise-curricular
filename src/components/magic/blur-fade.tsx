import type { CSSProperties, ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Entrada suave com desfoque (estilo Magic UI "BlurFade"), sem JavaScript no cliente. */
export function BlurFade({
  as: Component = "div",
  delay = 0,
  className,
  children,
  ...rest
}: {
  as?: ElementType;
  delay?: number;
  className?: string;
  children: ReactNode;
} & Record<string, unknown>) {
  return (
    <Component
      className={cn("animate-blur-fade", className)}
      style={{ animationDelay: `${delay}s` } as CSSProperties}
      {...rest}
    >
      {children}
    </Component>
  );
}
