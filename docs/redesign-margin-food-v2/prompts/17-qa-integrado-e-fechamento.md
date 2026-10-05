# PROMPT — FASE 17 • QA integrado, cobertura total e entrega

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Verificar a implementação em todo o sistema, corrigir regressões visuais deste trabalho e produzir o fechamento verificável, sem declarar cobertura falsa.

## Leitura dirigida

Leia matriz completa, progresso, decisões, relatórios/handoffs, pendências, diff acumulado e baseline. Confirme telas adicionadas ao repositório durante a execução. Consulte os critérios do mestre, as referências e os testes do projeto.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. Todas as referências, respeitando o manifesto; fotos de antes/depois vindas dos componentes reais.

## Implementação / entregáveis

1. Cruze novamente registry, rotas, sidebar e renderização com a matriz. Nenhuma tela pode desaparecer do inventário por renomeação; registre aliases e novas superfícies.
2. Percorra todos os módulos/submódulos e estados em navegador, com conjuntos de dados controlados. Corrija cortes, overflow, contrastes, foco, grids e inconsistências provocadas pela V2.
3. Teste o caminho integrado: trocar unidade autorizada → dashboard → card → detalhe filtrado → operação → retorno; inclua Estoque/Inventário/Compras e os dois CMVs, com ações de escrita somente isoladas.
4. Compare números, contagens, percentuais, relatórios e exportações com baseline equivalente. Cheque parâmetros, unidade, regime e sinais; screenshots bonitas não substituem essa comparação.
5. Execute o plano de viewports, temas, teclado/zoom, menus, gráficos, tabelas longas, formulários e estados. Diferencie teste em browser real, emulação e hardware físico.
6. Execute typecheck, lint, testes/build e revisão do diff. Revise performance, queries, subscriptions, lazy loading, bundle e console. Não esconder falhas por silenciar logs ou remover testes.
7. Remova somente código temporário deste trabalho comprovadamente sem uso. Não limpar arquivos históricos, fixtures úteis ou backups do usuário.
8. Produza `RELATORIO-FINAL.md` com cobertura, evidências, comandos, problemas corrigidos, limitações, arquivos alterados e rollback seletivo. Atualize a memória do projeto concisamente.
9. Se houver bloqueio, gere prompt de correção/validação pendente, sem fingir encerramento. Se tudo passou, entregue um prompt de manutenção visual periódica, sem executá-lo.
10. Não realizar push, merge, deploy ou publicação. A entrega é o código local/revisável e seu relatório; a liberação depende de autorização específica.

## Invariantes específicos

“Implementado” não significa “validado”. “Sem acesso” não significa “não se aplica”. “Mantido” exige justificativa. Nenhuma screenshot de produção deve conter segredos/dados pessoais. Sem garantia absoluta de ausência de bugs; relatório deve refletir testes e limites reais.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Exigir cobertura explícita de todas as telas, confirmação dos oito cards financeiros, todos os contratos específicos de CMV, sidebar/loja isoladas, ações existentes e dados intactos. Nenhuma regressão crítica aberta. Evidências de desktop/mobile/light/dark, acesso permitido/negado e estado vazio/erro. Falhas preexistentes críticas e ambiente insuficiente devem impedir a declaração de validação completa, com próximo passo preciso.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/17-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare o prompt de manutenção visual; sem pendências ocultas. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 17.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.
