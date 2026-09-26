import { PortalHeroArtwork } from "@/components/shared/portal-hero-artwork";
import { CampaignSignature } from "@/components/shared/campaign-signature";
import Image from "next/image";
import type { ReactNode } from "react";
import { PortalEffects } from "./effects";
export function PortalAuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <PortalEffects>
      <main className="portal-auth grid min-h-dvh bg-[#f7faff] lg:grid-cols-[1.05fr_1fr]">
        <aside className="portal-auth-story relative isolate flex flex-col overflow-hidden bg-[#003B71] text-white lg:justify-end lg:p-12 xl:p-16">
          {/* No celular a foto é um banner livre, sem texto por cima; no desktop ela ocupa toda a coluna. */}
          <div className="relative aspect-[16/10] w-full sm:aspect-[16/8] lg:absolute lg:inset-0 lg:aspect-auto">
            <PortalHeroArtwork className="z-0 object-[70%_35%] lg:object-[38%_center]" />
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent to-[#003B71] lg:hidden" />
            <div className="absolute inset-0 hidden bg-[linear-gradient(90deg,rgba(0,37,75,.9)_0%,rgba(0,37,75,.6)_32%,rgba(0,37,75,.1)_58%,transparent_75%),linear-gradient(180deg,transparent_45%,rgba(0,37,75,.75)_100%)] lg:block" />
          </div>
          <div className="portal-reveal relative z-20 max-w-lg px-6 pb-7 pt-1 sm:px-8 sm:pb-9 lg:max-w-[22rem] lg:p-0 lg:pb-3 xl:max-w-sm">
            <span className="mb-6 hidden items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-medium backdrop-blur-md lg:inline-flex">
              <span className="size-1.5 rounded-full bg-[#FEF84C]" /> Cada etapa importa
            </span>
            <h2 className="font-semibold tracking-tight">
              <span className="block text-[clamp(1.3rem,6.2vw,1.9rem)] leading-tight lg:hidden">
                <span className="block whitespace-nowrap">Seu futuro, mais perto</span>
                <span className="block whitespace-nowrap text-[#FEF84C]">a cada passo.</span>
              </span>
              <span className="hidden text-4xl leading-[1.08] lg:block">
                Seu futuro.
                <br />
                Mais perto
                <br />
                <span className="text-[#FEF84C]">a cada passo.</span>
              </span>
            </h2>
            <p className="mt-6 hidden max-w-sm text-base leading-7 text-blue-100 lg:block">
              Acompanhe suas conquistas, entenda sua situação e veja o caminho
              até a formatura.
            </p>
            <CampaignSignature className="mt-3 lg:mt-4" />
            <p className="mt-6 hidden border-t border-white/20 pt-6 text-sm text-blue-100 lg:block">
              Sua trajetória acadêmica, em um só lugar.
            </p>
          </div>
        </aside>
        <div className="relative flex flex-col items-center justify-center px-5 py-10 sm:px-10 sm:py-12 lg:px-14">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_100%_0%,#dff1fd,transparent_50%)]"
          />
          <div className="portal-reveal relative w-full max-w-sm">
            <Image
              src="/brand/logo-cruzeiro-do-sul-virtual.svg"
              alt="Cruzeiro do Sul Virtual"
              width={276}
              height={65}
              className="mb-10 h-auto w-52 sm:mb-12 sm:w-60"
              priority
            />
            <p className="text-[11px] font-bold uppercase tracking-[.22em] text-[#0693E3]">
              Portal Acadêmico do Aluno
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[#003B71] sm:text-4xl">
              {title}
            </h1>
            <p className="mb-8 mt-4 text-sm leading-7 text-slate-500">
              {description}
            </p>
            <div className="portal-auth-form">{children}</div>
            <p className="mt-10 border-t border-slate-200 pt-6 text-xs leading-5 text-slate-400">
              Cruzeiro do Sul Virtual
              <br />
              Seu próximo passo começa aqui.
            </p>
          </div>
        </div>
      </main>
    </PortalEffects>
  );
}
