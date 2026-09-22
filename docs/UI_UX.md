# UI_UX.md

## Identidade
Inspirada na Universidade Cruzeiro do Sul Virtual: institucional, moderna, premium, tecnológica, clean.
Referências conceituais: Linear, Stripe, Vercel, Notion. Tokens em `src/styles/tokens.css`:

| Token | Valor |
|-------|-------|
| `--brand-navy` | #003E69 |
| `--brand-blue` | #004B7A |
| `--brand-cyan` | #00B9E4 |
| `--brand-gold` | #D3B45B |
| `--bg` | #F5F7FA |
| `--surface` | #FFFFFF |
| `--fg` | #17212B |

Nenhum hexadecimal fora do arquivo de tokens; componentes usam classes semânticas (`bg-primary`, `text-muted-foreground`…).
Tipografia: Inter (UI) e JetBrains Mono (hash/valores). Raios 8–12px, sombras suaves, bordas `1px` em `--border`.

## Navegação
Sidebar (Nova análise, Análises, Revisões, Meus relatórios, Gestão, Configurações → Geral, Regras Acadêmicas, OpenAI,
Usuários), topbar com menu do usuário. Abaixo de `xl` a sidebar vira rail de ícones (alternável); abaixo de `md` some e o
menu abre em drawer (`Sidebar variant="drawer"`, sempre expandido, com botão X).

## Mobile
- Nomes de arquivo e títulos usam `break-words` + `[overflow-wrap:anywhere]` (PageHeader) ou `break-all`; nenhum texto
  pode forçar scroll horizontal — o `overflow-x-clip` do body é só proteção, não solução.
- Abas da análise rolam horizontalmente no celular (`flex-nowrap overflow-x-auto`) e quebram em linhas a partir de `sm`.
- "PDF lado a lado" só aparece a partir de `xl`; no celular usa-se a aba PDF original.

## Datas e horas
Sempre em `America/Porto_Velho` via `formatDateTime`/`formatDate` (`src/lib/time.ts`). Inatividade de usuários em
linguagem natural (`formatRelativeTime`: "há 12 dias"), com destaque acima de 7 e 30 dias.

## Telas
- **Login**: cartão central, logo, campo e-mail/senha, erro genérico, botão com estado de carregamento.
- **Dashboard**: 4 cards de métricas, lista de análises recentes, status da integração OpenAI, atalhos.
- **Nova análise**: dropzone grande (ARRASTE O PDF AQUI / SELECIONAR PDF) + bloco "Antes de iniciar, identifique o
  atendimento" (nome do aluno, polo — lista em `src/domain/polos.ts` —, formato do curso EAD Digital/Semipresencial,
  período e semestre; todos obrigatórios, mensagens inline) → "Gerar análise" abre diálogo de confirmação → "Confirmar e iniciar".
- **Relatórios por polo**: card "Análises por polo" em Meus relatórios (do usuário) e Gestão (geral), com link para a lista
  filtrada (`/analyses?polo=`) e exportação CSV (`/api/reports/analyses?polo=`).
- **Processamento**: checklist com progresso real (✓ concluído, ● em andamento, ○ pendente) alimentada por `processingSteps`.
- **Resultado**: cards (Curso, Período de ingresso, Total da grade, Dispensadas, Pendentes, Pendências anteriores,
  Semestres restantes, Previsão estimada, Verificação); abas Resumo · Grade curricular · Pendências · Previsão · PDF original ·
  Conferência · Histórico; banners (ingresso pendente em registros legados / regra adicional); resumo para candidato (copiar).
- **Revisões**: mesmo conjunto do card "Precisam de atenção" da Gestão (ingresso pendente, falha na OpenAI, não concluída),
  cada item com o motivo e a ação esperada.
- **Gestão**: cards operacionais; "Atividade por usuário" ordenada pela última atividade, com "Último acesso: há N dias".
- **Grade**: agrupada por período com ícones ✓ × ?; tabela com filtros (Todas/Dispensadas/Pendentes/Revisar), busca, período,
  edição inline com motivo opcional.
- **PDF lado a lado**: desktop 50/50; clique na disciplina navega à página e destaca a linha (bbox quando disponível).
- **Timeline**: bloco "Previsão em texto" no formato usado pela equipe (ingresso, total a adaptar, máximo por semestre, `• *2026.2:* 4º semestre + 5 adaptações`, "previsão de formação para o final de AAAA", botão Copiar) seguido de cartões por semestre (termo, período, regulares, adaptações, total/capacidade, pendências restantes).
- **Semestre letivo de ingresso**: seletor (AAAA.1 / AAAA.2) no upload e na análise; alterar recalcula a previsão.
- **Configurações → OpenAI**: status, modal de conexão, cards pós-conexão, seletores de modelo, botões de ação.

## Estados e feedback
Skeletons em todas as listas/cards; toasts para ações; empty states com CTA; erros amigáveis sem stacktrace;
microinterações discretas (transições 150–200 ms); foco visível; contraste AA; navegação por teclado.

## Fonte dos dados
Cada valor relevante exibe um rótulo de origem (PDF · página N, Usuário, Regra vX, Motor vX, OpenAI) via tooltip/badge.
