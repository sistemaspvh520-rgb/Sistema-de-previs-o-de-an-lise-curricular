# Previsão acadêmica de conclusão

Este documento define a estrutura comum de projeção para todas as novas análises acadêmicas. O cálculo é determinístico e executado pelo motor curricular; IA não decide situação, dispensa, capacidade ou data.

## Dados de entrada e classificação

- Considerar somente componentes marcados como pertencentes à grade principal.
- Cada componente precisa ter período válido (1–20) e situação reconhecida.
- `A CURSAR`, reprovações e notas abaixo da média são pendências; `CURSANDO` é carga em andamento e a previsão assume aprovação; `AE`/`AE*` são dispensas; situações aprovadas/concluídas não geram nova carga.
- Preservar cada linha extraída, inclusive linhas iguais. Não completar nomes nem situações por suposição.
- Linha sem período ou situação desconhecida, extração incompleta ou período atual não confirmado impedem publicar uma data de conclusão.

## Montagem do cronograma

1. Projetar o período atual no semestre letivo da análise. Componentes `CURSANDO` e `A CURSAR` do período atual entram na carga desse semestre, sob a premissa de aprovação.
2. Percorrer os períodos seguintes em ordem. Um período só consome semestre se houver componente para cursar ou pendência anterior efetivamente alocada nele.
3. Períodos posteriores compostos somente por dispensas, sem pendências antigas para alocar, não consomem semestres e não atrasam a previsão.
4. Se houver pendências de períodos anteriores, as dispensas podem liberar vagas no próprio período conforme as regras configuradas. Não transferir esse bônus a outros períodos.
5. Distribuir pendências antigas pela ordem do período mais antigo e pela ordem do extrato, respeitando capacidade e teto. Se ainda sobrarem componentes, usar apenas a regra configurada de semestre adicional; sem regra, deixar a conclusão em aberto.
6. Mostrar o resultado como cenário preliminar até o tutor conferir o extrato e confirmar o prosseguimento. O texto para o aluno não informa uma data enquanto essa confirmação ou outra validação estiver pendente.

## Invariantes e comunicação

- Toda carga projetada deve vir de uma linha da grade ou de uma pendência anterior identificada; períodos vazios não criam capacidade artificial.
- A carga do semestre nunca pode exceder a capacidade calculada.
- Uma disciplina não pode ser contada duas vezes nem desaparecer por estar dispensada.
- Erro/aviso que indique linha omitida, tabela não lida ou situação/período incerto bloqueia a data até correção e revisão.
- A previsão depende de aprovação, rematrícula no prazo, oferta, pré-requisitos e regras institucionais. Calendário projetado deve ser identificado como projetado; o cálculo não garante uma data oficial de colação.

## Casos de regressão obrigatórios

- 13 componentes em andamento + 3 a cursar no 1º período em 2026.2, 14 a cursar no 2º e períodos 3–8 apenas com AE*: projetar 2026.2 e concluir em 2027.1; os períodos dispensados não acrescentam semestres.
- 24 pendências anteriores + 3 componentes em andamento no período atual, seguidos de períodos com carga regular e dispensas: alocar sem ultrapassar o teto, usar as vagas AE somente no período correspondente e preservar a previsão 2027.2 no cenário operacional já validado.
- Um período intermediário sem componentes não pode inserir um semestre artificial entre dois períodos com carga.
- Situação/período desconhecido, linhas excluídas da extração ou regra de semestre adicional ausente: mostrar ressalva e não publicar data como confirmada.

Os casos são cenários de teste, não exceções codificadas por aluno. A projeção deve resultar dos componentes, regras e calendário fornecidos para cada análise.
