/**
 * Integração: envio de matriz comercial (PDF → leitura → armazenamento → catálogo).
 * Pulado automaticamente se o banco não estiver acessível.
 */
import path from "node:path";
import { rm } from "node:fs/promises";
import { config as loadEnv } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { selectablePdf } from "../fixtures/academic-pdf";

loadEnv({ path: path.resolve(process.cwd(), ".env"), override: true });

vi.setConfig({ testTimeout: 30_000 });
let dbOk = false;
let userId = "";
let prismaMod: typeof import("@/lib/prisma");
const storageDir = path.resolve(process.cwd(), "storage-test-commercial");
process.env.STORAGE_DIR = storageDir;
process.env.STORAGE_DRIVER = "local";

vi.mock("@/lib/session", () => ({ requirePermission: async () => ({ id: userId, role: "ADMIN" }) }));
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

function formWith(bytes: Buffer, name = "CST EM ESTÉTICA E COSMÉTICA.PDF") {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], name, { type: "application/pdf" }));
  return form;
}

describe("envio de grade comercial", () => {
  it("lê, guarda o PDF e publica a grade mesmo sem IA configurada (leitura local)", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { uploadCommercialGradeAction } = await import("@/features/commercial-grades/actions");
    const result = await uploadCommercialGradeAction(formWith(gradePdf("A")));
    expect(result).toMatchObject({ ok: true });
    const saved = await prismaMod.prisma.commercialGrade.findFirst({ where: { uploadedById: userId } });
    expect(saved?.courseName).toContain("CST");
    expect(saved?.contentHash).toHaveLength(64);
  });

  it("não falha quando o PDF traz totais absurdos (estouro de INT4): o campo fica vazio para revisão", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { uploadCommercialGradeAction } = await import("@/features/commercial-grades/actions");
    const result = await uploadCommercialGradeAction(formWith(gradePdf("B", "99999999999"), "OUTRA GRADE.PDF"));
    expect(result).toMatchObject({ ok: true });
    const saved = await prismaMod.prisma.commercialGrade.findFirst({ where: { uploadedById: userId, originalName: "OUTRA GRADE.PDF" } });
    expect(saved?.totalCourseHours).toBeNull();
  });

  it("remove o PDF do armazenamento quando a gravação no banco falha", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { readdir } = await import("node:fs/promises");
    const { uploadCommercialGradeAction } = await import("@/features/commercial-grades/actions");
    const before = (await readdir(path.join(storageDir, "commercial-grades"))).length;
    const spy = vi.spyOn(prismaMod.prisma.commercialGrade, "create").mockRejectedValueOnce(new Error("falha simulada"));
    const result = await uploadCommercialGradeAction(formWith(gradePdf("C"), "TERCEIRA.PDF"));
    spy.mockRestore();
    expect(result).toMatchObject({ ok: false });
    expect((await readdir(path.join(storageDir, "commercial-grades"))).length).toBe(before);
  });
});
