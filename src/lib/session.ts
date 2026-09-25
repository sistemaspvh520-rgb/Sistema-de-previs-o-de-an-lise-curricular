import "server-only";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can, type Permission } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/enums";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
  impersonator: { id: string; name: string } | null;
}

export class ForbiddenError extends Error {
  constructor(message = "Você não tem permissão para esta ação.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class UnauthorizedError extends Error {
  constructor(message = "Sessão inválida. Faça login novamente.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function getSessionUser(options: { allowStudent?: boolean } = {}): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) return null;
  const current = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true, isActive: true, sessionVersion: true, email: true, name: true, mustChangePassword: true } });
  if (!current?.isActive || current.sessionVersion !== (session.user.sessionVersion ?? 0)) return null;
  if (current.role === "STUDENT" && (!options.allowStudent || current.mustChangePassword || session.user.impersonatorId)) return null;
  return {
    id: session.user.id,
    email: current.email,
    name: current.name,
    role: current.role,
    mustChangePassword: current.mustChangePassword,
    impersonator: session.user.impersonatorId ? { id: session.user.impersonatorId, name: session.user.impersonatorName ?? "Administrador" } : null,
  };
}

/** Para páginas: redireciona ao login se não autenticado. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser({ allowStudent: true });
  if (!user) redirect("/login");
  if (user.role === "STUDENT") redirect("/portal");
  return user;
}

/** Para páginas: redireciona se não tiver a permissão. */
export async function requirePagePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect(can(user.role, "analysis:create") ? "/analyses/new?forbidden=1" : "/analyses?forbidden=1");
  return user;
}

/** Para server actions / route handlers: lança erro em vez de redirecionar. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  if (!can(user.role, permission)) throw new ForbiddenError();
  return user;
}
