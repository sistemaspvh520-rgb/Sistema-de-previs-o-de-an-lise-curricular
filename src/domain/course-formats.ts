import type { CourseFormat } from "@/generated/prisma/enums";

/** Formato do curso informado pelo analista no envio (não é lido do PDF). */
export const COURSE_FORMATS: readonly { code: CourseFormat; label: string }[] = [
  { code: "EAD_DIGITAL", label: "EAD Digital" },
  { code: "SEMIPRESENCIAL", label: "Semipresencial" },
];

export function isCourseFormat(value: string): value is CourseFormat {
  return COURSE_FORMATS.some((f) => f.code === value);
}

export function formatCourseFormat(code: CourseFormat | null | undefined): string {
  return COURSE_FORMATS.find((f) => f.code === code)?.label ?? "—";
}
