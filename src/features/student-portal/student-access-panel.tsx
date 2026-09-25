"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createStudentAction, studentAccessAction } from "./actions";

function TemporaryLink({
  link,
  expiresAt,
}: {
  link: string;
  expiresAt?: string;
}) {
  return (
    <div className="mt-4 space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-4">
      <p className="text-sm font-medium">
        Compartilhe este link temporário com o aluno.
      </p>
      <p className="text-xs text-slate-600">
        {expiresAt
          ? `Válido até ${new Date(expiresAt).toLocaleString("pt-BR")}. `
          : ""}
        O aluno define a própria senha. O link só pode ser utilizado uma vez.
      </p>
      <Input readOnly value={link} aria-label="Link temporário de acesso" />
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            toast.success("Link copiado.");
          } catch {
            toast.error("Selecione e copie o link acima.");
          }
        }}
      >
        Copiar link temporário
      </Button>
    </div>
  );
}

export function CreateStudentForm({
  student,
  hasAccess = false,
}: {
  hasAccess?: boolean;
  student?: {
    id: string;
    name: string;
    rgm: string;
    courseName: string | null;
  };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{
    enrollmentId: string;
    link?: string;
    expiresAt?: string;
    duplicate?: boolean;
  } | null>(null);
  // Keep this component mounted when the server refreshes the new account.
  // The one-time invitation remains only in client memory until the tutor closes it.
  if (hasAccess)
    return result ? (
      <div className="mb-5 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
        <p className="text-sm font-medium text-emerald-800">
          Acesso criado. O aluno pode definir sua senha pelo convite.
        </p>
        {result.link && (
          <TemporaryLink link={result.link} expiresAt={result.expiresAt} />
        )}
        <Button
          className="mt-4"
          type="button"
          variant="outline"
          onClick={() => setResult(null)}
        >
          Concluir
        </Button>
      </div>
    ) : null;
  return (
    <form
      action={(form) =>
        start(async () => {
          const response = await createStudentAction({
            name: form.get("name"),
            rgm: form.get("rgm"),
            courseName: form.get("courseName") || undefined,
            email: form.get("email") || undefined,
          });
          if (!response.ok) {
            toast.error(response.error);
            return;
          }
          toast.success(response.message);
          setResult(response.data);
        })
      }
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Nome
          <Input
            name="name"
            defaultValue={student?.name}
            readOnly={Boolean(student)}
            required
            className="mt-2"
          />
        </label>
        <label className="text-sm font-medium">
          RGM
          <Input
            name="rgm"
            defaultValue={student?.rgm}
            readOnly={Boolean(student)}
            required
            maxLength={40}
            className="mt-2"
          />
        </label>
        <label className="text-sm font-medium">
          E-mail para o convite
          <Input name="email" type="email" required className="mt-2" />
        </label>
        <label className="text-sm font-medium">
          Curso
          <Input
            name="courseName"
            defaultValue={student?.courseName ?? ""}
            readOnly={Boolean(student?.courseName)}
            className="mt-2"
            placeholder="Preenchido pelo extrato, quando disponível"
          />
        </label>
      </div>
      <p className="text-xs leading-5 text-slate-500">
        As análises já existentes são vinculadas pelo RGM exato, após
        conferência dos dados. O aluno recebe um convite para definir a própria
        senha.
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? "Criando acesso…" : "Criar acesso"}
      </Button>
      {result && (
        <div>
          {result.duplicate && (
            <p className="my-3 text-sm">
              Parece que este aluno já possui cadastro.
            </p>
          )}
          {result.link && (
            <TemporaryLink link={result.link} expiresAt={result.expiresAt} />
          )}
          <Link
            href={`/academic-analysis/students/${result.enrollmentId}`}
            onClick={() => router.refresh()}
            className="mt-4 block text-sm font-medium text-[#003B71] underline"
          >
            Abrir cadastro do aluno
          </Link>
        </div>
      )}
    </form>
  );
}

/** Fluxo de criação de acesso em modal — evita ter que rolar a página até um formulário solto no fim. */
export function CreateStudentDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4" /> Criar acesso
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Criar acesso do aluno</DialogTitle>
          <DialogDescription>
            O aluno recebe um convite para definir a própria senha e consultar sua análise no portal.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2">
          <CreateStudentForm />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function StudentAccessPanel({
  enrollmentId,
  email,
  active,
  invited,
}: {
  enrollmentId: string;
  email: string;
  active: boolean;
  invited: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{
    link?: string;
    expiresAt?: string;
  } | null>(null);
  type AccessAction = "INVITE" | "RESET" | "BLOCK" | "ACTIVATE" | "CONTACT";
  const [confirmation, setConfirmation] = useState<{
    action: AccessAction;
    email?: string;
    message: string;
  } | null>(null);
  function run(action: AccessAction, newEmail?: string) {
    const messages = {
      INVITE:
        "Reenviar convite de primeiro acesso? O link anterior deixará de funcionar.",
      RESET: "Enviar recuperação de senha ao aluno?",
      BLOCK:
        "Desativar o acesso? O aluno perderá o acesso ao portal. As análises serão preservadas.",
      ACTIVATE: "Reativar o acesso ao portal?",
      CONTACT:
        "Confirmar alteração do contato autorizado? Os links anteriores e sessões serão invalidados.",
    };
    setConfirmation({ action, email: newEmail, message: messages[action] });
  }
  function confirm() {
    if (!confirmation) return;
    const { action, email: newEmail } = confirmation;
    start(async () => {
      const response = await studentAccessAction({
        enrollmentId,
        action,
        email: newEmail,
        confirmed: true,
      });
      if (!response.ok) {
        toast.error(response.error);
        return;
      }
      toast.success(response.message);
      setResult(response.data);
      setConfirmation(null);
      router.refresh();
    });
  }
  return (
    <div>
      <AlertDialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirmation(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar alteração de acesso</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                confirm();
              }}
            >
              {pending ? "Aguarde…" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex flex-wrap gap-3">
        {active && (
          <Button
            disabled={pending}
            variant="outline"
            onClick={() => run(invited ? "INVITE" : "RESET")}
          >
            {invited ? "Reenviar convite" : "Enviar recuperação de senha"}
          </Button>
        )}
        <Button
          disabled={pending}
          variant={active ? "destructive" : "outline"}
          onClick={() => run(active ? "BLOCK" : "ACTIVATE")}
        >
          {active ? "Desativar acesso" : "Reativar acesso"}
        </Button>
      </div>
      <details className="mt-5 rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Editar contato autorizado
        </summary>
        <form
          className="mt-4 flex flex-wrap gap-3"
          action={(form) => run("CONTACT", String(form.get("email")))}
        >
          <label className="min-w-0 flex-1 text-sm">
            E-mail de contato
            <Input
              name="email"
              type="email"
              required
              defaultValue={email}
              className="mt-2"
            />
          </label>
          <Button className="self-end" disabled={pending}>
            Salvar contato
          </Button>
        </form>
      </details>
      {result?.link && (
        <TemporaryLink link={result.link} expiresAt={result.expiresAt} />
      )}
    </div>
  );
}
