import { describe, expect, it } from "vitest";
import { decryptString, encryptString, parseMasterKey } from "@/services/crypto/aes-gcm";

const master = parseMasterKey(Buffer.alloc(32, 1).toString("base64"), 1);
const other = parseMasterKey(Buffer.alloc(32, 2).toString("base64"), 1);
const AAD = "openai-integration:v1";

describe("AES-256-GCM", () => {
  it("roundtrip", () => {
    const enc = encryptString("sk-proj-abc123", master, AAD);
    expect(enc.ciphertext).not.toContain("sk-");
    expect(decryptString(enc, master, AAD)).toBe("sk-proj-abc123");
  });
  it("IV diferente a cada operação", () => {
    const a = encryptString("x", master, AAD);
    const b = encryptString("x", master, AAD);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
  it("falha com chave mestra errada", () => {
    const enc = encryptString("segredo", master, AAD);
    expect(() => decryptString(enc, other, AAD)).toThrow();
  });
  it("falha com auth tag adulterada ou AAD diferente", () => {
    const enc = encryptString("segredo", master, AAD);
    expect(() => decryptString({ ...enc, authTag: Buffer.alloc(16, 0).toString("base64") }, master, AAD)).toThrow();
    expect(() => decryptString(enc, master, "outro")).toThrow();
  });
  it("rejeita versão de chave divergente", () => {
    const enc = encryptString("segredo", master, AAD);
    expect(() => decryptString({ ...enc, keyVersion: 2 }, master, AAD)).toThrow(/Versão/);
  });
  it("rejeita chave mestra com tamanho errado", () => {
    expect(() => parseMasterKey(Buffer.alloc(16, 1).toString("base64"), 1)).toThrow();
  });
});
