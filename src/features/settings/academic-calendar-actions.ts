"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isValidAcademicCalendarTerm, type AcademicCalendarConfig, type AcademicCalendarTerm } from "@/domain/academic-calendar/calendar";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";
import { requirePermission } from "@/lib/session";
import { saveAcademicCalendar } from "@/repositories/academic-calendar-repository";
import { recordAudit } from "@/services/audit-log/audit-log";

const termSchema = z.object({
  term: z.string().regex(/^\d{4}\.[12]$/),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  confidence: z.enum(["OFFICIAL", "ESTIMATED"]),
  basisYear: z.coerce.number().int().min(2020).max(2200),
  source: z.string().max(200).nullable(),
});

export async function saveAcademicCalendarAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("privacy:manage");
    const parsed = z.array(termSchema).min(2).max(80).safeParse(input);
    if (!parsed.success) return fail("Revise as datas informadas no calendário.");

    const terms = [...parsed.data].sort((a, b) => a.term.localeCompare(b.term));
    if (!terms.every(isValidAcademicCalendarTerm)) return fail("Há datas inválidas ou períodos com início posterior ao término.");
    if (new Set(terms.map((term) => term.term)).size !== terms.length) return fail("Não repita períodos no calendário.");

    for (let index = 0; index < terms.length; index++) {
      const current = terms[index];
      const [yearText] = current.term.split(".");
      if (!current.startsOn.startsWith(yearText) || !current.endsOn.startsWith(yearText)) {
        return fail(`As datas do período ${current.term} devem pertencer ao ano indicado.`);
      }
      const previous = terms[index - 1];
      if (previous && previous.endsOn >= current.startsOn) {
        return fail(`Os períodos ${previous.term} e ${current.term} estão sobrepostos ou fora de ordem.`);
      }
    }

    const years = [...new Set(terms.map((term) => Number(term.term.slice(0, 4))))];
    for (const year of years) {
      if (!terms.some((term) => term.term === `${year}.1`) || !terms.some((term) => term.term === `${year}.2`)) {
        return fail(`Informe os dois semestres de ${year}.`);
      }
    }

    const normalized: AcademicCalendarTerm[] = terms.map((term) => ({
      ...term,
      source: term.confidence === "OFFICIAL"
        ? (term.source || "Calendário oficial conferido pela gestão")
        : null,
    }));
    const config: AcademicCalendarConfig = { version: 1, terms: normalized };
    await saveAcademicCalendar(config);
    await recordAudit({
      userId: user.id,
      action: "settings.academic-calendar.update",
      entityType: "SystemSetting",
      metadata: {
        termsCount: normalized.length,
        officialTerms: normalized.filter((term) => term.confidence === "OFFICIAL").map((term) => term.term),
      },
    });
    revalidatePath("/settings/academic-calendar");
    revalidatePath("/academic-analysis", "page");
    return ok(undefined, "Calendário acadêmico atualizado.");
  } catch (error) {
    return toActionError(error);
  }
}
