import "server-only";
import { randomInt } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { decryptString, encryptString, parseMasterKey } from "@/services/crypto/aes-gcm";

const AAD = "user-initial-password:v1";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"; // sem 0/O, 1/l/I

function masterKey() {
  const env = getEnv();
  return parseMasterKey(env.APP_ENCRYPTION_KEY, env.APP_ENCRYPTION_KEY_VERSION);
}

/** Senha temporária legível: prefixo + 12 caracteres sem ambiguidade. */
export function generateTemporaryPassword(): string {
  let out = "CZS-";
  for (let i = 0; i < 12; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/**
 * Define uma senha temporária: grava o hash (para login), a cópia cifrada (para o ADMIN consultar
 * até o primeiro acesso) e marca mustChangePassword. Retorna a senha em texto puro UMA vez.
 */
export async function assignTemporaryPassword(userId: string, password = generateTemporaryPassword()): Promise<string> {
  const target = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true } });
  if (target.role === "STUDENT") throw new Error("Use o convite ou recuperação por link para alunos.");
  const enc = encryptString(password, masterKey(), AAD);
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hash(password),
      mustChangePassword: true,
      initialPasswordEncrypted: enc.ciphertext,
      initialPasswordIv: enc.iv,
      initialPasswordAuthTag: enc.authTag,
      initialPasswordKeyVersion: enc.keyVersion,
      initialPasswordSetAt: new Date(),
    },
  });
  return password;
}

/** Lê a senha temporária cifrada. Retorna null quando o usuário já definiu a própria senha. */
export async function readTemporaryPassword(userId: string): Promise<string | null> {
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { mustChangePassword: true, initialPasswordEncrypted: true, initialPasswordIv: true, initialPasswordAuthTag: true, initialPasswordKeyVersion: true },
  });
  if (!u.mustChangePassword || !u.initialPasswordEncrypted || !u.initialPasswordIv || !u.initialPasswordAuthTag || u.initialPasswordKeyVersion === null) return null;
  return decryptString({ ciphertext: u.initialPasswordEncrypted, iv: u.initialPasswordIv, authTag: u.initialPasswordAuthTag, keyVersion: u.initialPasswordKeyVersion }, masterKey(), AAD);
}

/** Apaga a senha temporária (usuário definiu a própria). */
export async function clearTemporaryPassword(userId: string, newPasswordHash: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 }, passwordHash: newPasswordHash, mustChangePassword: false, initialPasswordEncrypted: null, initialPasswordIv: null, initialPasswordAuthTag: null, initialPasswordKeyVersion: null, initialPasswordSetAt: null },
  });
}
