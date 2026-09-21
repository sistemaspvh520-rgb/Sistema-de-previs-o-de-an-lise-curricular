# DEPLOY — Vercel + Supabase

Produção roda na **Vercel** (Next.js, região `gru1`) com **Supabase** (Postgres 17 + Storage privado para os PDFs).

| Recurso | Identificação |
|---------|---------------|
| Projeto Supabase | `Sistema de previsão de análise curricular` · ref `gflvyhutqhfrfpdpcgii` · `sa-east-1` |
| Projeto Vercel | `analise-curricular` · time `Sistemas PVH` · conectado ao GitHub `main` |
| Storage | bucket privado `documents` (criado automaticamente no primeiro upload) |

## Variáveis de ambiente (Vercel → Settings → Environment Variables → Production)

Já configuradas via CLI: `AUTH_SECRET`, `AUTH_TRUST_HOST`, `APP_ENCRYPTION_KEY`, `APP_ENCRYPTION_KEY_VERSION`, `CRON_SECRET`,
`STORAGE_DRIVER=supabase`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET`, `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`.

**Faltam duas, que contêm a senha do banco** (Supabase → *Connect* → ORMs → Prisma):

```
DATABASE_URL = postgresql://postgres.gflvyhutqhfrfpdpcgii:[SENHA]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL   = postgresql://postgres.gflvyhutqhfrfpdpcgii:[SENHA]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
```

- `DATABASE_URL` = **Transaction pooler (6543)** — usado pelo app (serverless).
- `DIRECT_URL` = **Session pooler (5432)** — usado por `prisma migrate deploy` e pelo seed durante o build.
- Copie os hosts exatos da tela *Connect* do Supabase (pode ser `aws-1-…` em projetos novos). Se a senha tiver caracteres especiais, faça URL-encode.
- Se esqueceu a senha: Supabase → Settings → Database → *Reset database password*.

## Estado do banco no Supabase (feito em 21/09/2026)

Aplicado via `supabase db query --linked` (Management API, sem senha do banco):

- 4 migrações do Prisma aplicadas e registradas em `_prisma_migrations` com os checksums originais — `prisma migrate deploy` reconhece o histórico;
- seed aplicado (`npm run seed:sql` gera o SQL idempotente: ADMIN, regras v1.0, configurações, integração OpenAI);
- **RLS ativado em todas as 22 tabelas** e `REVOKE` para `anon`/`authenticated` (`prisma/supabase-rls.sql`) — o app usa a role `postgres` via Prisma; a Data API pública não expõe nada;
- bucket privado `documents` criado (limite 50 MB, somente `application/pdf`).

Após criar uma nova migração no futuro: `supabase db query -f prisma/migrations/<nova>/migration.sql --linked`, registrar em `_prisma_migrations` (ou deixar o `vercel-build` fazer isso com `DIRECT_URL` configurada) e reexecutar `prisma/supabase-rls.sql`.

## O que acontece no deploy

`npm run vercel-build` (`scripts/vercel-build.mjs`) executa:

1. se `DIRECT_URL`/`DATABASE_URL` existirem: `prisma migrate deploy` + `tsx prisma/seed.ts` (idempotente);
2. `prisma generate` + `next build` — o build **não** depende do banco; o app só exige `DATABASE_URL` em runtime.

Cron de retenção LGPD: `vercel.json` agenda `GET /api/cron/retention` diariamente às 03:00 UTC; a Vercel envia `Authorization: Bearer CRON_SECRET` automaticamente.

## Primeiro acesso

1. Abra a URL de produção e entre com `ADMIN_EMAIL` / `ADMIN_PASSWORD`. **Troque a senha** em Configurações → Usuários.
2. Configurações → OpenAI → *Conectar OpenAI* com a chave do projeto dedicado.
3. Configurações → Privacidade: confirme a retenção e o modo de envio à IA.
4. Nova análise → envie um PDF real.

## Limites e observações

- Funções: `maxDuration = 300 s` nas rotas de upload/reprocessamento. O pipeline roda em `after()`; se a OpenAI demorar mais que isso, a análise fica em `AI_ERROR` e pode ser retomada com *Tentar novamente* (ver A1 em `IMPROVEMENT_REPORT.md` — fila durável).
- O Storage do Supabase substitui o disco local (`STORAGE_DRIVER=supabase`). Em desenvolvimento continue com `local`.
- Segurança do Supabase: o app usa **somente** a chave secreta no servidor (bypass de RLS). O banco é acessado via Prisma, não pela Data API; não exponha o schema `public` na Data API se não for usar.
- Redeploy manual: `npx vercel --prod --scope sistemas-pvh` ou botão *Redeploy* na Vercel.

## Desenvolvimento local continua igual

`docker compose up -d db` · `npm run db:migrate` · `npm run db:seed` · `npm run dev` (ver README).
