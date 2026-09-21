# ARCHITECTURE.md — Análise Curricular Inteligente

Universidade Cruzeiro do Sul Virtual · Aplicação web interna

## 1. Objetivo

Automatizar a leitura de PDFs de análise curricular e produzir, de forma rastreável e auditável:
curso, grade por período, disciplinas dispensadas/pendentes/a revisar, backlog de períodos anteriores,
período de ingresso, capacidade por semestre, simulação semestre a semestre, previsão de conclusão e
resumo para o candidato.

## 2. Princípio fundamental

> **IA para interpretar. Código para calcular. IA para auditar. Humano para resolver exceções.**

A OpenAI nunca é a fonte oficial de contagens, capacidades, distribuição ou previsão. Toda matemática
acadêmica é executada pelo **motor determinístico** em `src/domain/curricular-analysis`, que não depende
de React, Prisma ou OpenAI e é 100% testável.

## 3. Camadas

| # | Camada | Implementação | Responsabilidade |
|---|--------|---------------|------------------|
| 1 | Documento original | `UploadedDocument` + `StorageService` | PDF validado, hash SHA-256, armazenado fora de `public/` |
| 2 | Parser local | `src/services/pdf/parser.ts` | Texto por página com posições (x, y, w, h) via pdf.js; contagem de páginas; detecção de linhas |
| 3 | OpenAI Extractor | `src/services/openai/extractor.ts` | Interpreta a tabela e devolve **Structured Output** (Zod strict) |
| 4 | Normalização | `src/services/pipeline/normalize.ts` | Trim, caixa alta, inteiros, `rowHash`, `classifySubject`, bounding box por match |
| 5 | Motor acadêmico | `src/domain/curricular-analysis/engine` + `simulation` | Totais, backlog, capacidade, simulação semestral, previsão |
| 6 | Validador determinístico | `src/domain/curricular-analysis/validators` | Invariantes (§40), claims, inconsistências |
| 7 | OpenAI Auditor | `src/services/openai/auditor.ts` | Segunda conferência; só aponta `issues`, nunca altera |
| 8 | Revisão humana | `src/features/reviews`, `ManualCorrection` | Edição de campos → recálculo automático → histórico imutável |
| 9 | Resultado final | `CurricularAnalysis` + `SemesterProjection` | Cards, abas, timeline, explicação, resumo WhatsApp |

## 4. Fluxo de processamento (estados)

```
UPLOADED → PARSING → AI_EXTRACTION → NORMALIZING → CALCULATING → VALIDATING → AI_AUDIT → VALIDATING(2ª)
                                                                                   ↓
                                                                    COMPLETED | WAITING_REVIEW
Falhas:  qualquer etapa OpenAI → AI_ERROR (retomável)   |   outras → FAILED (com errorCode)
```

- O upload responde imediatamente com o `analysisId`; o pipeline roda em `after()` (`next/server`) e persiste
  `status` + `processingSteps` a cada passo. A UI faz polling em `GET /api/analyses/[id]/status`.
- **Período de ingresso**: o valor informado no envio (`USER`) é a fonte oficial. Se não informado, o pipeline usa o cabeçalho
  do PDF ("Série: N", leitura local) ou a IA (`DOCUMENT`), depois a regra institucional (`RULE`). Divergências entre envio e
  documento viram `DocumentClaim`/alerta; nunca são corrigidas em silêncio.
- Se o período de ingresso não puder ser determinado, o pipeline grava as disciplinas e para em
  `WAITING_REVIEW` com o warning `ENTRY_PERIOD_REQUIRED`. Após confirmação manual, `recalculateAnalysis`
  executa NORMALIZING(parcial) → CALCULATING → VALIDATING sem novo upload e sem nova chamada à OpenAI.
- **Retomada**: `AI_ERROR` preserva `localExtraction`; "Tentar novamente" reinicia a partir da etapa que falhou.

## 5. Stack

Next.js 16 (App Router, Server Actions, Route Handlers) · React 19 · TypeScript 5.9 strict · Tailwind 4 +
shadcn/ui · PostgreSQL 17 · Prisma 7 (`@prisma/adapter-pg`) · Auth.js v5 (Credentials, JWT) · Zod 4 ·
OpenAI SDK 7 (Responses API + `zodTextFormat`) · pdf.js (servidor: `pdfjs-dist` legacy; cliente: `react-pdf`) ·
Vitest · ESLint 9.

## 6. Estrutura de pastas

```
docs/                         documentos de arquitetura
prisma/                       schema, migrations, seed
src/app/                      rotas (App Router) — apenas composição de UI e handlers finos
src/components/               ui (shadcn), layout, shared
src/features/<feature>/       server actions + componentes específicos (analyses, curriculum, projections,
                              reviews, matrices, integrations, settings)
src/domain/curricular-analysis/
  engine/                     classify, totals, backlog, capacity, allocation
  rules/                      tipos de regra, defaults, resolução de RuleSet
  simulation/                 simulateSemester, simulateCurriculum, terms
  validators/                 validateAnalysis, compareDocumentClaims, detectInconsistencies, status
src/services/
  openai/                     client-factory, credentials, test-connection, extractor, auditor, schemas,
                              prompts, errors, usage, pricing
  pdf/                        parser, table-detector, redaction
  crypto/                     aes-gcm
  storage/                    StorageService (local-fs)
  pipeline/                   runner, normalize, recalculate
  audit-log/                  registro de AuditLog
  rate-limit/                 token bucket em memória
src/repositories/             acesso Prisma por agregado
src/schemas/                  Zod compartilhados (env, forms, API)
src/lib/                      auth, prisma, env, logger, rbac, utils
src/types/                    tipos compartilhados
tests/                        unit, integration, fixtures
samples/                      PDFs reais (gitignored)
storage/                      arquivos enviados (gitignored)
```

Regra: **nenhuma regra acadêmica dentro de componentes React**. Componentes recebem resultados já calculados.

## 7. Rastreabilidade (fonte de cada dado)

Todo dado exibido carrega `source`:

| Dado | Fonte |
|------|-------|
| Disciplina, C.H., período, disciplina utilizada | `PDF · página N · linha M` (via Extractor) ou `Usuário` (correção) |
| Status | `Disciplina Utilizada` (regra §6) ou `Usuário` |
| Período de ingresso | `Documento`, `Campo estruturado`, `Regra institucional` ou `Confirmação do usuário` |
| Capacidade | `Regra Acadêmica vX.Y` (`RuleSetVersion`) |
| Previsão | `Motor Acadêmico vX.Y.Z` (`ENGINE_VERSION`) |
| Auditoria | `OpenAI · modelo · promptVersion` |

## 8. Versionamento por análise

Cada `CurricularAnalysis` grava: `ruleSetVersionId`, `engineVersion`, `extractorPromptVersion`,
`auditorPromptVersion`, `extractionModel`, `auditModel`, `curriculumMatrixId` e `createdAt`.
Alterar regras cria uma **nova** `RuleSetVersion`; análises antigas continuam explicáveis com a versão original.

## 9. Perfis (RBAC)

| Perfil | Permissões |
|--------|-----------|
| ADMIN | usuários, OpenAI, regras, matrizes, integrações, auditoria, uso de IA, todas as análises |
| ANALYST | criar análise, revisar, corrigir, recalcular, concluir, gerar resumo |
| VIEWER | consultar análises |

Verificação em três pontos: `middleware.ts` (rota), server action / route handler (`requireRole`) e UI (ocultar ações).

## 10. Evoluções previstas

- Fila externa (BullMQ/Redis) substituindo `after()` para ambientes serverless/multi-instância.
- `StorageService` S3-compatível.
- Rate limiting distribuído.
- Comparação automática contra matrizes oficiais (já modelada; comparação implementada, sugestão de matriz futura).
