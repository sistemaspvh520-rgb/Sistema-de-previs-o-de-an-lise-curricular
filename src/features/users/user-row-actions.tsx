"use client";

import { useState, useTransition } from "react";
import {
  Eye,
  KeyRound,
  Loader2,
  LogIn,
  MailPlus,
  MoreHorizontal,
  Pencil,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, STAFF_ROLES, isStudentFacingRole, usesPolo } from "@/lib/rbac";
import { formatWhatsapp } from "@/lib/whatsapp";
import { POLOS } from "@/domain/polos";
import {
  deleteUserAction,
  impersonateUserAction,
  resendInviteAction,
  resetPasswordAction,
  revealInitialPasswordAction,
  sendResetLinkAction,
  updateUserAction,
} from "@/features/users/actions";
import { TemporaryPasswordDialog } from "@/features/users/temporary-password-dialog";
import type { Role } from "@/generated/prisma/enums";

const NO_POLO = "__none__";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  inviteSentAt: string | null;
  poloCode: string | null;
  phone: string | null;
}

export function UserRowActions({
  user,
  isSelf,
  emailEnabled,
}: {
  user: UserRow;
  isSelf: boolean;
  emailEnabled: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [shown, setShown] = useState<{ password: string | null } | null>(null);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<Role>(user.role);
  const [polo, setPolo] = useState(user.poloCode ?? NO_POLO);
  const [phone, setPhone] = useState(formatWhatsapp(user.phone) ?? "");
  const [pending, start] = useTransition();

  function saveEdit() {
    start(async () => {
      const res = await updateUserAction({
        id: user.id,
        name,
        email,
        role,
        isActive: user.isActive,
        poloCode: usesPolo(role) && polo !== NO_POLO ? polo : null,
        phone: isStudentFacingRole(role) ? phone : null,
      });
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
  function remove() {
    start(async () => {
      const res = await deleteUserAction({ id: user.id });
      setDeleteOpen(false);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
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
    <div className="flex items-center justify-end gap-1">
      {!isSelf && user.isActive && (
        <Button
          variant="outline"
          size="sm"
          className="hidden gap-1.5 md:inline-flex"
          onClick={impersonate}
          disabled={pending}
          aria-label={`Acessar conta de ${user.name}`}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <LogIn className="size-4" />
          )}{" "}
          Acessar
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Editar ${user.name}`}
        onClick={() => setEditOpen(true)}
      >
        <Pencil className="size-4" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Mais ações para ${user.name}`}
            disabled={pending}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {user.mustChangePassword && (
            <DropdownMenuItem onSelect={reveal} disabled={pending}>
              <Eye className="text-status-warning" /> Ver senha temporária
            </DropdownMenuItem>
          )}
          {user.mustChangePassword && (
            <DropdownMenuItem
              onSelect={resendInvite}
              disabled={pending || !emailEnabled}
            >
              <MailPlus /> Reenviar convite
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={sendResetLink}
            disabled={pending || !emailEnabled || isSelf}
          >
            <Send /> Enviar redefinição de senha
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setResetOpen(true)}
            disabled={isSelf}
          >
            <KeyRound /> Gerar senha temporária
          </DropdownMenuItem>
          {!isSelf && user.isActive && (
            <DropdownMenuItem onSelect={impersonate} disabled={pending}>
              <LogIn className="text-brand-navy" /> Acessar como usuário
            </DropdownMenuItem>
          )}
          {!isSelf && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  setDeleteConfirm("");
                  setDeleteOpen(true);
                }}
                disabled={pending}
              >
                <Trash2 /> Excluir conta
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
            <DialogDescription>{user.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`name-${user.id}`}>Nome</Label>
              <Input
                id={`name-${user.id}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`email-${user.id}`}>E-mail (login)</Label>
              <Input
                id={`email-${user.id}`}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {isSelf
                  ? "O novo e-mail passa a ser o seu login."
                  : "Ao corrigir o e-mail, reenvie o convite para a pessoa definir a senha."}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Perfil</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as Role)}
                disabled={isSelf}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAFF_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {role !== "STUDENT" && (
                <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
              )}
            </div>
            {isStudentFacingRole(role) && (
              <div className={usesPolo(role) ? "grid gap-4 sm:grid-cols-2" : "grid gap-4"}>
                {usesPolo(role) && <div className="min-w-0 space-y-2">
                  <Label>Polo</Label>
                  <Select value={polo} onValueChange={setPolo}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_POLO}>Sem polo definido</SelectItem>
                      {POLOS.map((p) => (
                        <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>}
                <div className="min-w-0 space-y-2">
                  <Label htmlFor={`phone-${user.id}`}>WhatsApp</Label>
                  <Input
                    id={`phone-${user.id}`}
                    type="tel"
                    inputMode="tel"
                    placeholder="(69) 99999-0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveEdit} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Redefinir senha de {user.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              A senha atual deixa de funcionar. Uma nova senha temporária será
              gerada e exibida para você repassar; a pessoa terá que trocá-la no
              próximo acesso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                reset();
              }}
              disabled={pending}
            >
              {pending && <Loader2 className="size-4 animate-spin" />} Gerar
              senha temporária
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a conta de {user.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é definitiva e não pode ser desfeita. O acesso é
              removido na hora. As análises e correções feitas por esta pessoa
              passam a constar como suas, para não perder dados institucionais.
              Para confirmar, digite <strong>EXCLUIR</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder="EXCLUIR"
            autoComplete="off"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                remove();
              }}
              disabled={pending || deleteConfirm !== "EXCLUIR"}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending && <Loader2 className="size-4 animate-spin" />} Excluir
              definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TemporaryPasswordDialog
        open={!!shown}
        onOpenChange={(o) => !o && setShown(null)}
        name={user.name}
        login={user.email}
        password={shown?.password ?? null}
      />
    </div>
  );
}
