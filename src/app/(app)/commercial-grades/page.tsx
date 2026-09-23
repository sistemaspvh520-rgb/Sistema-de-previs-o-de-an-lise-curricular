import type { Metadata } from "next";
import type { CommercialGrade } from "@/generated/prisma/client";
import { BriefcaseBusiness, Download, FileText, GraduationCap, Route, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CommercialGradeUploadForm } from "@/features/commercial-grades/upload-form";
import { CopyWhatsapp } from "@/features/commercial-grades/copy-whatsapp";
import { CommercialGradeCatalogFilters } from "@/features/commercial-grades/catalog-filters";
import { CommercialGradeCatalogSearch } from "@/features/commercial-grades/catalog-search";
import { ManageCommercialGradeButtons } from "@/features/commercial-grades/manage-grade-buttons";
import { formatDateTime } from "@/lib/time";
import { normalizeCatalogMetadata, parseCourseTracks } from "@/services/commercial-grades/course-metadata";

export const metadata: Metadata = { title: "Grades comerciais" };
export const dynamic = "force-dynamic";

type PageQuery = { q?: string | string[]; degree?: string | string[]; area?: string | string[]; duration?: string | string[] };
const one = (value: string | string[] | undefined) => typeof value === "string" ? value : undefined;

export default async function CommercialGradesPage({ searchParams }: { searchParams: Promise<PageQuery> }) {
  const user = await requireUser();
  const query = await searchParams;
  const filters = { q: one(query.q) ?? "", degree: one(query.degree), area: one(query.area), duration: one(query.duration) };
  const grades = await prisma.commercialGrade.findMany({ orderBy: [{ courseName: "asc" }, { createdAt: "desc" }], include: { uploadedBy: { select: { name: true } } } });
  const catalog = grades.map((grade) => ({ grade, metadata: normalizeCatalogMetadata({ courseName: grade.courseName, degree: grade.degree, knowledgeArea: grade.knowledgeArea, durationSemesters: grade.durationSemesters }), tracks: parseCourseTracks(grade.courseTracks, grade.internshipInfo) }));
  const degrees = [...new Set(catalog.map((item) => item.metadata.degree).filter((value): value is string => Boolean(value)))].sort();
  const areas = [...new Set(catalog.map((item) => item.metadata.knowledgeArea).filter((value): value is string => Boolean(value)))].sort();
  const durations = [...new Set(catalog.map((item) => item.metadata.durationSemesters).filter((value): value is number => typeof value === "number"))].sort((a, b) => a - b);
  const visible = catalog.filter(({ grade, metadata }) => (!filters.q || matchesSearch(filters.q, grade.courseName, grade.modality, metadata.degree, metadata.knowledgeArea)) && (!filters.degree || metadata.degree === filters.degree) && (!filters.area || metadata.knowledgeArea === filters.area) && (!filters.duration || metadata.durationSemesters === Number(filters.duration)));

  return <>
    <PageHeader eyebrow="Material comercial" title="Grades curriculares" description="Biblioteca de PDFs com informações objetivas para orientar a conversa e o envio ao candidato." />
    {user.role === "ADMIN" && <Card className="mb-6 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-4 text-brand-cyan-700" /> Anexar uma matriz curricular</CardTitle><p className="text-sm text-muted-foreground">Envie somente o PDF. A IA identifica dados comerciais, grau, área, duração e possíveis trilhas de formação.</p></CardHeader><CardContent><CommercialGradeUploadForm /></CardContent></Card>}
    <CommercialGradeCatalogSearch initialQuery={filters.q} courses={catalog.map(({ grade, metadata }) => ({ id: grade.id, name: grade.courseName, detail: [grade.modality, metadata.degree, metadata.knowledgeArea, metadata.durationSemesters ? `${metadata.durationSemesters} semestres` : null].filter(Boolean).join(" · ") }))} />
    <CommercialGradeCatalogFilters filters={filters} degrees={degrees} areas={areas} durations={durations} />
    <p className="mb-4 text-sm text-muted-foreground">{visible.length} {visible.length === 1 ? "grade encontrada" : "grades encontradas"}{(filters.q || filters.degree || filters.area || filters.duration) ? " com os filtros atuais." : "."}</p>
    <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.length === 0 ? <Card className="md:col-span-2 xl:col-span-3"><CardContent className="py-12 text-center text-sm text-muted-foreground">Nenhuma grade corresponde aos filtros selecionados.</CardContent></Card> : visible.map(({ grade, metadata, tracks }) => <CommercialGradeCard key={grade.id} grade={grade} metadata={metadata} tracks={tracks} canManage={user.role === "ADMIN"} />)}</div>
  </>;
}

function CommercialGradeCard({ grade, metadata, tracks, canManage }: { grade: CommercialGrade & { uploadedBy: { name: string } }; metadata: ReturnType<typeof normalizeCatalogMetadata>; tracks: ReturnType<typeof parseCourseTracks>; canManage: boolean }) {
  const hasInternship = Boolean(grade.internshipInfo);
  const savedWhatsapp = grade.whatsappSummary?.replace(/^Olá! Segue a matriz curricular de (.+)\.\n*/i, "Matriz curricular: $1.\n").replace(/\n*Estou enviando o PDF completo da grade para você consultar\.\s*$/i, "") ?? `Matriz curricular: ${grade.courseName}.`;
  const whatsapp = !hasInternship && !/est[aá]gio obrigat[oó]rio/i.test(savedWhatsapp) ? savedWhatsapp.replace(/(Matriz curricular:[^\n]*\.?)/i, "$1\n\nUma praticidade deste curso: ele não possui estágio obrigatório, trazendo mais flexibilidade para organizar a rotina de estudos.") : savedWhatsapp;
  const hasMultipleTracks = tracks.length > 1;
  const decisionSemester = tracks.map((track) => track.decisionSemester).find((semester): semester is number => Boolean(semester));
  return <Card className="h-auto self-start shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"><CardHeader><CardTitle className="flex items-start gap-2 text-base"><GraduationCap className="mt-0.5 size-4 shrink-0 text-brand-cyan-700" /><span>{grade.courseName}</span></CardTitle><p className="text-xs text-muted-foreground">{[grade.modality, grade.curriculumTerm].filter(Boolean).join(" · ") || "Modalidade não informada"}</p></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex flex-wrap gap-2"><span className={`rounded-full px-2 py-1 text-xs font-medium ${grade.hasTcc ? "bg-status-success-bg text-status-success" : "bg-muted text-muted-foreground"}`}>{grade.hasTcc ? "Possui TCC" : "Sem TCC informado"}</span><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${hasInternship ? "bg-brand-cyan-50 text-brand-cyan-800" : "bg-status-warning-bg text-status-warning"}`}><BriefcaseBusiness className="size-3" />{hasInternship ? grade.totalInternshipHours ? `${grade.totalInternshipHours.toLocaleString("pt-BR")}h de estágio` : "Possui estágio obrigatório" : "Não tem estágio obrigatório"}</span><span className="rounded-full bg-muted px-2 py-1 text-xs"><FileText className="mr-1 inline size-3" /> PDF</span></div>
    {(metadata.degree || metadata.knowledgeArea || metadata.durationSemesters) && <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{metadata.degree ?? "Grau não identificado"}</span>{metadata.knowledgeArea && <span>• {metadata.knowledgeArea}</span>}{metadata.durationSemesters && <span>• {metadata.durationSemesters} semestres</span>}</div>}
    {hasMultipleTracks && <div className="rounded-lg border border-brand-cyan-200 bg-brand-cyan-50/60 p-3"><div className="flex items-center gap-2 font-medium text-brand-navy"><Route className="size-4" /> Duas formações disponíveis</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{decisionSemester ? `O aluno define entre Bacharelado e Licenciatura no ${decisionSemester}º semestre.` : "O PDF apresenta Bacharelado e Licenciatura. Selecione a formação na mensagem para enviar os estágios corretos."}</p></div>}
    <div className="whitespace-pre-line text-sm text-muted-foreground">{grade.internshipInfo || "Esta matriz não prevê estágio obrigatório."}</div>{grade.totalCourseHours && <p className="text-xs text-muted-foreground">Carga horária total: {grade.totalCourseHours.toLocaleString("pt-BR")}h.</p>}{whatsapp && <CopyWhatsapp text={whatsapp} courseName={grade.courseName} hasTcc={grade.hasTcc} totalCourseHours={grade.totalCourseHours} tracks={tracks} />}<div className="border-t pt-3 text-xs text-muted-foreground">Enviada por {grade.uploadedBy.name} · {formatDateTime(grade.createdAt)}</div><a className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-navy px-3 text-sm font-medium text-white transition-opacity hover:opacity-90" href={`/api/commercial-grades/${grade.id}/download`}><Download className="size-4" /> Baixar PDF</a>{canManage && <ManageCommercialGradeButtons id={grade.id} courseName={grade.courseName} />}</CardContent></Card>;
}

function matchesSearch(query: string, ...values: Array<string | null | undefined>) { const normalizedQuery = normalize(query); return normalizedQuery.split(" ").filter(Boolean).every((word) => normalize(values.filter(Boolean).join(" ")).includes(word)); }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR"); }
