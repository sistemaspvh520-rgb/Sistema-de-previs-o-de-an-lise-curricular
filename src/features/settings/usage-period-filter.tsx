"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function UsagePeriodFilter({ period }: { period: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState(period);
  function apply(value = selected) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return;
    router.push(`/settings/usage?period=${value}`);
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-sm">
      <CalendarDays className="ml-1 size-4 text-muted-foreground" />
      <Input aria-label="Mês de referência" type="month" value={selected} onChange={(event) => setSelected(event.target.value)} className="h-8 w-40 border-0 bg-transparent px-2 shadow-none focus-visible:ring-0" />
      <Button size="sm" onClick={() => apply()}>Aplicar</Button>
      <Button size="sm" variant="ghost" onClick={() => { const now = new Date(); const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; setSelected(current); apply(current); }}>Mês atual</Button>
    </div>
  );
}
