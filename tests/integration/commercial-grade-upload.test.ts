/**
 * Integração: envio de matriz comercial pela rota de API (PDF → leitura → armazenamento → catálogo).
 * Pulado automaticamente se o banco não estiver acessível.
 */
import path from "node:path";
import { mkdir, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { config as loadEnv } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { selectablePdf } from "../fixtures/academic-pdf";

loadEnv({ path: path.resolve(process.cwd(), ".env"), override: true });
vi.setConfig({ testTimeout: 30_000 });

let dbOk = false;
let userId = "";
let role = "ADMIN";
let prismaMod: typeof import("@/lib/prisma");
const storageDir = path.resolve(process.cwd(), "storage-test-commercial");
process.env.STORAGE_DIR = storageDir;
process.env.STORAGE_DRIVER = "local";

vi.mock("@/lib/session", () => ({ getSessionUser: async () => ({ id: userId, role }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

beforeAll(async () => {
  try {
    prismaMod = await import("@/lib/prisma");
    await prismaMod.prisma.$queryRaw`SELECT 1`;
    const user = await prismaMod.prisma.user.create({ data: { email: `grade-${Date.now()}@test.local`, name: "Teste", passwordHash: "x", role: "ADMIN" } });
    userId = user.id;
    dbOk = true;
  } catch {
    dbOk = false;
  }
});

afterAll(async () => {
  if (dbOk) {
    await prismaMod.prisma.commercialGrade.deleteMany({ where: { uploadedById: userId } });
    await prismaMod.prisma.user.delete({ where: { id: userId } });
    await prismaMod.prisma.$disconnect();
  }
  await rm(storageDir, { recursive: true, force: true });
});

function gradePdf(label: string, courseHours = "1.680") {
  return selectablePdf([
    [40, 800, `Matriz Curricular - 20182 - CST em Estetica e Cosmetica ${label}`],
    [40, 780, "GRADUACAO EAD"],
    [40, 760, `Total em Horas Relogio ${courseHours}`],
    [40, 740, "Total de horas de Estagio 160"],
  ]);
}

function upload(bytes: Buffer | string, name = "CST EM ESTÉTICA E COSMÉTICA.PDF", url = "http://localhost/api/commercial-grades/upload", mode?: "upsert") {
  const form = new FormData();
  if (mode) form.set("mode", mode);
  form.set("file", new File([new Uint8Array(typeof bytes === "string" ? Buffer.from(bytes) : bytes)], name, { type: "application/pdf" }));
  return new Request(url, { method: "POST", body: form });
}

const storedCount = async () => (await readdir(path.join(storageDir, "commercial-grades")).catch(() => [])).length;

describe("envio de grade comercial pela API", () => {
  it("lê, guarda o PDF e publica a grade mesmo sem IA configurada (leitura local)", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { POST } = await import("@/app/api/commercial-grades/upload/route");
    const response = await POST(upload(gradePdf("A")));
    expect(response.status).toBe(200);
    const saved = await prismaMod.prisma.commercialGrade.findFirst({ where: { uploadedById: userId } });
    expect(saved?.courseName).toContain("CST");
    expect(saved?.contentHash).toHaveLength(64);
  });

  it("recusa o mesmo PDF duas vezes (409) e arquivo que não é PDF (422)", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { POST } = await import("@/app/api/commercial-grades/upload/route");
    expect((await POST(upload(gradePdf("A"), "REPETIDA.PDF"))).status).toBe(409);
    const notPdf = await POST(upload("isto não é um pdf", "FALSO.PDF"));
    expect(notPdf.status).toBe(422);
    expect((await notPdf.json()).error).toMatch(/PDF/);
  });

  it("não falha quando o PDF traz totais absurdos (estouro de INT4): o campo fica vazio para revisão", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { POST } = await import("@/app/api/commercial-grades/upload/route");
    expect((await POST(upload(gradePdf("B", "99999999999"), "OUTRA GRADE.PDF"))).status).toBe(200);
    const saved = await prismaMod.prisma.commercialGrade.findFirst({ where: { uploadedById: userId, originalName: "OUTRA GRADE.PDF" } });
    expect(saved?.totalCourseHours).toBeNull();
  });

  it("remove o PDF do armazenamento e informa a referência quando a gravação no banco falha", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { POST } = await import("@/app/api/commercial-grades/upload/route");
    const before = await storedCount();
    const spy = vi.spyOn(prismaMod.prisma.commercialGrade, "create").mockRejectedValueOnce(new Error("falha simulada"));
    const response = await POST(upload(gradePdf("C"), "TERCEIRA.PDF"));
    spy.mockRestore();
    expect(response.status).toBe(500);
    expect((await response.json()).error).toMatch(/ref\.: Error/);
    expect(await storedCount()).toBe(before);
  });

  it("atualiza uma grade existente pela rota de substituição", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { POST } = await import("@/app/api/commercial-grades/[id]/replace/route");
    const target = await prismaMod.prisma.commercialGrade.findFirstOrThrow({ where: { uploadedById: userId, originalName: "OUTRA GRADE.PDF" } });
    const before = await storedCount();
    const response = await POST(upload(gradePdf("B", "2.000"), "OUTRA GRADE V2.PDF"), { params: Promise.resolve({ id: target.id }) });
    expect(response.status).toBe(200);
    const updated = await prismaMod.prisma.commercialGrade.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.originalName).toBe("OUTRA GRADE V2.PDF");
    expect(updated.totalCourseHours).toBe(2000);
    expect(await storedCount()).toBe(before); // o PDF antigo foi removido
  });

  it("relê o PDF já guardado (Reler com IA) sem novo envio e mantém um só arquivo", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { POST } = await import("@/app/api/commercial-grades/[id]/reread/route");
    const target = await prismaMod.prisma.commercialGrade.findFirstOrThrow({ where: { uploadedById: userId, originalName: "OUTRA GRADE V2.PDF" } });
    await prismaMod.prisma.commercialGrade.update({ where: { id: target.id }, data: { totalCourseHours: 669, hasTcc: true } });
    const before = await storedCount();
    const response = await POST(new Request(`http://localhost/api/commercial-grades/${target.id}/reread`, { method: "POST" }), { params: Promise.resolve({ id: target.id }) });
    expect(response.status).toBe(200);
    expect((await response.json()).message).toMatch(/^Grade atualizada/);
    const reread = await prismaMod.prisma.commercialGrade.findUniqueOrThrow({ where: { id: target.id } });
    expect(reread.totalCourseHours).toBe(2000);
    expect(reread.originalName).toBe("OUTRA GRADE V2.PDF");
    expect(await storedCount()).toBe(before);
    const missing = await POST(new Request("http://localhost/api/commercial-grades/x/reread", { method: "POST" }), { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }) });
    expect(missing.status).toBe(404);
  });

  it("envio em lote (upsert): cria, atualiza a grade do mesmo curso e ignora o mesmo PDF", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { POST } = await import("@/app/api/commercial-grades/upload/route");
    const send = async (bytes: Buffer, name: string) => {
      const response = await POST(upload(bytes, name, undefined, "upsert"));
      return { status: response.status, body: await response.json() };
    };
    const created = await send(gradePdf("LOTE", "1.000"), "LOTE v1.PDF");
    expect(created).toMatchObject({ status: 200, body: { action: "created" } });
    const before = await storedCount();
    const total = await prismaMod.prisma.commercialGrade.count({ where: { uploadedById: userId } });

    // Mesmo curso, conteúdo novo: atualiza a grade existente (um só registro e um só arquivo no armazenamento).
    const updated = await send(gradePdf("LOTE", "1.100"), "LOTE v2.PDF");
    expect(updated).toMatchObject({ status: 200, body: { action: "updated", id: created.body.id } });
    expect(await prismaMod.prisma.commercialGrade.count({ where: { uploadedById: userId } })).toBe(total);
    expect(await storedCount()).toBe(before);
    expect((await prismaMod.prisma.commercialGrade.findUniqueOrThrow({ where: { id: created.body.id } })).totalCourseHours).toBe(1100);

    // O mesmo PDF de novo não é erro: fica "sem mudança".
    const unchanged = await send(gradePdf("LOTE", "1.100"), "LOTE v2 de novo.PDF");
    expect(unchanged).toMatchObject({ status: 200, body: { action: "unchanged", id: created.body.id } });

    // Sem o modo em lote, o mesmo PDF continua sendo recusado (409).
    expect((await POST(upload(gradePdf("LOTE", "1.100"), "LOTE v2 repetida.PDF"))).status).toBe(409);
  });

  it("só administradores publicam grades", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { POST } = await import("@/app/api/commercial-grades/upload/route");
    role = "ANALYST";
    try { expect((await POST(upload(gradePdf("D"), "SEM PERMISSAO.PDF"))).status).toBe(403); } finally { role = "ADMIN"; }
  });

  it("localiza e remove apenas arquivos órfãos antigos", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { findOrphanGradeFiles, removeOrphanGradeFiles } = await import("@/services/commercial-grades/publish");
    const dir = path.join(storageDir, "commercial-grades");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "orfao-antigo.pdf"), "x");
    await writeFile(path.join(dir, "orfao-recente.pdf"), "x");
    const old = new Date(Date.now() - 60 * 60 * 1000);
    await utimes(path.join(dir, "orfao-antigo.pdf"), old, old);
    // birthtime não é alterável; simula o relógio 1 h à frente para tornar o arquivo "antigo".
    const found = await findOrphanGradeFiles(Date.now() + 60 * 60 * 1000);
    expect(found).toContain("commercial-grades/orfao-antigo.pdf");
    expect(found.some((key) => !key.includes("orfao"))).toBe(false); // arquivos com grade não são órfãos
    expect(await findOrphanGradeFiles()).toEqual([]); // recém-criados são preservados
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 60 * 60 * 1000 });
    try { expect(await removeOrphanGradeFiles()).toBe(2); } finally { vi.useRealTimers(); }
    expect(await readdir(dir)).not.toContain("orfao-antigo.pdf");
  });
});
