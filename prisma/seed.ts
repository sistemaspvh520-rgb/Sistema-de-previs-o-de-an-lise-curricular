import "dotenv/config";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "@node-rs/argon2";
import { RULE_DEFINITIONS } from "../src/domain/curricular-analysis/rules/types";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "admin@cruzeirodosul.local").toLowerCase();
  const name = process.env.ADMIN_NAME ?? "Administrador";
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error("ADMIN_PASSWORD (mín. 8 caracteres) é obrigatório para o seed.");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    const passwordHash = await hash(password);
    await prisma.user.create({ data: { email, name, passwordHash, role: "ADMIN" } });
    console.log(`Usuário ADMIN criado: ${email}`);
  } else {
    console.log(`Usuário ADMIN já existe: ${email}`);
  }

  const active = await prisma.ruleSetVersion.findFirst({ where: { isActive: true } });
  if (!active) {
    await prisma.ruleSetVersion.create({
      data: {
        version: "1.0",
        isActive: true,
        notes: "Conjunto inicial de regras (seed).",
        rules: {
          create: RULE_DEFINITIONS.map((d) => ({
            key: d.key,
            valueType: d.valueType,
            value: d.defaultValue === null ? Prisma.JsonNull : (d.defaultValue as Prisma.InputJsonValue),
            status: d.status,
            description: d.description,
          })),
        },
      },
    });
    console.log("RuleSetVersion 1.0 criada.");
  }

  const defaults: Array<{ key: string; value: unknown }> = [
    { key: "retentionPolicy", value: "DAYS_90" },
    // Texto extraído e redigido evita enviar o PDF completo duas vezes à API.
    { key: "aiPrivacyMode", value: "REDACTED_TEXT" },
    { key: "institutionName", value: "Universidade Cruzeiro do Sul Virtual" },
    { key: "maxUploadMb", value: 20 },
    { key: "maxPdfPages", value: 60 },
  ];
  for (const s of defaults) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      create: { key: s.key, value: s.value as never },
      update: {},
    });
  }

  await prisma.openAIIntegration.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
  console.log("Configurações padrão garantidas.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
