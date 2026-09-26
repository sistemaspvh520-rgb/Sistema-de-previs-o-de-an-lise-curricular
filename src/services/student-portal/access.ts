import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { ForbiddenError, type SessionUser } from "@/lib/session";

export function enrollmentScope(user: SessionUser) {
  if (user.role === "STUDENT") return { studentUserId: user.id };
  if (!can(user.role, "students:manage")) throw new ForbiddenError();
  return user.role === "ADMIN" ? {} : { ownerId: user.id };
}

export async function requireEnrollment(user: SessionUser, id?: string) {
  if (id && !z.string().uuid().safeParse(id).success)
    throw new ForbiddenError();
  // Explicit IDs are always checked, including student requests.
  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { ...enrollmentScope(user), ...(id ? { id } : {}) },
    orderBy: { createdAt: "asc" },
    include: {
      studentUser: {
        select: {
          id: true,
          email: true,
          isActive: true,
          mustChangePassword: true,
          lastLoginAt: true,
        },
      },
      currentVersion: { include: { preferredSource: true } },
      owner: { select: { name: true, email: true, poloCode: true, phone: true } },
    },
  });
  if (!enrollment || (!id && user.role !== "STUDENT"))
    throw new ForbiddenError(
      "Matrícula não encontrada ou acesso não autorizado.",
    );
  return enrollment;
}

export function accessStatus(
  user: { isActive: boolean; mustChangePassword: boolean } | null,
) {
  return !user
    ? "SEM ACESSO"
    : !user.isActive
      ? "BLOQUEADO"
      : user.mustChangePassword
        ? "CONVITE PENDENTE"
        : "ATIVO";
}
