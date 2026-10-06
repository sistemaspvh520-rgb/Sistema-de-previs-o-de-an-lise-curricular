import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Compatibilidade com links antigos (catálogo, e-mail): o uso das grades agora é uma visão do Uso da equipe. */
export default async function LegacyGradeUsagePage({ searchParams }: PageProps<"/management/team-usage/grades">) {
  const params = await searchParams;
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== "string") continue;
    // O antigo "view" (pessoas/grades/registro) virou "gv"; "view" agora escolhe Equipe ou Grades.
    next.set(key === "view" ? "gv" : key, value);
  }
  next.set("view", "grades");
  redirect(`/management/team-usage?${next.toString()}`);
}
