"use client";

import { useId, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, Lock, Mail, MapPin, MessageCircle, UserRoundSearch } from "lucide-react";
import { confirmStudentPoloAction } from "./polo-actions";
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
        <span className={cn("block text-[10px] leading-4 font-semibold tracking-[0.08em] uppercase", highlight ? "text-brand-cyan-700" : "text-slate-400")}>{role}</span>
        <span className="line-clamp-2 block text-sm leading-5 font-semibold break-words text-slate-900" title={contact.name}>{contact.name}</span>
        {phone && <span className="block text-xs whitespace-nowrap tabular-nums text-slate-500">{phone}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-1">
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

function PoloHeader({ entry, label, action }: { entry: PoloDirectoryEntry | null; label: string; action?: React.ReactNode }) {
  return (
    <div className="flex w-full items-center gap-3 text-left">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#FEF84C] to-[#f7d24a] text-[#003B71] shadow-[0_8px_18px_-12px_#c9a800]">
        <MapPin className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold tracking-[0.14em] text-slate-400 uppercase">{label}</span>
        <span className="block text-sm leading-5 font-semibold text-[#003B71]">{entry ? entry.city : "Toque no seu polo abaixo"}</span>
        {entry?.area && <span className="block text-xs leading-4 text-slate-500">{entry.area}</span>}
      </span>
      {action}
    </div>
  );
}

function PoloGrid({ directory, code, expanded, onChoose, id }: { directory: PoloDirectoryEntry[]; code: string | null; expanded: boolean; onChoose: (code: string) => void; id: string }) {
  return (
    <div id={id} className={cn("grid transition-[grid-template-rows,opacity,margin] duration-500 ease-[cubic-bezier(.2,.7,.2,1)]", expanded ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")} inert={!expanded}>
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
                onClick={() => onChoose(entry.code)}
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
  );
}

function PoloContacts({ entry, message, excludeEmail }: { entry: PoloDirectoryEntry; message: string; excludeEmail?: string | null }) {
  const tutors = entry.tutors.filter((contact) => !excludeEmail || contact.email?.toLowerCase() !== excludeEmail.toLowerCase());
  const rows = [
    ...tutors.map((contact) => ({ role: excludeEmail ? "Tutor do polo" : tutors.length > 1 ? "Tutor do polo" : "Tutor", contact })),
    ...entry.coordination.map((contact) => ({ role: "Coordenação acadêmica", contact })),
  ];
  const noTutor = entry.tutors.length === 0 && !excludeEmail;
  return (
    <ul key={entry.code} className="mt-3 space-y-1.5" aria-live="polite" aria-label={`Contatos do polo ${entry.city}`}>
      {rows.map(({ role, contact }, index) => (
        <ContactRow key={`${role}-${contact.name}`} role={role} contact={contact} message={message} delay={60 + index * 70} />
      ))}
      {noTutor && (
        <li style={{ animationDelay: `${60 + rows.length * 70}ms` }} className="polo-in flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 px-3 py-2.5 text-xs leading-5 text-slate-500">
          <UserRoundSearch className="size-5 shrink-0 text-slate-400" aria-hidden="true" />
          Tutor deste polo ainda não cadastrado. Fale com a coordenação acadêmica.
        </li>
      )}
    </ul>
  );
}

const headerButton = "group w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_10px_30px_-26px_#003b71] transition-[border-color,box-shadow] duration-300";

/**
 * Página pública (primeiro acesso): o aluno escolhe o polo e vê tutor(es) e coordenação acadêmica.
 * A escolha fica lembrada no aparelho.
 */
export function PoloContactPicker({ directory, message, storageKey = "portal:polo" }: { directory: PoloDirectoryEntry[]; message: string; storageKey?: string }) {
  const listId = useId();
  const stored = useSyncExternalStore(noop, () => readStored(storageKey), () => null);
  const [picked, setPicked] = useState<string | null>(null);
  const code = [picked, stored].find((value) => value && directory.some((entry) => entry.code === value)) ?? null;
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

  return (
    <div className="polo-picker">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={expanded}
        aria-controls={listId}
        disabled={!code}
        className={cn(headerButton, "hover:border-brand-cyan/40 hover:shadow-[0_14px_32px_-22px_#0693e3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cyan disabled:cursor-default")}
      >
        <PoloHeader
          entry={selected}
          label={selected ? "Seu polo" : "Escolha seu polo"}
          action={code ? (
            <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-cyan-700">
              {expanded ? "Fechar" : "Trocar"}
              <ChevronDown className={cn("size-4 transition-transform duration-300", expanded && "rotate-180")} />
            </span>
          ) : undefined}
        />
      </button>
      <PoloGrid id={listId} directory={directory} code={code} expanded={expanded} onChoose={choose} />
      {selected && <PoloContacts entry={selected} message={message} />}
    </div>
  );
}

/**
 * Portal do aluno: o polo é fixo. Vem do tutor que liberou o acesso; se ele não tinha polo, o aluno
 * escolhe e confirma uma única vez (depois só a equipe altera).
 */
export function StudentPoloContacts({ directory, message, poloCode, ownerEmail, canConfirm }: { directory: PoloDirectoryEntry[]; message: string; poloCode: string | null; ownerEmail?: string | null; canConfirm: boolean }) {
  const router = useRouter();
  const listId = useId();
  const [picked, setPicked] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fixed = directory.find((entry) => entry.code === poloCode) ?? null;

  if (fixed) {
    return (
      <div className="polo-picker">
        <div className={headerButton}>
          <PoloHeader
            entry={fixed}
            label="Seu polo"
            action={<Lock className="size-4 shrink-0 text-slate-300" aria-label="Polo definido pela equipe" />}
          />
        </div>
        <PoloContacts entry={fixed} message={message} excludeEmail={ownerEmail} />
      </div>
    );
  }

  const selected = directory.find((entry) => entry.code === picked) ?? null;
  const confirm = () =>
    start(async () => {
      if (!selected) return;
      const result = await confirmStudentPoloAction({ code: selected.code });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      router.refresh();
    });

  return (
    <div className="polo-picker rounded-3xl border border-amber-200/70 bg-gradient-to-b from-amber-50/80 to-white p-3">
      <PoloHeader entry={selected} label="Confirme seu polo" />
      <p className="mt-2 px-1 text-xs leading-5 text-slate-600">Você só faz isso uma vez. Depois, apenas a equipe acadêmica pode alterar.</p>
      <PoloGrid id={listId} directory={directory} code={picked} expanded onChoose={setPicked} />
      {selected && (
        <>
          <PoloContacts entry={selected} message={message} excludeEmail={ownerEmail} />
          <button
            type="button"
            onClick={confirm}
            disabled={pending || !canConfirm}
            className="polo-in mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#003B71] px-4 text-sm font-semibold text-white shadow-[0_12px_26px_-16px_#003b71] transition-[background-color,transform] duration-200 hover:bg-[#07558f] active:scale-[.99] disabled:opacity-60"
          >
            <Check className="size-4" /> {pending ? "Confirmando…" : `Confirmar ${selected.city}${selected.area ? ` · ${selected.area}` : ""}`}
          </button>
          {!canConfirm && <p className="mt-2 text-center text-xs text-slate-500">Somente o aluno confirma o polo. A equipe define na página do aluno.</p>}
        </>
      )}
    </div>
  );
}
