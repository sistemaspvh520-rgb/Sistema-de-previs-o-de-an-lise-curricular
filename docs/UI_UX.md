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
Sidebar fixa (Dashboard, Nova análise, Análises, Revisões, Matrizes, Configurações → Geral, Regras Acadêmicas, OpenAI,
Usuários, Privacidade, Segurança, Auditoria, Uso de IA), topbar com breadcrumb e menu do usuário. Mobile: sidebar em drawer.

## Telas
- **Login**: cartão central, logo, campo e-mail/senha, erro genérico, botão com estado de carregamento.
- **Dashboard**: 4 cards de métricas, lista de análises recentes, status da integração OpenAI, atalhos.
- **Nova análise**: título "Análise Curricular Inteligente", descrição, dropzone grande (ARRASTE O PDF AQUI / SELECIONAR PDF).
- **Processamento**: checklist com progresso real (✓ concluído, ● em andamento, ○ pendente) alimentada por `processingSteps`.
- **Resultado**: cards (Curso, Período de ingresso, Total da grade, Dispensadas, Pendentes, Pendências anteriores,
  Semestres restantes, Previsão estimada, Status); abas RESUMO · GRADE CURRICULAR · PENDÊNCIAS · PREVISÃO · PDF ORIGINAL ·
  AUDITORIA IA · HISTÓRICO; banners de bloqueio (ingresso / regra adicional); botões COMO CHEGAMOS NESTA PREVISÃO? e
  GERAR RESUMO PARA CANDIDATO (copiar).
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
