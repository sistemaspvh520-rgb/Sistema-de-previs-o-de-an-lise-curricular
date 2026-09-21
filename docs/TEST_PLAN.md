# TEST_PLAN.md

## Ferramentas
Vitest 5 (unit + integração com mocks), Testing Library para componentes críticos, `vi.mock("openai")` para o SDK.
Comandos: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## 1. Motor acadêmico (`tests/unit/domain`)
| # | Caso | Esperado |
|---|------|----------|
| 1 | 8 disciplinas, 0 dispensadas | regulares 8, capacidade 11, adaptações 3 |
| 2 | 8 disciplinas, 2 dispensadas | regulares 6, capacidade 11, adaptações 5 |
| 3 | 8 disciplinas, 5 dispensadas | regulares 3, capacidade 11, adaptações 8 |
| 4 | capacidade de backlog 5, backlog 2 | aloca 2 |
| 5 | C.H. = 0 | disciplina mantida |
| 6 | usedSubject = "-" | PENDENTE |
| 7 | usedSubject = null | PENDENTE |
| 8 | usedSubject = "CONTABILIDADE BÁSICA" | DISPENSADA |
| 9 | mesma disciplina utilizada em 3 linhas | 3 linhas mantidas |
| 10 | claim 20 vs calculado 21 | DOCUMENT_TOTAL_MISMATCH |
| 11 | simulação completa (ingresso 4º, backlog 15) | carga ≤ capacidade em todos os semestres; backlog consumido na ordem |
| 12 | regra adicional UNCONFIGURED com sobra | `incomplete = true` + warning |
| 13 | invariantes do validador | violações detectadas (linha sumida, duplicidade, excesso de capacidade) |
| 14 | confiabilidade | HIGH / REVIEW_RECOMMENDED / REVIEW_REQUIRED conforme critérios |

## 2. Integração OpenAI (`tests/unit/services/openai`)
Chave válida · inválida · revogada · sem acesso · timeout · rate limit · 5xx · Structured Output inválido · troca por chave
válida · troca por chave inválida (anterior preservada) · desconectar · ANALYST bloqueado · ADMIN permitido · resposta nunca
contém a chave completa.

## 3. Criptografia
Roundtrip AES-GCM; IV único; auth tag inválida falha; chave mestra errada falha.

## 4. PDF
Validação de MIME real, tamanho, header; parser extrai páginas e linhas de fixture sintética; redação mascara CPF/RG/telefone.

## 5. Pipeline
Fluxo feliz com extractor/auditor mockados; falha da OpenAI → `AI_ERROR` com `localExtraction` preservado; retomada;
ingresso ausente → `WAITING_REVIEW` + `ENTRY_PERIOD_REQUIRED`; confirmação → recálculo.

## 6. RBAC
Matriz de permissões por perfil; middleware redireciona não autenticados; server actions negam perfil insuficiente.

## 7. Aceite manual (§80)
Checklist de 33 itens executada com PDF real de `samples/` e chave real do projeto dedicado.
