import { z } from "zod";

const base64Key32 = z
  .string()
  .min(1, "obrigatório")
  .refine((v) => {
    try {
      return Buffer.from(v, "base64").length === 32;
    } catch {
      return false;
    }
  }, "deve ser 32 bytes em base64 (openssl rand -base64 32)");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  AUTH_URL: z.string().url().optional(),
  APP_ENCRYPTION_KEY: base64Key32,
  APP_ENCRYPTION_KEY_VERSION: z.coerce.number().int().positive().default(1),
  STORAGE_DIR: z.string().default("./storage"),
  CRON_SECRET: z.string().min(16),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_NAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Lê e valida as variáveis de ambiente do servidor uma única vez. Nunca expor ao cliente. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Variáveis de ambiente inválidas: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
