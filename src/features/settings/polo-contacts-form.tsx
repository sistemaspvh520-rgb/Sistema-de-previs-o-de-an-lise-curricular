"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { savePoloContactsAction } from "@/features/settings/polo-contacts-actions";
import type { Polo } from "@/domain/polos";
import type { PoloContactEntry, PoloContacts } from "@/repositories/settings-repository";

const EMPTY: PoloContactEntry = { nome: "", email: "", telefone: "" };
const ROLE_LABELS = {
  mantenedor: "Mantenedor",
  coordAcademico: "Coordenação acadêmica",
  coordComercial: "Coordenação comercial",
} as const;

export function PoloContactsForm({
  polos,
  initial,
  readOnly,
}: {
  polos: Polo[];
  initial: Record<string, PoloContacts>;
  readOnly: boolean;
}) {
  const [contacts, setContacts] = useState<Record<string, PoloContacts>>(() => {
    const seeded: Record<string, PoloContacts> = {};
    for (const polo of polos) {
      seeded[polo.code] = initial[polo.code] ?? {
        mantenedor: { ...EMPTY },
        coordAcademico: { ...EMPTY },
        coordComercial: { ...EMPTY },
      };
    }
    return seeded;
  });
  const [openPolo, setOpenPolo] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function update(poloCode: string, role: keyof PoloContacts, field: keyof PoloContactEntry, value: string) {
    setContacts((prev) => ({
      ...prev,
      [poloCode]: { ...prev[poloCode], [role]: { ...prev[poloCode][role], [field]: value } },
    }));
  }

  function submit() {
    start(async () => {
      const res = await savePoloContactsAction(contacts);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        O aluno vê os contatos do polo do seu tutor responsável, no portal.
      </p>
      {polos.map((polo) => {
        const open = openPolo === polo.code;
        return (
          <Collapsible
            key={polo.code}
            open={open}
            onOpenChange={(next) => setOpenPolo(next ? polo.code : null)}
            className="rounded-xl border bg-muted/20"
          >
            <CollapsibleTrigger className="flex w-full items-center justify-between p-4 text-left text-sm font-semibold">
              {polo.name}
              <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="grid gap-4 border-t p-4 sm:grid-cols-3">
                {(Object.keys(ROLE_LABELS) as (keyof PoloContacts)[]).map((role) => (
                  <fieldset key={role} className="space-y-2">
                    <legend className="text-xs font-semibold text-muted-foreground">{ROLE_LABELS[role]}</legend>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Nome</Label>
                      <Input
                        value={contacts[polo.code][role].nome}
                        disabled={readOnly}
                        onChange={(e) => update(polo.code, role, "nome", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">E-mail</Label>
                      <Input
                        type="email"
                        value={contacts[polo.code][role].email}
                        disabled={readOnly}
                        onChange={(e) => update(polo.code, role, "email", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Telefone / WhatsApp</Label>
                      <Input
                        value={contacts[polo.code][role].telefone}
                        disabled={readOnly}
                        onChange={(e) => update(polo.code, role, "telefone", e.target.value)}
                      />
                    </div>
                  </fieldset>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
      {!readOnly && (
        <div>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />} Salvar contatos
          </Button>
        </div>
      )}
    </div>
  );
}
