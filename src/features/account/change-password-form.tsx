"use client";

import { useRef, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeOwnPasswordAction } from "@/features/account/actions";

export function ChangePasswordForm() {
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  function submit(fd: FormData) {
    start(async () => {
      const res = await changeOwnPasswordAction({ currentPassword: fd.get("currentPassword"), newPassword: fd.get("newPassword"), confirm: fd.get("confirm") });
      if (res.ok) {
        toast.success(res.message);
        formRef.current?.reset();
      } else toast.error(res.error);
    });
  }
  return (
    <form ref={formRef} action={submit} className="grid max-w-md gap-4">
      <div className="space-y-2">
        <Label htmlFor="currentPassword">Senha atual</Label>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="newPassword">Nova senha</Label>
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={12} required />
        <p className="text-xs text-muted-foreground">Mínimo de 12 caracteres.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirmar nova senha</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} required />
      </div>
      <div>
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Alterar senha</Button>
      </div>
    </form>
  );
}
