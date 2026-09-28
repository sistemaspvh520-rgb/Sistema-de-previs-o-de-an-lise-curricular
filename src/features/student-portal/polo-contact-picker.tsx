"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Check, ChevronDown, Mail, MapPin, MessageCircle, UserRoundSearch } from "lucide-react";
import type { DirectoryContact, PoloDirectoryEntry } from "@/services/student-portal/polo-directory.shared";
import { formatWhatsapp, whatsappUrl } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter((word) => word.length > 2 || /^[A-ZÀ-Ú]/.test(word));
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

/** Contato em uma linha: avatar, papel, nome e botões redondos de WhatsApp e e-mail. */
export function ContactRow({ role, contact, message, highlight = false, delay = 0 }: { role: string; contact: DirectoryContact; message: string; highlight?: boolean; delay?: number }) {
  const whatsapp = whatsappUrl(contact.phone, message);
  const phone = formatWhatsapp(contact.phone);
  return (
    <li
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        "polo-in group flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-[background-color,border-color,box-shadow] duration-300",
        highlight
          ? "border-brand-cyan/25 bg-gradient-to-r from-brand-cyan-50 to-white"
          : "border-transparent bg-white/70 hover:border-slate-200 hover:bg-white hover:shadow-[0_12px_28px_-22px_#003b71]",
      )}
    >
      <span aria-hidden="true" className="relative grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#0693E3] to-[#003B71] text-sm font-semibold text-white shadow-[0_8px_18px_-10px_#0693E3] transition-transform duration-300 group-hover:scale-105">
        {initials(contact.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[10px] font-semibold tracking-[0.08em] uppercase", highlight ? "text-brand-cyan-700" : "text-slate-400")}>{role}</span>
        <span className="block truncate text-sm font-semibold text-slate-900">{contact.name}</span>
        {phone && <span className="block truncate text-xs tabular-nums text-slate-500">{phone}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Conversar com ${contact.name} no WhatsApp`}
            title="Conversar no WhatsApp"
            className="polo-whats grid size-10 place-items-center rounded-full bg-[#25D366] text-white shadow-[0_8px_18px_-10px_#25D366] transition-transform duration-200 hover:-translate-y-0.5 hover:scale-105 active:scale-95"
          >
            <MessageCircle className="size-[18px]" />
          </a>
        )}
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            aria-label={`Enviar e-mail para ${contact.name}`}
            title={contact.email}
            className="grid size-10 place-items-center rounded-full border border-slate-200 bg-white text-[#003B71] transition-[transform,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-brand-cyan/40 hover:bg-brand-cyan-50 active:scale-95"
          >
            <Mail className="size-[18px]" />
          </a>
        )}
      </span>
    </li>
  );
}

const noop = () => () => {};

function readStored(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * O aluno escolhe o polo e vê só o essencial: tutor(es) e coordenação acadêmica daquele polo.
 * A escolha fica lembrada no aparelho; `defaultCode` é o polo do responsável, quando existe.
 */
export function PoloContactPicker({ directory, message, defaultCode = null, storageKey = "portal:polo" }: { directory: PoloDirectoryEntry[]; message: string; defaultCode?: string | null; storageKey?: string }) {
  const listId = useId();
  const stored = useSyncExternalStore(noop, () => readStored(storageKey), () => null);
  const [picked, setPicked] = useState<string | null>(null);
  const code = [picked, stored, defaultCode].find((value) => value && directory.some((entry) => entry.code === value)) ?? null;
  const [open, setOpen] = useState(false);
  const expanded = open || !code;
  const selected = directory.find((entry) => entry.code === code) ?? null;

  const choose = (next: string) => {
    setPicked(next);
    setOpen(false);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {}
  };

  const rows = selected
    ? [
        ...selected.tutors.map((contact) => ({ role: selected.tutors.length > 1 ? "Tutor do polo" : "Tutor", contact })),
        ...selected.coordination.map((contact) => ({ role: "Coordenação acadêmica", contact })),
      ]
    : [];

  return (
    <div className="polo-picker">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={expanded}
        aria-controls={listId}
        disabled={!code}
        className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-[0_10px_30px_-26px_#003b71] transition-[border-color,box-shadow] duration-300 hover:border-brand-cyan/40 hover:shadow-[0_14px_32px_-22px_#0693e3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cyan disabled:cursor-default"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#FEF84C] to-[#f7d24a] text-[#003B71] shadow-[0_8px_18px_-12px_#c9a800]">
          <MapPin className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-semibold tracking-[0.14em] text-slate-400 uppercase">{selected ? "Seu polo" : "Escolha seu polo"}</span>
          <span className="block truncate text-sm font-semibold text-[#003B71]">
            {selected ? selected.city : "Toque no seu polo abaixo"}
            {selected?.area && <span className="font-normal text-slate-500"> · {selected.area}</span>}
          </span>
        </span>
        {code && (
          <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-cyan-700">
            {expanded ? "Fechar" : "Trocar"}
            <ChevronDown className={cn("size-4 transition-transform duration-300", expanded && "rotate-180")} />
          </span>
        )}
      </button>

      <div id={listId} className={cn("grid transition-[grid-template-rows,opacity,margin] duration-500 ease-[cubic-bezier(.2,.7,.2,1)]", expanded ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")} inert={!expanded}>
        <div className="overflow-hidden">
          <div role="radiogroup" aria-label="Polos" className="grid grid-cols-2 gap-1.5 p-0.5">
            {directory.map((entry, index) => {
              const active = entry.code === code;
              return (
                <button
                  key={entry.code}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => choose(entry.code)}
                  style={{ animationDelay: `${index * 35}ms` }}
                  className={cn(
                    "relative min-h-12 rounded-xl border px-3 py-2 text-left text-xs transition-[background-color,border-color,transform,box-shadow] duration-200 active:scale-[.98]",
                    expanded && "polo-in",
                    active
                      ? "border-[#003B71] bg-[#003B71] text-white shadow-[0_10px_22px_-14px_#003b71]"
                      : "border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-brand-cyan/40 hover:bg-brand-cyan-50/60",
                  )}
                >
                  <span className="line-clamp-2 block pr-4 text-[13px] leading-4 font-semibold">{entry.city}</span>
                  <span className={cn("mt-0.5 block truncate", active ? "text-sky-100" : "text-slate-500")}>{entry.area ?? "Polo"}</span>
                  {active && <Check className="absolute top-2 right-2 size-3.5" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {selected && (
        <ul key={selected.code} className="mt-3 space-y-1.5" aria-live="polite" aria-label={`Contatos do polo ${selected.city}`}>
          {rows.map(({ role, contact }, index) => (
            <ContactRow key={`${role}-${contact.name}`} role={role} contact={contact} message={message} delay={60 + index * 70} />
          ))}
          {selected.tutors.length === 0 && (
            <li style={{ animationDelay: `${60 + rows.length * 70}ms` }} className="polo-in flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 px-3 py-2.5 text-xs leading-5 text-slate-500">
              <UserRoundSearch className="size-5 shrink-0 text-slate-400" aria-hidden="true" />
              Tutor deste polo ainda não cadastrado. Fale com a coordenação acadêmica.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
