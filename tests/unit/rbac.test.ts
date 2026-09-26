import { describe, expect, it } from "vitest";
import { can, ROUTE_PERMISSIONS } from "@/lib/rbac";

describe("RBAC", () => {
  it("ADMIN tem todas as permissões", () => {
    expect(can("ADMIN", "integration:manage")).toBe(true);
    expect(can("ADMIN", "users:manage")).toBe(true);
    expect(can("ADMIN", "analysis:create")).toBe(true);
    expect(can("ADMIN", "analysis:delete")).toBe(true);
  });
  it("ANALYST opera análises mas não configura sistema", () => {
    expect(can("ANALYST", "analysis:create")).toBe(true);
    expect(can("ANALYST", "analysis:review")).toBe(true);
    expect(can("ANALYST", "analysis:summary")).toBe(true);
    expect(can("ANALYST", "integration:manage")).toBe(false);
    expect(can("ANALYST", "users:manage")).toBe(false);
    expect(can("ANALYST", "users:manage")).toBe(false);
    expect(can("ANALYST", "analysis:delete")).toBe(false);
  });
  it("ANALYST não acessa a área acadêmica", () => {
    expect(can("ANALYST", "academic:manage")).toBe(false);
    expect(can("ANALYST", "students:manage")).toBe(false);
    const academic = ROUTE_PERMISSIONS.find((r) => r.prefix === "/academic-analysis");
    expect(can("ANALYST", academic!.permission)).toBe(false);
    const reviews = ROUTE_PERMISSIONS.find((r) => r.prefix === "/reviews");
    expect(can("ANALYST", reviews!.permission)).toBe(true);
  });
  it("TUTOR tem o acesso do analista e a área acadêmica", () => {
    for (const permission of ["analysis:create", "analysis:review", "analysis:summary", "academic:manage", "students:manage"] as const)
      expect(can("TUTOR", permission)).toBe(true);
    expect(can("TUTOR", "users:manage")).toBe(false);
    expect(can("TUTOR", "analysis:delete")).toBe(false);
    expect(can("ADMIN", "academic:manage")).toBe(true);
  });
  it("Coordenação acadêmica vê a área acadêmica de todos os polos, sem administrar o sistema", () => {
    for (const permission of ["academic:all", "academic:manage", "students:manage", "analysis:create", "analysis:review"] as const)
      expect(can("ACADEMIC_COORDINATOR", permission)).toBe(true);
    for (const permission of ["users:manage", "integration:manage", "privacy:manage", "audit:read", "analysis:delete"] as const)
      expect(can("ACADEMIC_COORDINATOR", permission)).toBe(false);
    expect(can("TUTOR", "academic:all")).toBe(false);
  });
  it("VIEWER só lê", () => {
    expect(can("VIEWER", "analysis:read")).toBe(true);
    expect(can("VIEWER", "analysis:create")).toBe(false);
    expect(can("VIEWER", "analysis:review")).toBe(false);
    expect(can("VIEWER", "analysis:delete")).toBe(false);
  });
  it("sem perfil nega tudo", () => expect(can(undefined, "analysis:read")).toBe(false));
  it("rotas sensíveis exigem permissão de admin", () => {
    const openai = ROUTE_PERMISSIONS.find((r) => r.prefix === "/settings/openai");
    expect(openai?.permission).toBe("integration:manage");
    expect(can("ANALYST", openai!.permission)).toBe(false);
  });
});
