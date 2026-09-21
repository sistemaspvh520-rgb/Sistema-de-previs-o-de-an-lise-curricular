# Relatório de Auditoria e Plano de Melhorias

**Sistema:** Análise Curricular Inteligente — Cruzeiro do Sul Virtual
**Data:** 21/09/2026 · **Versão auditada:** commit inicial no GitHub · **Atualizado:** 21/09/2026 (Sprint 1 aplicada; itens marcados ✅)
**Escopo:** segurança, estrutura/arquitetura, funcionalidades (aderência ao critério de aceite §80) e operação.

Legenda de prioridade: **P0** bloqueia produção · **P1** antes do uso amplo · **P2** evolução · **P3** desejável.
Esforço: **P** (≤ ½ dia) · **M** (1–3 dias) · **G** (> 3 dias).

---

## 1. Estado atual (o que já funciona e foi verificado)

| Área | Situação |
|------|----------|
| Autenticação / RBAC | Auth.js v5 + argon2id, cookie HttpOnly/SameSite, proxy de rotas, `requirePermission` em **todas** as 28 server actions e nos 4 route handlers |
| OpenAI | Chave cifrada AES-256-GCM, teste real (`models.retrieve` + `responses.create`), rotação segura, desconexão auditada, chave nunca sai do servidor |
| Pipeline | Upload validado → parser pdf.js **com reconstrução determinística da tabela** (74/74 linhas no PDF real, quebras de página resolvidas) → Extractor (Structured Output) → normalização → motor → validador → Auditor → status. `AI_ERROR` retomável |
| Motor acadêmico | Puro e testado (regra +3, bônus das dispensas, backlog ordenado, semestres adicionais, invariantes, claims). Previsão narrativa no formato da equipe |
| Cruzamento local × IA | Novo: contagem de linhas, código, série, C.H. e Disciplina Utilizada comparados entre a leitura local e a IA → alertas `LOCAL_*` |
| Revisão humana | Correção por disciplina com histórico imutável, confirmação de ingresso, recálculo automático, PDF lado a lado com destaque da linha |
| Qualidade | `lint` ✓ · `typecheck` ✓ · **92 testes** ✓ (unit + integração com Postgres real) · `next build` ✓ |

Pendências externas (não são defeitos): conectar a **API Key** do projeto OpenAI dedicado e rodar o fluxo com IA real; validar com a coordenação a regra de semestre adicional (`SAME_AS_LAST_PERIOD`, adotada com base no documento de orientação).

---

## 2. Segurança

| # | Achado | Risco | Prio | Esf. | Ação recomendada |
|---|--------|-------|------|------|------------------|
| S1 | | S1 | ✅ **Feito (21/09)** — callback `jwt` reconfere `isActive`/perfil no banco a cada 5 min e invalida a sessão. (achado original:sessão JWT (8h) **não era revogada** ao desativar usuário) | Alto | P0 | P | No callback `jwt`, revalidar `isActive`/`role` no banco a cada ~5 min (`token.checkedAt`); em `authorize` já bloqueia inativos. Alternativa: sessões em banco (`strategy: "database"`) |
| S2 | CSP com `script-src 'unsafe-inline'` (e `'unsafe-eval'` em dev) | Médio | P1 | M | Gerar **nonce** no `proxy.ts` e propagar (`headers().get("x-nonce")`), remover `unsafe-inline`; manter `style-src` com hash/nonce |
| S3 | Rate limit em memória (login, upload, teste OpenAI, reauditoria) — não compartilhado entre instâncias e perde estado no restart | Médio | P1 | M | Redis/Upstash (`@upstash/ratelimit`) ou tabela `RateLimitBucket` no Postgres |
| S4 | | S4 | ✅ **Feito** — `src/lib/request-ip.ts` só confia em `X-Forwarded-For` atrás de proxy (`TRUSTED_PROXY` ou Vercel). (achado original:chave de rate limit de login usava `x-forwarded-for` falsificável) | Médio | P1 | P | Confiar no header apenas quando `TRUSTED_PROXY=1`; caso contrário usar o IP do socket; documentar no deploy |
| S5 | Sem bloqueio progressivo de conta nem política de senha além de 8 caracteres; sem 2FA | Médio | P1 | M | Lockout após N falhas (tabela `LoginAttempt`), senha ≥ 12 com verificação contra listas comuns, TOTP opcional para ADMIN |
| S6 | Documentos em disco local sem criptografia em repouso e sem backup | Médio | P1 | M | `StorageService` S3-compatível com SSE-KMS; política de backup; manter apenas o `sha256` no banco |
| S7 | LGPD: modo padrão `PDF_FILE` envia o documento inteiro (com `cpfCandidato` no rodapé) à OpenAI | Alto (compliance) | P0 | P | Como a reconstrução local da tabela é agora exata, **avaliar tornar `REDACTED_TEXT` o padrão**; formalizar DPA/Zero Data Retention com a OpenAI; registrar base legal no `PRIVACY` |
| S8 | VIEWER lê **qualquer** análise (`analysis:read` global) — spec fala em "análises autorizadas" | Médio | P1 | M | ACL por análise (`AnalysisAccess` usuário/grupo) ou escopo por campus/curso; aplicar em `document` route e listagens |
| S9 | | S9 | ✅ **Feito** — upload valida `Origin` contra o host. (achado original:`POST /api/analyses/upload` não validava `Origin`) | Baixo | P2 | P | Rejeitar quando `Origin` ≠ `AUTH_URL` |
| S10 | Rotação de `APP_ENCRYPTION_KEY`: `keyVersion` é gravado, mas não há rotina de recifragem | Baixo | P2 | P | Script `npm run secrets:rotate` (lê com a versão antiga, grava com a nova) |
| S11 | `AuditLog` sem garantia de integridade (linha pode ser apagada por DBA) | Baixo | P3 | M | Hash encadeado (`prevHash`) e/ou exportação periódica assinada |
| S12 | `npm audit`: 4 vulnerabilidades *high* apenas em dependências de desenvolvimento do Prisma CLI (`mysql2`, `deepmerge-ts`) | Baixo | P2 | P | Acompanhar release do Prisma; não afeta runtime |
| S13 | Cron de retenção protegido só por Bearer secret | Baixo | P2 | P | Allowlist de IP do agendador + log de execução |
| S14 | Sem varredura antimalware do PDF; visualização inline via pdf.js | Baixo | P3 | M | ClamAV no upload; `Content-Disposition: attachment` para download explícito |

---

## 3. Estrutura e arquitetura

| # | Achado | Prio | Esf. | Ação recomendada |
|---|--------|------|------|------------------|
| A1 | Pipeline executa em `after()` do Next: **não é durável** (restart perde o job), sem fila, sem limite de concorrência, sem retry automático | P0 | G | Tabela `Job` (status, tentativas, `nextRunAt`) + worker (`npm run worker`) ou BullMQ/Redis; `after()` apenas enfileira. Retomada já é suportada pelo runner |
| A2 | Duas frentes de trabalho em paralelo geraram **duas formas de informar o ingresso** (no upload e no banner pós-processamento) | P1 | P | Manter o ingresso no upload como fonte oficial (`USER`); o banner só aparece quando não informado; documentar no `ARCHITECTURE.md` |
| A3 | `features/analyses/actions.ts` concentra 9 ações; `runner.ts` tem 300+ linhas | P2 | M | Separar `subject-actions.ts`, `review-actions.ts`, `lifecycle-actions.ts`; extrair cada etapa do runner para `steps/*.ts` |
| A4 | Páginas consultam Prisma diretamente em vez de repositórios (dashboard, audit, usage, matrices) | P2 | M | Consolidar em `repositories/*` para facilitar testes e cache |
| A5 | | A5 | ✅ **Feito** — `.github/workflows/ci.yml` (Postgres 17, migrate, seed, lint, typecheck, test, build). (achado original:sem CI) | P1 | P | GitHub Actions com serviço Postgres (workflow abaixo) |
| A6 | | A6 | ✅ Parcial — `GET /api/health` (banco + versão). Pendente: Dockerfile para hospedagem própria (na Vercel não é necessário). (achado original:sem artefato de deploy) | P1 | M | `Dockerfile` multi-stage (`output: "standalone"`), `GET /api/health` (DB + storage), `prisma migrate deploy` no entrypoint |
| A7 | Observabilidade limitada a logs JSON; sem request-id, métricas ou tracing | P2 | M | `x-request-id` no proxy; OpenTelemetry (Next suporta `instrumentation.ts`); métricas de duração por etapa do pipeline |
| A8 | Structured Output limitado a `max_output_tokens: 32000`; documentos muito longos (> ~150 linhas) podem truncar | P1 | M | Extrair por **blocos de páginas** e concatenar; ou usar a tabela local como esqueleto e pedir à IA só a validação por lote |
| A9 | | A9 | ✅ **Feito** — `periodUnit = YEAR` avança um ano por período e formata o termo como `AAAA`. (achado original:cursos anuais não alteravam a sequência de termos) | P2 | P | `termSequence` com passo anual quando `periodUnit = YEAR` |
| A10 | Scripts utilitários (`dump-pdf.mjs`, `inspect-tables.ts`) misturados com scripts operacionais | P3 | P | Mover para `scripts/dev/` |
| A11 | Testes: sem E2E de navegador; integração depende de Postgres local | P2 | M | Playwright (login → upload → resultado) com OpenAI mockada via `MSW`; `testcontainers` para o Postgres |

**Workflow de CI sugerido** (`.github/workflows/ci.yml`): checkout → `npm ci` → Postgres 17 como service → `prisma migrate deploy` → `npm run lint` → `npm run typecheck` → `npm test` → `npm run build`.

---

## 4. Funcionalidades — lacunas e melhorias

| # | Item | Prio | Esf. | Detalhe |
|---|------|------|------|---------|
| F1 | **Calibração com IA real** | P0 | P | Conectar a chave, processar `samples/analise-real-01.pdf`, comparar com a leitura local (deve dar 0 alertas `LOCAL_*`) e ajustar o prompt se necessário |
| F2 | | F2 | ✅ **Feito** — seletor de matriz oficial na aba Resumo, com sugestão automática pela `Grade:`/curso do documento. (achado original:faltava a UI) | P1 | P | A ação `linkMatrixToAnalysisAction` existe, mas falta o seletor na aba Resumo; sugerir automaticamente pela `Grade:` do cabeçalho (`20221/2023-2`) |
| F3 | | F3 | ✅ **Feito** — upload com mesmo SHA-256 responde 409 e a tela oferece “Abrir existente” ou “Enviar mesmo assim”. (achado original:detecção de PDF já analisado) | P2 | P | Avisar e oferecer abrir a análise existente |
| F4 | Excluir/arquivar análise (permissão `analysis:delete` existe sem ação/UI) | P2 | P | Soft-delete com auditoria e remoção do arquivo |
| F5 | Exportação do resultado (PDF/impressão e CSV da grade) | P2 | M | Rota `print` com layout institucional |
| F6 | Fluxo de revisão colaborativo: atribuição, comentários, notificação | P3 | G | `ReviewAssignment`, comentários por disciplina, e-mail/Teams |
| F7 | | F7 | ✅ Parcial — `/settings/account` permite trocar a própria senha (mín. 12 caracteres). Pendente: redefinição por e-mail. (achado original:autoatendimento de senha) | P1 | M | Página `/settings/account`; token de redefinição com expiração |
| F8 | Orçamento/alerta de custo da OpenAI | P2 | P | Limite mensal em `SystemSetting` + aviso no dashboard e bloqueio opcional |
| F9 | Dashboard com séries temporais (análises/dia, tempo médio, taxa de revisão) | P3 | M | Consultas agregadas + gráficos |
| F10 | Regras institucionais ainda **não configuradas** (pré-requisitos, TCC, estágio, extensão, atividades complementares) | P2 | G | Levantar com a coordenação; modelar como `SystemRule` + etapa opcional no motor |
| F11 | Modo `REDACTED_TEXT` como padrão após validação (ver S7) | P1 | P | Trocar default no seed e na migração |
| F12 | Acessibilidade e mobile: PDF lado a lado só no desktop; revisar foco/contraste com auditoria automatizada (axe) | P2 | M | — |

---

## 5. Plano de execução sugerido

**Sprint 1 — Produção segura (P0/P1 curtos):** ~~S1, S4, A5, F2, S9~~ (feitos em 21/09) · restam S7/F11 (decisão de privacidade), A2 (documentação), F1 (chave OpenAI), S13.
**Sprint 2 — Robustez:** A1 (fila durável), S3, S6, A6, A8, F7, S5.
**Sprint 3 — Governança e evolução:** S2, S8, A3/A4, A11, F3–F5, F8, A9.
**Backlog:** S10–S12, S14, A7, A10, F6, F9, F10, F12.

Critério de saída para "pronto para produção": Sprint 1 concluída + fluxo com IA real validado em ≥ 10 PDFs reais com 0 alertas `LOCAL_*` não explicados + CI verde.
