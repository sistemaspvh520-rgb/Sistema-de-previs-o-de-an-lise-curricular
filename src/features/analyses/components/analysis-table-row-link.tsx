"use client";

import { useRouter } from "next/navigation";
import { TableRow } from "@/components/ui/table";

/** Linha inteira navegável, com suporte a teclado para listas operacionais. */
export function AnalysisTableRowLink({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  return <TableRow role="link" tabIndex={0} onClick={() => router.push(href)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); router.push(href); } }} className="cursor-pointer animate-in fade-in slide-in-from-bottom-1 duration-300 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">{children}</TableRow>;
}
