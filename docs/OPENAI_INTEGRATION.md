# OPENAI_INTEGRATION.md — Integração com a OpenAI API

## 1. Projeto OpenAI dedicado

```
OPENAI ORGANIZATION
  └── Project "Analise Curricular - Cruzeiro do Sul"
        └── Service Account "analise-curricular-web"
              └── Project API Key  →  backend desta aplicação  →  OpenAI API
```

A aplicação **não** depende de login/OAuth/sessão do ChatGPT nem de chave pessoal. Só a OpenAI API.

## 2. Service Account

Criar dentro do projeto uma Service Account (`analise-curricular-web`) e gerar a chave a partir dela. A chave é
exclusiva desta aplicação e não é compartilhada com outros sistemas, bots ou ambientes.

## 3. API Key de projeto

Formato aceito: `sk-...` (inclusive `sk-proj-...` e `sk-svcacct-...`). A validação estrutural é apenas
`^sk-[A-Za-z0-9_\-]{20,}$`; a validação real exige comunicação com a API (§5).

## 4. Tela de conexão

`Configurações → Integrações → OpenAI` (somente ADMIN). Estados: `● Não conectado` / `● Conectado` / `● Erro`.
Botão CONECTAR OPENAI abre o modal "Conectar OpenAI" com campo `type=password` (mostrar/ocultar enquanto digita),
botões VALIDAR E CONECTAR / CANCELAR. Estados visuais: "Testando conexão…", "Conexão estabelecida.",
"Não foi possível conectar à OpenAI." + orientação.

## 5. Validação real da credencial

`testOpenAIConnection(apiKey, model)`:
1. valida estrutura básica; 2. **não persiste**; 3. cria cliente temporário `new OpenAI({ apiKey, timeout: 30_000, maxRetries: 0 })`;
4. `models.retrieve(model)` (confirma acesso ao modelo configurado); 5. `responses.create({ model, input: "ping", max_output_tokens: 16 })`;
6. só com ambas as chamadas OK → criptografa, persiste, grava `apiKeyLastFour`, `lastTestedAt`, `status = CONNECTED`;
7. em falha: não persiste, devolve `OpenAIErrorCode` + mensagem amigável. Nenhuma resposta contém a chave.

## 6. Criptografia

AES-256-GCM (`node:crypto`), IV de 12 bytes aleatório por operação, auth tag de 16 bytes, AAD = `"openai-integration:v1"`.
Chave mestra `APP_ENCRYPTION_KEY` (32 bytes, base64) fornecida como secret do servidor — nunca no banco, nunca em
`NEXT_PUBLIC_*`. `keyVersion` gravado junto ao ciphertext para rotação da chave mestra. Em produção: Secret Manager/KMS.

## 7. Armazenamento

Entidade `OpenAIIntegration` (linha única): `encryptedApiKey`, `encryptionIv`, `encryptionAuthTag`, `keyVersion`,
`apiKeyLastFour`, modelos, labels, `lastTestedAt`, `lastConnectionStatus`, `lastErrorCode`, autoria. Nunca `plainApiKey`.

## 8. Rotação (ATUALIZAR API KEY)

Nova chave → validar → testar → se válida: criptografar e substituir. Se inválida: **a chave anterior permanece** e a
integração continua operacional. Tudo registrado em `AuditLog` (sem a chave).

## 9. Remoção (DESCONECTAR)

Confirmação → apaga `encryptedApiKey`, `encryptionIv`, `encryptionAuthTag` → `status = DISCONNECTED` → `AuditLog`.
A UI avisa que remover a chave do sistema não a revoga na OpenAI.

## 10. Cliente server-side

`OpenAISecretService` (`credentials.ts`): `encryptApiKey`, `decryptApiKey`, `saveApiKey`, `replaceApiKey`,
`deleteApiKey`, `getApiKeyForServer`. **Não existe** `getApiKeyForBrowser`. Módulos marcados com `import "server-only"`.
`OpenAIClientFactory.getOpenAIClient()`: consulta integração → descriptografa em memória → instancia SDK → executa → sem
persistência ou log do plaintext.

## 11. Modelos

Configurações `extractionModel` e `auditModel` (padrão `gpt-5.6-sol`), `futureExplanationModel`.
Alteráveis pelo ADMIN; validados com `models.retrieve` antes de salvar. Nenhum id de modelo fixo no código de negócio.

## 12. Extractor

`OpenAICurriculumExtractor.extract()` usa a Responses API com `input_file` (PDF base64) no modo `PDF_FILE` ou o texto
extraído localmente com posições e PII mascarada no modo `REDACTED_TEXT`. O padrão é `REDACTED_TEXT`: evita enviar o PDF
completo e reduz custo; `PDF_FILE` fica disponível apenas para documentos cujo texto local não seja suficiente. Saída em
Structured Output (schema §14).
Instruções do prompt: não inverter colunas; não deduplicar; manter C.H. 0; `-`/vazio ⇒ `usedSubject: null`;
marcar `UNCLEAR`/`UNREADABLE` em dúvida; extrair afirmações numéricas como `documentClaims`; listar `ambiguities`.

## 13. Auditor

`OpenAICurriculumAuditor.audit()` é chamado **somente após** o motor calcular. Recebe extração, normalização, totais,
distribuição semestral, claims e páginas relevantes. Procura: linha ausente/duplicada, período/C.H. incorretos, status
possivelmente incorreto, disciplina utilizada mal interpretada, total divergente, inconsistência tabela×texto e PDF×resultado.
Retorna apenas `{ status: "OK" | "REVIEW", issues: [...] }`. Não altera nada.

## 14. Structured Outputs

Extractor (`CurriculumExtractionSchema`):
```json
{
  "document": { "course": "string|null", "matrix": "string|null", "detectedEntryPeriod": "number|null", "detectedEntryPeriodEvidence": "string|null" },
  "subjects": [ { "name": "string", "workload": "number", "period": "number", "usedSubject": "string|null",
                  "sourcePage": "number", "sourceRow": "number", "readability": "CLEAR|UNCLEAR|UNREADABLE", "note": "string|null" } ],
  "documentClaims": [ { "type": "PENDING_TOTAL|EXEMPTED_TOTAL|TOTAL_SUBJECTS|ENTRY_PERIOD|OTHER", "value": "number|null", "sourcePage": "number", "rawText": "string" } ],
  "ambiguities": [ { "sourcePage": "number", "sourceRow": "number|null", "message": "string" } ]
}
```
Auditor (`CurriculumAuditSchema`):
```json
{ "status": "OK|REVIEW",
  "issues": [ { "code": "POSSIBLE_MISSING_ROW|POSSIBLE_DUPLICATE_ROW|WRONG_PERIOD|WRONG_WORKLOAD|WRONG_STATUS|USED_SUBJECT_MISREAD|TOTAL_MISMATCH|TABLE_TEXT_INCONSISTENCY|RESULT_INCONSISTENCY|OTHER",
                "severity": "INFO|WARNING|CRITICAL", "subjectRowHash": "string|null", "sourcePage": "number|null", "message": "string" } ] }
```
Ambos gerados via `zodTextFormat(schema, name)` com `strict: true`; a resposta é validada novamente com Zod.

## 15. Tratamento de erros

| Situação | `OpenAIErrorCode` | Mensagem |
|----------|-------------------|----------|
| 401 | INVALID_API_KEY | Chave inválida ou revogada |
| 403 | FORBIDDEN | Chave sem acesso ao recurso/projeto |
| 404 modelo | MODEL_NOT_FOUND | Modelo indisponível para este projeto |
| 429 | RATE_LIMITED / INSUFFICIENT_QUOTA | Limite/cota atingido |
| 5xx | SERVER_ERROR | Instabilidade na OpenAI |
| timeout | TIMEOUT | Tempo esgotado |
| conexão | CONNECTION_ERROR | Falha de rede |
| schema | INVALID_STRUCTURED_OUTPUT | Resposta fora do formato esperado |
| arquivo | FILE_REJECTED | Arquivo rejeitado pela API |

Nunca stacktrace ao usuário. Em falha durante o pipeline: `AI_ERROR`, PDF preservado, botão TENTAR NOVAMENTE.

## 16. Logs

Registrar `analysisId`, `userId`, ação, modelo, `promptVersion`, `durationMs`, status, `errorCode`, usage.
Nunca: API Key, CPF/RG, PDF completo, prompt completo, chain-of-thought. Logger com redação por regex.

## 17. Consumo

`AIUsage` por chamada (`inputTokens`, `outputTokens`, `totalTokens`, `estimatedCost`). Preços em
`src/services/openai/pricing.ts` (estimativa editável). Tela `Configurações → Uso de IA`.

## 18. Segurança

Chave só no servidor; sem `localStorage`/`sessionStorage`/`NEXT_PUBLIC_`/cookie/HTML/console/Git. Server actions
devolvem apenas `apiKeyLastFour`. Rate limit em testes de conexão. RBAC: somente ADMIN.

## 19. Ambientes

| | DEV | PROD |
|-|-----|------|
| Projeto | Analise Curricular - Dev | Analise Curricular - Cruzeiro do Sul |
| Service Account | analise-curricular-web-dev | analise-curricular-web-prod |
| Chave | nunca a de produção localmente | Secret Manager/KMS para `APP_ENCRYPTION_KEY` |

## 20. Testes

SDK mockado (`vi.mock("openai")`): chave válida; inválida (401); revogada (401); sem acesso (403); timeout; rate limit (429);
5xx; Structured Output inválido; troca por chave válida; troca por chave inválida (anterior preservada); desconectar;
ANALYST tentando acessar credencial (403); ADMIN acessando; API nunca retorna chave completa.
