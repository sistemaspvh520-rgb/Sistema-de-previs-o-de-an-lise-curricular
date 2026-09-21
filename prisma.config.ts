import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // CLI (migrate/seed) usa a conexão direta quando disponível; o runtime usa DATABASE_URL (pooler).
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
