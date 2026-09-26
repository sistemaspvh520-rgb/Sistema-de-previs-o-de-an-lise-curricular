"use client";
import type { ReactNode } from "react";
import { Settings } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";

export function SettingsSheet({ children }: { children: ReactNode }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className="flex min-h-11 items-center gap-2 rounded-full border border-slate-200 px-3 text-sm font-medium text-[#003B71] hover:bg-sky-50"
        >
          <Settings className="size-4" />
          <span className="hidden sm:inline">Configurações</span>
        </button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 bg-slate-50 sm:max-w-md">
        <SheetHeader className="border-b border-slate-200 bg-gradient-to-br from-brand-cyan-50 via-white to-white px-5 py-5">
          <div className="flex items-center gap-3 pr-8">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#003B71] text-white shadow-[0_10px_24px_-14px_#003B71]">
              <Settings className="size-5" />
            </span>
            <div className="min-w-0">
              <SheetTitle className="text-lg text-[#003B71]">Configurações</SheetTitle>
              <SheetDescription>Contatos, solicitações e sua conta.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto overscroll-contain scroll-smooth px-5 py-6">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
