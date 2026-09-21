# SECURITY.md

## Autenticação e sessão
- Auth.js v5, provider Credentials, senha com argon2id (`@node-rs/argon2`).
- Sessão JWT em cookie `HttpOnly`, `SameSite=Lax`, `Secure` em produção, expiração 8h com renovação.
- Login com rate limit (5 tentativas/min por IP) e mensagem genérica.

## Autorização (RBAC)
- Perfis ADMIN / ANALYST / VIEWER. Matriz de permissões em `src/lib/rbac.ts`.
- Verificação em `middleware.ts` (rotas), em cada server action/route handler (`requireRole`) e na UI.

## Segredos
- `APP_ENCRYPTION_KEY` (AES-256-GCM), `AUTH_SECRET`, `DATABASE_URL`, `CRON_SECRET` apenas em variáveis de ambiente do servidor.
- API Key OpenAI cifrada no banco; plaintext apenas em memória, no escopo da chamada. Nunca em logs.
- Ambiente validado por Zod ao iniciar (`src/lib/env.ts`); ausência de secret impede o boot.

## Upload
- Apenas `application/pdf`: verificação de magic bytes (`%PDF-`) e `file-type`, tamanho ≤ 20 MB, ≤ 60 páginas.
- Armazenamento em `STORAGE_DIR` (fora de `public/`), nome aleatório (uuid), hash SHA-256.
- Download só por `GET /api/analyses/[id]/document` autenticado e autorizado; `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`.

## Headers
`Content-Security-Policy` (self + worker do pdf.js + blob), `Strict-Transport-Security` (prod), `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restritiva.

## Validação
- Toda entrada validada server-side com Zod; validação client apenas como UX.
- IDs de rota validados como UUID; queries Prisma sempre escopadas por análise/usuário.

## Rate limiting
Token bucket em memória por IP/usuário: login 5/min, upload 10/min, teste OpenAI 3/min, recálculo 30/min.
Single-instance; distribuir via Redis quando houver múltiplas instâncias.

## Logs e redação
Logger central (`src/lib/logger.ts`) com redação de `sk-…`, CPF, RG e telefones. Sem PDF ou prompt completo.

## LGPD
Minimização (PII mascarada no modo texto; PDF completo apenas quando o modo `PDF_FILE` estiver ativo), retenção
configurável com rotina automática, auditoria de acessos/alterações, sem coleta além do necessário.

## Auditoria
`AuditLog` para login, criação/edição/conclusão de análise, correções manuais, alterações de usuários, regras,
integração OpenAI (conectar/testar/trocar/desconectar) e configurações de privacidade.
