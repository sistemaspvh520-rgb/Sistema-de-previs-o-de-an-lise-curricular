import type { UsageModule } from "@/generated/prisma/enums";

/**
 * Mapeamento único rota → módulo do painel "Uso da equipe". Só o padrão da rota é guardado
 * (ex.: /analyses/[id]): IDs, buscas e qualquer dado de aluno ficam de fora.
 */

/** Módulos de trabalho exibidos em destaque no painel (Gestão e Configurações aparecem só no detalhe). */
export const WORK_MODULES = ["CURRICULAR", "GRADES", "ACADEMIC"] as const satisfies readonly UsageModule[];
export type WorkModule = (typeof WORK_MODULES)[number];

export const MODULE_LABELS: Record<UsageModule, string> = {
  CURRICULAR: "Análise curricular",
  GRADES: "Grades comerciais",
  ACADEMIC: "Sistema acadêmico",
  MANAGEMENT: "Gestão",
  SETTINGS: "Configurações",
  OTHER: "Outros",
};

const MODULE_RULES: Array<{ test: RegExp; module: UsageModule }> = [
  { test: /^\/(analyses|reviews|reports|dashboard|commercial-dashboard)(\/|$)/, module: "CURRICULAR" },
  { test: /^\/commercial-grades(\/|$)/, module: "GRADES" },
  { test: /^\/academic-analysis(\/|$)/, module: "ACADEMIC" },
  { test: /^\/management(\/|$)/, module: "MANAGEMENT" },
  { test: /^\/settings(\/|$)/, module: "SETTINGS" },
];

/** Segmento que identifica um registro (UUID, número ou token longo) e vira "[id]". */
const ID_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+|(?=[a-z0-9_-]*\d)[a-z0-9_-]{16,})$/i;

/** "/analyses/3f2c…?tab=x" → "/analyses/[id]". Sempre começa com "/" e tem no máximo 120 caracteres. */
export function routePattern(path: string): string {
  const clean = (path.split(/[?#]/)[0] || "/").trim();
  const segments = clean.split("/").filter(Boolean).slice(0, 6).map((segment) => (ID_SEGMENT.test(segment) ? "[id]" : segment.replace(/[^a-z0-9_-]/gi, "").slice(0, 40)));
  return `/${segments.filter(Boolean).join("/")}`.slice(0, 120);
}

export function moduleForPath(path: string): UsageModule {
  const pattern = routePattern(path);
  return MODULE_RULES.find((rule) => rule.test.test(pattern))?.module ?? "OTHER";
}

const PAGE_LABELS: Record<string, string> = {
  "/": "Início",
  "/dashboard": "Painel",
  "/analyses": "Análises",
  "/analyses/new": "Nova análise",
  "/analyses/[id]": "Análise curricular",
  "/reviews": "Revisões",
  "/reports": "Relatórios",
  "/commercial-dashboard": "Painel comercial",
  "/commercial-grades": "Grades comerciais",
  "/academic-analysis": "Análise acadêmica",
  "/academic-analysis/[id]": "Grade acadêmica",
  "/academic-analysis/requests": "Solicitações acadêmicas",
  "/academic-analysis/requests/[id]": "Solicitação acadêmica",
  "/academic-analysis/students": "Alunos",
  "/academic-analysis/students/[id]": "Ficha do aluno",
  "/management": "Gestão",
  "/management/team-usage": "Uso da equipe",
  "/management/team-usage/[id]": "Uso de uma pessoa",
};

/** Nome legível da tela para a linha do tempo. */
export function pageLabel(pattern: string): string {
  if (PAGE_LABELS[pattern]) return PAGE_LABELS[pattern];
  if (pattern.startsWith("/settings")) return "Configurações";
  return pattern;
}
