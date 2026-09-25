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
