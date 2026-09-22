import type { Role } from "@/generated/prisma/enums";

export type Permission =
  | "analysis:create"
  | "analysis:read"
  | "analysis:review"
  | "analysis:recalculate"
  | "analysis:summary"
  | "analysis:delete"
  | "users:manage"
  | "integration:manage"
  | "audit:read"
  | "usage:read"
  | "privacy:manage";

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  ADMIN: new Set<Permission>([
    "analysis:create",
    "analysis:read",
    "analysis:review",
    "analysis:recalculate",
    "analysis:summary",
    "analysis:delete",
    "users:manage",
    "integration:manage",
    "audit:read",
    "usage:read",
    "privacy:manage",
  ]),
  ANALYST: new Set<Permission>([
    "analysis:create",
    "analysis:read",
    "analysis:review",
    "analysis:recalculate",
    "analysis:summary",
  ]),
  VIEWER: new Set<Permission>(["analysis:read"]),
};

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[role]?.has(permission) ?? false;
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  ANALYST: "Analista",
  VIEWER: "Visualizador",
};

/** Prefixos de rota e permissão mínima exigida (usado pelo proxy/middleware). */
export const ROUTE_PERMISSIONS: Array<{ prefix: string; permission: Permission }> = [
  { prefix: "/settings/openai", permission: "integration:manage" },
  { prefix: "/settings/users", permission: "users:manage" },
  { prefix: "/settings/audit", permission: "audit:read" },
  { prefix: "/settings/usage", permission: "usage:read" },
  { prefix: "/settings/privacy", permission: "privacy:manage" },
  { prefix: "/settings/security", permission: "privacy:manage" },
  { prefix: "/settings/maintenance", permission: "privacy:manage" },
  { prefix: "/analyses/new", permission: "analysis:create" },
  { prefix: "/reviews", permission: "analysis:review" },
  { prefix: "/management", permission: "audit:read" },
];
