import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAcademicCalendar } from "@/repositories/academic-calendar-repository";
import { requirePagePermission } from "@/lib/session";
import { zonedDateParts } from "@/lib/time";
import { AcademicCalendarForm } from "@/features/settings/academic-calendar-form";

export const metadata: Metadata = { title: "Calendário acadêmico" };
export const dynamic = "force-dynamic";

export default async function AcademicCalendarSettingsPage() {
  await requirePagePermission("privacy:manage");
  const currentYear = zonedDateParts().year;
  const terms = await getAcademicCalendar(currentYear + 10);
  const officialCount = terms.filter((term) => term.confidence === "OFFICIAL").length;

  return <>
    <PageHeader eyebrow="Configurações acadêmicas" title="Calendário letivo" description="Datas por semestre usadas para transformar a previsão em período e data de conclusão." />
    <div className="max-w-5xl space-y-5">
      <Card className="border-brand-cyan/30 bg-brand-cyan-50/20">
        <CardContent className="flex items-start gap-3 p-4 sm:p-5">
          <CalendarDays className="mt-0.5 size-5 shrink-0 text-brand-navy" />
          <div className="space-y-1 text-sm"><p className="font-semibold">Calendário 2026 cadastrado · {officialCount} semestre(s) com datas oficiais</p><p className="text-muted-foreground">As datas de 2026 vieram do PDF local. Anos sem publicação oficial são projetados repetindo mês e dia do último calendário oficial e precisam ser conferidos antes de informar uma data exata ao aluno.</p></div>
          <Badge variant="outline" className="ml-auto shrink-0">Até {currentYear + 10}</Badge>
        </CardContent>
      </Card>
      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-base">Períodos e datas</CardTitle><CardDescription>Atualize as datas quando o calendário institucional anual for publicado. Marque “oficial” somente após conferir o documento.</CardDescription></CardHeader>
        <CardContent><AcademicCalendarForm initialTerms={terms} currentYear={currentYear} /></CardContent>
      </Card>
    </div>
  </>;
}
