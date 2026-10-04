# PROMPT — FASE 13 • Planejamento e Relatórios Gerais

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Organizar metas, projeções e relatórios inteligentes em uma leitura gerencial consistente, sem converter simulação em fato.

## Leitura dirigida

Leia PlanningView, MetaCompraCard, PlanningProjecaoCard, WeeklyBreakdown, BudgetPressure, PurchaseRadar, SimuladorCompra, RelatoriosView, AnaliseItemView, GastosPorSetorChart e respectivos hooks. Identifique filtros de fonte e categoria e permissões das abas.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. `05-planejamento.png`, biblioteca de componentes, identidade do dashboard e de estoque.

## Implementação / entregáveis

1. Mantenha metas, projeção mensal, ritmo semanal, pressão orçamentária, radar de compras e simulador; reorganize-os conforme a referência, sem remover seções.
2. Escolha destaque azul para o resumo principal adequado. Indicadores de limite excedido mantêm alerta e percentual real, inclusive acima de 100%; uma barra pode saturar visualmente, mas o valor não pode ser reduzido a 100.
3. Diferencie realizado, ideal, orçado e projetado com legenda/traço e contexto. Preserve janelas W1–W5 e critérios atuais; não invente distribuição linear como histórico.
4. Harmonize MonthNavigator, fonte Tudo/Salmão/Geral e categoria, evitando filtros pequenos demais. Preserve comportamento no desktop e abertura das seções no mobile.
5. Em Relatórios Gerais, revise CMV, Estoque, Compras, Tendência, Score e Itens e qualquer aba adicional real. Cada uma recebe cards/gráficos/tabelas no mesmo padrão.
6. Apresente score e confiança com texto acessível e significado atual. Não apenas pontos coloridos minúsculos. Mantenha simuladores com rótulo inequívoco de hipótese.
7. Renove análise de item e gráficos por setor com nomes extensos, valores e unidades completos. Não confundir faturamento de uma fonte com receita de outra.
8. Preserve relatórios, downloads, navegação por item e ações de cenário, sem consultas duplicadas por estética.

## Invariantes específicos

Metas, gastos consolidados, previsões, cenários, score e confiança não mudam. Não chamar compra simulada de compra salva. Não transformar ausência de meta em desempenho positivo. Não modificar sincronização de gasto no servidor nem a separação Salmão/Geral.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Fixture com meta ausente, meta zero conforme domínio, gasto acima do limite, projeção, cinco semanas, cenário hipotético e categorias longas. Verificar que filtro altera os mesmos conjuntos de antes, simular não salva compra e abas respeitam permissões. Comparar valor real/orçado/projetado, testar mobile com seções expandidas e todos os gráficos, score e análise por item.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/13-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 14. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 13.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.
