import path from "node:path";
import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import type { SessionUser } from "@/lib/session";
import { academicPdf, academicHistoryPdf, selectablePdf } from "../fixtures/academic-pdf";

loadEnv({
  path: path.resolve(process.cwd(), ".env"),
  override: true,
  quiet: true,
});
const session = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
}));
vi.mock("@/lib/auth", () => ({
  auth: async () => (session.user ? { user: session.user } : null),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/student-portal/notifications", () => ({
  notifyAcademicUpdate: vi.fn(),
}));
vi.mock("@/services/email/mailer", () => ({
  isEmailConfigured: () => false,
  appUrl: (value: string) => `http://localhost:3000${value}`,
  sendMail: vi.fn(),
}));
let prisma: (typeof import("@/lib/prisma"))["prisma"];
let tutor: SessionUser;
let otherTutor: SessionUser;
let student: SessionUser;
const users: string[] = [];
const enrollments: string[] = [];
const reviewIds: string[] = [];
let enrollmentId: string;
const rgm = `9${Date.now()}`;
const asSession = (user: SessionUser, version = 0) => {
  session.user = { ...user, sessionVersion: version };
};

beforeAll(async () => {
  if (
    !/localhost|127\.0\.0\.1/.test(new URL(process.env.DATABASE_URL!).hostname)
  )
    throw new Error("Portal integration tests require a local database.");
  prisma = (await import("@/lib/prisma")).prisma;
  await prisma.$queryRaw`SELECT 1`;
  const make = async (role: "TUTOR" | "STUDENT") => {
    const user = await prisma.user.create({
      data: {
        role,
        email: `portal-test-${randomUUID()}@example.test`,
        name: "Aluno Teste Portal",
        passwordHash: "unused",
      },
    });
    users.push(user.id);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role,
      mustChangePassword: false,
      impersonator: null,
    } satisfies SessionUser;
  };
  tutor = await make("TUTOR");
  otherTutor = await make("TUTOR");
  student = await make("STUDENT");
  const enrollment = await prisma.studentEnrollment.create({
    data: {
      name: student.name,
      rgm,
      ownerId: tutor.id,
      studentUserId: student.id,
      courseName: "Administracao",
    },
  });
  enrollments.push(enrollment.id);
  enrollmentId = enrollment.id;
}, 20000);
afterAll(async () => {
  if (!prisma) return;
  const sources = await prisma.academicAnalysisSource.findMany({
    where: { enrollmentId: { in: enrollments } },
    select: { storageKey: true },
  });
  const storage = (await import("@/services/storage/storage")).getStorage();
  for (const source of sources)
    if (source.storageKey) await storage.delete(source.storageKey);
  await prisma.studentEnrollment.updateMany({
    where: { id: { in: enrollments } },
    data: { currentVersionId: null },
  });
  await prisma.academicAnalysisSource.deleteMany({
    where: { enrollmentId: { in: enrollments } },
  });
  await prisma.academicAnalysisVersion.updateMany({
    where: { enrollmentId: { in: enrollments } },
    data: { previousVersionId: null },
  });
  await prisma.academicAnalysisVersion.deleteMany({
    where: { enrollmentId: { in: enrollments } },
  });
  await prisma.academicGridReview.deleteMany({
    where: {
      OR: [{ enrollmentId: { in: enrollments } }, { id: { in: reviewIds } }],
    },
  });
  await prisma.studentEnrollment.deleteMany({
    where: { id: { in: enrollments } },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [{ userId: { in: users } }, { entityId: { in: enrollments } }],
    },
  });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}, 20000);

describe("Portal Acadêmico — banco real", () => {
  it("nega IDs de outros alunos, escopo de outro tutor e todas as permissões internas", async () => {
    const { requireEnrollment } =
      await import("@/services/student-portal/access");
    const { can } = await import("@/lib/rbac");
    expect((await requireEnrollment(student, enrollmentId)).id).toBe(
      enrollmentId,
    );
    await expect(requireEnrollment(student, randomUUID())).rejects.toThrow();
    await expect(requireEnrollment(otherTutor, enrollmentId)).rejects.toThrow();
    expect(can("STUDENT", "analysis:read")).toBe(false);
    expect(can("STUDENT", "analysis:review")).toBe(false);
    expect(can("STUDENT", "students:manage")).toBe(false);
    asSession(student);
    const { getSessionUser, requirePermission } = await import("@/lib/session");
    expect(await getSessionUser()).toBeNull();
    expect((await getSessionUser({ allowStudent: true }))?.id).toBe(student.id);
    await expect(requirePermission("analysis:delete")).rejects.toThrow();
  });
  it("dois envios concorrentes compartilham o job e publicam uma única versão", async () => {
    const { claimUpload, processUpload } =
      await import("@/services/student-portal/processing");
    const pdf = academicPdf(rgm);
    const claims = await Promise.all([
      claimUpload(tutor, enrollmentId, pdf, "tutor.pdf"),
      claimUpload(student, enrollmentId, pdf, "aluno-renomeado.pdf"),
    ]);
    expect(claims.filter((claim) => claim.run)).toHaveLength(1);
    expect(claims[0].source.id).toBe(claims[1].source.id);
    const claim = claims.find((value) => value.run)!;
    await processUpload(claim.source.id, claim.source.attempts, pdf);
    const job = await prisma.academicAnalysisSource.findUniqueOrThrow({
      where: { id: claim.source.id },
    });
    expect(job.errorMessage).toBeNull();
    expect(job.status).toBe("COMPLETED");
    expect(
      await prisma.academicAnalysisVersion.count({ where: { enrollmentId } }),
    ).toBe(1);
    expect(
      await prisma.academicGridReview.count({ where: { enrollmentId } }),
    ).toBe(1);
    const duplicate = await claimUpload(
      student,
      enrollmentId,
      pdf,
      "outro-nome.pdf",
    );
    expect(duplicate.run).toBe(false);
    expect(duplicate.duplicate).toBe(true);
  }, 20000);
  it("reutiliza metadata diferente antes da extração estruturada e snapshot igual não cria histórico", async () => {
    const { claimUpload, processUpload } =
      await import("@/services/student-portal/processing");
    const pdf = academicPdf(rgm, "A CURSAR", "different PDF metadata");
    const claim = await claimUpload(student, enrollmentId, pdf, "novo.pdf");
    await processUpload(claim.source.id, claim.source.attempts, pdf);
    const job = await prisma.academicAnalysisSource.findUniqueOrThrow({
      where: { id: claim.source.id },
    });
    expect(job.reused).toBe(true);
    expect(job.storageKey).toBeNull();
    const variant = academicPdf(rgm, "A CURSAR", "", "ALUNO TESTE PORTAL");
    const next = await claimUpload(
      student,
      enrollmentId,
      variant,
      "formatado.pdf",
    );
    await processUpload(next.source.id, next.source.attempts, variant);
    expect(
      (
        await prisma.academicAnalysisSource.findUniqueOrThrow({
          where: { id: next.source.id },
        })
      ).reused,
    ).toBe(true);
    expect(
      await prisma.academicAnalysisVersion.count({ where: { enrollmentId } }),
    ).toBe(1);
    expect(
      await prisma.academicGridReview.count({ where: { enrollmentId } }),
    ).toBe(1);
  }, 20000);
  it("mudança real cria V2, registra o tutor e mantém V1 imutável", async () => {
    const { claimUpload, processUpload } =
      await import("@/services/student-portal/processing");
    const pdf = academicPdf(rgm, "CURSANDO");
    const claim = await claimUpload(tutor, enrollmentId, pdf, "atualizado.pdf");
    await processUpload(claim.source.id, claim.source.attempts, pdf);
    const versions = await prisma.academicAnalysisVersion.findMany({
      where: { enrollmentId },
      orderBy: { version: "asc" },
    });
    expect(versions).toHaveLength(2);
    expect(versions[1].actorUserId).toBe(tutor.id);
    expect(versions[1].origin).toBe("TUTOR_UPLOAD");
    expect(versions[1].changeSummary).toContain(
      "Pendências anteriores: 1 → 0.",
    );
    expect(
      (versions[0].snapshot as { result: { previousPending: number } }).result
        .previousPending,
    ).toBe(1);
    expect(
      (
        await prisma.studentEnrollment.findUniqueOrThrow({
          where: { id: enrollmentId },
        })
      ).currentVersionId,
    ).toBe(versions[1].id);
  }, 20000);
  it("PDF de outro RGM ou curso e PDF corrompido não substituem a versão atual", async () => {
    const { claimUpload, processUpload } =
      await import("@/services/student-portal/processing");
    const before = await prisma.studentEnrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
    });
    for (const pdf of [
      academicPdf("outra-matricula"),
      academicPdf(rgm, "A CURSAR", "", "Aluno Teste Portal", "Pedagogia"),
      Buffer.from("%PDF-corrompido"),
    ]) {
      const claim = await claimUpload(
        student,
        enrollmentId,
        pdf,
        "extrato.pdf",
      );
      await processUpload(claim.source.id, claim.source.attempts, pdf);
      expect(
        (
          await prisma.academicAnalysisSource.findUniqueOrThrow({
            where: { id: claim.source.id },
          })
        ).status,
      ).toBe("FAILED");
    }
    expect(
      (
        await prisma.studentEnrollment.findUniqueOrThrow({
          where: { id: enrollmentId },
        })
      ).currentVersionId,
    ).toBe(before.currentVersionId);
  }, 20000);
  it("correção manual usa o motor existente, preserva versão anterior e bloqueia aluno", async () => {
    const current = await prisma.studentEnrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
      include: { currentVersion: true },
    });
    const { updateAcademicGridFieldAction } =
      await import("@/features/academic-analysis/actions");
    asSession(student);
    expect(
      (
        await updateAcademicGridFieldAction({
          reviewId: current.currentVersion!.reviewId,
          disciplineIndex: 0,
          field: "originalStatus",
          value: "AE",
        })
      ).ok,
    ).toBe(false);
    asSession(tutor);
    expect(
      (
        await updateAcademicGridFieldAction({
          reviewId: current.currentVersion!.reviewId,
          disciplineIndex: 0,
          field: "originalStatus",
          value: "AE",
        })
      ).ok,
    ).toBe(true);
    const next = await prisma.studentEnrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
      include: { currentVersion: true },
    });
    expect(next.currentVersion?.version).toBe(3);
    expect(next.currentVersion?.origin).toBe("TUTOR_MANUAL_CORRECTION");
    expect(next.currentVersion?.actorUserId).toBe(tutor.id);
    const count = await prisma.academicAnalysisVersion.count({
      where: { enrollmentId },
    });
    await updateAcademicGridFieldAction({
      reviewId: next.currentVersion!.reviewId,
      disciplineIndex: 0,
      field: "originalStatus",
      value: "AE",
    });
    expect(
      await prisma.academicAnalysisVersion.count({ where: { enrollmentId } }),
    ).toBe(count);
  });
  it("bloqueio é imediato, reativação não revive sessões antigas e o histórico permanece", async () => {
    const { studentAccessAction } =
      await import("@/features/student-portal/actions");
    const { getSessionUser } = await import("@/lib/session");
    asSession(tutor);
    expect(
      (
        await studentAccessAction({
          enrollmentId,
          action: "BLOCK",
          confirmed: true,
        })
      ).ok,
    ).toBe(true);
    asSession(student);
    expect(await getSessionUser({ allowStudent: true })).toBeNull();
    asSession(tutor);
    expect(
      (
        await studentAccessAction({
          enrollmentId,
          action: "ACTIVATE",
          confirmed: true,
        })
      ).ok,
    ).toBe(true);
    asSession(student);
    expect(await getSessionUser({ allowStudent: true })).toBeNull();
    asSession(student, 2);
    expect((await getSessionUser({ allowStudent: true }))?.id).toBe(student.id);
    expect(
      await prisma.academicAnalysisVersion.count({ where: { enrollmentId } }),
    ).toBe(3);
  });
  it("convite sem SMTP gera link temporário, senha não recuperável e token de uso único", async () => {
    const { createStudentAction } =
      await import("@/features/student-portal/actions");
    asSession(tutor);
    const newRgm = `${rgm}1`;
    const email = `portal-test-${randomUUID()}@example.test`;
    const result = await createStudentAction({
      name: "Nova Aluna",
      rgm: newRgm,
      email,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    enrollments.push(result.data.enrollmentId);
    const enrollment = await prisma.studentEnrollment.findUniqueOrThrow({
      where: { id: result.data.enrollmentId },
      include: { studentUser: true },
    });
    users.push(enrollment.studentUserId!);
    expect(enrollment.studentUser?.role).toBe("STUDENT");
    expect(enrollment.studentUser?.initialPasswordEncrypted).toBeNull();
    expect(enrollment.studentUser?.mustChangePassword).toBe(true);
    const token = new URL(result.data.link!).searchParams.get("token")!;
    const { consumePasswordToken } =
      await import("@/features/users/password-tokens");
    expect((await consumePasswordToken(token, "NovaSenhaSegura123!")).ok).toBe(
      true,
    );
    expect((await consumePasswordToken(token, "OutraSenhaSegura123!")).ok).toBe(
      false,
    );
    expect(
      (
        await prisma.user.findUniqueOrThrow({
          where: { id: enrollment.studentUserId! },
        })
      ).mustChangePassword,
    ).toBe(false);
    const duplicate = await createStudentAction({
      name: "Nova Aluna",
      rgm: newRgm,
      email,
    });
    expect(duplicate.ok && duplicate.data.duplicate).toBe(true);
  });
  it("vincula análises legadas por RGM exato e conserva o histórico sem duplicatas", async () => {
    const { parsePdf } = await import("@/services/pdf/parser");
    const { extractAcademicGrid } =
      await import("@/services/academic-analysis/extract");
    const { sha256 } = await import("@/services/student-portal/fingerprints");
    const { ensureEnrollment } =
      await import("@/services/student-portal/enrollments");
    const oldRgm = `${rgm}2`;
    const pdf = academicPdf(oldRgm);
    const snapshot = extractAcademicGrid(
      await parsePdf(pdf, { maxPages: 5 }),
      "antigo.pdf",
    );
    for (let i = 0; i < 2; i++) {
      const review = await prisma.academicGridReview.create({
        data: {
          createdById: tutor.id,
          studentName: snapshot.studentName,
          rgm: oldRgm,
          courseName: snapshot.courseName,
          currentPeriod: 3,
          sourceFilename: "antigo.pdf",
          sourceSha256: sha256(pdf),
          sourcePageCount: 1,
          status: snapshot.result.status,
          snapshot: JSON.parse(JSON.stringify(snapshot)),
        },
      });
      reviewIds.push(review.id);
    }
    const enrollment = await ensureEnrollment(tutor, {
      rgm: oldRgm,
      name: "Aluno Teste Portal",
      courseName: "Administracao",
    });
    enrollments.push(enrollment.id);
    expect(
      await prisma.academicGridReview.count({
        where: { enrollmentId: enrollment.id },
      }),
    ).toBe(2);
    expect(
      await prisma.academicAnalysisVersion.count({
        where: { enrollmentId: enrollment.id },
      }),
    ).toBe(1);
    await expect(
      ensureEnrollment(otherTutor, { rgm: oldRgm, name: "Aluno Teste Portal" }),
    ).rejects.toThrow();
  });
  it("protege APIs de status e PDF mesmo com IDs conhecidos e nega execução de upload interno", async () => {
    const statusRoute = await import("@/app/api/portal/status/route");
    const documentRoute = await import("@/app/api/portal/document/[id]/route");
    const internalUpload =
      await import("@/app/api/academic-analysis/upload/route");
    const source = await prisma.academicAnalysisSource.findFirstOrThrow({
      where: { enrollmentId, storageKey: { not: null } },
    });
    asSession(student, 2);
    expect(
      (
        await statusRoute.GET(
          new Request(
            `http://localhost:3000/api/portal/status?enrollmentId=${enrollmentId}`,
          ),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await statusRoute.GET(
          new Request(
            `http://localhost:3000/api/portal/status?enrollmentId=${randomUUID()}`,
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await documentRoute.GET(new Request("http://localhost"), {
          params: Promise.resolve({ id: source.id }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await internalUpload.POST(
          new Request("http://localhost:3000/api/academic-analysis/upload", {
            method: "POST",
          }),
        )
      ).status,
    ).toBe(401);
    asSession(otherTutor);
    expect(
      (
        await documentRoute.GET(new Request("http://localhost"), {
          params: Promise.resolve({ id: source.id }),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await statusRoute.GET(
          new Request(
            `http://localhost:3000/api/portal/status?enrollmentId=${enrollmentId}`,
          ),
        )
      ).status,
    ).toBe(403);
  });

  it("retoma job interrompido sem permitir publicação pela tentativa antiga", async () => {
    const { claimUpload, processUpload, STALE_JOB_MS } =
      await import("@/services/student-portal/processing");
    const pdf = academicPdf(rgm, "APROVADO", "retry test");
    const first = await claimUpload(tutor, enrollmentId, pdf, "retomada.pdf");
    await prisma.academicAnalysisSource.update({
      where: { id: first.source.id },
      data: { updatedAt: new Date(Date.now() - STALE_JOB_MS - 1000) },
    });
    const retry = await claimUpload(student, enrollmentId, pdf, "retomada.pdf");
    expect(retry.run).toBe(true);
    expect(retry.source.attempts).toBe(2);
    await processUpload(first.source.id, first.source.attempts, pdf);
    expect(
      (
        await prisma.academicAnalysisSource.findUniqueOrThrow({
          where: { id: first.source.id },
        })
      ).status,
    ).toBe("PROCESSING");
    await processUpload(retry.source.id, retry.source.attempts, pdf);
    expect(
      (
        await prisma.academicAnalysisSource.findUniqueOrThrow({
          where: { id: first.source.id },
        })
      ).status,
    ).toBe("COMPLETED");
  });

  it("banco aplica RLS e índice parcial que impedem exposição e processamento concorrente", async () => {
    const flags = await prisma.$queryRaw<
      Array<{ relrowsecurity: boolean }>
    >`SELECT relrowsecurity FROM pg_class WHERE relname IN ('StudentEnrollment', 'AcademicAnalysisVersion', 'AcademicAnalysisSource')`;
    expect(flags).toHaveLength(3);
    expect(flags.every((row) => row.relrowsecurity)).toBe(true);
    const first = await prisma.academicAnalysisSource.create({
      data: {
        enrollmentId,
        sourceFileHash: "b".repeat(64),
        filename: "index-test.pdf",
        actorUserId: tutor.id,
        actorRole: "TUTOR",
      },
    });
    await expect(
      prisma.academicAnalysisSource.create({
        data: {
          enrollmentId,
          sourceFileHash: "c".repeat(64),
          filename: "race.pdf",
          actorUserId: student.id,
          actorRole: "STUDENT",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await prisma.academicAnalysisSource.delete({ where: { id: first.id } });
  });

  it("rejeita múltiplos PDFs em qualquer campo multipart para aluno, tutor e admin", async () => {
    const adminUser = await prisma.user.create({ data: { role: "ADMIN", email: `academic-admin-${randomUUID()}@example.test`, name: "Admin Teste", passwordHash: "unused" } });
    users.push(adminUser.id);
    const admin = { ...tutor, id: adminUser.id, role: "ADMIN" as const, email: adminUser.email };
    const { handleAcademicUpload } = await import("@/services/student-portal/upload-handler");
    for (const actor of [student, tutor, admin]) {
      const account = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
      asSession(actor, account.sessionVersion);
      for (const secondKey of ["file", "complementaryDocument"]) {
        const form = new FormData();
        form.append("file", new File([academicPdf(rgm)], "a.pdf", { type: "application/pdf" }));
        form.append(secondKey, new File([academicPdf(rgm)], "b.pdf", { type: "application/pdf" }));
        form.set("enrollmentId", enrollmentId); form.set("confirmUpdatedTranscript", "true");
        const response = await handleAcademicUpload(new Request("http://localhost:3000/api/portal/upload", { method: "POST", body: form }));
        expect(response.status).toBe(422);
        expect((await response.json()).error).toContain("apenas 1");
      }
    }
  });

  it("Extrato → Simples → Oficial mantém versão, preserva mapeamento e promove fonte oficial", async () => {
    const { claimUpload, processUpload } = await import("@/services/student-portal/processing");
    const code = `${rgm}77`;
    const enrollment = await prisma.studentEnrollment.create({ data: { rgm: code, name: student.name, ownerId: tutor.id, studentUserId: student.id, courseName: "Administracao" } });
    enrollments.push(enrollment.id);
    const upload = async (pdf: Buffer, name: string) => { const claim = await claimUpload(student, enrollment.id, pdf, name); if (claim.run) await processUpload(claim.source.id, claim.source.attempts, pdf); return prisma.academicAnalysisSource.findUniqueOrThrow({ where: { id: claim.source.id }, include: { requests: true } }); };
    const extract = await upload(academicPdf(code), "base.pdf");
    const simple = await upload(academicHistoryPdf(code), "simples.pdf");
    const official = await upload(academicHistoryPdf(code, true), "oficial.pdf");
    expect(simple.status).toBe("COMPLETED");
    expect(official.status).toBe("COMPLETED");
    expect(simple.versionId).toBe(extract.versionId);
    expect(official.versionId).toBe(extract.versionId);
    expect(official.requests[0].status).toBe("NO_CHANGES");
    expect(await prisma.academicAnalysisVersion.count({ where: { enrollmentId: enrollment.id } })).toBe(1);
    const current = await prisma.academicAnalysisVersion.findUniqueOrThrow({ where: { id: extract.versionId! } });
    expect(current.preferredSourceId).toBe(official.id);
    const snapshot = current.snapshot as unknown as import("@/domain/academic-analysis/types").AcademicGridSnapshot;
    expect(snapshot.disciplines.map(r => r.period)).toEqual([1, 3, 2]);
    const beforeCount = await prisma.academicRequest.count({ where: { sourceDocument: { enrollmentId: enrollment.id } } });
    for (let i = 0; i < 5; i++) expect((await claimUpload(student, enrollment.id, academicHistoryPdf(code, true), `renamed-${i}.pdf`)).duplicate).toBe(true);
    expect(await prisma.academicRequest.count({ where: { sourceDocument: { enrollmentId: enrollment.id } } })).toBe(beforeCount);
    const changed = await upload(academicHistoryPdf(code, true, true), "nova-aprovacao.pdf");
    expect(changed.versionId).not.toBe(extract.versionId);
    expect(changed.requests[0].createdVersion).toBe(true);
    expect(await prisma.academicAnalysisVersion.count({ where: { enrollmentId: enrollment.id } })).toBe(2);
    const { reviewAcademicRequest } = await import("@/services/academic-documents/requests");
    await expect(reviewAcademicRequest(otherTutor, changed.requests[0].id, "REJECT")).rejects.toThrow();
    await expect(reviewAcademicRequest(student, changed.requests[0].id, "REJECT")).rejects.toThrow();
    await reviewAcademicRequest(tutor, changed.requests[0].id, "REJECT", "Documento inadequado.");
    expect((await prisma.studentEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).currentVersionId).toBe(extract.versionId);
    await expect(claimUpload(student, enrollment.id, academicHistoryPdf(code, true, true), "mesmo-recusado.pdf")).rejects.toThrow("recusado");
    const replacement = await upload(academicHistoryPdf(code, true, true, "new-request"), "corrigido.pdf");
    expect(replacement.requests[0].previousRequestId).toBe(changed.requests[0].id);
    expect(replacement.requests[0].sourceDocumentId).not.toBe(changed.id);
    expect(await prisma.academicAnalysisVersion.count({ where: { enrollmentId: enrollment.id } })).toBe(3);
    expect(await prisma.academicRequest.count({ where: { sourceDocument: { enrollmentId: enrollment.id }, aiUsed: true } })).toBe(0);
  });

  it("histórico sem grade publica dados seguros em revisão e rejeita RGM/curso/UNKNOWN", async () => {
    const { claimUpload, processUpload } = await import("@/services/student-portal/processing");
    const code = `${rgm}88`;
    const enrollment = await prisma.studentEnrollment.create({ data: { rgm: code, name: student.name, ownerId: tutor.id, studentUserId: student.id, courseName: "Administracao" } });
    enrollments.push(enrollment.id);
    const pdf = academicHistoryPdf(code);
    const claim = await claimUpload(tutor, enrollment.id, pdf, "qualquer-nome.pdf");
    await processUpload(claim.source.id, claim.source.attempts, pdf);
    const source = await prisma.academicAnalysisSource.findUniqueOrThrow({ where: { id: claim.source.id }, include: { requests: true, version: true } });
    expect(source.requests[0].status).toBe("UNDER_REVIEW");
    const snapshot = source.version!.snapshot as unknown as import("@/domain/academic-analysis/types").AcademicGridSnapshot;
    expect(snapshot.disciplines.every(r => r.period === null)).toBe(true);
    expect(snapshot.result.currentPeriod).toBeNull();
    const { reviewAcademicRequest } = await import("@/services/academic-documents/requests");
    await expect(reviewAcademicRequest(tutor, source.requests[0].id, "CONCLUDE")).rejects.toThrow("mapeamento");
    for (const invalid of [academicHistoryPdf("outro-rgm"), academicPdf(code, "A CURSAR", "", student.name, "Outro curso"), selectablePdf([[20, 780, "PDF sem dados academicos"]])]) {
      const bad = await claimUpload(student, enrollment.id, invalid, "invalido.pdf");
      await processUpload(bad.source.id, bad.source.attempts, invalid);
      expect((await prisma.academicAnalysisSource.findUniqueOrThrow({ where: { id: bad.source.id } })).status).toBe("FAILED");
      expect((await prisma.studentEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).currentVersionId).toBe(source.versionId);
    }
    const storage = (await import("@/services/storage/storage")).getStorage();
    expect(await storage.read(source.storageKey!)).toEqual(pdf);
    const flags = await prisma.$queryRaw<Array<{ relrowsecurity: boolean }>>`SELECT relrowsecurity FROM pg_class WHERE relname = 'AcademicRequest'`;
    expect(flags[0].relrowsecurity).toBe(true);
  });

});
