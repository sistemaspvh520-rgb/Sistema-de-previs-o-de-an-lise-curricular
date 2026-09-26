import type { Role } from "@/generated/prisma/enums";

export type Permission =
  | "academic:manage"
  | "students:manage"
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
  STUDENT: new Set<Permission>(),
  ADMIN: new Set<Permission>([
    "academic:manage",
    "students:manage",
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
  /** Tutor: tudo o que o Analista faz + área acadêmica (análise acadêmica, solicitações e alunos). */
  TUTOR: new Set<Permission>([
    "academic:manage",
    "students:manage",
    "analysis:create",
    "analysis:read",
    "analysis:review",
    "analysis:recalculate",
    "analysis:summary",
  ]),
  /** Analista: somente análise curricular, grades comerciais e relatórios — sem área acadêmica. */
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

/** Papéis atribuíveis a usuários da equipe, na ordem exibida nos formulários. */
export const STAFF_ROLES = ["ADMIN", "TUTOR", "ANALYST", "VIEWER"] as const satisfies readonly Role[];

export const ROLE_DESCRIPTIONS: Record<(typeof STAFF_ROLES)[number], string> = {
  ADMIN: "Acesso total, incluindo usuários e configurações.",
  TUTOR: "Análise curricular, grades comerciais, relatórios e toda a área acadêmica.",
  ANALYST: "Análise curricular, grades comerciais e relatórios — sem área acadêmica.",
  VIEWER: "Somente consulta das análises.",
};

/** Papéis que atendem alunos: exibem polo e WhatsApp no cadastro. */
export function isStudentFacingRole(role: Role): boolean {
  return role === "ADMIN" || role === "TUTOR";
}

export const ROLE_LABELS: Record<Role, string> = {
  STUDENT: "Aluno",
  ADMIN: "Administrador",
  TUTOR: "Tutor",
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
  { prefix: "/academic-analysis", permission: "academic:manage" },
  { prefix: "/reviews", permission: "analysis:review" },
  { prefix: "/management", permission: "audit:read" },
];
