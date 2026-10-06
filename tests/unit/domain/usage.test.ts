import { describe, expect, it } from "vitest";
import { moduleForPath, pageLabel, routePattern } from "@/domain/usage/modules";
import { AUDITED_ACTIONS, GRADE_ACTIONS, GRADE_ACTION_SHORT, TRACKED_ACTIONS, isGradeAction, usageAction } from "@/domain/usage/actions";
import { formatDuration, groupSessions, lastDayKeys, personStatus, resolveUsagePeriod, zonedDayKey, zonedWeekdayHour } from "@/domain/usage/metrics";

const UUID = "3f2c1a9e-4b7d-4c1e-9a2b-1c2d3e4f5a6b";

describe("uso da equipe: rotas e módulos", () => {
  it("guarda só o padrão da rota: sem IDs, números, buscas ou âncoras", () => {
    expect(routePattern(`/analyses/${UUID}?tab=audit#x`)).toBe("/analyses/[id]");
    expect(routePattern(`/academic-analysis/students/${UUID}`)).toBe("/academic-analysis/students/[id]");
    expect(routePattern("/commercial-grades?q=nutricao")).toBe("/commercial-grades");
    expect(routePattern("/analyses/12345")).toBe("/analyses/[id]");
    expect(routePattern("/commercial-dashboard")).toBe("/commercial-dashboard");
    expect(routePattern("")).toBe("/");
  });

  it("mapeia cada área do sistema para o seu módulo", () => {
    expect(moduleForPath("/analyses/new")).toBe("CURRICULAR");
    expect(moduleForPath(`/analyses/${UUID}`)).toBe("CURRICULAR");
    expect(moduleForPath("/reviews")).toBe("CURRICULAR");
    expect(moduleForPath("/reports")).toBe("CURRICULAR");
    expect(moduleForPath("/commercial-dashboard")).toBe("CURRICULAR");
    expect(moduleForPath("/commercial-grades")).toBe("GRADES");
    expect(moduleForPath("/academic-analysis/requests")).toBe("ACADEMIC");
    expect(moduleForPath("/academic-analysis/students/x")).toBe("ACADEMIC");
    expect(moduleForPath("/management/team-usage")).toBe("MANAGEMENT");
    expect(moduleForPath("/settings/users")).toBe("SETTINGS");
    expect(moduleForPath("/")).toBe("OTHER");
    // Prefixo parecido não engana o mapeamento.
    expect(moduleForPath("/analysesx")).toBe("OTHER");
  });

  it("dá nome legível às telas", () => {
    expect(pageLabel("/analyses/[id]")).toBe("Análise curricular");
    expect(pageLabel("/academic-analysis/requests")).toBe("Solicitações acadêmicas");
    expect(pageLabel("/settings/openai")).toBe("Configurações");
  });
});

describe("uso da equipe: catálogo de ações", () => {
  it("cada ação pertence a um módulo e ações rastreadas não duplicam a auditoria", () => {
    expect(usageAction("analysis.create")?.module).toBe("CURRICULAR");
    expect(usageAction("academic_grid.completed")?.module).toBe("ACADEMIC");
    expect(usageAction("ACADEMIC_REQUEST_CONCLUDE")?.module).toBe("ACADEMIC");
    expect(usageAction("grade.download")?.module).toBe("GRADES");
    expect(usageAction("email.sent")).toBeNull();
    for (const name of Object.keys(TRACKED_ACTIONS)) expect(AUDITED_ACTIONS[name]).toBeUndefined();
  });

  it("uso de grade: abrir a mensagem, copiar para o WhatsApp e baixar o PDF (a busca não identifica grade)", () => {
    expect([...GRADE_ACTIONS].sort()).toEqual(["grade.download", "grade.whatsapp_copy", "grade.whatsapp_open"]);
    for (const name of GRADE_ACTIONS) {
      expect(usageAction(name)?.module).toBe("GRADES");
      expect(GRADE_ACTION_SHORT[name]).toBeTruthy();
    }
    expect(isGradeAction("grade.search")).toBe(false);
    expect(isGradeAction("analysis.create")).toBe(false);
  });
});

describe("uso da equipe: métricas", () => {
  const now = new Date("2026-10-06T15:00:00Z"); // 11h em Porto Velho, terça

  it("situação: online, hoje, ontem, há N dias, sem uso há 14+ dias e nunca acessou", () => {
    expect(personStatus(new Date("2026-10-06T14:59:00Z"), true, now)).toMatchObject({ kind: "online" });
    expect(personStatus(new Date("2026-10-06T04:30:00Z"), false, now)).toMatchObject({ kind: "today", label: "Usou hoje" });
    // 23h de segunda em Porto Velho = 03h UTC de terça: ainda é "ontem" no fuso local.
    expect(personStatus(new Date("2026-10-06T03:00:00Z"), false, now)).toMatchObject({ kind: "recent", label: "Usou ontem", days: 1 });
    expect(personStatus(new Date("2026-10-01T15:00:00Z"), false, now)).toMatchObject({ kind: "recent", days: 5 });
    expect(personStatus(new Date("2026-09-20T15:00:00Z"), false, now)).toMatchObject({ kind: "idle", days: 16, label: "Sem uso há 16 dias" });
    expect(personStatus(null, false, now)).toMatchObject({ kind: "never", days: null });
  });

  it("dia e hora no fuso de Porto Velho", () => {
    expect(zonedDayKey(new Date("2026-10-06T03:59:00Z"))).toBe("2026-10-05");
    expect(zonedWeekdayHour(now)).toEqual({ weekday: 2, hour: 11 });
    expect(lastDayKeys(now, 3)).toEqual(["2026-10-04", "2026-10-05", "2026-10-06"]);
  });

  it("período: padrão de 7 dias, presets e intervalo personalizado (datas inválidas voltam ao padrão)", () => {
    expect(resolveUsagePeriod({}, now)).toMatchObject({ key: "7d", fromDay: "2026-09-30", toDay: "2026-10-06" });
    expect(resolveUsagePeriod({ period: "today" }, now).from.toISOString()).toBe("2026-10-06T04:00:00.000Z");
    const custom = resolveUsagePeriod({ period: "custom", from: "2026-09-01", to: "2026-09-30" }, now);
    expect(custom).toMatchObject({ key: "custom", label: "01/09/2026 a 30/09/2026" });
    expect(custom.to.toISOString()).toBe("2026-10-01T03:59:59.999Z");
    expect(resolveUsagePeriod({ period: "custom", from: "2026-09-30", to: "2026-09-01" }, now).key).toBe("7d");
    expect(resolveUsagePeriod({ period: "hack" }, now).key).toBe("7d");
  });

  it("sessões: pausas de mais de 30 minutos começam outra sessão (mais recente primeiro)", () => {
    const at = (time: string) => ({ at: new Date(`2026-10-06T${time}:00Z`) });
    const sessions = groupSessions([at("12:00"), at("12:20"), at("12:45"), at("14:00"), at("14:10")]);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].start.toISOString()).toBe("2026-10-06T14:00:00.000Z");
    expect(sessions[1].items).toHaveLength(3);
  });

  it("duração legível", () => {
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(20)).toBe("menos de 1 min");
    expect(formatDuration(45 * 60)).toBe("45 min");
    expect(formatDuration(2 * 3600 + 5 * 60)).toBe("2 h 05 min");
    expect(formatDuration(3 * 3600)).toBe("3 h");
  });
});
