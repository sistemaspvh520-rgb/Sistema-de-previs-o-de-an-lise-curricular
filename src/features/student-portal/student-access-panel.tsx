"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Ban, Clock3, KeyRound, Mail, Pencil, Send, ShieldCheck, UserPlus } from "lucide-react";
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
import { cn } from "@/lib/utils";

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

type AccessState = "ATIVO" | "CONVITE PENDENTE" | "BLOQUEADO" | "SEM ACESSO";
const ACCESS_TONE: Record<AccessState, { dot: string; pill: string; label: string }> = {
  ATIVO: { dot: "bg-emerald-400", pill: "bg-emerald-400/15 text-emerald-100 ring-emerald-300/30", label: "Acesso ativo" },
  "CONVITE PENDENTE": { dot: "bg-amber-300", pill: "bg-amber-300/15 text-amber-100 ring-amber-200/30", label: "Convite pendente" },
  BLOQUEADO: { dot: "bg-rose-400", pill: "bg-rose-400/15 text-rose-100 ring-rose-300/30", label: "Acesso bloqueado" },
  "SEM ACESSO": { dot: "bg-slate-300", pill: "bg-white/10 text-white/80 ring-white/20", label: "Sem acesso" },
};

/** Cartão compacto de acesso ao portal, desenhado para ficar sobre o cabeçalho escuro do aluno. */
export function PortalAccessCard({
  student,
  access,
}: {
  student: { id: string; name: string; rgm: string; courseName: string | null };
  access: { status: AccessState; email: string | null; active: boolean; invited: boolean; lastLogin: string | null } ;
}) {
  const tone = ACCESS_TONE[access.status];
  const [creating, setCreating] = useState(false);
  return (
    <div className="glass-surface rounded-2xl p-4 text-white sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="whitespace-nowrap text-[11px] font-semibold tracking-[0.16em] text-white/70 uppercase">Acesso ao portal</p>
        <span className={cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1", tone.pill)}>
          <span className={cn("size-1.5 rounded-full", tone.dot, access.status === "ATIVO" && "animate-pulse")} />
          {tone.label}
        </span>
      </div>
      {access.email ? (
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex items-center gap-2 text-white/90">
            <Mail className="size-4 shrink-0 text-cyan-200" />
            <dd className="min-w-0 truncate" title={access.email}>{access.email}</dd>
          </div>
          <div className="flex items-center gap-2 text-white/70">
            <Clock3 className="size-4 shrink-0 text-cyan-200" />
            <dd>{access.lastLogin ? `Último acesso ${access.lastLogin}` : "Ainda não acessou o portal"}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-4 text-sm leading-6 text-white/75">O aluno ainda não tem login. Crie o acesso para ele acompanhar a análise pelo portal.</p>
      )}
      <div className="mt-4 border-t border-white/10 pt-4">
        {access.email ? (
          <StudentAccessPanel enrollmentId={student.id} email={access.email} active={access.active} invited={access.invited} />
        ) : (
          <Button onClick={() => setCreating(true)} className="w-full bg-brand-cyan text-white shadow-[0_10px_30px_-12px_rgb(6_147_227)] hover:bg-brand-cyan/90">
            <UserPlus className="size-4" /> Criar acesso ao portal
          </Button>
        )}
      </div>
      {/* Mantido montado: o link de convite é exibido uma única vez e sobrevive à atualização da página. */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Criar acesso de {student.name.split(" ")[0]}</DialogTitle>
            <DialogDescription>O aluno recebe um convite por e-mail para definir a própria senha.</DialogDescription>
          </DialogHeader>
          <CreateStudentForm student={student} hasAccess={Boolean(access.email)} />
        </DialogContent>
      </Dialog>
    </div>
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
  const [editing, setEditing] = useState(false);
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
    setEditing(false);
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
  const action = "h-9 justify-start gap-2 border-white/15 bg-white/5 text-white hover:bg-white/15 hover:text-white";
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
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar e-mail de acesso</DialogTitle>
            <DialogDescription>Os links anteriores e as sessões abertas do aluno serão encerrados.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" action={(form) => run("CONTACT", String(form.get("email")))}>
            <label className="block text-sm font-medium">
              E-mail de contato
              <Input name="email" type="email" required defaultValue={email} className="mt-2" />
            </label>
            <Button className="w-full" disabled={pending}>Salvar e-mail</Button>
          </form>
        </DialogContent>
      </Dialog>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {active && (
          <Button disabled={pending} variant="outline" className={action} onClick={() => run(invited ? "INVITE" : "RESET")}>
            {invited ? <Send className="size-4" /> : <KeyRound className="size-4" />}
            {invited ? "Reenviar convite" : "Recuperar senha"}
          </Button>
        )}
        <Button disabled={pending} variant="outline" className={action} onClick={() => setEditing(true)}>
          <Pencil className="size-4" /> Alterar e-mail
        </Button>
        <Button
          disabled={pending}
          variant="outline"
          className={cn(action, active ? "text-rose-200 hover:text-rose-100" : "text-emerald-200 hover:text-emerald-100", "sm:col-span-2 lg:col-span-1 xl:col-span-2")}
          onClick={() => run(active ? "BLOCK" : "ACTIVATE")}
        >
          {active ? <Ban className="size-4" /> : <ShieldCheck className="size-4" />}
          {active ? "Desativar acesso" : "Reativar acesso"}
        </Button>
      </div>
      {result?.link && (
        <div className="text-slate-900">
          <TemporaryLink link={result.link} expiresAt={result.expiresAt} />
        </div>
      )}
    </div>
  );
}
