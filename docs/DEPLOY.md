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

## O que acontece no deploy

`npm run vercel-build` executa, nesta ordem:

1. `prisma migrate deploy` — aplica as migrações em `prisma/migrations` (via `DIRECT_URL`);
2. `tsx prisma/seed.ts` — idempotente: cria o ADMIN (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) se não existir, as regras v1.0 e as configurações padrão;
3. `prisma generate` + `next build`.

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
