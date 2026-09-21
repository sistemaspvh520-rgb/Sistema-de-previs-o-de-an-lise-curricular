"use client";

import { useState, useTransition } from "react";
import { KeyRound, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABELS } from "@/lib/rbac";
import { resetPasswordAction, updateUserAction } from "@/features/users/actions";
import type { Role } from "@/generated/prisma/enums";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
}

export function UserRowActions({ user, isSelf }: { user: UserRow; isSelf: boolean }) {
  const [editOpen, setEditOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<Role>(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [pending, start] = useTransition();

  function saveEdit() {
    start(async () => {
      const res = await updateUserAction({ id: user.id, name, role, isActive });
      if (res.ok) {
        toast.success(res.message);
        setEditOpen(false);
      } else toast.error(res.error);
    });
  }

  function savePassword(formData: FormData) {
    start(async () => {
      const res = await resetPasswordAction({ id: user.id, password: formData.get("password") });
      if (res.ok) {
        toast.success(res.message);
        setPwOpen(false);
      } else toast.error(res.error);
    });
  }

  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setEditOpen(true)}>
        <Pencil className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Redefinir senha" onClick={() => setPwOpen(true)}>
        <KeyRound className="size-4" />
      </Button>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
            <DialogDescription>{user.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`name-${user.id}`}>Nome</Label>
              <Input id={`name-${user.id}`} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Perfil</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)} disabled={isSelf}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Acesso ativo</div>
                <div className="text-xs text-muted-foreground">Usuários inativos não conseguem entrar.</div>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} disabled={isSelf} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent>
          <form action={savePassword}>
            <DialogHeader>
              <DialogTitle>Redefinir senha</DialogTitle>
              <DialogDescription>Defina uma nova senha para {user.name}.</DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-2">
              <Label htmlFor={`pw-${user.id}`}>Nova senha</Label>
              <Input id={`pw-${user.id}`} name="password" type="password" minLength={8} required autoComplete="new-password" />
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setPwOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Redefinir</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
