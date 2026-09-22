"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export interface FollowUpItem {
  id: string;
  student: string;
  course: string;
  dueLabel: string;
  ownerName?: string;
}

/** Sino com os retornos de matrícula vencidos (24h após a entrega sem resposta). */
export function FollowUpBell({ items, total, teamWide }: { items: FollowUpItem[]; total: number; teamWide: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={total > 0 ? `${total} retornos de matrícula pendentes` : "Sem retornos pendentes"}>
          <Bell className="size-5" />
          {total > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-danger px-1 text-[10px] font-semibold text-white">{total > 99 ? "99+" : total}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>
          <div className="text-sm font-medium">Retornos de matrícula</div>
          <div className="text-xs font-normal text-muted-foreground">{total === 0 ? "Nenhum retorno pendente." : `${total} ${total === 1 ? "análise entregue" : "análises entregues"} há mais de 24h sem resposta${teamWide ? " (toda a equipe)" : ""}.`}</div>
        </DropdownMenuLabel>
        {items.length > 0 && <DropdownMenuSeparator />}
        {items.map((item) => (
          <DropdownMenuItem key={item.id} asChild>
            <Link href={`/analyses/${item.id}`} className="flex flex-col items-start gap-0.5">
              <span className="w-full truncate font-medium">{item.student}</span>
              <span className="w-full truncate text-xs text-muted-foreground">{item.course} · vencido {item.dueLabel}{item.ownerName ? ` · ${item.ownerName}` : ""}</span>
            </Link>
          </DropdownMenuItem>
        ))}
        {total > items.length && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/analyses?followUp=due">Ver todos os {total}</Link></DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
