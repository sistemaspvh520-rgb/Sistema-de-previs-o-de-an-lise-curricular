import Image from "next/image";

/** Foto de fundo cheia usada nos heróis do Portal Acadêmico (login do aluno e análise acadêmica). */
export function PortalHeroArtwork() {
  return (
    <Image
      src="/brand/formatura-portal-2026.png"
      alt=""
      fill
      priority
      sizes="100vw"
      className="-z-20 object-cover"
    />
  );
}
