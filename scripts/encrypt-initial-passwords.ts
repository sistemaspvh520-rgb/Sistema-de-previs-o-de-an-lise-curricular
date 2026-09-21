/**
 * Gera SQL que marca usuários com senha temporária (mustChangePassword) e grava a senha cifrada
 * (AES-256-GCM) para consulta do ADMIN até o primeiro acesso.
 *
 * Uso: APP_ENCRYPTION_KEY=... APP_ENCRYPTION_KEY_VERSION=1 npx tsx scripts/encrypt-initial-passwords.ts acessos.csv > out.sql
 * CSV: nome,perfil,login,senha_inicial (cabeçalho na 1ª linha). A senha NÃO vai em texto puro para o SQL.
 */
import { readFileSync } from "node:fs";
import { encryptString, parseMasterKey } from "../src/services/crypto/aes-gcm";

const AAD = "user-initial-password:v1";
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const key = process.env.APP_ENCRYPTION_KEY;
if (!key) throw new Error("APP_ENCRYPTION_KEY é obrigatória.");
const master = parseMasterKey(key, Number(process.env.APP_ENCRYPTION_KEY_VERSION ?? "1"));
const lines = readFileSync(process.argv[2], "utf8").split(/\r?\n/).filter(Boolean).slice(1);
const sql = ["BEGIN;"];
for (const line of lines) {
  const [, , login, password] = parseCsvLine(line);
  if (!login || !password) continue;
  const enc = encryptString(password, master, AAD);
  sql.push(
    `UPDATE "User" SET "mustChangePassword" = true, "initialPasswordEncrypted" = ${q(enc.ciphertext)}, "initialPasswordIv" = ${q(enc.iv)}, "initialPasswordAuthTag" = ${q(enc.authTag)}, "initialPasswordKeyVersion" = ${enc.keyVersion}, "initialPasswordSetAt" = now(), "updatedAt" = now() WHERE email = ${q(login.toLowerCase())};`,
  );
}
sql.push("COMMIT;");
process.stdout.write(sql.join("\n") + "\n");
