"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const RELOAD_KEY = "page-load-error:reloaded-at";
const RELOAD_WINDOW_MS = 30_000;

/** Erros típicos de aba aberta antes de uma publicação: o JavaScript antigo não existe mais no servidor. */
function isStaleBuildError(error: Error) {
  return (
    error.name === "ChunkLoadError" ||
    /loading (css )?chunk|failed to load chunk|dynamically imported module|importing a module script failed|failed to fetch/i.test(error.message)
  );
}

/** Recarrega uma vez só; se o erro voltar logo depois, mostra a tela em vez de entrar em loop. */
function canAutoReload(error: Error) {
  if (typeof window === "undefined" || !isStaleBuildError(error)) return false;
  try {
    return Date.now() - Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0) >= RELOAD_WINDOW_MS;
  } catch {
    return false;
  }
}

export function PageLoadError({ error, fullscreen = false }: { error: Error & { digest?: string }; fullscreen?: boolean }) {
  const router = useRouter();
  const [reloading] = useState(() => canAutoReload(error));

  useEffect(() => {
    console.error(error);
    if (!reloading) return;
    try {
      window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {}
    window.location.reload();
  }, [error, reloading]);

  const goBack = () => (window.history.length > 1 ? router.back() : router.push("/"));

  return (
    <div className={cn("grid place-items-center px-5", fullscreen ? "min-h-dvh bg-slate-50" : "min-h-[60vh] py-10")}>
      <section className="w-full max-w-md rounded-3xl border bg-white p-8 text-center shadow-sm">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#003B71]/10 text-[#003B71]">
          <RefreshCw className={cn("size-6", reloading && "animate-spin")} aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-semibold text-[#003B71]">
          {reloading ? "Atualizando o sistema…" : "Não foi possível carregar esta página"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          {reloading
            ? "Uma versão nova foi publicada. Estamos recarregando a página para você."
            : "Pode ter sido uma instabilidade ou uma atualização recente do sistema. Recarregue para tentar de novo — seus dados continuam salvos."}
        </p>
        {!reloading && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#003B71] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#002a52]"
            >
              <RefreshCw className="size-4" aria-hidden="true" /> Recarregar
            </button>
            <button
              type="button"
              onClick={goBack}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft className="size-4" aria-hidden="true" /> Voltar
            </button>
          </div>
        )}
        {error.digest && !reloading && <p className="mt-5 font-mono text-[11px] text-slate-400">Código: {error.digest}</p>}
      </section>
    </div>
  );
}
