import { cn } from "@/lib/utils";

/**
 * Assinatura "Escolha ter estrela ." em texto real, na mesma linha, reproduzindo a arte
 * public/brand/escolha-estrela-assinatura.png: "Escolha" em branco e "ter estrela ." manuscrito
 * (--font-script) em amarelo #ECE181. Tudo em `em`, então o tamanho vem do `text-*` em `className`.
 */
export function CampaignSignature({
  className,
  showSite = true,
  align = "left",
}: {
  className?: string;
  showSite?: boolean;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("text-[1.35rem] sm:text-[1.6rem]", align === "center" && "text-center", className)}>
      <p aria-label="Escolha ter estrela." className="whitespace-nowrap leading-none">
        <span aria-hidden="true" className="font-sans font-normal tracking-tight text-white">Escolha</span>{" "}
        <span aria-hidden="true" className="font-script text-[1.12em] font-bold text-[#ECE181]">ter estrela .</span>
      </p>
      {showSite && <p className="mt-1.5 text-[0.62em] italic tracking-wide text-white/90">cruzeirodosulvirtual.com.br</p>}
    </div>
  );
}
