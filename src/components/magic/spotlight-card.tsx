"use client";
import type { ComponentProps, MouseEvent } from "react";
import { cn } from "@/lib/utils";

/** Cartão com holofote que acompanha o cursor (estilo Magic UI "MagicCard" / Aceternity "Card Spotlight"). */
export function SpotlightCard({ className, onMouseMove, ...props }: ComponentProps<"div">) {
  function move(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
    onMouseMove?.(event);
  }
  return <div onMouseMove={move} className={cn("magic-card", className)} {...props} />;
}
