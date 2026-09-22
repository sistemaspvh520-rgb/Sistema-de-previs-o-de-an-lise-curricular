import type { Metadata } from "next";
import Image from "next/image";
import { requirePagePermission } from "@/lib/session";
import { getSystemSettings } from "@/repositories/settings-repository";
import { UploadDropzone } from "@/features/analyses/upload-dropzone";
import { zonedDateParts } from "@/lib/time";
import { suggestStartTerm } from "@/domain/curricular-analysis/simulation/terms";

export const metadata: Metadata = { title: "Nova análise" };
export const dynamic = "force-dynamic";

export default async function NewAnalysisPage() {
  await requirePagePermission("analysis:create");
  const settings = await getSystemSettings();

  return (
    <div className="space-y-6 md:space-y-8">
      <section className="relative isolate overflow-hidden rounded-2xl bg-brand-navy shadow-sm md:rounded-3xl">
        <Image src="/brand/foto-04-cruzeiro.jpg" alt="Estudante da Cruzeiro do Sul Virtual" fill priority sizes="(max-width: 768px) 100vw, 1280px" className="-z-20 object-cover object-[62%_42%]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-brand-navy via-brand-navy/90 to-brand-navy/20" />
        <div className="max-w-xl px-6 py-10 text-white sm:px-10 sm:py-14 lg:px-14 lg:py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold">Nova análise</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Previsão curricular pronta, com poucos passos.</h1>
          <p className="mt-4 max-w-lg text-sm leading-6 text-white/85 sm:text-base">Envie o PDF e informe o ingresso do candidato. O sistema organiza a grade, as pendências e a previsão automaticamente.</p>
        </div>
      </section>
      <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6 lg:p-8">
        <UploadDropzone maxMb={settings.maxUploadMb} defaultStartTerm={settings.defaultStartTerm ?? suggestStartTerm()} currentYear={zonedDateParts().year} />
      </section>
    </div>
  );
}
