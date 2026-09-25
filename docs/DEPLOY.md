# DEPLOY — Vercel + Supabase

Produção roda na **Vercel** (Next.js, região `gru1`) com **Supabase** (Postgres 17 + Storage privado para os PDFs).

| Recurso          | Identificação                                                                                                                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projeto Supabase | `Sistema de previsão de análise curricular` · ref `gflvyhutqhfrfpdpcgii` · `sa-east-1`                                                                                                                                                   |
| Projeto Vercel   | `analise-curricular` · time `Sistemas PVH` · conectado ao GitHub `main` · **URL pública: https://analise-curricular.vercel.app** · Deployment Protection (Vercel Authentication e Password Protection) desativada em 25/09/2026 — deployments por branch/preview (`https://analise-curricular-git-<branch>-sistemas-pvh.vercel.app`) também ficam acessíveis sem login na Vercel |
| Storage          | bucket privado `documents` (criado automaticamente no primeiro upload)                                                                                                                                                                   |

## Variáveis de ambiente (Vercel → Settings → Environment Variables → Production)

Já configuradas via CLI: `AUTH_SECRET`, `AUTH_TRUST_HOST`, `APP_ENCRYPTION_KEY`, `APP_ENCRYPTION_KEY_VERSION`, `CRON_SECRET`,
`STORAGE_DRIVER=supabase`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET`, `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`.

**Faltam duas, que contêm a senha do banco** (Supabase → _Connect_ → ORMs → Prisma):

```
DATABASE_URL = postgresql://postgres.gflvyhutqhfrfpdpcgii:[SENHA]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL   = postgresql://postgres.gflvyhutqhfrfpdpcgii:[SENHA]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
```

- `DATABASE_URL` = **Transaction pooler (6543)** — usado pelo app (serverless).
- `DIRECT_URL` = **Session pooler (5432)** — usado por `prisma migrate deploy` e pelo seed durante o build.
- Copie os hosts exatos da tela _Connect_ do Supabase (pode ser `aws-1-…` em projetos novos). Se a senha tiver caracteres especiais, faça URL-encode.
- Se esqueceu a senha: Supabase → Settings → Database → _Reset database password_.

## Estado do banco no Supabase (feito em 21/09/2026)

Aplicado via `supabase db query --linked` (Management API, sem senha do banco):

- 4 migrações do Prisma aplicadas e registradas em `_prisma_migrations` com os checksums originais — `prisma migrate deploy` reconhece o histórico;
- seed aplicado (`npm run seed:sql` gera o SQL idempotente: ADMIN, regras v1.0, configurações, integração OpenAI);
- **RLS ativado em todas as 22 tabelas** e `REVOKE` para `anon`/`authenticated` (`prisma/supabase-rls.sql`) — o app usa a role `postgres` via Prisma; a Data API pública não expõe nada;
- bucket privado `documents` criado (limite 50 MB, somente `application/pdf`).

Após criar uma nova migração no futuro: `supabase db query -f prisma/migrations/<nova>/migration.sql --linked`, registrar em `_prisma_migrations` (ou deixar o `vercel-build` fazer isso com `DIRECT_URL` configurada) e reexecutar `prisma/supabase-rls.sql`.

## E-mail (convites e redefinição de senha)

Remetente: `cruzeirogpt@gmail.com` via SMTP do Google (`EMAIL_USER`, `EMAIL_FROM`, `APP_URL` já configurados na Vercel).
Falta **`EMAIL_APP_PASSWORD`** — senha de app da conta Google, que só o responsável deve cadastrar:

1. Entre em `cruzeirogpt@gmail.com` → myaccount.google.com → Segurança → ative a **Verificação em duas etapas**.
2. Em myaccount.google.com/apppasswords crie uma senha de app (nome: "Análise Curricular"). Copie os 16 caracteres.
3. Vercel → analise-curricular → Settings → Environment Variables → `EMAIL_APP_PASSWORD` (Production) → Redeploy.

Sem essa variável o sistema funciona normalmente, mas convites/links ficam desativados (aviso na tela de Usuários) e o admin repassa a senha temporária. Limite do Gmail: ~500 e-mails/dia.

## Senhas, primeiro acesso e "Acessar como"

- Contas novas recebem **senha temporária** (cifrada com `APP_ENCRYPTION_KEY`) e um **convite por e-mail** com link (7 dias) para definir a senha oficial. O ADMIN vê/copia a temporária até o primeiro acesso; depois ela é apagada.
- Todo usuário com senha temporária é obrigado a definir a própria senha ao entrar (`/settings/account`).
- Redefinição: o ADMIN gera nova temporária ou envia link (60 min); o usuário também pode usar "Esqueci minha senha".
- **Acessar como**: o ADMIN entra na conta de qualquer usuário para suporte (faixa amarela no topo, botão Encerrar). Registrado na Auditoria; o usuário não é notificado.
- Rotação de `APP_ENCRYPTION_KEY` em 21/09/2026: variáveis "sensíveis" da Vercel não podem ser lidas de volta; como nada estava cifrado, a chave foi trocada e as 14 senhas temporárias gravadas com a nova.

## Incidentes conhecidos (resolvidos em 21/09/2026)

- **Upload falhava com "PDF corrompido"**: (1) o worker/fontes do pdf.js não entravam no bundle serverless — resolvido com `outputFileTracingIncludes` em `next.config.ts`; (2) `require.resolve("pdfjs-dist/package.json")` era transformado pelo Turbopack em id numérico no build — resolvido em `src/services/pdf/parser.ts` com resolução dinâmica + fallback. A causa real agora é registrada em `pdf.open_failed` nos logs.
- **Storage "Invalid Compact JWS"**: `supabase projects api-keys` sem `--reveal` devolve a chave `sb_secret_` **mascarada**; use sempre `--reveal` ao copiar a chave para `SUPABASE_SECRET_KEY`.
- **Links de e-mail caíam no login da Vercel**: usar sempre `APP_URL=https://analise-curricular.vercel.app` (domínio de produção); a URL `…-sistemas-pvh.vercel.app` é de deployment. A Vercel Authentication foi desativada pelo responsável em 21/09.
- **Subdomínios/previews pareciam "não funcionar"**: a Deployment Protection ainda estava ativa para os deployments de preview (por branch/PR), mesmo com a produção já liberada — o responsável desativou "Vercel Authentication" e "Password Protection" em Project Settings → Deployment Protection em 25/09/2026. Nenhuma mudança de código foi necessária: `src/proxy.ts`, o CSP de `next.config.ts` e `AUTH_TRUST_HOST=true` já eram independentes de host.

## O que acontece no deploy

`npm run vercel-build` (`scripts/vercel-build.mjs`) executa:

1. se `DIRECT_URL`/`DATABASE_URL` existirem: `prisma migrate deploy` + `tsx prisma/seed.ts` (idempotente);
2. `prisma generate` + `next build` — o build **não** depende do banco; o app só exige `DATABASE_URL` em runtime.

Cron de retenção LGPD: `vercel.json` agenda `GET /api/cron/retention` diariamente às 03:00 UTC; a Vercel envia `Authorization: Bearer CRON_SECRET` automaticamente. Os retornos de matrícula têm dois crons em dias úteis: 12:00 UTC (08:00 em Rondônia, manhã) e 18:00 UTC (14:00 em Rondônia, tarde). Confirme `EMAIL_APP_PASSWORD` em Production: sem essa variável o sistema registra a tentativa, mas não consegue entregar e-mails.

## Primeiro acesso

1. Abra a URL de produção e entre com `ADMIN_EMAIL` / `ADMIN_PASSWORD`. **Troque a senha** em Configurações → Usuários.
2. Configurações → OpenAI → _Conectar OpenAI_ com a chave do projeto dedicado.
3. Configurações → Privacidade: confirme a retenção e o modo de envio à IA.
4. Nova análise → envie um PDF real.

## Limites e observações

- Funções: `maxDuration = 300 s` nas rotas de upload/reprocessamento. O pipeline roda em `after()`; se a OpenAI demorar mais que isso, a análise fica em `AI_ERROR` e pode ser retomada com _Tentar novamente_ (ver A1 em `IMPROVEMENT_REPORT.md` — fila durável).
- O Storage do Supabase substitui o disco local (`STORAGE_DRIVER=supabase`). Em desenvolvimento continue com `local`.
- Segurança do Supabase: o app usa **somente** a chave secreta no servidor (bypass de RLS). O banco é acessado via Prisma, não pela Data API; não exponha o schema `public` na Data API se não for usar.
- Redeploy manual: `npx vercel --prod --scope sistemas-pvh` ou botão _Redeploy_ na Vercel.

## Desenvolvimento local continua igual

`docker compose up -d db` · `npm run db:migrate` · `npm run db:seed` · `npm run dev` (ver README).
