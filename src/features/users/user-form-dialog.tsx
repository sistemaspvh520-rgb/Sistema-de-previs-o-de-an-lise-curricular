"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, STAFF_ROLES, isStudentFacingRole } from "@/lib/rbac";
import { createUserAction } from "@/features/users/actions";
import { TemporaryPasswordDialog } from "@/features/users/temporary-password-dialog";
import { POLOS } from "@/domain/polos";
import type { Role } from "@/generated/prisma/enums";

const NO_POLO = "__none__";
type StaffRole = (typeof STAFF_ROLES)[number];

export function UserFormDialog() {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>("TUTOR");
  const [polo, setPolo] = useState(NO_POLO);
  const [phone, setPhone] = useState("");
  const [pending, start] = useTransition();
  const [created, setCreated] = useState<{ name: string; login: string; password: string; note: string } | null>(null);

  function submit(formData: FormData) {
    const name = String(formData.get("name") ?? "");
    const email = String(formData.get("email") ?? "").toLowerCase();
    start(async () => {
      const studentFacing = isStudentFacingRole(role);
      const res = await createUserAction({ name, email, role, poloCode: studentFacing && polo !== NO_POLO ? polo : null, phone: studentFacing ? phone : null });
      if (res.ok) {
        toast.success(res.message);
        setOpen(false);
        setCreated({
          name,
          login: email,
          password: res.data.temporaryPassword,
          note: res.data.inviteSent ? `Convite enviado para ${email} com link para definir a senha (válido por 7 dias).` : (res.data.inviteError ?? ""),
        });
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="size-4" /> Novo usuário
          </Button>
        </DialogTrigger>
        <DialogContent>
          <form action={submit}>
            <DialogHeader>
              <DialogTitle>Novo usuário</DialogTitle>
              <DialogDescription>Uma senha temporária é gerada automaticamente e fica visível aqui até o primeiro acesso.</DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input id="name" name="name" required minLength={2} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail institucional (login)</Label>
                <Input id="email" name="email" type="email" required placeholder="nome.sobrenome@cruzeirodosul.edu.br" />
              </div>
              <div className="space-y-2">
                <Label>Perfil</Label>
                <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAFF_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role as StaffRole]}</p>
              </div>
              {isStudentFacingRole(role) && (
                <>
                  <div className="space-y-2">
                    <Label>Polo</Label>
                    <Select value={polo} onValueChange={setPolo}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_POLO}>Sem polo definido</SelectItem>
                        {POLOS.map((p) => (
                          <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Define os contatos institucionais mostrados aos alunos deste tutor.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">WhatsApp</Label>
                    <Input id="phone" name="phone" type="tel" inputMode="tel" placeholder="(69) 99999-0000" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    <p className="text-xs text-muted-foreground">Os alunos abrem a conversa direto pelo portal.</p>
                  </div>
                </>
              )}
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />} Criar usuário
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <TemporaryPasswordDialog open={!!created} onOpenChange={(o) => !o && setCreated(null)} name={created?.name ?? ""} login={created?.login ?? ""} password={created?.password ?? null} note={created?.note} />
    </>
  );
}
