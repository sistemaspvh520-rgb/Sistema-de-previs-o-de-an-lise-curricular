import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePagePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MatrixSubjectsEditor } from "@/features/matrices/matrix-forms";

export const metadata: Metadata = { title: "Matriz curricular" };
export const dynamic = "force-dynamic";

export default async function MatrixPage({ params }: PageProps<"/matrices/[id]">) {
  await requirePagePermission("matrix:manage");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const matrix = await prisma.curriculumMatrix.findUnique({
    where: { id },
    include: { course: true, periods: { orderBy: { number: "asc" }, include: { subjects: { orderBy: { order: "asc" } } } } },
  });
  if (!matrix) notFound();
  const text = matrix.periods
    .flatMap((p) => p.subjects.map((s) => `${p.number} | ${s.name} | ${s.workload}${Array.isArray(s.prerequisites) && (s.prerequisites as string[]).length ? ` | ${(s.prerequisites as string[]).join("; ")}` : ""}`))
    .join("\n");
  const total = matrix.periods.reduce((a, p) => a + p.subjects.length, 0);

  return (
    <>
      <PageHeader eyebrow={`${matrix.course.name}${matrix.course.modality ? ` · ${matrix.course.modality}` : ""}`} title={matrix.label} description={`${matrix.year} / versão ${matrix.version} · ${matrix.periods.length} período(s) · ${total} disciplina(s)`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Disciplinas</CardTitle>
            <CardDescription>Salvar substitui todas as disciplinas da matriz.</CardDescription>
          </CardHeader>
          <CardContent><MatrixSubjectsEditor matrixId={matrix.id} initialText={text} /></CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-base">Visão por período</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {matrix.periods.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma disciplina cadastrada.</p>}
            {matrix.periods.map((p) => (
              <div key={p.id}>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{p.number}º período · {p.subjects.length}</div>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {p.subjects.map((s) => (
                    <li key={s.id} className="flex justify-between gap-2"><span>{s.name}</span><span className="text-xs text-muted-foreground">{s.workload}h</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
