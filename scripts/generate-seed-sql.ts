/**
 * Gera o SQL equivalente ao prisma/seed.ts para ambientes onde não há acesso direto ao banco
 * (ex.: Supabase via `supabase db query -f`). Idempotente: usa ON CONFLICT / NOT EXISTS.
 *
 * Uso: ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... npx tsx scripts/generate-seed-sql.ts > seed.sql
 */
import { hash } from "@node-rs/argon2";
import { randomUUID } from "node:crypto";
import { RULE_DEFINITIONS } from "../src/domain/curricular-analysis/rules/types";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  if (!email) throw new Error("ADMIN_EMAIL é obrigatório.");
  const name = process.env.ADMIN_NAME ?? "Administrador";
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8) throw new Error("ADMIN_PASSWORD (mín. 8) é obrigatório.");
  const passwordHash = await hash(password);
  const ruleSetId = randomUUID();

  const lines: string[] = [];
  lines.push("BEGIN;");
  lines.push(
    `INSERT INTO "User" ("id","email","name","passwordHash","role","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(), ${q(email)}, ${q(name)}, ${q(passwordHash)}, 'ADMIN', true, now(), now()) ON CONFLICT ("email") DO NOTHING;`,
  );
  lines.push(
    `INSERT INTO "RuleSetVersion" ("id","version","isActive","effectiveFrom","notes","createdAt") SELECT ${q(ruleSetId)}, '1.0', true, now(), 'Conjunto inicial de regras (seed).', now() WHERE NOT EXISTS (SELECT 1 FROM "RuleSetVersion" WHERE "isActive");`,
  );
  for (const d of RULE_DEFINITIONS) {
    const value = d.defaultValue === null ? "'null'::jsonb" : `${q(JSON.stringify(d.defaultValue))}::jsonb`;
    lines.push(
      `INSERT INTO "SystemRule" ("id","ruleSetVersionId","key","valueType","value","status","description") SELECT gen_random_uuid(), ${q(ruleSetId)}, ${q(d.key)}, ${q(d.valueType)}, ${value}, ${q(d.status)}, ${q(d.description)} WHERE EXISTS (SELECT 1 FROM "RuleSetVersion" WHERE "id" = ${q(ruleSetId)});`,
    );
  }
  const settings: Array<[string, unknown]> = [
    ["retentionPolicy", "DAYS_90"],
    ["aiPrivacyMode", "PDF_FILE"],
    ["institutionName", "Universidade Cruzeiro do Sul Virtual"],
    ["maxUploadMb", 20],
    ["maxPdfPages", 60],
  ];
  for (const [k, v] of settings) {
    lines.push(`INSERT INTO "SystemSetting" ("key","value","updatedAt") VALUES (${q(k)}, ${q(JSON.stringify(v))}::jsonb, now()) ON CONFLICT ("key") DO NOTHING;`);
  }
  lines.push(`INSERT INTO "OpenAIIntegration" ("id","status","createdAt","updatedAt") VALUES ('default', 'DISCONNECTED', now(), now()) ON CONFLICT ("id") DO NOTHING;`);
  lines.push("COMMIT;");
  process.stdout.write(lines.join("\n") + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
