/**
 * Integração: uso da equipe (sinais do navegador → agregado por hora, linha do tempo e presença → painel do gestor).
 * Pulado automaticamente se o banco não estiver acessível.
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

loadEnv({ path: path.resolve(process.cwd(), ".env"), override: true });
vi.setConfig({ testTimeout: 30_000 });

/** Polo exclusivo dos usuários do teste: isola o painel de outros dados do banco local. */
const POLO = "8251";
let dbOk = false;
let prismaMod: typeof import("@/lib/prisma");
const ids = { tutor: "", analyst: "", idle: "", never: "", admin: "" };
let gradeId = "";
let session: { id: string; role: string; impersonator: { id: string; name: string } | null } | null = null;

vi.mock("@/lib/session", () => ({ getSessionUser: async () => session }));

beforeAll(async () => {
  try {
    prismaMod = await import("@/lib/prisma");
    await prismaMod.prisma.$queryRaw`SELECT 1`;
    const stamp = Date.now();
    const create = (key: string, role: "TUTOR" | "ANALYST" | "ADMIN", extra: Record<string, unknown> = {}) =>
      prismaMod.prisma.user.create({ data: { email: `uso-${key}-${stamp}@test.local`, name: `Uso ${key}`, passwordHash: "x", role, poloCode: POLO, ...extra } });
    ids.tutor = (await create("tutor", "TUTOR")).id;
    ids.analyst = (await create("analista", "ANALYST")).id;
    ids.idle = (await create("parado", "ANALYST", { lastActiveAt: new Date(Date.now() - 20 * 24 * 60 * 60_000) })).id;
    ids.never = (await create("nunca", "ANALYST")).id;
    // Admin com acesso recente: não aparece como "nunca acessou", mas entra no alerta de quem não usou as grades.
    ids.admin = (await create("admin", "ADMIN", { lastActiveAt: new Date() })).id;
    gradeId = (await prismaMod.prisma.commercialGrade.create({ data: { courseName: `CST EM TESTE DE USO ${stamp}`, originalName: "teste.pdf", storageKey: `commercial-grades/uso-${stamp}.pdf`, sizeBytes: 10, uploadedById: ids.admin } })).id;
    dbOk = true;
  } catch {
    dbOk = false;
  }
});

afterAll(async () => {
  if (dbOk) {
    const all = Object.values(ids).filter(Boolean);
    await prismaMod.prisma.commercialGrade.deleteMany({ where: { uploadedById: { in: all } } });
    await prismaMod.prisma.auditLog.deleteMany({ where: { userId: { in: all } } });
    await prismaMod.prisma.user.deleteMany({ where: { id: { in: all } } });
    await prismaMod.prisma.$disconnect();
  }
});

const post = (body: unknown) => new Request("http://localhost/api/usage/track", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

describe("uso da equipe", () => {
  it("tela aberta, minuto ativo (sem dobrar com duas abas) e ação chegam ao agregado e à presença", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { recordAction, recordHeartbeat, recordPageView } = await import("@/services/usage/track");
    const t0 = new Date();
    await recordPageView(ids.tutor, "/academic-analysis/students/3f2c1a9e-4b7d-4c1e-9a2b-1c2d3e4f5a6b?x=1", t0);
    expect(await recordHeartbeat(ids.tutor, "/academic-analysis/requests", new Date(t0.getTime() + 1_000))).toBe(60);
    // Outra aba aberta manda o mesmo sinal 10 s depois: não soma tempo de novo.
    expect(await recordHeartbeat(ids.tutor, "/academic-analysis/requests", new Date(t0.getTime() + 11_000))).toBe(0);
    expect(await recordAction(ids.tutor, "grade.download", gradeId, new Date(t0.getTime() + 12_000))).toBe(true);
    // Uso de grade sem grade válida é descartado (o nome do curso vem do banco, nunca do navegador).
    expect(await recordAction(ids.tutor, "grade.download", null)).toBe(false);
    expect(await recordAction(ids.tutor, "grade.whatsapp_open", "00000000-0000-4000-8000-000000000000")).toBe(false);
    const download = await prismaMod.prisma.usageEvent.findFirstOrThrow({ where: { userId: ids.tutor, name: "grade.download" } });
    expect(download.entityLabel).toMatch(/^CST EM TESTE DE USO/);

    const hours = await prismaMod.prisma.usageHourly.findMany({ where: { userId: ids.tutor } });
    expect(hours.find((row) => row.module === "ACADEMIC")).toMatchObject({ activeSeconds: 60, pageViews: 1 });
    const page = await prismaMod.prisma.usageEvent.findFirstOrThrow({ where: { userId: ids.tutor, kind: "PAGE_VIEW" } });
    expect(page.name).toBe("/academic-analysis/students/[id]");
    const presence = await prismaMod.prisma.userPresence.findUniqueOrThrow({ where: { userId: ids.tutor } });
    expect(presence).toMatchObject({ module: "ACADEMIC", routeLabel: "/academic-analysis/requests" });
  });

  it("a rota do navegador registra a equipe e ignora 'Acessar como', alunos e sessão inválida", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { POST } = await import("@/app/api/usage/track/route");
    session = { id: ids.analyst, role: "ANALYST", impersonator: null };
    expect((await POST(post({ type: "page", path: "/analyses/new" }))).status).toBe(204);
    expect((await POST(post({ type: "action", name: "grade.whatsapp_open", entityId: gradeId }))).status).toBe(204);
    // Abrir/copiar a mensagem sem dizer qual grade é recusado.
    expect((await POST(post({ type: "action", name: "grade.whatsapp_copy" }))).status).toBe(400);
    // Ação que só o servidor pode registrar não é aceita do navegador.
    expect((await POST(post({ type: "action", name: "grade.download" }))).status).toBe(400);
    expect(await prismaMod.prisma.usageEvent.count({ where: { userId: ids.analyst } })).toBe(2);

    session = { id: ids.analyst, role: "ANALYST", impersonator: { id: ids.tutor, name: "Admin" } };
    expect((await POST(post({ type: "page", path: "/reviews" }))).status).toBe(204);
    session = { id: ids.analyst, role: "STUDENT", impersonator: null };
    expect((await POST(post({ type: "page", path: "/reviews" }))).status).toBe(204);
    expect(await prismaMod.prisma.usageEvent.count({ where: { userId: ids.analyst } })).toBe(2);
    session = null;
    expect((await POST(post({ type: "page", path: "/reviews" }))).status).toBe(401);
  });

  it("o painel soma tempo, telas e ações por pessoa e por módulo e aponta quem pede atenção", async (ctx) => {
    if (!dbOk) return ctx.skip();
    await prismaMod.prisma.auditLog.create({ data: { userId: ids.analyst, action: "analysis.create", entityType: "CurricularAnalysis" } });
    const { getTeamUsage, getPersonUsage } = await import("@/services/usage/team-usage");
    const now = new Date(Date.now() + 20_000);
    const report = await getTeamUsage({ from: new Date(now.getTime() - 24 * 60 * 60_000), to: now, polo: POLO }, now);
    expect(report.accounts).toBe(5);
    const tutor = report.people.find((person) => person.id === ids.tutor)!;
    expect(tutor).toMatchObject({ activeSeconds: 60, online: true, currentModule: "ACADEMIC", actions: 1 });
    expect(tutor.moduleActions.GRADES).toBe(1);
    expect(tutor.highlights).toEqual(["PDFs baixados: 1"]);
    const analyst = report.people.find((person) => person.id === ids.analyst)!;
    expect(analyst.moduleActions).toMatchObject({ CURRICULAR: 1, GRADES: 1 });
    expect(report.modules.find((module) => module.module === "ACADEMIC")).toMatchObject({ people: 1, activeSeconds: 60 });
    expect(report.online.map((person) => person.id)).toContain(ids.tutor);
    // Ritmo: quem trabalhou em cada horário e dia da semana (o tutor tem 60 s registrados no teste anterior).
    const tutorHours = report.rhythmPeople.hours.flatMap((list) => list.filter((person) => person.id === ids.tutor));
    expect(tutorHours).toHaveLength(1);
    expect(tutorHours[0]).toMatchObject({ seconds: 60, name: "Uso tutor" });
    expect(report.rhythmPeople.weekdays.flat().filter((person) => person.id === ids.tutor)).toHaveLength(1);
    expect(report.attention.neverAccessed.map((person) => person.id)).toEqual([ids.never]);
    expect(report.attention.idle.map((person) => person.id)).toEqual([ids.idle]);
    expect(report.attention.analystsWithoutAnalyses.map((person) => person.id).sort()).toEqual([ids.idle, ids.never].sort());
    // Alerta de grades vale para toda a equipe, admin inclusive.
    expect(report.attention.withoutGrades.map((person) => person.id).sort()).toEqual([ids.idle, ids.never, ids.admin].sort());

    const detail = await getPersonUsage(ids.tutor, { from: new Date(now.getTime() - 24 * 60 * 60_000), to: now }, now);
    expect(detail?.topScreens[0]).toMatchObject({ name: "/academic-analysis/students/[id]", views: 1, label: "Ficha do aluno" });
    expect(detail?.timeline.map((item) => item.kind)).toEqual(["action", "page"]);
    expect(detail?.sessions).toHaveLength(1);
    expect(detail?.sessions[0]).toMatchObject({ screens: 1, actions: 1, login: false, summary: ["Baixou o PDF de uma grade"] });
  });

  it("uso das grades: quem usou qual grade e quando, grades sem uso e histórico após excluir a grade", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { recordAction } = await import("@/services/usage/track");
    const { getGradeUsage } = await import("@/services/usage/grade-usage");
    // Depois do download do primeiro teste (gravado 12 s à frente): é o uso mais recente do registro.
    await recordAction(ids.tutor, "grade.whatsapp_copy", gradeId, new Date(Date.now() + 15_000));
    const other = await prismaMod.prisma.commercialGrade.create({ data: { courseName: "GRADE SEM USO DE TESTE", originalName: "x.pdf", storageKey: `commercial-grades/sem-uso-${Date.now()}.pdf`, sizeBytes: 1, uploadedById: ids.admin } });
    const now = new Date(Date.now() + 20_000);
    const range = { from: new Date(now.getTime() - 24 * 60 * 60_000), to: now, polo: POLO };
    const report = await getGradeUsage(range);

    const tutor = report.byPerson.find((person) => person.id === ids.tutor)!;
    expect(tutor).toMatchObject({ total: 2, copies: 1, downloads: 1, opens: 0 });
    expect(tutor.grades).toHaveLength(1);
    expect(tutor.grades[0]).toMatchObject({ gradeId, copies: 1, downloads: 1, exists: true });
    expect(tutor.grades[0].firstAt <= tutor.grades[0].lastAt).toBe(true);
    const analyst = report.byPerson.find((person) => person.id === ids.analyst)!;
    expect(analyst).toMatchObject({ total: 1, opens: 1 });
    expect(report.byGrade[0]).toMatchObject({ gradeId, total: 3, copies: 1 });
    expect(report.byGrade[0].people.map((person) => person.id)).toEqual([ids.tutor, ids.analyst]);
    expect(report.unusedGrades.map((grade) => grade.id)).toContain(other.id);
    expect(report.notUsing.map((person) => person.id).sort()).toEqual([ids.idle, ids.never, ids.admin].sort());
    expect(report.totals).toMatchObject({ people: 2, accounts: 5, copies: 1 });
    expect(report.log[0]).toMatchObject({ userId: ids.tutor, action: "grade.whatsapp_copy" });
    const onlyTutor = await getGradeUsage({ ...range, userId: ids.tutor });
    expect(onlyTutor.byPerson.map((person) => person.id)).toEqual([ids.tutor]);

    // A grade é excluída: o histórico continua com o nome do curso guardado no uso.
    await prismaMod.prisma.commercialGrade.delete({ where: { id: gradeId } });
    const after = await getGradeUsage(range);
    expect(after.byGrade[0]).toMatchObject({ gradeId, exists: false });
    expect(after.byGrade[0].label).toMatch(/^CST EM TESTE DE USO/);
  });

  it("a limpeza remove só o que passou do prazo", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { purgeOldUsage } = await import("@/services/usage/track");
    const old = new Date(Date.now() - 200 * 24 * 60 * 60_000);
    await prismaMod.prisma.usageEvent.create({ data: { userId: ids.tutor, module: "GRADES", kind: "PAGE_VIEW", name: "/commercial-grades", createdAt: old } });
    const before = await prismaMod.prisma.usageEvent.count({ where: { userId: ids.tutor } });
    const result = await purgeOldUsage();
    expect(result.events).toBeGreaterThanOrEqual(1);
    expect(await prismaMod.prisma.usageEvent.count({ where: { userId: ids.tutor } })).toBe(before - 1);
  });
});
