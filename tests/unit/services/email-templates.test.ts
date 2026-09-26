import { describe, expect, it } from "vitest";
import { inviteEmail, resetEmail, temporaryPasswordEmail } from "@/services/email/templates";

describe("templates de e-mail", () => {
  it("convite contém link, login e validade — e nenhuma senha", () => {
    const m = inviteEmail({ name: "Laura Maria", login: "laura@x.edu.br", url: "https://app/definir-senha?token=abc", invitedBy: "João", validDays: 7, institution: "Cruzeiro do Sul Virtual" });
    expect(m.subject).toMatch(/conta/i);
    expect(m.html).toContain("https://app/definir-senha?token=abc");
    expect(m.html).toContain("laura@x.edu.br");
    expect(m.html).toContain("7 dias");
    expect(m.html).not.toMatch(/senha tempor/i);
    expect(m.text).toContain("https://app/definir-senha?token=abc");
    expect(m.html).toContain("<!doctype html>");
    expect(m.html).toContain("/brand/logo-email.png");
    expect(m.html).not.toContain("cid:");
    expect(m.html).toContain("Sistema de Análise Curricular Inteligente");
  });
  it("redefinição informa validade em minutos", () => {
    const m = resetEmail({ name: "JOEL SILVA", login: "joel@x", url: "https://app/definir-senha?token=t", validMinutes: 60, institution: "Cruzeiro" });
    expect(m.html).toContain("60 minutos");
    expect(m.html).toContain("Joel, vamos redefinir sua senha");
    expect(m.text).toContain("token=t");
  });
  it("escapa HTML em campos dinâmicos", () => {
    const m = temporaryPasswordEmail({ name: "<b>x</b>", login: "a@b", password: "CZS-abc", loginUrl: "https://app/login", institution: "I" });
    expect(m.html).not.toContain("<b>x</b>");
    expect(m.html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(m.html).toContain("CZS-abc");
  });
});
