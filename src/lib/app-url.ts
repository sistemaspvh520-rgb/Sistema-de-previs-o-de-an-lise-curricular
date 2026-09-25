import { getEnv } from "@/lib/env";

/** URL pública do app (base dos links/imagens de e-mail). */
export function appUrl(path = ""): string {
  const base = getEnv().APP_URL ?? process.env.AUTH_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
  return `${base.replace(/\/$/, "")}${path}`;
}
