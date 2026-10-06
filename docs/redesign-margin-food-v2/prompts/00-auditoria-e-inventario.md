# PROMPT — FASE 00 • Auditoria, cobertura e baseline

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Levantar o estado real do Margin Food, definir a implementação da identidade aprovada e distribuir TODAS as telas entre as fases. Esta etapa produz documentação e evidências, sem alterar o visual ou o negócio.

## Leitura dirigida

Inspecione `CLAUDE.md`, `AGENTS.md`, `package.json`, lockfiles, tsconfigs, `src/pages/Index.tsx`, `src/App.tsx`, `src/components/AppLayout.tsx`, `src/components/FinanceiroView.tsx`, `src/permissions/registry` e os componentes referenciados. Confirme caminhos existentes. Leia o histórico de `docs/redesign/` sem herdar seus estados de conclusão. Confira `CompanySelector`, `KpiCard`, tema, wrappers de gráficos e documentação do domínio.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. Todas as referências, começando pelos recortes `00-card-azul-aprovado.png` e `00-sidebar-aprovada.png`; manifesto com prioridade.

## Implementação / entregáveis

1. Faça uma varredura da árvore de componentes, rotas, abas, registry, imports lazy e navegações internas. Deduplique aliases que apontam para a mesma tela, mas preserve os diferentes caminhos de acesso na matriz.
2. Crie `MATRIZ-DE-COBERTURA.md` com linhas por tela e por estado relevante: principal, detalhe, modal, formulário, empty/error/loading e mobile. Classifique tabelas, cards, gráficos e dependências compartilhadas.
3. Registre para cada indicador rótulo, significado, fonte, unidade, filtros, nulidade, clique e permissão. Faça um inventário de gráficos com tipo, eixos, unidades, denominadores, legenda, tooltip e pontos de overflow a testar.
4. Identifique todas as áreas de Financeiro, Estoque, Salmão, Operação/Inventário, Compras/Fornecedores, CMVs, Ficha Técnica, Planejamento, Relatórios, RH, IA, usuários/configurações/admin e acesso. Inclua superfícies fora da sidebar.
5. Compare as referências com o estado real. Para cada módulo proponha mudanças concretas de layout, cards, gráficos e operações. Diferencie problema confirmado em navegador de suspeita por leitura de código.
6. Capture baseline de testes/build, tema claro/escuro, perfis de teste disponíveis, viewports, rede e bundle. Use ambiente isolado autorizado. Sem ambiente, documente o bloqueio com o procedimento necessário.
7. Crie `PLANO-DE-FASES.md`, `PROGRESSO.md`, `DECISOES.md`, `PENDENCIAS-FUNCIONAIS.md` e relatório `fases/00-RELATORIO.md` a partir dos templates. Preserve os prompts originais deste pacote.
8. Defina a primeira migração opt-in e como validar consumidores antigos das primitivas. Registre a estratégia de rollback seletivo e os critérios de aceitação visual.
9. Atribua fase a cada tela descoberta. Subdivida as etapas grandes sem perder escopo. Registre a lista de referências e divergências de mockups.

## Invariantes específicos

Não mudar CSS, JSX, dependências, dados ou configuração de produção nesta fase. Não chamar algo de bug confirmado apenas porque parece suspeito. Não confundir um redesign histórico concluído com execução desta V2. Não depender exclusivamente dos módulos visíveis ao perfil logado para inventariar o sistema.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Demonstre como o inventário cruza registry, navegação e renderização. Todos os módulos encontrados precisam de responsável/fase. Os oito cards financeiros e seus contratos devem estar descritos. Registre comandos realmente executados e falhas de baseline. Aponte exatamente os acessos que faltam para QA; não os contorne.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/00-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 01. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 00.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.
