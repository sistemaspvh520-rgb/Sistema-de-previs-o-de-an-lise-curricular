# ACADEMIC_RULES.md — Regras acadêmicas do motor

Este documento separa explicitamente o que é **CONFIRMADO** (fixo no motor), **CONFIGURÁVEL** (armazenado em
`SystemRule` dentro de uma `RuleSetVersion`) e **PENDENTE DE CONFIRMAÇÃO** (não modelado; o sistema exibe
`REGRA NÃO CONFIGURADA`). Nenhuma regra institucional é inventada.

## 1. Leitura da análise curricular — CONFIRMADO

| Coluna | Significado |
|--------|-------------|
| DISCIPLINA | Componente da grade da Cruzeiro do Sul (destino) |
| C.H. | Carga horária |
| SÉRIE | Período acadêmico (1 = 1º período, 2 = 2º …) |
| DISCIPLINA UTILIZADA | Disciplina da formação anterior usada para aproveitar a disciplina da grade |

- Nunca inverter DISCIPLINA com DISCIPLINA UTILIZADA.
- A grade é montada **dinamicamente** a partir da coluna DISCIPLINA agrupada por SÉRIE. Nenhuma grade é hardcoded.

## 2. Classificação — CONFIRMADO

```
usedSubject com conteúdo válido            → DISPENSADA (EXEMPTED)
usedSubject = "-" | "" | null | só espaços → PENDENTE  (PENDING)
readability ≠ CLEAR ou ambiguidade         → REVISAR   (REVIEW)
```
- Nomes diferentes entre DISCIPLINA e DISCIPLINA UTILIZADA **não** impedem a dispensa (a decisão já está no documento).
- **Não deduplicar**: a mesma disciplina utilizada pode aparecer em várias linhas; cada linha é uma decisão independente.
- **C.H. = 0** não exclui a disciplina.
- Identidade da linha: `rowHash = sha256(documentId + page + rowIndex + name + period)`.

## 3. Fórmulas do motor — CONFIRMADO

Para cada período `p`:

```
subjectsInPeriod       = total de componentes do período
exemptedInPeriod       = dispensadas no período
regularSubjectsToTake  = subjectsInPeriod − exemptedInPeriod
maximumCapacity        = subjectsInPeriod + extraSubjectsAllowed
maximumCapacity        = min(maximumCapacity, maximumSubjectsPerSemester), quando o teto estiver configurado
backlogCapacity        = maximumCapacity − regularSubjectsToTake
                       = extraSubjectsAllowed + exemptedInPeriod
subjectsFromBacklog    = min(availableBacklog, backlogCapacity)
semesterLoad           = regularSubjectsToTake + subjectsFromBacklog   (sempre ≤ maximumCapacity)
```

Exemplo (§12): 8 disciplinas, 2 dispensadas, extra = 3 → regulares 6, capacidade 11, adaptações 5, carga 11.

### Teto institucional por semestre

Alguns cursos têm mais disciplinas regulares em um período. Para que a regra `+3` não ultrapasse o limite institucional,
`maximumSubjectsPerSemester` é opcional e limita a capacidade total. Exemplo: 10 disciplinas regulares, `+3` e teto 11
resultam em capacidade 11 — portanto, apenas 1 disciplina de períodos anteriores pode ser anexada. Se o período já tiver
mais disciplinas que o teto, nenhuma disciplina regular é removida e não há vagas extras.

## 4. Backlog e ordem — CONFIRMADO

- Backlog = pendentes (e a revisar) de períodos **anteriores** ao período de ingresso.
- Pendentes de períodos ≥ ingresso são cursadas como regulares no próprio período.
- Dispensadas de períodos anteriores ao ingresso não entram no backlog.
- Ordem: período mais antigo primeiro; dentro do período, ordem original do documento. Sem pré-requisitos inventados.

## 5. Período de ingresso — CONFIRMADO PELO USUÁRIO (obrigatório)

O período e o semestre de ingresso são informados e confirmados pelo analista **antes** de iniciar a análise
(fonte `USER`); o sistema não os lê do PDF. O cabeçalho ("Série: N") e a IA servem apenas para conferência:
divergência gera o alerta `ENTRY_PERIOD_MISMATCH`, nunca substitui o valor informado. Registros legados sem
ingresso ficam em "Ingresso pendente" até a confirmação no banner; após a seleção, toda a previsão é recalculada.

## 6. Simulador semestral — CONFIRMADO

Para cada semestre: identificar período regular → carregar disciplinas → remover dispensadas → identificar a cursar →
capacidade máxima → capacidade de backlog → buscar backlog → inserir conforme capacidade → registrar programadas →
retirar do backlog → calcular restantes → avançar.

## 7. Semestres adicionais — CONFIGURÁVEL

Observação operacional: nos exemplos fornecidos pela equipe, os semestres adicionais usam a mesma capacidade do último
período (ex.: 8 + 3 = 11). Isso corresponde à opção `SAME_AS_LAST_PERIOD`, que precisa ser confirmada e ativada em
Configurações → Regras Acadêmicas.

`additionalSemesterCapacityRule`: `SAME_AS_LAST_PERIOD` | `FIXED_VALUE` | `CUSTOM_RULE` | `UNCONFIGURED`.
Padrão: **UNCONFIGURED** → se sobrar backlog após o último período, a previsão fica incompleta e o sistema mostra
`REGRA DE SEMESTRE ADICIONAL PRECISA SER CONFIRMADA`.

## 8. Divergências e claims — CONFIRMADO

Afirmações do PDF ("20 matérias para adaptar") viram `DocumentClaim`. O motor recalcula e, se divergir,
gera `DOCUMENT_TOTAL_MISMATCH` (`REVISÃO NECESSÁRIA`). Nunca corrige silenciosamente.

## 9. Invariantes do validador — CONFIRMADO

- `totalGrade = exempted + pending + review`.
- Nenhuma linha desaparece entre extração e resultado.
- Nenhuma disciplina programada duas vezes.
- Nenhuma adaptação simultaneamente PROGRAMADA e em BACKLOG.
- Nenhum semestre acima de `maximumCapacity`.

## 10. Confiabilidade — CONFIRMADO

| Nível | Critérios |
|-------|-----------|
| ALTA | todas as linhas CLEAR; períodos contínuos; totais fecham; ingresso confirmado; validador OK; auditor OK |
| REVISÃO RECOMENDADA | ambiguidades pequenas ou divergências não críticas |
| REVISÃO OBRIGATÓRIA | período desconhecido; linha ilegível; divergência matemática; issue importante do auditor; regra não configurada |

## 11. Regras CONFIGURÁVEIS (RuleSet v1.0 seed)

| key | valor padrão | status |
|-----|--------------|--------|
| `extraSubjectsAllowed` | 3 | CONFIGURABLE |
| `maximumSubjectsPerSemester` | null (sem teto) | CONFIGURABLE |
| `additionalSemesterCapacityRule` | `{type: "UNCONFIGURED"}` | NOT_CONFIGURED |
| `periodUnit` | `SEMESTER` | CONFIGURABLE |
| `backlogOrdering` | `OLDEST_FIRST` | CONFIGURABLE |
| `entryPeriodDefault` | null | NOT_CONFIGURED |
| `reviewCountsAsPending` | true | CONFIGURABLE |

## 12. PENDENTE DE CONFIRMAÇÃO (não modelado — exibe REGRA NÃO CONFIGURADA)

| Tema | Situação |
|------|----------|
| Pré-requisitos | não aplicados; `CurriculumSubject.prerequisites` é informativo |
| Correquisitos | não modelado |
| Estágio | não modelado |
| TCC | não modelado |
| Extensão | não modelado |
| Oferta anual de disciplina | não modelado |
| Atividades complementares | não modelado |
| Limite especial do último período | não modelado (usa a fórmula geral) |
| Semestre adicional | `UNCONFIGURED` por padrão |
| SÉRIE = ano em cursos anuais | `periodUnit` configurável; padrão semestre |
| Semestre letivo inicial (`startTerm`) | por análise; padrão = próximo semestre a partir da data atual |
