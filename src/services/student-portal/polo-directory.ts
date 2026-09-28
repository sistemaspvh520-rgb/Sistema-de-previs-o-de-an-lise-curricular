import "server-only";
import { prisma } from "@/lib/prisma";
import { getSystemSettings } from "@/repositories/settings-repository";
import { buildPoloDirectory, type PoloDirectoryEntry } from "./polo-directory.shared";

/** Contatos profissionais que o aluno vê ao escolher o polo: tutores e coordenação acadêmica. */
export async function getPoloDirectory(): Promise<PoloDirectoryEntry[]> {
  const [settings, staff] = await Promise.all([
    getSystemSettings(),
    prisma.user.findMany({
      where: { isActive: true, role: { in: ["TUTOR", "ACADEMIC_COORDINATOR"] } },
      orderBy: { name: "asc" },
      select: { name: true, email: true, phone: true, poloCode: true, role: true },
    }),
  ]);
  return buildPoloDirectory({
    polos: settings.polos,
    tutors: staff.filter((person) => person.role === "TUTOR"),
    coordinators: staff.filter((person) => person.role === "ACADEMIC_COORDINATOR"),
    poloCoordination: Object.fromEntries(Object.entries(settings.poloContacts).map(([code, contacts]) => [code, contacts.coordAcademico])),
  });
}
