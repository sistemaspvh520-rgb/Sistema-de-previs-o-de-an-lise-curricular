import { cn } from "@/lib/utils";

/**
 * Assinatura da campanha "Escolha ter estrela." em texto real (antes era uma
 * imagem raster que pixelizava ao ampliar). Usa a fonte script carregada em
 * `layout.tsx` (--font-script) só para a palavra em destaque.
 */
export function CampaignSignature({ className }: { className?: string }) {
  return (
    <div className={cn("leading-tight", className)}>
      <p className="text-xl font-semibold text-white sm:text-2xl">
        Escolha{" "}
        <span className="font-script text-2xl font-semibold text-brand-gold sm:text-3xl">
          ter estrela
        </span>
        <span className="text-brand-gold">.</span>
      </p>
      <p className="mt-1 text-xs italic text-blue-100 sm:text-sm">cruzeirodosulvirtual.com.br</p>
    </div>
  );
}
