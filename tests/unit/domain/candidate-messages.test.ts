import { describe, expect, it } from "vitest";
import { buildCandidateMessages } from "@/features/analyses/components/candidate-summary-dialog";
import type { AnalysisVM } from "@/features/analyses/view-model";

const vm = {
  studentName: "DEIVID HERRIQUE DE ARAUJO OLIVEIRA",
  courseName: "CST EM ANÁLISE E DESENVOLVIMENTO DE SISTEMAS",
  courseFormat: "EAD_DIGITAL",
  entryPeriod: 4,
  totals: { exempted: 16, pending: 27, review: 0 },
  estimatedCompletionTerm: "2027.1",
  estimatedCompletionSummary: "período 2027.1, até 30 de junho de 2027 · datas projetadas",
  narrative: { bulletLines: ["• 2026.2: 4º semestre + 3 adaptações (14 matérias)", "• 2027.1: semestre adicional c/ 13 matéria(s) e conclusão"] },
} as unknown as AnalysisVM;

describe("buildCandidateMessages", () => {
  it("monta a sequência de mensagens do WhatsApp: cumprimento, aprovação, resultado e aviso", () => {
    const [greeting, approval, result, notice] = buildCandidateMessages(vm);
    expect(greeting).toBe("Oi, Deivid! Tudo bem? Recebi agora o resultado da sua análise curricular");
    expect(approval).toBe("A análise foi aprovada e você poderá ingressar no 4º semestre de Análise e Desenvolvimento de Sistemas, com aproveitamento de disciplinas que já cursou anteriormente");
    expect(result.startsWith("Curso: CST EM ANÁLISE E DESENVOLVIMENTO DE SISTEMAS (")).toBe(true);
    expect(result).toContain("✓ 16 disciplinas foram aproveitadas.");
    expect(result).toContain("• 27 disciplinas permanecem para cursar.");
    expect(result).toContain("Você seguirá a partir do 4º período, conforme informado no resultado da análise.");
    expect(result).toContain("a conclusão estimada é período 2027.1, até 30 de junho de 2027 · datas projetadas.");
    expect(result).toContain("Organização prevista:\n• 2026.2: 4º semestre + 3 adaptações (14 matérias)");
    expect(result).not.toContain("Olá!");
    expect(notice).toMatch(/^Esta é uma previsão acadêmica/);
  });

  it("sem nome, sem ingresso e sem previsão ainda gera mensagens coerentes", () => {
    const [greeting, approval, result] = buildCandidateMessages({ ...vm, studentName: null, courseName: null, entryPeriod: null, estimatedCompletionTerm: null, narrative: null } as unknown as AnalysisVM);
    expect(greeting).toBe("Oi! Tudo bem? Recebi agora o resultado da sua análise curricular");
    expect(approval).toContain("ingressar no curso");
    expect(result).toContain("A previsão de conclusão será disponibilizada");
  });
});
