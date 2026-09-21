import "server-only";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getEnv } from "@/lib/env";

/**
 * StorageService — abstração de armazenamento de documentos.
 * Implementação atual: sistema de arquivos local (STORAGE_DIR, fora de public/).
 * Preparado para uma implementação S3-compatível com a mesma interface.
 */
export interface StorageService {
  save(bytes: Buffer, opts: { extension: string; prefix?: string }): Promise<{ key: string; sizeBytes: number }>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

function baseDir(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), getEnv().STORAGE_DIR);
}

function resolveKey(key: string): string {
  const base = baseDir();
  const full = path.resolve(/*turbopackIgnore: true*/ base, key);
  if (!full.startsWith(base + path.sep)) {
    throw new Error("Chave de armazenamento inválida.");
  }
  return full;
}

export const localFsStorage: StorageService = {
  async save(bytes, opts) {
    const prefix = opts.prefix ?? "documents";
    const key = path.posix.join(prefix, `${randomUUID()}.${opts.extension.replace(/^\./, "")}`);
    const full = resolveKey(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes, { mode: 0o600 });
    return { key, sizeBytes: bytes.length };
  },
  async read(key) {
    return readFile(resolveKey(key));
  },
  async delete(key) {
    await rm(resolveKey(key), { force: true });
  },
  async exists(key) {
    try {
      await stat(resolveKey(key));
      return true;
    } catch {
      return false;
    }
  },
};

export function getStorage(): StorageService {
  return localFsStorage;
}
