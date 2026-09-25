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
        <aside className="portal-auth-story relative isolate flex min-h-[240px] flex-col justify-end overflow-hidden bg-[#003B71] px-6 py-8 text-white sm:min-h-[300px] sm:px-8 sm:py-10 lg:min-h-0 lg:p-12 xl:p-16">
          <PortalHeroArtwork />
          <div className="absolute inset-0 z-10 bg-[linear-gradient(180deg,rgba(0,37,75,.05),rgba(0,59,113,.08)_34%,rgba(0,37,75,.36)_68%,rgba(0,37,75,.9)_100%)]" />
          <div className="portal-reveal relative z-20 max-w-lg pb-1 sm:pb-3">
            <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[11px] font-medium backdrop-blur-md sm:mb-6 sm:px-4 sm:py-2 sm:text-xs">
              <span className="size-1.5 rounded-full bg-[#FEF84C]" /> Cada etapa
              importa
            </span>
            <h2 className="text-2xl font-semibold leading-[1.15] tracking-tight sm:text-4xl sm:leading-[1.08] xl:text-5xl">
              Seu futuro.
              <br className="hidden sm:block" />{" "}
              Mais perto
              <br className="hidden sm:block" />{" "}
              <span className="text-[#FEF84C]">a cada passo.</span>
            </h2>
            <p className="mt-3 hidden max-w-sm text-base leading-7 text-blue-100 sm:mt-6 sm:block">
              Acompanhe suas conquistas, entenda sua situação e veja o caminho
              até a formatura.
            </p>
            <CampaignSignature className="mt-3 sm:mt-4" />
            <p className="mt-4 hidden border-t border-white/20 pt-4 text-xs text-blue-100 sm:block sm:pt-6 sm:text-sm">
              Sua trajetória acadêmica, em um só lugar.
            </p>
          </div>
        </aside>
        <div className="relative flex flex-col items-center justify-center px-5 py-12 sm:px-10 lg:px-14">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_100%_0%,#dff1fd,transparent_50%)]"
          />
          <div className="portal-reveal relative w-full max-w-sm">
            <Image
              src="/brand/logo-cruzeiro-do-sul-virtual.png"
              alt="Cruzeiro do Sul Virtual"
              width={240}
              height={80}
              className="mb-12 h-auto w-48 sm:w-56"
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
