import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface EncryptedPayload {
  ciphertext: string; // base64
  iv: string; // base64 (12 bytes)
  authTag: string; // base64 (16 bytes)
  keyVersion: number;
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export interface MasterKey {
  key: Buffer;
  version: number;
}

export function parseMasterKey(base64: string, version: number): MasterKey {
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) {
    throw new Error("APP_ENCRYPTION_KEY deve ter 32 bytes (base64).");
  }
  return { key, version };
}

export function encryptString(plaintext: string, master: MasterKey, aad: string): EncryptedPayload {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, master.key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    keyVersion: master.version,
  };
}

export function decryptString(payload: EncryptedPayload, master: MasterKey, aad: string): string {
  if (payload.keyVersion !== master.version) {
    throw new Error(
      `Versão da chave mestra divergente (payload=${payload.keyVersion}, atual=${master.version}).`,
    );
  }
  const decipher = createDecipheriv(ALGORITHM, master.key, Buffer.from(payload.iv, "base64"));
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
