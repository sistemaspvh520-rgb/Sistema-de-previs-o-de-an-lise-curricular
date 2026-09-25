import { CampaignSignature } from "./campaign-signature";

/** Shared campaign artwork; the original files are preserved in public/brand. */
export function CampaignBanner() {
  return (
    <section aria-label="Escolha ter estrela" className="overflow-hidden rounded-2xl border border-sky-100 bg-[#003B71] shadow-sm sm:rounded-3xl">
      <div className="px-6 py-7 sm:px-8 sm:py-8">
        <CampaignSignature />
      </div>
    </section>
  );
}
