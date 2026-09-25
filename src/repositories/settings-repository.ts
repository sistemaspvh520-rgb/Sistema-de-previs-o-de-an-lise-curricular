import "server-only";
import { prisma } from "@/lib/prisma";
import type { AIPrivacyMode, RetentionPolicy } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import type { CourseFormat } from "@/generated/prisma/enums";
import type { FollowUpCadence } from "@/generated/prisma/enums";
import { POLOS, type Polo } from "@/domain/polos";
import { COURSE_FORMATS } from "@/domain/course-formats";

export interface SystemSettings {
  retentionPolicy: RetentionPolicy;
  aiPrivacyMode: AIPrivacyMode;
  institutionName: string;
  maxUploadMb: number;
  maxPdfPages: number;
  defaultStartTerm: string | null;
  aiMonthlyBudgetUsd: number;
  usdBrlReferenceRate: number;
  polos: Polo[];
  courseFormats: CourseFormat[];
  followUpBusinessStartHour: number;
  followUpBusinessEndHour: number;
  followUpRepeatBusinessDays: number;
  followUpDefaultCadence: FollowUpCadence;
}

const DEFAULTS: SystemSettings = {
  retentionPolicy: "DAYS_90",
  aiPrivacyMode: "REDACTED_TEXT",
  institutionName: "Universidade Cruzeiro do Sul Virtual",
  maxUploadMb: 20,
  maxPdfPages: 60,
  defaultStartTerm: null,
  aiMonthlyBudgetUsd: 0,
  usdBrlReferenceRate: 5.5,
  polos: [...POLOS],
  courseFormats: COURSE_FORMATS.map((format) => format.code),
  followUpBusinessStartHour: 8,
  followUpBusinessEndHour: 18,
  followUpRepeatBusinessDays: 1,
  followUpDefaultCadence: "TWICE_DAILY",
};

function validPolos(value: unknown): Polo[] {
  if (!Array.isArray(value)) return DEFAULTS.polos;
  const polos = value.filter(
    (item): item is Polo =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as Polo).code === "string" &&
      /^\d{3,12}$/.test((item as Polo).code) &&
      typeof (item as Polo).name === "string" &&
      (item as Polo).name.trim().length >= 2,
  );
  return polos.length ? polos : DEFAULTS.polos;
}

function validCourseFormats(value: unknown): CourseFormat[] {
  if (!Array.isArray(value)) return DEFAULTS.courseFormats;
  const allowed = new Set(COURSE_FORMATS.map((format) => format.code));
  const formats = value.filter(
    (item): item is CourseFormat =>
      typeof item === "string" && allowed.has(item as CourseFormat),
  );
  return formats.length ? formats : DEFAULTS.courseFormats;
}

export async function getSystemSettings(): Promise<SystemSettings> {
  const rows = await prisma.systemSetting.findMany();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Partial<
    Record<keyof SystemSettings, unknown>
  >;
  return {
    retentionPolicy:
      (map.retentionPolicy as RetentionPolicy) ?? DEFAULTS.retentionPolicy,
    aiPrivacyMode:
      (map.aiPrivacyMode as AIPrivacyMode) ?? DEFAULTS.aiPrivacyMode,
    institutionName:
      (map.institutionName as string) ?? DEFAULTS.institutionName,
    maxUploadMb: Number(map.maxUploadMb ?? DEFAULTS.maxUploadMb),
    maxPdfPages: Number(map.maxPdfPages ?? DEFAULTS.maxPdfPages),
    defaultStartTerm:
      typeof map.defaultStartTerm === "string"
        ? map.defaultStartTerm
        : DEFAULTS.defaultStartTerm,
    aiMonthlyBudgetUsd: Number(
      map.aiMonthlyBudgetUsd ?? DEFAULTS.aiMonthlyBudgetUsd,
    ),
    usdBrlReferenceRate: Number(
      map.usdBrlReferenceRate ?? DEFAULTS.usdBrlReferenceRate,
    ),
    polos: validPolos(map.polos),
    courseFormats: validCourseFormats(map.courseFormats),
    followUpBusinessStartHour: Number(
      map.followUpBusinessStartHour ?? DEFAULTS.followUpBusinessStartHour,
    ),
    followUpBusinessEndHour: Number(
      map.followUpBusinessEndHour ?? DEFAULTS.followUpBusinessEndHour,
    ),
    followUpRepeatBusinessDays: Number(
      map.followUpRepeatBusinessDays ?? DEFAULTS.followUpRepeatBusinessDays,
    ),
    followUpDefaultCadence:
      map.followUpDefaultCadence === "ONCE_DAILY"
        ? "ONCE_DAILY"
        : DEFAULTS.followUpDefaultCadence,
  };
}

export async function setSystemSetting<K extends keyof SystemSettings>(
  key: K,
  value: SystemSettings[K],
) {
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value: value as Prisma.InputJsonValue },
    update: { value: value as Prisma.InputJsonValue },
  });
}
