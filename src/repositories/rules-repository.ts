import "server-only";
import { prisma } from "@/lib/prisma";
import { buildRulesFromRecords, type AcademicRules } from "@/domain/curricular-analysis/rules/types";

export async function getActiveRuleSet(): Promise<{ id: string; version: string; rules: AcademicRules }> {
  const active = await prisma.ruleSetVersion.findFirst({ where: { isActive: true }, include: { rules: true }, orderBy: { effectiveFrom: "desc" } });
  if (!active) throw new Error("Nenhuma versão de regras ativa. Execute o seed.");
  return { id: active.id, version: active.version, rules: buildRulesFromRecords(active.rules) };
}

export async function getRuleSetById(id: string): Promise<{ id: string; version: string; rules: AcademicRules }> {
  const rs = await prisma.ruleSetVersion.findUniqueOrThrow({ where: { id }, include: { rules: true } });
  return { id: rs.id, version: rs.version, rules: buildRulesFromRecords(rs.rules) };
}
