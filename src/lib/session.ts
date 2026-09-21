import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can, type Permission } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/enums";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
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

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? "",
    role: session.user.role,
  };
}

/** Para páginas: redireciona ao login se não autenticado. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
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
