"use client";

import { useState, useTransition } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordResetAction } from "@/features/auth/password-token-actions";

export function ForgotPasswordForm() {
  const [pending, start] = useTransition();
  const [sent, setSent] = useState<string | null>(null);
  function submit(fd: FormData) {
    start(async () => {
      const res = await requestPasswordResetAction({ email: fd.get("email") });
      if (res.ok) setSent(res.message ?? "Verifique sua caixa de entrada.");
      else toast.error(res.error);
    });
  }
  if (sent) {
    return (
      <div className="flex items-start gap-2 rounded-md bg-status-success-bg px-3 py-3 text-sm text-status-success">
        <MailCheck className="mt-0.5 size-4 shrink-0" /> {sent} Confira também a pasta de spam.
      </div>
    );
  }
  return (
    <form action={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="nome.sobrenome@cruzeirodosul.edu.br" />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Enviar link</Button>
    </form>
  );
}
