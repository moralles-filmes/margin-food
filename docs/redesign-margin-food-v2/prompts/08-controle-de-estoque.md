# PROMPT — FASE 08 • Controle de Estoque e análises de estoque

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Renovar todas as abas de Controle de Estoque, com atenção aos cards de situação, custo, categorias, perdas, consumo e previsões.

## Leitura dirigida

Leia EstoqueGeralView, `estoque/StockDashboardSection`, StockLossesSection, StockPredictiveSection, StockTopConsumedSection, StockInactivityAlert, saldos, detalhes e demais componentes referenciados. Verifique fonte, unidade e navegações por status.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. `03-controle-de-estoque.png`, `08-estoque-mobile.png`, biblioteca de componentes e card azul.

## Implementação / entregáveis

1. Destaque Valor em Estoque com a família azul. Preserve Produtos, Estoque Baixo, Críticos e Sem Estoque, seus valores, cores de situação e cliques filtrados.
2. Renove distribuição por categoria com barras horizontais e nomes legíveis. Apresente status do estoque com legenda, contagens e controle acessível para o filtro correspondente.
3. Revise perdas, principais consumos, previsões, inatividade e demais abas encontradas. Quantidade, valor, período e método atual devem continuar identificáveis.
4. Dê consistência às tabelas de saldo, lote, validade, unidade e movimentações, mantendo colunas e detalhes essenciais. Não ocultar ação operacional para simplificar a tela.
5. Destaque situação crítica sem fazer todo valor de estoque elevado parecer bom. Para projeções, explicite previsão e dados insuficientes conforme retorno atual.
6. Preserve a integração com requisições, leitura, cadastro, detalhes e ações existentes. Use layout responsivo com filtros recolhíveis apenas se todos continuarem disponíveis e identificados.
7. Não substituir estoque consolidado por soma das linhas visíveis. Use fontes canônicas existentes.
8. Atualize a matriz para cada aba e estado; o dashboard é só uma parte desta fase.

## Invariantes específicos

Saldos físicos, custos, critérios de estoque baixo/crítico, lotes, unidades, arredondamento e regras de movimento não mudam. Não criar a opção “OK” como novo cálculo se ela já vier do domínio; reaproveitar. Preservar cliques das fatias/legenda e cards para a mesma situação filtrada.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Testar produto com zero/sem custo/crítico/atenção, nomes extensos, unidade kg/unidade, centenas de categorias, lista paginada e escopo de empresa. Verificar igualdade de totais, badges, filtros por card/status, legenda acessível, gráficos de consumo/perdas/previsão e tabela em 320–1920 px. No mobile, não retirar detalhes importantes nem usar contagens fictícias.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/08-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 09. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 08.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.
