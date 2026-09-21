# Análise Curricular Inteligente — Cruzeiro do Sul Virtual

Aplicação web interna que lê PDFs de análise curricular, identifica grade, dispensas e pendências, recalcula tudo com um
motor acadêmico determinístico, audita com a OpenAI e sinaliza exceções para revisão humana.

> **IA para interpretar. Código para calcular. IA para auditar. Humano para resolver exceções.**

Documentação: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/DATABASE.md`](docs/DATABASE.md) ·
[`docs/ACADEMIC_RULES.md`](docs/ACADEMIC_RULES.md) · [`docs/OPENAI_INTEGRATION.md`](docs/OPENAI_INTEGRATION.md) ·
[`docs/SECURITY.md`](docs/SECURITY.md) · [`docs/UI_UX.md`](docs/UI_UX.md) · [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md)

## Produção

Vercel + Supabase — passo a passo em [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Requisitos

- Node.js ≥ 20.19 (testado com 26) e npm
- Docker Desktop (PostgreSQL 17 via `docker-compose.yml`)
- Uma API Key de **projeto dedicado** da OpenAI (cadastrada pelo painel, nunca em `.env`)

## Primeira execução

```bash
cp .env.example .env            # preencha AUTH_SECRET, APP_ENCRYPTION_KEY (openssl rand -base64 32), CRON_SECRET e ADMIN_PASSWORD
docker compose up -d db
npm install
npm run db:migrate
npm run db:seed                 # cria o ADMIN, as regras v1.0 e as configurações padrão
npm run dev                     # http://localhost:3000
```

1. Entre com `ADMIN_EMAIL` / `ADMIN_PASSWORD` do `.env` (e-mail institucional `@cruzeirodosul.edu.br`).
2. **Configurações → OpenAI → Conectar OpenAI**: cole a API Key do projeto dedicado. A chave é validada com uma
   chamada real, cifrada com AES-256-GCM e nunca devolvida ao navegador.
3. **Nova análise**: envie o PDF, escolha o semestre letivo de ingresso e acompanhe o processamento.

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` / `npm run build` / `npm start` | Next.js |
| `npm run lint` · `npm run typecheck` · `npm test` | qualidade (ESLint, tsc, Vitest) |
| `npm run db:migrate` · `npm run db:seed` · `npm run db:studio` | Prisma |
| `npm run retention:run` | executa a rotina de retenção LGPD (também via `GET /api/cron/retention` com `Authorization: Bearer CRON_SECRET`) |

O teste de integração (`tests/integration`) usa o banco do `.env` e é pulado automaticamente se o PostgreSQL não estiver acessível.

## Estrutura

```
docs/         documentos de arquitetura
prisma/       schema, migrations, seed
src/domain/   motor acadêmico determinístico (puro, testável)
src/services/ openai, pdf, crypto, storage, pipeline, retention, rate-limit, audit-log
src/features/ server actions + componentes por funcionalidade
src/app/      rotas (App Router)
tests/        unit, integration, fixtures
samples/      PDFs reais para calibração (gitignored)
storage/      PDFs enviados (gitignored, fora de /public)
```

## Perfis

| Perfil | Pode |
|--------|------|
| ADMIN | tudo: usuários, OpenAI, regras, matrizes, privacidade, auditoria, uso de IA |
| ANALYST | criar, revisar, corrigir, recalcular, concluir análises e gerar resumo |
| VIEWER | consultar análises |
