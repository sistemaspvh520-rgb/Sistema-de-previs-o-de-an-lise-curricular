import Image from "next/image";
import { CampaignSignature } from "./campaign-signature";

/** Shared campaign artwork; the original files are preserved in public/brand. */
export function CampaignBanner() {
  return (
    <section aria-label="Escolha ter estrela" className="overflow-hidden rounded-2xl border border-sky-100 bg-[#003B71] shadow-sm sm:rounded-3xl">
      <div className="grid sm:grid-cols-[1fr_220px]">
        <div className="px-6 py-7 sm:px-8 sm:py-8">
          <CampaignSignature />
        </div>
        <div className="relative hidden min-h-52 overflow-hidden sm:block" aria-hidden="true">
          <Image src="/brand/estrela-fita.png" alt="" fill sizes="220px" className="object-contain p-3" />
        </div>
      </div>
    </section>
  );
}
