"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FilePlus2,
  Files,
  ClipboardCheck,
  ChartNoAxesCombined,
  Settings,
  ChevronDown,
  PanelLeftClose,
  ChartColumnIncreasing,
  BookOpen,
  GraduationCap,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { can, type Permission } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/enums";
import { MAIN_NAV, SETTINGS_NAV } from "@/components/layout/nav-items";
import { BrandLogo } from "@/components/shared/brand-logo";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const ICONS = {
  dashboard: LayoutDashboard,
  new: FilePlus2,
  list: Files,
  review: ClipboardCheck,
  management: ChartNoAxesCombined,
  reports: ChartColumnIncreasing,
  grades: BookOpen,
  academic: GraduationCap,
  settings: Settings,
} as const;

/**
 * `rail`: barra lateral do desktop (recolhe para ícones abaixo de xl e pode ser alternada).
 * `drawer`: conteúdo do menu mobile dentro do Sheet — sempre expandido, sem o botão de recolher.
 */
export function Sidebar({ role, onNavigate, onClose, variant = "rail" }: { role: Role; onNavigate?: () => void; onClose?: () => void; variant?: "rail" | "drawer" }) {
  const pathname = usePathname();
  const [railMode, setMode] = useState<"auto" | "expanded" | "collapsed">("auto");
  const drawer = variant === "drawer";
  const mode = drawer ? "expanded" : railMode;
  const allowed = (p?: Permission) => !p || can(role, p);
  const inSettings = pathname.startsWith("/settings");
  const expanded = mode === "expanded";
  const labels = mode === "expanded" ? "inline" : mode === "collapsed" ? "hidden" : "hidden xl:inline";
  const settingsVisibility = mode === "expanded" ? "block" : mode === "collapsed" ? "hidden" : "hidden xl:block";

  function toggle() {
    const isCurrentlyExpanded = mode === "expanded" || (mode === "auto" && window.matchMedia("(min-width: 1280px)").matches);
    const next = isCurrentlyExpanded ? "collapsed" : "expanded";
    setMode(next);
  }

  return (
    <aside className={cn("relative z-30 flex flex-col bg-sidebar text-sidebar-foreground", drawer ? "h-full w-full" : "h-screen min-h-screen transition-[width] duration-300", !drawer && (mode === "expanded" ? "w-64" : mode === "collapsed" ? "w-16" : "w-16 xl:w-64"))}>
      <div className={cn("flex items-center pb-4 pt-5 text-white", expanded ? "justify-between px-5" : mode === "collapsed" ? "justify-center px-3" : "justify-center px-3 xl:justify-between xl:px-5")}>
        {mode === "collapsed" ? (
          <button type="button" onClick={toggle} className="rounded-md p-1 text-white transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-sidebar-primary" aria-label="Expandir menu lateral" title="Expandir menu lateral">
            <BrandLogo compact />
          </button>
        ) : (
          <>
            <span className={cn("min-w-0", mode === "expanded" ? "block" : "hidden xl:block", drawer && "max-w-[180px]")}><BrandLogo /></span>
            <button type="button" onClick={toggle} className={mode === "expanded" ? "hidden" : "block rounded-md p-1 text-white transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-sidebar-primary xl:hidden"} aria-label="Expandir menu lateral" title="Expandir menu lateral"><BrandLogo compact /></button>
          </>
        )}
        {drawer ? (
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-white/80 transition-colors hover:bg-sidebar-accent hover:text-white" aria-label="Fechar menu">
            <X className="size-5" />
          </button>
        ) : mode !== "collapsed" && <button type="button" onClick={toggle} className={cn("rounded-md p-1.5 text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-white", mode === "auto" && "absolute -right-11 top-3 z-40 bg-sidebar text-white shadow-md xl:static xl:bg-transparent xl:shadow-none")} aria-label="Expandir ou recolher menu lateral" title="Expandir ou recolher menu lateral">
          <PanelLeftClose className="size-4" />
        </button>}
      </div>
      <nav className={cn("flex-1 space-y-1 px-3", drawer && "overflow-y-auto pb-6")} aria-label="Navegação principal">
        {MAIN_NAV.filter((i) => allowed(i.permission)).map((item) => {
          const Icon = ICONS[item.icon];
          const active =
            item.href === "/analyses"
              ? pathname === "/analyses" || /^\/analyses\/(?!new)/.test(pathname)
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              title={item.label}
              className={cn(
                "flex items-center justify-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                expanded ? "justify-start" : mode === "auto" && "xl:justify-start",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-white",
              )}
            >
              <Icon className="size-4" />
              <span className={labels}>{item.label}</span>
            </Link>
          );
        })}

        {SETTINGS_NAV.some((item) => allowed(item.permission)) && <Collapsible defaultOpen={inSettings} className={cn("pt-2", settingsVisibility)}>
          <CollapsibleTrigger
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              inSettings ? "text-white" : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-white",
            )}
          >
            <Settings className="size-4" />
            Configurações
            <ChevronDown className="ml-auto size-4 opacity-60 transition-transform [[data-state=open]_&]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 space-y-0.5 border-l border-sidebar-border/60 pl-3 ml-5">
            {SETTINGS_NAV.filter((i) => allowed(i.permission)).map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "block rounded-md px-3 py-1.5 text-[13px] transition-colors",
                    active ? "bg-sidebar-accent text-white" : "text-sidebar-foreground/75 hover:text-white",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </CollapsibleContent>
        </Collapsible>}
        {SETTINGS_NAV.some((item) => allowed(item.permission)) && mode !== "expanded" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" title="Configurações" className={cn("flex w-full items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-colors", mode === "auto" && "xl:hidden", inSettings ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-white")}>
                <Settings className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-52">
              <DropdownMenuLabel>Configurações</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {SETTINGS_NAV.filter((item) => allowed(item.permission)).map((item) => (
                <DropdownMenuItem key={item.href} asChild>
                  <Link href={item.href} onClick={onNavigate}>{item.label}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </nav>
    </aside>
  );
}
