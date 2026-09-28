import Link from "next/link";
import { PortalAuthShell } from "@/features/student-portal/auth-shell";
import { PoloContactPicker } from "@/features/student-portal/polo-contact-picker";
import { getPoloDirectory } from "@/services/student-portal/polo-directory";

export const dynamic = "force-dynamic";

export default async function StudentFirstAccessPage() {
  const directory = await getPoloDirectory();
  return (
    <PortalAuthShell
      title="Seu primeiro acesso"
      description="Seu acesso é autorizado pela equipe acadêmica. Abra o convite recebido por e-mail e defina sua senha."
    >
      <section aria-labelledby="fale-com-seu-polo" className="rounded-3xl border border-slate-200/80 bg-white/70 p-3 backdrop-blur-sm sm:p-4">
        <h2 id="fale-com-seu-polo" className="px-1 text-sm font-semibold text-[#003B71]">Ainda não recebeu o convite?</h2>
        <p className="mt-1 mb-3 px-1 text-xs leading-5 text-slate-500">
          Escolha seu polo e fale com seu tutor ou com a coordenação para conferir seu RGM e e-mail e receber o link de ativação.
        </p>
        <PoloContactPicker
          directory={directory}
          message="Olá! Estou fazendo o primeiro acesso ao Portal Acadêmico e preciso do meu link de ativação. Meu RGM é: "
        />
      </section>
      <Link
        href="/portal/login"
        className="mt-6 block rounded-xl bg-[#003B71] p-3 text-center font-semibold text-white transition-colors hover:bg-[#07558f]"
      >
        Voltar para entrar
      </Link>
    </PortalAuthShell>
  );
}
