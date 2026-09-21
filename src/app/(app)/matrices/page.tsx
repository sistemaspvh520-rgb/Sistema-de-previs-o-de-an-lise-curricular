import type { Metadata } from "next";
import Link from "next/link";
import { Grid3x3 } from "lucide-react";
import { requirePagePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateMatrixDialog, MatrixActiveSwitch } from "@/features/matrices/matrix-forms";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Matrizes curriculares" };
export const dynamic = "force-dynamic";

export default async function MatricesPage() {
  await requirePagePermission("matrix:manage");
  const matrices = await prisma.curriculumMatrix.findMany({
    orderBy: [{ course: { name: "asc" } }, { year: "desc" }],
    include: { course: true, periods: { include: { _count: { select: { subjects: true } } } }, _count: { select: { analyses: true } } },
  });

  return (
    <>
      <PageHeader title="Matrizes curriculares" description="Matrizes oficiais para comparação com os PDFs. A comparação gera alertas; nunca altera a análise." actions={<CreateMatrixDialog />} />
      {matrices.length === 0 ? (
        <Card className="p-10 text-center shadow-sm">
          <Grid3x3 className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Nenhuma matriz cadastrada. Crie a primeira para habilitar a comparação PDF × matriz oficial.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden shadow-sm">
          <div className="hidden lg:block"><Table>
            <TableHeader>
              <TableRow>
                <TableHead>Curso</TableHead>
                <TableHead>Matriz</TableHead>
                <TableHead>Ano/versão</TableHead>
                <TableHead>Vigência</TableHead>
                <TableHead>Períodos</TableHead>
                <TableHead>Disciplinas</TableHead>
                <TableHead>Análises</TableHead>
                <TableHead>Ativa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matrices.map((m) => (
                <TableRow key={m.id}>
                  <TableCell><Link href={`/matrices/${m.id}`} className="font-medium hover:underline">{m.course.name}</Link>{m.course.modality && <span className="ml-1 text-xs text-muted-foreground">{m.course.modality}</span>}</TableCell>
                  <TableCell><Link href={`/matrices/${m.id}`} className="hover:underline">{m.label}</Link></TableCell>
                  <TableCell>{m.year} / {m.version}</TableCell>
                  <TableCell className="text-muted-foreground">{m.validFrom || m.validTo ? `${formatDate(m.validFrom)} – ${formatDate(m.validTo)}` : "—"}</TableCell>
                  <TableCell>{m.periods.length}</TableCell>
                  <TableCell>{m.periods.reduce((a, p) => a + p._count.subjects, 0)}</TableCell>
                  <TableCell>{m._count.analyses}</TableCell>
                  <TableCell><MatrixActiveSwitch matrixId={m.id} isActive={m.isActive} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table></div>
          <div className="divide-y lg:hidden">
            {matrices.map((m) => (
              <article key={m.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={`/matrices/${m.id}`} className="block break-words font-medium hover:underline">{m.course.name}</Link><p className="mt-1 break-words text-sm text-muted-foreground">{m.label} · {m.year} / {m.version}</p></div><MatrixActiveSwitch matrixId={m.id} isActive={m.isActive} /></div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground"><span>Períodos: {m.periods.length}</span><span>Disciplinas: {m.periods.reduce((a, p) => a + p._count.subjects, 0)}</span><span>Análises: {m._count.analyses}</span><span className="break-words">Vigência: {m.validFrom || m.validTo ? `${formatDate(m.validFrom)} – ${formatDate(m.validTo)}` : "—"}</span></div>
              </article>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
