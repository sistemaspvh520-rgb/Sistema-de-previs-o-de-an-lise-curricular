import { GraduationCap } from "lucide-react";
import type { GraduationPlanStep } from "@/domain/academic-analysis/graduation-forecast";
import { readableName } from "@/lib/text";
import { cn } from "@/lib/utils";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Linha do tempo "Seu caminho até a conclusão", pensada para o aluno: semestres, disciplinas e a formatura. */
export function ConclusionPath({ steps, officialTerms, completion }: { steps: GraduationPlanStep[]; officialTerms: Set<string>; completion: string | null }) {
  return (
    <ol className="relative" aria-label="Semestres previstos até a conclusão">
      {steps.map((step, index) => {
        const groups: Array<[string, string[], string]> = (
          [
            ["Disciplinas do período", step.regularSubjectNames, "bg-[#0693E3]"],
            ["Já em andamento", step.inProgressSubjectNames, "bg-cyan-500"],
            ["Pendências de períodos anteriores", step.previousSubjects, "bg-amber-400"],
          ] as Array<[string, string[], string]>
        ).filter(([, names]) => names.length > 0);
        const total = groups.reduce((sum, [, names]) => sum + names.length, 0);
        const chips = [
          step.regularSubjectNames.length ? plural(step.regularSubjectNames.length, "do período", "do período") : null,
          step.inProgressSubjectNames.length ? plural(step.inProgressSubjectNames.length, "em andamento", "em andamento") : null,
          step.previousSubjects.length ? plural(step.previousSubjects.length, "pendência anterior", "pendências anteriores") : null,
          step.exemptions ? plural(step.exemptions, "dispensa", "dispensas") : null,
        ].filter(Boolean);
        const first = index === 0;
        const projected = Boolean(step.term && !officialTerms.has(step.term));
        return (
          <li key={`${step.curriculumPeriod}-${step.term}-${index}`} className="relative pb-7 pl-8 sm:pl-10">
            <span aria-hidden="true" className="absolute bottom-0 left-[7px] top-5 w-0.5 rounded-full bg-gradient-to-b from-[#0693E3]/50 to-slate-200 sm:left-[11px]" />
            <span aria-hidden="true" className={cn("absolute left-0 top-1 grid size-4 place-items-center rounded-full ring-4 sm:left-1", first ? "bg-[#0693E3] ring-sky-100" : step.isAdditional ? "bg-amber-400 ring-amber-100" : "border-2 border-[#0693E3] bg-white ring-sky-100")} />
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="min-w-0">
                <p className="text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">
                  {step.isAdditional ? `Semestre adicional ${step.adaptationSemesterNumber ?? ""}` : `${step.curriculumPeriod}º período`}
                  {first && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] tracking-wide text-sky-800">agora</span>}
                </p>
                <h3 className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {step.term ?? "A definir"}
                  {projected && <span className="ml-2 align-middle text-xs font-normal tracking-normal text-slate-400">previsto</span>}
                </h3>
              </div>
              <p className="text-sm font-medium text-slate-600">{plural(total, "disciplina", "disciplinas")}</p>
            </div>
            {chips.length > 0 && (
              <p className="mt-2 flex flex-wrap gap-1.5">
                {chips.map((chip) => (
                  <span key={chip} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{chip}</span>
                ))}
              </p>
            )}
            {total > 0 && (
              <details open={first} className="group mt-3 rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_-28px_rgba(15,42,66,0.6)] open:border-sky-200">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#003B71] [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">Ver as disciplinas deste semestre</span>
                  <span className="hidden group-open:inline">Disciplinas deste semestre</span>
                  <span aria-hidden="true" className="text-slate-400 transition-transform group-open:rotate-180">⌄</span>
                </summary>
                <div className="space-y-4 border-t border-slate-100 px-4 pt-3 pb-4">
                  {groups.map(([label, names, dot]) => (
                    <div key={label}>
                      <p className="text-[11px] font-semibold tracking-[0.1em] text-slate-500 uppercase">{label}</p>
                      <ul className="mt-1 gap-x-8 sm:columns-2">
                        {names.map((name, nameIndex) => (
                          <li key={`${name}-${nameIndex}`} className="flex break-inside-avoid items-start gap-2.5 border-b border-slate-100 py-2 text-sm leading-5 text-slate-800">
                            <span aria-hidden="true" className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", dot)} />
                            <span className="min-w-0">{readableName(name)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </li>
        );
      })}
      <li className="relative pl-8 sm:pl-10">
        <span aria-hidden="true" className="absolute -left-1 top-0 grid size-6 place-items-center rounded-full bg-[#003B71] text-[#FEF84C] ring-4 ring-[#FEF84C]/30 sm:left-0">
          <GraduationCap className="size-3.5" />
        </span>
        <p className="text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Conclusão prevista</p>
        <p className="mt-0.5 text-2xl font-semibold tracking-tight text-[#003B71] tabular-nums">{completion ?? "Em cálculo"}</p>
      </li>
    </ol>
  );
}
