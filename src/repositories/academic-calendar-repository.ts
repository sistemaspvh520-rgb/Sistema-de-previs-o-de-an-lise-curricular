import "server-only";
import { buildAcademicCalendar, DEFAULT_ACADEMIC_CALENDAR, parseAcademicCalendarConfig, type AcademicCalendarConfig } from "@/domain/academic-calendar/calendar";
import { prisma } from "@/lib/prisma";
import { zonedDateParts } from "@/lib/time";
import type { Prisma } from "@/generated/prisma/client";

const SETTING_KEY = "academicCalendar.v1";

export async function getAcademicCalendar(throughYear = zonedDateParts().year + 10) {
  const saved = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEY }, select: { value: true } });
  const config = parseAcademicCalendarConfig(saved?.value ?? DEFAULT_ACADEMIC_CALENDAR);
  return buildAcademicCalendar(config, throughYear);
}

export async function saveAcademicCalendar(config: AcademicCalendarConfig) {
  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: config as unknown as Prisma.InputJsonValue },
    update: { value: config as unknown as Prisma.InputJsonValue },
  });
}
