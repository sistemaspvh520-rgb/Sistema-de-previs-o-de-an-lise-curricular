import Link from "next/link";
import { Trophy } from "lucide-react";
import type { TutorScore } from "@/services/student-portal/team-insights";

const COLUMNS: Array<[keyof Omit<TutorScore, "tutor">, string, string]> = [
  ["students", "Alunos", "Alunos sob responsabilidade"],
  ["activeAccess", "Com acesso", "Alunos que já entram no portal"],
  ["analysesThisMonth", "Análises no mês", "Versões de análise publicadas neste mês"],
  ["advanced", "Avançaram", "Alunos com menos pendências que na análise anterior"],
  ["canAdvance", "Podem avançar", "Alunos com vaga livre para pendências agora"],
  ["actions", "Pendências da equipe", "Itens em \"Precisa de você\""],
];

/** Placar por tutor: acompanhamento e reconhecimento da equipe, sem virar cobrança. */
export function TutorScoreboard({ tutors }: { tutors: TutorScore[] }) {
  return (
    <section aria-labelledby="placar-tutores" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700"><Trophy className="size-5" aria-hidden="true" /></span>
        <div>
          <h2 id="placar-tutores" className="text-base font-semibold text-slate-900">Acompanhamento acadêmico por tutor</h2>
          <p className="mt-0.5 text-sm text-slate-500">Alunos, acesso ao portal, análises do mês e quem avançou nas pendências.</p>
        </div>
      </div>
      {tutors.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">Nenhum aluno cadastrado ainda.</p>
      ) : (
        <>
          <ul className="mt-4 grid gap-2 md:hidden">
            {tutors.map((row) => (
              <li key={row.tutor.id} className="rounded-xl border border-slate-200 p-3">
                <p className="font-medium text-slate-900">{row.tutor.name}</p>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  {COLUMNS.map(([key, label]) => (
                    <div key={key}><dt className="text-slate-500">{label}</dt><dd className="font-semibold tabular-nums text-slate-900">{row[key]}</dd></div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Tutor</th>
                  {COLUMNS.map(([key, label, hint]) => <th key={key} title={hint} className="px-3 py-2 text-right font-medium">{label}</th>)}
                </tr>
              </thead>
              <tbody>
                {tutors.map((row) => (
                  <tr key={row.tutor.id} className="border-t border-slate-100">
                    <td className="py-2.5 pr-3 font-medium text-slate-900">
                      <Link href={`/academic-analysis/requests?tutor=${encodeURIComponent(row.tutor.name)}`} className="hover:underline">{row.tutor.name}</Link>
                    </td>
                    {COLUMNS.map(([key]) => (
                      <td key={key} className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                        {key === "activeAccess" ? <>{row.activeAccess}<span className="text-xs text-slate-400"> ({row.students ? Math.round((row.activeAccess / row.students) * 100) : 0}%)</span></> : row[key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
