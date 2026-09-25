import Image from "next/image";
import { cn } from "@/lib/utils";

export function PortalHeroArtwork({ story = false }: { story?: boolean }) {
  return (
    <div className={cn("absolute inset-0 overflow-hidden bg-[#1688cf]", story ? "z-0" : "-z-20")} aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_15%,#70cdf2,transparent_65%),linear-gradient(140deg,#0755a0,#239dda_65%,#004582)]" />
      <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle,#b4e9ff_1px,transparent_1.5px)] [background-size:24px_24px]" />
      {story ? (
        <>
          <div className="absolute right-[-10%] top-[-6%] h-[78%] w-[84%]">
            <Image src="/brand/estrela-fita.png" alt="" fill sizes="55vw" className="object-contain mix-blend-multiply" />
          </div>
          <Image src="/brand/formanda-estrela.png" alt="" width={1662} height={3597} sizes="(max-width: 1024px) 100vw, 800px" preload className="portal-hero-portrait absolute bottom-[-18%] left-[43%] z-10 h-[125%] w-auto max-w-none -translate-x-1/2 object-contain" />
        </>
      ) : (
        <div className="absolute inset-y-0 right-0 h-[60%] w-full md:h-full md:w-[55%]">
          <Image src="/brand/estrela-fita.png" alt="" fill sizes="(max-width: 768px) 100vw, 650px" className="scale-110 object-contain mix-blend-multiply" />
          <Image src="/brand/formanda-estrela.png" alt="" width={1662} height={3597} sizes="(max-width: 768px) 100vw, 400px" preload className="absolute bottom-[-40%] right-[8%] h-[160%] w-auto max-w-none object-contain md:right-[16%]" />
        </div>
      )}
    </div>
  );
}
