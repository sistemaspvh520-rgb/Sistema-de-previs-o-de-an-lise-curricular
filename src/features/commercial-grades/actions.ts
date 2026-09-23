"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { z } from "zod";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/services/storage/storage";
import { recordAudit } from "@/services/audit-log/audit-log";
import { readCommercialGrade } from "@/services/commercial-grades/reader";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";

const metadataSchema = z.object({ courseName: z.string().trim().max(180), modality: z.string().trim().max(80), curriculumTerm: z.string().trim().max(40) });

export async function uploadCommercialGradeAction(input: FormData): Promise<ActionResult> {
  try {
    const user = await requirePermission("privacy:manage");
    const parsed = metadataSchema.safeParse({ courseName: input.get("courseName") ?? "", modality: input.get("modality") ?? "", curriculumTerm: input.get("curriculumTerm") ?? "" });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Confira os dados da grade.");
    const file = input.get("file");
    if (!(file instanceof File) || file.size === 0 || file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) return fail("Envie uma grade em PDF.");
    if (file.size > 20 * 1024 * 1024) return fail("O PDF deve ter no máximo 20 MB.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const contentHash = fingerprint(bytes);
    const sameFile = await prisma.commercialGrade.findUnique({ where: { contentHash }, select: { courseName: true } });
    if (sameFile) return fail(`Este mesmo PDF já está disponível como “${sameFile.courseName}”.`);
    const reading = await readCommercialGrade(bytes, file.name);
    const courseName = parsed.data.courseName || reading.courseName || file.name.replace(/\.pdf$/i, "");
    const modality = parsed.data.modality || reading.modality;
    const curriculumTerm = parsed.data.curriculumTerm || reading.curriculumTerm;
    const catalogKey = fingerprint(`${normalizeCatalogValue(courseName)}|${normalizeCatalogValue(modality)}|${normalizeCatalogValue(curriculumTerm)}`);
    const sameMatrix = await prisma.commercialGrade.findFirst({ where: { OR: [{ catalogKey }, { courseName, modality, curriculumTerm }] }, select: { courseName: true, curriculumTerm: true } });
    if (sameMatrix) return fail(`Já existe uma matriz de “${sameMatrix.courseName}”${sameMatrix.curriculumTerm ? ` (${sameMatrix.curriculumTerm})` : ""}. Exclua a versão anterior antes de publicar outra.`);
    const stored = await getStorage().save(bytes, { extension: "pdf", prefix: "commercial-grades" });
    const grade = await prisma.commercialGrade.create({ data: { courseName, modality, curriculumTerm, contentHash, catalogKey, degree: reading.degree, knowledgeArea: reading.knowledgeArea, durationSemesters: reading.durationSemesters, courseTracks: reading.courseTracks, internshipInfo: reading.internshipInfo, hasTcc: reading.hasTcc, totalInternshipHours: reading.totalInternshipHours, totalCourseHours: reading.totalCourseHours, whatsappSummary: reading.whatsappSummary, originalName: file.name, storageKey: stored.key, sizeBytes: stored.sizeBytes, uploadedById: user.id } });
    await recordAudit({ userId: user.id, action: "commercial_grade.upload", entityType: "CommercialGrade", entityId: grade.id, metadata: { courseName: grade.courseName, degree: grade.degree, knowledgeArea: grade.knowledgeArea, durationSemesters: grade.durationSemesters, hasTcc: grade.hasTcc, totalInternshipHours: grade.totalInternshipHours, source: reading.source } });
    revalidatePath("/commercial-grades"); return ok(undefined, reading.source === "AI" ? "Grade lida pela IA e disponibilizada para o time comercial." : "Grade disponibilizada com leitura local; revise os dados antes do envio.");
  } catch (error) { return toActionError(error); }
}

export async function deleteCommercialGradeAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("privacy:manage");
    const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
    if (!parsed.success) return fail("Grade inválida.");
    const grade = await prisma.commercialGrade.findUnique({ where: { id: parsed.data.id }, select: { id: true, courseName: true, originalName: true, storageKey: true } });
    if (!grade) return fail("Grade não encontrada.");
    await prisma.commercialGrade.delete({ where: { id: grade.id } });
    await getStorage().delete(grade.storageKey).catch(() => undefined);
    await recordAudit({ userId: user.id, action: "commercial_grade.delete", entityType: "CommercialGrade", entityId: grade.id, metadata: { courseName: grade.courseName, originalName: grade.originalName } });
    revalidatePath("/commercial-grades");
    return ok(undefined, "Grade excluída definitivamente.");
  } catch (error) { return toActionError(error); }
}

/** Substitui o PDF, refaz a leitura pela IA e mantém uma única grade no catálogo. */
export async function updateCommercialGradeAction(input: FormData): Promise<ActionResult> {
  try {
    const user = await requirePermission("privacy:manage");
    const id = input.get("id");
    if (typeof id !== "string" || !z.string().uuid().safeParse(id).success) return fail("Grade inválida.");
    const previous = await prisma.commercialGrade.findUnique({ where: { id }, select: { id: true, storageKey: true } });
    if (!previous) return fail("Grade não encontrada.");
    const file = input.get("file");
    if (!(file instanceof File) || file.size === 0 || file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) return fail("Envie uma grade em PDF.");
    if (file.size > 20 * 1024 * 1024) return fail("O PDF deve ter no máximo 20 MB.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const contentHash = fingerprint(bytes);
    const sameFile = await prisma.commercialGrade.findFirst({ where: { contentHash, NOT: { id } }, select: { courseName: true } });
    if (sameFile) return fail(`Este PDF já pertence à grade “${sameFile.courseName}”.`);
    const reading = await readCommercialGrade(bytes, file.name);
    const courseName = reading.courseName || file.name.replace(/\.pdf$/i, "");
    const catalogKey = fingerprint(`${normalizeCatalogValue(courseName)}|${normalizeCatalogValue(reading.modality)}|${normalizeCatalogValue(reading.curriculumTerm)}`);
    const sameMatrix = await prisma.commercialGrade.findFirst({ where: { NOT: { id }, OR: [{ catalogKey }, { courseName, modality: reading.modality, curriculumTerm: reading.curriculumTerm }] }, select: { courseName: true, curriculumTerm: true } });
    if (sameMatrix) return fail(`Já existe uma matriz de “${sameMatrix.courseName}”${sameMatrix.curriculumTerm ? ` (${sameMatrix.curriculumTerm})` : ""}. Exclua a versão anterior antes de atualizar.`);
    const stored = await getStorage().save(bytes, { extension: "pdf", prefix: "commercial-grades" });
    await prisma.commercialGrade.update({ where: { id }, data: { courseName, modality: reading.modality, curriculumTerm: reading.curriculumTerm, contentHash, catalogKey, degree: reading.degree, knowledgeArea: reading.knowledgeArea, durationSemesters: reading.durationSemesters, courseTracks: reading.courseTracks, internshipInfo: reading.internshipInfo, hasTcc: reading.hasTcc, totalInternshipHours: reading.totalInternshipHours, totalCourseHours: reading.totalCourseHours, whatsappSummary: reading.whatsappSummary, originalName: file.name, storageKey: stored.key, sizeBytes: stored.sizeBytes, uploadedById: user.id } });
    await getStorage().delete(previous.storageKey).catch(() => undefined);
    await recordAudit({ userId: user.id, action: "commercial_grade.update", entityType: "CommercialGrade", entityId: id, metadata: { courseName, originalName: file.name, source: reading.source } });
    revalidatePath("/commercial-grades");
    return ok(undefined, reading.source === "AI" ? "Grade atualizada e lida novamente pela IA." : "Grade atualizada; a leitura local precisa de revisão.");
  } catch (error) { return toActionError(error); }
}

function fingerprint(value: Buffer | string) { return createHash("sha256").update(value).digest("hex"); }
function normalizeCatalogValue(value: string | null | undefined) { return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase(); }
