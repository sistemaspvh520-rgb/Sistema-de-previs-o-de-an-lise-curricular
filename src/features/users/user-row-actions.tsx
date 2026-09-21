"use client";

import { useState, useTransition } from "react";
import { Eye, KeyRound, Loader2, LogIn, MailPlus, Pencil, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ROLE_LABELS } from "@/lib/rbac";
import { impersonateUserAction, resendInviteAction, resetPasswordAction, revealInitialPasswordAction, sendResetLinkAction, updateUserAction } from "@/features/users/actions";
import { TemporaryPasswordDialog } from "@/features/users/temporary-password-dialog";
import type { Role } from "@/generated/prisma/enums";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  inviteSentAt: string | null;
}

export function UserRowActions({ user, isSelf, emailEnabled }: { user: UserRow; isSelf: boolean; emailEnabled: boolean }) {
  const [editOpen, setEditOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [shown, setShown] = useState<{ password: string | null } | null>(null);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<Role>(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [pending, start] = useTransition();

  function saveEdit() {
    start(async () => {
      const res = await updateUserAction({ id: user.id, name, email, role, isActive });
      if (res.ok) {
        toast.success(res.message);
        setEditOpen(false);
      } else toast.error(res.error);
    });
  }
  function reveal() {
    start(async () => {
      const res = await revealInitialPasswordAction({ id: user.id });
      if (res.ok) setShown({ password: res.data.temporaryPassword });
      else toast.error(res.error);
    });
  }
  function resendInvite() {
    start(async () => {
      const res = await resendInviteAction({ id: user.id });
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }
  function sendResetLink() {
    start(async () => {
      const res = await sendResetLinkAction({ id: user.id });
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }
  function impersonate() {
    start(async () => {
      const res = await impersonateUserAction({ id: user.id });
      if (res && !res.ok) toast.error(res.error);
    });
  }
  function reset() {
    start(async () => {
      const res = await resetPasswordAction({ id: user.id });
      setResetOpen(false);
      if (res.ok) {
        toast.success(res.message);
        setShown({ password: res.data.temporaryPassword });
      } else toast.error(res.error);
    });
  }

  return (
    <div className="flex justify-end gap-1">
      {user.mustChangePassword && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Ver senha temporária" onClick={reveal} disabled={pending}>
              <Eye className="size-4 text-status-warning" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ver senha temporária (ainda não fez o primeiro acesso)</TooltipContent>
        </Tooltip>
      )}
      {user.mustChangePassword && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Reenviar convite" onClick={resendInvite} disabled={pending || !emailEnabled}>
              <MailPlus className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{emailEnabled ? "Reenviar convite por e-mail (link para definir a senha)" : "Envio de e-mail não configurado"}</TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Enviar link de redefinição" onClick={sendResetLink} disabled={pending || !emailEnabled || isSelf}>
            <Send className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{emailEnabled ? "Enviar link de redefinição de senha por e-mail" : "Envio de e-mail não configurado"}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Editar nome, e-mail, perfil e acesso</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Gerar senha temporária" onClick={() => setResetOpen(true)} disabled={isSelf}>
            <KeyRound className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Gerar nova senha temporária</TooltipContent>
      </Tooltip>
      {!isSelf && user.isActive && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Acessar como" onClick={impersonate} disabled={pending}>
              <LogIn className="size-4 text-brand-navy" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Acessar como este usuário (modo de suporte)</TooltipContent>
        </Tooltip>
      )}

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
              <Label htmlFor={`email-${user.id}`}>E-mail (login)</Label>
              <Input id={`email-${user.id}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isSelf} />
              {!isSelf && <p className="text-xs text-muted-foreground">Ao corrigir o e-mail, reenvie o convite para a pessoa definir a senha.</p>}
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
                <div className="text-xs text-muted-foreground">Usuários inativos perdem a sessão em até 5 minutos.</div>
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

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Redefinir senha de {user.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              A senha atual deixa de funcionar. Uma nova senha temporária será gerada e exibida para você repassar; a pessoa terá que trocá-la no próximo acesso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); reset(); }} disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Gerar senha temporária</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TemporaryPasswordDialog open={!!shown} onOpenChange={(o) => !o && setShown(null)} name={user.name} login={user.email} password={shown?.password ?? null} />
    </div>
  );
}
