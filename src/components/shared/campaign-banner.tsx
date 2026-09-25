import Image from "next/image";

/** Shared campaign artwork; the original files are preserved in public/brand. */
export function CampaignBanner() {
  return (
    <section aria-label="Escolha ter estrela" className="group overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm sm:rounded-3xl">
      <div className="grid sm:grid-cols-[1fr_220px]">
        <div className="bg-[#003B71] px-6 py-7 sm:px-8">
          <Image src="/brand/escolha-estrela-assinatura.png" alt="Escolha ter estrela. cruzeirodosulvirtual.com.br" width={1230} height={352} sizes="(max-width: 640px) 85vw, 420px" className="h-auto w-full max-w-[420px]" />
          <details className="mt-4 text-white">
            <summary className="w-fit cursor-pointer rounded-lg py-2 text-xs font-medium text-blue-100 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Ver animação da campanha</summary>
            <video controls playsInline preload="none" width={1230} height={352} poster="/brand/escolha-estrela-assinatura.png" aria-label="Animação da campanha Ter estrela, sem áudio" className="mt-3 aspect-[1230/352] w-full max-w-xl rounded-lg bg-[#003B71]">
              <source src="/brand/escolha-estrela.mp4" type="video/mp4" />
              Seu navegador não reproduz este vídeo.
            </video>
          </details>
        </div>
        <div className="relative hidden min-h-52 overflow-hidden bg-white sm:block" aria-hidden="true">
          <Image src="/brand/estrela-fita.png" alt="" fill sizes="220px" className="object-contain p-3 motion-safe:transition-transform motion-safe:duration-700 motion-safe:group-hover:scale-105" />
        </div>
      </div>
    </section>
  );
}
