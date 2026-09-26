/** Normaliza um telefone brasileiro para o formato do WhatsApp (DDI 55 + DDD + número). */
export function normalizeWhatsapp(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return digits;
  return null;
}

export function whatsappUrl(phone: string | null | undefined, text?: string): string | null {
  const number = normalizeWhatsapp(phone);
  if (!number) return null;
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** "5569999990000" → "(69) 99999-0000" */
export function formatWhatsapp(phone: string | null | undefined): string | null {
  const number = normalizeWhatsapp(phone);
  if (!number) return phone?.trim() || null;
  const local = number.slice(2);
  return `(${local.slice(0, 2)}) ${local.slice(2, -4)}-${local.slice(-4)}`;
}
