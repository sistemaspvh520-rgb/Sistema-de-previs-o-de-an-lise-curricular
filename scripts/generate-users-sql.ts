/**
 * Gera SQL idempotente para criar usuários (com hash argon2id) a partir de um JSON:
 *   [{ "name": "...", "email": "...", "role": "ADMIN|ACADEMIC_COORDINATOR|TUTOR|ANALYST|VIEWER", "password": "..." }]
 * Uso: npx tsx scripts/generate-users-sql.ts users.json > users.sql
 * As senhas NÃO vão para o SQL em texto puro; apenas o hash.
 */
import { readFileSync } from "node:fs";
import { hash } from "@node-rs/argon2";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

async function main() {
  const users = JSON.parse(readFileSync(process.argv[2], "utf8")) as Array<{ name: string; email: string; role: string; password: string }>;
  const lines = ["BEGIN;"];
  for (const u of users) {
    if (!["ADMIN", "ACADEMIC_COORDINATOR", "TUTOR", "ANALYST", "VIEWER"].includes(u.role)) throw new Error(`Perfil inválido: ${u.role}`);
    if (u.password.length < 12) throw new Error(`Senha curta para ${u.email}`);
    const h = await hash(u.password);
    lines.push(
      `INSERT INTO "User" ("id","email","name","passwordHash","role","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(), ${q(u.email.toLowerCase())}, ${q(u.name)}, ${q(h)}, ${q(u.role)}, true, now(), now()) ON CONFLICT ("email") DO UPDATE SET "name" = EXCLUDED."name", "role" = EXCLUDED."role", "passwordHash" = EXCLUDED."passwordHash", "isActive" = true, "updatedAt" = now();`,
    );
    lines.push(
      `INSERT INTO "AuditLog" ("id","userId","action","entityType","entityId","metadata","createdAt") SELECT gen_random_uuid(), (SELECT id FROM "User" WHERE email = ${q((process.env.ADMIN_EMAIL ?? users[0].email).toLowerCase())}), 'user.create', 'User', u.id::text, jsonb_build_object('email', u.email, 'role', u.role, 'via', 'scripts/generate-users-sql.ts'), now() FROM "User" u WHERE u.email = ${q(u.email.toLowerCase())};`,
    );
  }
  lines.push("COMMIT;");
  process.stdout.write(lines.join("\n") + "\n");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
