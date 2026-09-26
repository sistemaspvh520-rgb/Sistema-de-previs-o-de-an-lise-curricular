import { cn } from "@/lib/utils";

/**
 * Assinatura "Escolha ter estrela" em texto real, reproduzindo a arte da campanha:
 * "Escolha" em branco e negrito; "ter estrela" manuscrito (--font-script), em laranja
 * #FFB828, na linha de baixo e deslocado para a direita. Tudo em `em`, então o
 * tamanho vem do `text-*` passado em `className`.
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
    <div className={cn("text-[1.25rem] sm:text-[1.5rem]", align === "center" && "flex flex-col items-center", className)}>
      <p aria-label="Escolha ter estrela" className="inline-flex flex-col leading-none">
        <span aria-hidden="true" className="font-sans text-[1em] font-bold tracking-tight text-white">
          Escolha
        </span>
        <span
          aria-hidden="true"
          className="-mt-[0.3em] ml-[0.95em] -rotate-2 whitespace-nowrap font-script text-[1.4em] font-bold text-[#FFB828]"
        >
          ter estrela
        </span>
      </p>
      {showSite && <p className="mt-2 text-[0.55em] italic text-blue-100">cruzeirodosulvirtual.com.br</p>}
    </div>
  );
}
