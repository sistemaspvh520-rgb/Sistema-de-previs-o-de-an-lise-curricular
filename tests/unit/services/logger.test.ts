import { describe, expect, it } from "vitest";
import { redact } from "@/lib/logger";

describe("redação de logs", () => {
  it("mascara API keys, CPF, RG e telefone", () => {
    const out = redact("chave sk-proj-abcdefghijklmnop123456 cpf 123.456.789-09 tel (11) 91234-5678") as string;
    expect(out).not.toContain("sk-proj-abcdefghijklmnop123456");
    expect(out).not.toContain("123.456.789-09");
    expect(out).toContain("***CPF***");
    expect(out).toContain("***TEL***");
  });
  it("mascara campos sensíveis por nome", () => {
    const out = redact({ apiKey: "sk-x", nested: { password: "p", ok: "visível" } }) as Record<string, unknown>;
    expect(out.apiKey).toBe("***REDACTED***");
    expect((out.nested as Record<string, unknown>).password).toBe("***REDACTED***");
    expect((out.nested as Record<string, unknown>).ok).toBe("visível");
  });
});
