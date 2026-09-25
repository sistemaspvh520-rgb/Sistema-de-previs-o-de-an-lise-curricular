# Portal Acadêmico do Aluno

## Rotas e operação

- `/portal/login`: acesso por e-mail ou RGM. Não existe cadastro público.
- `/portal/primeiro-acesso`: orienta o aluno a solicitar convite ao tutor.
- `/portal/recuperar` e `/portal/definir-senha`: recuperação e ativação com os tokens de uso único existentes.
- `/portal`: situação atual, pendências, jornada, previsão, atualização do extrato, histórico e conta, sem sidebar administrativa.
- `/academic-analysis/students`: alunos, pesquisa, filtros e criação de acesso.
- `/academic-analysis/students/[id]`: contato, convite, recuperação, bloqueio, upload, correção e histórico com autoria.

O perfil existente `ANALYST` atende à função de tutor, mantendo o escopo por responsável; `ADMIN` acompanha toda a equipe. `VIEWER` não administra alunos. O novo perfil `STUDENT` não tem nenhuma permissão interna.

## Instalação

Execute `npm run db:deploy` e `npm run db:generate` antes de iniciar a versão nova. Reinicie o servidor de desenvolvimento após gerar o Prisma Client: o singleton de uma sessão antiga conserva o schema anterior.

O banco local recebeu as migrações `20260925150000_student_portal` e `20260925160000_portal_document_retention`. A migração habilita RLS e revoga acesso das roles Supabase `anon` e `authenticated` às novas tabelas, se existirem. A aplicação usa Auth.js e consultas Prisma no servidor; não usa identidades Supabase Auth. Não foram criadas políticas permissivas baseadas em `auth.uid()` incompatíveis com esse modelo.

Configure `APP_URL` com a origem pública correta. O envio automático reutiliza `EMAIL_USER` e `EMAIL_APP_PASSWORD`. Sem SMTP, o tutor recebe um link temporário para copiar. Nenhuma senha de aluno é exibida ou armazenada de forma reversível. O portal funciona com o storage local privado ou o Supabase Storage privado existente. A rotina de retenção existente também remove PDFs do portal no prazo configurado; hashes e histórico acadêmico permanecem. Na política de remoção após processamento, o novo PDF nem é persistido.

## Identidade e autorização

`User → StudentEnrollment → AcademicAnalysisVersion`. O RGM é único e exato; uma conta pode futuramente possuir múltiplas matrículas. O portal atual abre a primeira matrícula vinculada. Nome aproximado nunca determina identidade.

A associação inicial importa análises existentes do mesmo RGM, verificando conflitos de nome, curso e responsável. Divergências exigem conferência dos registros pela administração. Importação não chama IA, não cria novas análises e consolida snapshots consecutivos iguais no histórico do portal.

`getSessionUser` valida no banco role, ativação e versão da sessão em cada requisição; rejeita alunos por padrão. Só os pontos de entrada do portal e a troca da própria senha habilitam explicitamente alunos. `requireUser` mantém as páginas internas restritas. Todas as consultas do portal aplicam matrícula + usuário ou responsável. Versões e documentos são consultados dentro desse escopo, inclusive IDs manipulados por URL.

A troca da própria senha pede um novo login e invalida todas as sessões anteriores. O log de argumentos de Server Functions do Next foi desabilitado para não registrar senhas/tokens em desenvolvimento.

Bloqueio, alteração de contato e redefinição incrementam `sessionVersion`; reativar não revive sessões antigas. Tokens anteriores são invalidados. Consumo de token, senha, ativação e auditoria são atômicos. Emissão e consumo de links usam lock da conta.

A visualização do tutor usa sua própria sessão, faixa de suporte persistente e auditoria. Uploads e correções mantêm o tutor como autor; não há troca para uma sessão do aluno. A impersonação administrativa antiga não admite alvos `STUDENT`.

## Processamento e versões

1. Validação de extensão, MIME, conteúdo PDF, tamanho e confirmação.
2. SHA-256 binário e busca por matrícula; mesmo arquivo com outro nome reutiliza o resultado.
3. Job persistente `AcademicAnalysisSource`, lock da matrícula e índice parcial único para um processamento ativo.
4. Extração local existente via pdf.js; conteúdo normalizado é comparado antes da extração estruturada.
5. Extração e cálculo existentes, com conferência obrigatória de RGM e curso.
6. Snapshot canônico com disciplinas ordenadas, código, nome, período, situação/nota, carga horária, pertencimento à grade, curso e RGM.
7. Snapshot igual mantém a versão atual; alteração real cria versão imutável e diff determinístico.
8. Versão e ponteiro atual são gravados na mesma transação. Uma falha conserva o último resultado válido.

O upload do módulo acadêmico permanece inteiramente local: não executa chamadas de IA. A revisão assistida opcional da interface interna continua sendo uma operação explícita do tutor, fora do upload. As regras e o motor em `src/domain/academic-analysis/` não foram alterados pelo portal.

O job usa `after()` conforme a infraestrutura existente e continua depois da resposta ou fechamento da aba. A UI consulta o estado persistido. A execução está sujeita ao limite de 120 segundos da rota/plataforma. Uma execução interrompida é considerada falha após cinco minutos; um novo envio explícito permite retomada, com número de tentativa que impede um worker antigo de publicar sobre um novo. Não há promessa de fila durável externa.

Correções usam o workspace existente e recalculam sem IA. Quando os dados são válidos e realmente diferentes, publicam uma versão; rascunhos incompletos preservam a versão anterior. Uma análise que integra o histórico do aluno não pode ser excluída pela ação comum de exclusão.

## Interface

Identidade Cruzeiro do Sul Virtual, login próprio e navegação simples. Componentes do dashboard existente são reutilizados. Animações de entrada por visibilidade, anel de progresso, estados de carregamento, transições de botões e abertura de detalhes. Sem biblioteca adicional de animação. `prefers-reduced-motion` desabilita o movimento. Dados e percentuais são calculados sobre o extrato real.

## Validação

`npm run typecheck`, `npm run lint`, `npm run test` e `npm run build`.

Os testes de integração do portal exigem PostgreSQL local e migração aplicada. Criam registros sintéticos isolados e removem seus próprios dados e PDFs. Cobrem escopo, concorrência tutor/aluno, hashes binário/textual/acadêmico, alterações reais, falhas, RGM/curso incorretos, correção manual, revogação imediata, convites e vínculo legado.

Limite herdado: o rate limit de autenticação e envio é por processo, como no sistema atual. A exclusão mútua dos uploads é no PostgreSQL e funciona entre instâncias. SMTP e Supabase remoto precisam ser configurados no ambiente em que a aplicação será publicada.

Validação visual e funcional realizada com Chromium em 360, 390, 430, 768 e 1440 px, incluindo convite, ativação, login RGM, suporte, upload, duplicidade, versões e restrições de rotas. Build de produção verificado com `npm run build -- --webpack`; o Turbopack encontrou uma restrição local de abertura de porta ao processar CSS.
