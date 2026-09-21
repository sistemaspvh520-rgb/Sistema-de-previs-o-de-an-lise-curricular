// Build na Vercel: migra e semeia apenas quando há conexão direta configurada;
// caso contrário (migrações já aplicadas por outro meio, ex.: supabase db query), só gera o client e compila.
import { execSync } from "node:child_process";
const run = (cmd) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
};
if (process.env.DIRECT_URL || process.env.DATABASE_URL) {
  run("prisma migrate deploy");
  run("tsx prisma/seed.ts");
} else {
  console.log("DIRECT_URL/DATABASE_URL ausentes: pulando migrate/seed (o app exige DATABASE_URL em runtime).");
}
run("prisma generate");
run("next build");
