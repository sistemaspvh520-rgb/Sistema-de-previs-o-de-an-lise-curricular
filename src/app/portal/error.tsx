"use client";
import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 px-5">
      <section className="max-w-md rounded-3xl border bg-white p-8 text-center">
        <h1 className="text-2xl font-semibold text-[#003B71]">
          Vamos tentar novamente?
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-500">
          Não conseguimos carregar esta página agora. Sua última análise
          continua salva.
        </p>
        <button
          onClick={reset}
          className="mt-6 min-h-11 w-full rounded-xl bg-[#003B71] px-5 py-3 font-medium text-white"
        >
          Tentar novamente
        </button>
        <Link href="/portal/login" className="mt-4 block text-sm underline">
          Voltar para entrar
        </Link>
      </section>
    </main>
  );
}
