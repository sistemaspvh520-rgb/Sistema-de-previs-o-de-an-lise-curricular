import "server-only";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { StorageService } from "@/services/storage/types";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * StorageService sobre o Supabase Storage (bucket privado). Usa a chave SECRETA do projeto
 * (server-only) — nunca exposta ao navegador. O bucket é criado sob demanda como privado.
 */
let client: SupabaseClient | null = null;
let bucketReady: Promise<void> | null = null;

function getClient(): SupabaseClient {
  if (client) return client;
  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    throw new Error("SUPABASE_URL e SUPABASE_SECRET_KEY são obrigatórios quando STORAGE_DRIVER=supabase.");
  }
  client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

function bucketName(): string {
  return getEnv().SUPABASE_STORAGE_BUCKET;
}

async function ensureBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const supabase = getClient();
    const { data, error } = await supabase.storage.getBucket(bucketName());
    if (data) return;
    if (error && !/not found/i.test(error.message)) throw error;
    const { error: createError } = await supabase.storage.createBucket(bucketName(), { public: false, fileSizeLimit: 52_428_800, allowedMimeTypes: ["application/pdf"] });
    if (createError && !/already exists/i.test(createError.message)) throw createError;
    logger.info("storage.supabase.bucket_created", { bucket: bucketName() });
  })().catch((e) => {
    bucketReady = null;
    throw e;
  });
  return bucketReady;
}

function safeKey(key: string): string {
  if (key.includes("..") || path.posix.isAbsolute(key)) throw new Error("Chave de armazenamento inválida.");
  return key;
}

export const supabaseStorage: StorageService = {
  async save(bytes, opts) {
    await ensureBucket();
    const key = path.posix.join(opts.prefix ?? "documents", `${randomUUID()}.${opts.extension.replace(/^\./, "")}`);
    const { error } = await getClient().storage.from(bucketName()).upload(key, bytes, { contentType: "application/pdf", upsert: false });
    if (error) throw new Error(`Falha ao gravar no Supabase Storage: ${error.message}`);
    return { key, sizeBytes: bytes.length };
  },
  async read(key) {
    const { data, error } = await getClient().storage.from(bucketName()).download(safeKey(key));
    if (error || !data) throw new Error(`Falha ao ler do Supabase Storage: ${error?.message ?? "sem dados"}`);
    return Buffer.from(await data.arrayBuffer());
  },
  async delete(key) {
    const { error } = await getClient().storage.from(bucketName()).remove([safeKey(key)]);
    if (error) throw new Error(`Falha ao remover do Supabase Storage: ${error.message}`);
  },
  async exists(key) {
    const dir = path.posix.dirname(safeKey(key));
    const base = path.posix.basename(key);
    const { data, error } = await getClient().storage.from(bucketName()).list(dir, { search: base, limit: 1 });
    if (error) return false;
    return (data ?? []).some((f) => f.name === base);
  },
};
