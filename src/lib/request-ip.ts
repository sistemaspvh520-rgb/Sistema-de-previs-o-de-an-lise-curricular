/**
 * IP do cliente. Cabeçalhos X-Forwarded-For só são confiáveis atrás de um proxy que os sobrescreve
 * (Vercel, Cloudflare, Nginx configurado). Fora disso, um cliente poderia forjá-los para burlar o rate limit.
 */
export function isTrustedProxy(): boolean {
  if (process.env.TRUSTED_PROXY === "1" || process.env.TRUSTED_PROXY === "true") return true;
  if (process.env.TRUSTED_PROXY === "0" || process.env.TRUSTED_PROXY === "false") return false;
  return process.env.VERCEL === "1";
}

export function getClientIp(headers: Headers | { get(name: string): string | null | undefined }): string {
  if (isTrustedProxy()) {
    const xff = headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
    const real = headers.get("x-real-ip");
    if (real) return real.trim();
  }
  // sem proxy confiável: não há IP de socket acessível no runtime do Next; usa um bucket compartilhado
  return "untrusted";
}
