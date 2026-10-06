import type { UsageModule } from "@/generated/prisma/enums";

/**
 * Catálogo das ações que contam como uso. As que já ficam na auditoria (AuditLog) são lidas de lá — não há registro
 * duplicado; as demais (ex.: baixar o PDF de uma grade) são gravadas como UsageEvent do tipo ACTION.
 * `key`: entra nos números de destaque do módulo; `plural`: rótulo de contagem ("12 PDFs baixados").
 */
export interface UsageActionDef {
  module: UsageModule;
  label: string;
  plural: string;
  key?: boolean;
}

export const AUDITED_ACTIONS: Record<string, UsageActionDef> = {
  "auth.login": { module: "OTHER", label: "Entrou no sistema", plural: "logins" },

  "analysis.create": { module: "CURRICULAR", label: "Criou uma análise curricular", plural: "análises criadas", key: true },
  "analysis.enrollment_updated": { module: "CURRICULAR", label: "Atualizou a matrícula de um candidato", plural: "matrículas atualizadas", key: true },
  "analysis.subject_corrected": { module: "CURRICULAR", label: "Corrigiu uma disciplina", plural: "correções" },
  "analysis.subject_added": { module: "CURRICULAR", label: "Incluiu uma disciplina", plural: "inclusões" },
  "analysis.entry_period_confirmed": { module: "CURRICULAR", label: "Confirmou o período de ingresso", plural: "ingressos confirmados" },
  "analysis.warning_resolved": { module: "CURRICULAR", label: "Resolveu um alerta da análise", plural: "alertas resolvidos" },
  "analysis.retry": { module: "CURRICULAR", label: "Reprocessou uma análise", plural: "reprocessamentos" },
  "analysis.reaudit": { module: "CURRICULAR", label: "Pediu nova auditoria", plural: "reauditorias" },

  "commercial_grade.upload": { module: "GRADES", label: "Publicou uma grade", plural: "grades publicadas", key: true },
  "commercial_grade.update": { module: "GRADES", label: "Atualizou ou releu uma grade", plural: "grades atualizadas" },

  "academic_grid.created": { module: "ACADEMIC", label: "Criou uma grade acadêmica", plural: "grades acadêmicas criadas" },
  "academic_grid.completed": { module: "ACADEMIC", label: "Concluiu uma grade acadêmica", plural: "grades acadêmicas concluídas", key: true },
  "academic_grid.corrected": { module: "ACADEMIC", label: "Corrigiu uma grade acadêmica", plural: "correções acadêmicas" },
  TUTOR_UPLOAD: { module: "ACADEMIC", label: "Enviou um documento de aluno", plural: "documentos enviados" },
  ANALYSIS_CREATED: { module: "ACADEMIC", label: "Gerou a análise acadêmica de um aluno", plural: "análises acadêmicas geradas" },
  ANALYSIS_UPDATED: { module: "ACADEMIC", label: "Atualizou a análise acadêmica de um aluno", plural: "análises acadêmicas atualizadas" },
  ACADEMIC_REQUEST_CONCLUDE: { module: "ACADEMIC", label: "Concluiu uma solicitação de aluno", plural: "solicitações concluídas", key: true },
  ACADEMIC_REQUEST_REJECT: { module: "ACADEMIC", label: "Pediu novo documento ao aluno", plural: "pedidos de novo documento" },
  ACADEMIC_REQUEST_REVIEW: { module: "ACADEMIC", label: "Colocou uma solicitação em conferência", plural: "solicitações em conferência" },
  STUDENT_LINKED: { module: "ACADEMIC", label: "Vinculou um aluno", plural: "alunos vinculados", key: true },
  "student.tutor_changed": { module: "ACADEMIC", label: "Trocou o tutor de um aluno", plural: "trocas de tutor" },
  "student.polo_changed": { module: "ACADEMIC", label: "Trocou o polo de um aluno", plural: "trocas de polo" },
  "student.polo_confirmed": { module: "ACADEMIC", label: "Confirmou o polo de um aluno", plural: "polos confirmados" },
  TUTOR_VIEWED_AS_STUDENT: { module: "ACADEMIC", label: "Viu o portal como o aluno", plural: "visitas ao portal" },
};

/** Ações gravadas pelo próprio rastreamento (não existem na auditoria). */
export const TRACKED_ACTIONS = {
  "grade.download": { module: "GRADES", label: "Baixou o PDF de uma grade", plural: "PDFs baixados", key: true },
  "grade.whatsapp_copy": { module: "GRADES", label: "Copiou a mensagem de WhatsApp de uma grade", plural: "mensagens copiadas", key: true },
  "grade.search": { module: "GRADES", label: "Buscou no catálogo de grades", plural: "buscas" },
  "report.export": { module: "CURRICULAR", label: "Exportou um relatório", plural: "relatórios exportados" },
} as const satisfies Record<string, UsageActionDef>;

export type TrackedActionName = keyof typeof TRACKED_ACTIONS;

export function isTrackedAction(name: string): name is TrackedActionName {
  return Object.prototype.hasOwnProperty.call(TRACKED_ACTIONS, name);
}

/** Definição de qualquer ação conhecida (auditada ou rastreada); null para ações que não contam como uso. */
export function usageAction(name: string): UsageActionDef | null {
  return AUDITED_ACTIONS[name] ?? (isTrackedAction(name) ? TRACKED_ACTIONS[name] : null);
}

export const AUDITED_ACTION_NAMES = Object.keys(AUDITED_ACTIONS);
