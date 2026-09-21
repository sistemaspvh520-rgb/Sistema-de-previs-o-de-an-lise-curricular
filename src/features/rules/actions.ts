"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/session";
import { recordAudit } from "@/services/audit-log/audit-log";
import { RULE_DEFINITIONS } from "@/domain/curricular-analysis/rules/types";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";

const additionalRuleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("UNCONFIGURED") }),
  z.object({ type: z.literal("SAME_AS_LAST_PERIOD") }),
  z.object({ type: z.literal("FIXED_VALUE"), value: z.coerce.number().int().min(1).max(30) }),
  z.object({ type: z.literal("CUSTOM_RULE"), regular: z.coerce.number().int().min(0).max(30), extra: z.coerce.number().int().min(0).max(30) }),
]);

const schema = z.object({
  extraSubjectsAllowed: z.coerce.number().int().min(0).max(20),
  maximumSubjectsPerSemester: z.union([z.null(), z.coerce.number().int().min(1).max(40)]),
  additionalSemesterCapacityRule: additionalRuleSchema,
  periodUnit: z.enum(["SEMESTER", "YEAR"]),
  backlogOrdering: z.enum(["OLDEST_FIRST"]),
  entryPeriodDefault: z.union([z.null(), z.coerce.number().int().min(1).max(20)]),
  reviewCountsAsPending: z.boolean(),
  maxAdditionalSemesters: z.coerce.number().int().min(1).max(30),
  notes: z.string().trim().max(500).optional(),
});

function nextVersion(current: string): string {
  const [major, minor = "0"] = current.split(".");
  return `${major}.${Number(minor) + 1}`;
}

/**
 * Salvar regras cria uma NOVA RuleSetVersion ativa. A versão anterior permanece imutável
 * e continua vinculada às análises antigas (§75).
 */
export async function saveRulesAction(input: unknown): Promise<ActionResult<{ version: string }>> {
  try {
    const user = await requirePermission("rules:manage");
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    const d = parsed.data;

    const active = await prisma.ruleSetVersion.findFirst({ where: { isActive: true }, orderBy: { effectiveFrom: "desc" } });
    const version = nextVersion(active?.version ?? "1.0");
    const values: Record<string, unknown> = {
      extraSubjectsAllowed: d.extraSubjectsAllowed,
      maximumSubjectsPerSemester: d.maximumSubjectsPerSemester,
      additionalSemesterCapacityRule: d.additionalSemesterCapacityRule,
      periodUnit: d.periodUnit,
      backlogOrdering: d.backlogOrdering,
      entryPeriodDefault: d.entryPeriodDefault,
      reviewCountsAsPending: d.reviewCountsAsPending,
      maxAdditionalSemesters: d.maxAdditionalSemesters,
    };

    await prisma.$transaction(async (tx) => {
      await tx.ruleSetVersion.updateMany({ where: { isActive: true }, data: { isActive: false } });
      await tx.ruleSetVersion.create({
        data: {
          version,
          isActive: true,
          notes: d.notes || null,
          createdById: user.id,
          rules: {
            create: RULE_DEFINITIONS.map((def) => {
              const value = values[def.key];
              const status =
                def.key === "additionalSemesterCapacityRule"
                  ? (value as { type: string }).type === "UNCONFIGURED"
                    ? "NOT_CONFIGURED"
                    : "CONFIGURABLE"
                  : def.key === "entryPeriodDefault"
                    ? value === null
                      ? "NOT_CONFIGURED"
                      : "CONFIGURABLE"
                    : def.status;
              return {
                key: def.key,
                valueType: def.valueType,
                value: value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue),
                status,
                description: def.description,
              };
            }),
          },
        },
      });
    });
    await recordAudit({ userId: user.id, action: "rules.new_version", entityType: "RuleSetVersion", metadata: { version, previous: active?.version ?? null, values } });
    revalidatePath("/settings/rules");
    return ok({ version }, `Regras salvas como versão ${version}. Análises anteriores mantêm a versão original.`);
  } catch (err) {
    return toActionError(err);
  }
}
