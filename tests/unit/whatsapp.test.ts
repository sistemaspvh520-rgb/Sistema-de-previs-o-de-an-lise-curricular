import { describe, expect, it } from "vitest";
import { formatWhatsapp, normalizeWhatsapp, whatsappUrl } from "@/lib/whatsapp";

describe("WhatsApp", () => {
  it("normaliza números brasileiros com ou sem DDI", () => {
    expect(normalizeWhatsapp("(69) 99999-0000")).toBe("5569999990000");
    expect(normalizeWhatsapp("+55 69 3222-1100")).toBe("556932221100");
    expect(normalizeWhatsapp("069 99999-0000")).toBe("5569999990000");
    expect(normalizeWhatsapp("12345")).toBeNull();
    expect(normalizeWhatsapp(null)).toBeNull();
  });
  it("monta o link com mensagem codificada e formata para exibição", () => {
    expect(whatsappUrl("69 99999-0000", "Olá, sou João")).toBe("https://wa.me/5569999990000?text=Ol%C3%A1%2C%20sou%20Jo%C3%A3o");
    expect(whatsappUrl("")).toBeNull();
    expect(formatWhatsapp("5569999990000")).toBe("(69) 99999-0000");
  });
});
