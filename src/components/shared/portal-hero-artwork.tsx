import Image from "next/image";
import { cn } from "@/lib/utils";

/** Foto de fundo cheia usada nos heróis do Portal Acadêmico (login do aluno e análise acadêmica). */
export function PortalHeroArtwork({ className }: { className?: string } = {}) {
  return (
    <Image
      src="/brand/formatura-portal-2026.png"
      alt=""
      fill
      priority
      sizes="100vw"
      className={cn("-z-20 object-cover", className)}
    />
  );
}
