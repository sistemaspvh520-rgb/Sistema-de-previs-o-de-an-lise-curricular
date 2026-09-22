"use client";

import { useState } from "react";
import { KeyRound, LogOut, Menu, UserRound } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sidebar } from "@/components/layout/sidebar";
import { ROLE_LABELS } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/enums";
import { logoutAction } from "@/features/auth/actions";
import { FollowUpBell, type FollowUpItem } from "@/components/layout/follow-up-bell";
import { PushToggle } from "@/components/layout/push-toggle";

export function Topbar({ user, followUps, pushPublicKey }: { user: { name: string; email: string; role: Role; impersonator?: { id: string; name: string } | null }; followUps: { items: FollowUpItem[]; total: number; teamWide: boolean }; pushPublicKey: string | null }) {
  const [open, setOpen] = useState(false);
  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <>
    {user.impersonator && (
      <div className="flex items-center justify-between gap-3 bg-brand-gold px-4 py-1.5 text-xs font-medium text-brand-navy md:px-6">
        <span>Você ({user.impersonator.name}) está acessando como <strong>{user.name}</strong> — modo de suporte.</span>
        <form action={logoutAction}>
          <button type="submit" className="rounded border border-brand-navy/30 px-2 py-0.5 hover:bg-brand-navy hover:text-white">Encerrar</button>
        </form>
      </div>
    )}
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card/80 px-4 backdrop-blur md:px-6">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menu">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" showCloseButton={false} className="w-72 gap-0 border-0 bg-sidebar p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Navegação principal do sistema</SheetDescription>
          <Sidebar role={user.role} variant="drawer" onNavigate={() => setOpen(false)} onClose={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex-1" />
      <FollowUpBell items={followUps.items} total={followUps.total} teamWide={followUps.teamWide} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 hover:bg-muted" aria-label="Menu do usuário">
            <Avatar className="size-8">
              <AvatarFallback className="bg-brand-navy text-white text-xs">{initials || <UserRound className="size-4" />}</AvatarFallback>
            </Avatar>
            <div className="hidden text-left sm:block">
              <div className="text-sm font-medium leading-tight">{user.name}</div>
              <div className="text-[11px] text-muted-foreground leading-tight">{ROLE_LABELS[user.role]}</div>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="text-sm font-medium">{user.name}</div>
            <div className="text-xs font-normal text-muted-foreground">{user.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings/account"><KeyRound className="size-4" /> Minha conta</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
            <PushToggle publicKey={pushPublicKey} />
          </DropdownMenuItem>
          <form action={logoutAction}>
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full">
                <LogOut className="size-4" />
                Sair
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
    </>
  );
}
