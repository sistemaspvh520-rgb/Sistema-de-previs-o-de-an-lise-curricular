import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Mail, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatWhatsapp, whatsappUrl } from "@/lib/whatsapp";

export function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-slate-100 pb-6 last:border-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-cyan-50 text-brand-cyan-700">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold text-[#003B71]">{title}</h3>
          {description && <p className="mt-0.5 text-sm leading-5 text-slate-500">{description}</p>}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function ContactCard({
  role,
  name,
  email,
  phone,
  message,
  highlight = false,
}: {
  role: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  message: string;
  highlight?: boolean;
}) {
  const whatsapp = whatsappUrl(phone, message);
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 text-sm",
        highlight ? "border-brand-cyan/25 bg-brand-cyan-50/70" : "border-slate-200 bg-white",
      )}
    >
      <p className={cn("text-[11px] font-semibold tracking-wide uppercase", highlight ? "text-brand-cyan-700" : "text-slate-500")}>{role}</p>
      <p className="mt-1 font-semibold text-slate-900">{name}</p>
      {phone && <p className="mt-0.5 text-slate-600">{formatWhatsapp(phone)}</p>}
      {(whatsapp || email) && (
        <div className="mt-3 grid gap-2">
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-3.5 text-sm font-semibold text-white shadow-[0_8px_20px_-12px_#25D366] transition-colors hover:bg-[#1ebe5b]"
            >
              <MessageCircle className="size-4" /> Conversar no WhatsApp
            </a>
          )}
          {email && (
            <a
              href={`mailto:${email}`}
              className="inline-flex min-h-10 w-full min-w-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-[#003B71] transition-colors hover:border-brand-cyan/40 hover:bg-brand-cyan-50"
              title={email}
            >
              <Mail className="size-4 shrink-0" />
              <span className="truncate">{email}</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}
