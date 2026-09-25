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
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b border-slate-100">
          <SheetTitle className="text-[#003B71]">Configurações</SheetTitle>
          <SheetDescription>
            Contatos, solicitações e dados da sua conta.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 overflow-y-auto p-4">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
