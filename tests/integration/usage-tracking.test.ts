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
const ids = { tutor: "", analyst: "", idle: "", never: "" };
let session: { id: string; role: string; impersonator: { id: string; name: string } | null } | null = null;

vi.mock("@/lib/session", () => ({ getSessionUser: async () => session }));

beforeAll(async () => {
  try {
    prismaMod = await import("@/lib/prisma");
    await prismaMod.prisma.$queryRaw`SELECT 1`;
    const stamp = Date.now();
    const create = (key: string, role: "TUTOR" | "ANALYST", extra: Record<string, unknown> = {}) =>
      prismaMod.prisma.user.create({ data: { email: `uso-${key}-${stamp}@test.local`, name: `Uso ${key}`, passwordHash: "x", role, poloCode: POLO, ...extra } });
    ids.tutor = (await create("tutor", "TUTOR")).id;
    ids.analyst = (await create("analista", "ANALYST")).id;
    ids.idle = (await create("parado", "ANALYST", { lastActiveAt: new Date(Date.now() - 20 * 24 * 60 * 60_000) })).id;
    ids.never = (await create("nunca", "ANALYST")).id;
    dbOk = true;
  } catch {
    dbOk = false;
  }
});

afterAll(async () => {
  if (dbOk) {
    const all = Object.values(ids).filter(Boolean);
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
    await recordAction(ids.tutor, "grade.download", null, new Date(t0.getTime() + 12_000));

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
    expect((await POST(post({ type: "action", name: "grade.whatsapp_copy" }))).status).toBe(204);
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
    expect(report.accounts).toBe(4);
    const tutor = report.people.find((person) => person.id === ids.tutor)!;
    expect(tutor).toMatchObject({ activeSeconds: 60, online: true, currentModule: "ACADEMIC", actions: 1 });
    expect(tutor.moduleActions.GRADES).toBe(1);
    expect(tutor.highlights).toEqual(["PDFs baixados: 1"]);
    const analyst = report.people.find((person) => person.id === ids.analyst)!;
    expect(analyst.moduleActions).toMatchObject({ CURRICULAR: 1, GRADES: 1 });
    expect(report.modules.find((module) => module.module === "ACADEMIC")).toMatchObject({ people: 1, activeSeconds: 60 });
    expect(report.online.map((person) => person.id)).toContain(ids.tutor);
    expect(report.attention.neverAccessed.map((person) => person.id)).toEqual([ids.never]);
    expect(report.attention.idle.map((person) => person.id)).toEqual([ids.idle]);
    expect(report.attention.analystsWithoutAnalyses.map((person) => person.id).sort()).toEqual([ids.idle, ids.never].sort());

    const detail = await getPersonUsage(ids.tutor, { from: new Date(now.getTime() - 24 * 60 * 60_000), to: now }, now);
    expect(detail?.topScreens[0]).toMatchObject({ name: "/academic-analysis/students/[id]", views: 1, label: "Ficha do aluno" });
    expect(detail?.timeline.map((item) => item.kind)).toEqual(["action", "page"]);
    expect(detail?.sessions).toHaveLength(1);
    expect(detail?.sessions[0]).toMatchObject({ screens: 1, actions: 1, login: false, summary: ["Baixou o PDF de uma grade"] });
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
