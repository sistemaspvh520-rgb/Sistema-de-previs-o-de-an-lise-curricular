# SECURITY.md

## Autenticação e sessão
- Auth.js v5, provider Credentials, senha com argon2id (`@node-rs/argon2`).
- Sessão JWT em cookie `HttpOnly`, `SameSite=Lax`, `Secure` em produção, expiração 8h com renovação.
- Login com rate limit (5 tentativas/min por IP) e mensagem genérica.

## Senhas temporárias, convites e suporte
- Contas são criadas com senha temporária gerada (alfabeto sem caracteres ambíguos), armazenada como hash argon2id **e** cifrada (AES-256-GCM) para consulta do ADMIN até o primeiro acesso; ao definir a própria senha, a cópia cifrada é apagada.
- `mustChangePassword` no JWT força a troca no primeiro acesso (proxy redireciona para `/settings/account`).
- Convite e redefinição usam tokens aleatórios de 32 bytes; só o SHA-256 é persistido (`PasswordToken`), uso único, validade 7 dias (convite) / 60 min (redefinição); emitir um novo invalida o anterior. "Esqueci minha senha" responde sempre de forma genérica e é limitado por IP e por e-mail.
- "Acessar como": token de uso único (60 s) emitido por ADMIN ativo; a sessão resultante carrega `impersonatorId`; evento `admin.impersonate` na auditoria. O usuário não é notificado (decisão da instituição); o registro de auditoria é a salvaguarda.
- E-mails saem por SMTP autenticado (senha de app), sem senha em texto no corpo dos convites; a auditoria registra `email.sent`/`email.failed` sem conteúdo.

## Exclusão de contas e limpeza de dados
- Exclusão definitiva de conta (ADMIN): análises e correções da pessoa são transferidas ao admin que exclui; tokens/senha temporária caem em cascata; não é possível excluir a própria conta nem o último ADMIN ativo. Confirmação digitada ("EXCLUIR") e registro em auditoria.
- Manutenção de dados (ADMIN): limpeza de auditoria, uso de IA e análises (tudo ou mais antigos que N dias), com confirmação digitada ("LIMPAR"); arquivos no storage são removidos junto com as análises.

## Autorização (RBAC)
- Perfis ADMIN / TUTOR / ANALYST / VIEWER. TUTOR = análise curricular + área acadêmica (`academic:manage`, `students:manage`); ANALYST = só análise curricular, grades comerciais e relatórios. Matriz de permissões em `src/lib/rbac.ts`.
- Verificação em `src/proxy.ts` (rotas, `ROUTE_PERMISSIONS`), em cada server action/route handler (`requirePermission`) e na UI.

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
