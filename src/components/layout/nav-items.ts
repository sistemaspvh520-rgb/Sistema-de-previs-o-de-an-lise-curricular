import type { Permission } from "@/lib/rbac";

export interface NavItem {
  href: string;
  label: string;
  icon: "dashboard" | "new" | "list" | "review" | "settings" | "management" | "reports" | "grades";
  permission?: Permission;
}

export const MAIN_NAV: NavItem[] = [
  { href: "/analyses/new", label: "Nova análise", icon: "new", permission: "analysis:create" },
  { href: "/analyses", label: "Análises", icon: "list" },
  { href: "/reviews", label: "Revisões", icon: "review", permission: "analysis:review" },
  { href: "/reports", label: "Meus relatórios", icon: "reports" },
  { href: "/management", label: "Gestão", icon: "management", permission: "audit:read" },
  { href: "/commercial-grades", label: "Grades comerciais", icon: "grades" },
];

export interface SettingsNavItem {
  href: string;
  label: string;
  permission?: Permission;
}

export const SETTINGS_NAV: SettingsNavItem[] = [
  { href: "/settings/general", label: "Geral", permission: "privacy:manage" },
  { href: "/settings/openai", label: "OpenAI", permission: "integration:manage" },
  { href: "/settings/users", label: "Usuários", permission: "users:manage" },
];
