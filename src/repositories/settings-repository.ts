import "server-only";
import { prisma } from "@/lib/prisma";
import type { AIPrivacyMode, RetentionPolicy } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export interface SystemSettings {
  retentionPolicy: RetentionPolicy;
  aiPrivacyMode: AIPrivacyMode;
  institutionName: string;
  maxUploadMb: number;
  maxPdfPages: number;
  defaultStartTerm: string | null;
}

const DEFAULTS: SystemSettings = {
  retentionPolicy: "DAYS_90",
  aiPrivacyMode: "REDACTED_TEXT",
  institutionName: "Universidade Cruzeiro do Sul Virtual",
  maxUploadMb: 20,
  maxPdfPages: 60,
  defaultStartTerm: "2027.1",
};

export async function getSystemSettings(): Promise<SystemSettings> {
  const rows = await prisma.systemSetting.findMany();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Partial<Record<keyof SystemSettings, unknown>>;
  return {
    retentionPolicy: (map.retentionPolicy as RetentionPolicy) ?? DEFAULTS.retentionPolicy,
    aiPrivacyMode: (map.aiPrivacyMode as AIPrivacyMode) ?? DEFAULTS.aiPrivacyMode,
    institutionName: (map.institutionName as string) ?? DEFAULTS.institutionName,
    maxUploadMb: Number(map.maxUploadMb ?? DEFAULTS.maxUploadMb),
    maxPdfPages: Number(map.maxPdfPages ?? DEFAULTS.maxPdfPages),
    defaultStartTerm: typeof map.defaultStartTerm === "string" ? map.defaultStartTerm : DEFAULTS.defaultStartTerm,
  };
}

export async function setSystemSetting<K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) {
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value: value as Prisma.InputJsonValue },
    update: { value: value as Prisma.InputJsonValue },
  });
}
