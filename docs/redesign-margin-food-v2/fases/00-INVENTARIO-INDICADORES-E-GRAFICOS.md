# Fase 00 — Inventário de indicadores e gráficos

Levantado por leitura estática do código em 2026-10-03 (branch `main`, SHA `c6a9774`). Nada aqui foi observado em navegador. Fonte de RPC conferida no código cliente; definição viva no banco não verificada, salvo indicação.

## Oito cards do Dashboard Financeiro (contrato a preservar na Fase 03)

Fonte única: `supabase.rpc('get_fin_dashboard_summary', { p_start, p_end })` (`DashboardFinanceiroSection.tsx:144-147`), `p_end` exclusivo. Componente: `KpiCard` de `@/components/ui/KpiCard` (`DashboardFinanceiroSection.tsx:346-355`). Valor sempre `fmtBRL`. Definições do servidor lidas em `supabase/migrations/20260828181108_restore_dashboard_cash_basis_after_overwrite.sql:36-124` (banco vivo não verificado).

| # | Rótulo exato | Campo da RPC | Definição no servidor / fórmula no cliente | Variant / ícone | Delta | Sub-texto | onClick → destino e filtro | Linha |
|---|---|---|---|---|---|---|---|---|
| 1 | Saldo em Caixa | `saldo_caixa` | Soma do `saldo_inicial` das contas ativas + receitas − despesas REALIZADO/CONCILIADO (sem transferência) com data efetiva anterior a `p_end`; muda com o período | `success` / `DollarSign` | Não | Não | Aba `fluxo`, sem filtro | :261 |
| 2 | Contas a Receber | `a_receber` | CR com status fora de RECEBIDO/CANCELADO e vencimento dentro do período | `primary` / `ArrowUpRight` | Não | Não | Aba `receber` com `status='A_RECEBER'` | :262 |
| 3 | Contas a Pagar | `a_pagar` | CP com status fora de PAGO/CANCELADO e vencimento dentro do período | `warning` / `ArrowDownRight` | Não | Não | Aba `pagar`, sem status (fica "todos") | :263 |
| 4 | Contas Vencidas | `a_pagar_vencido` (+ `a_pagar_vencido_qtd`) | CP APROVADO/AGUARDANDO_APROVACAO com vencimento anterior a hoje (fuso SP); não depende do período | `danger` / `AlertTriangle` | Não | `N boleto(s)` quando qtd > 0 | Aba `pagar` com `status='VENCIDO'` | :264 |
| 5 | Receita do Período | `receita` (+ `receita_prev`) | Lançamentos RECEITA REALIZADO/CONCILIADO, operacionais, pela data efetiva de caixa | `success` / `TrendingUp` | Sim: "vs. período anterior", alta = positivo | Não | Aba `lancamentos` com `tipo='RECEITA'` e datas do período (fim inclusivo) | :265 |
| 6 | Despesa Realizada | `despesa` (+ `despesa_prev`) | Idem para DESPESA | `danger` / `TrendingDown` | Sim, invertido: queda = positivo | Não | Aba `lancamentos` com `tipo='DESPESA'` e datas do período | :266 |
| 7 | Despesas Provisionadas | derivado no cliente | `resumo.despesa + resumo.aPagar` (despesa realizada + contas a pagar em aberto com vencimento no período) | `warning` / `DollarSign` | Não | Não | Aba `pagar`, sem status | :92, :267 |
| 8 | Resultado | `resultado` (+ `resultado_prev`) | `receita − despesa` calculado no servidor | `success` se ≥ 0, senão `danger` / `DollarSign` | Sim, alta = positivo | Não | Aba `dre`, sem filtro | :268 |

**Delta.** `buildDelta` usa `calcVariacaoPct` (`src/domain/financeiro/selectors.ts:83-86`), que devolve `null` quando o período anterior é zero; nesse caso o card fica sem a linha de comparação. Formato `formatPercentBR(|pct|, 1)` + seta. O período anterior tem o mesmo tamanho do atual (`p_start − (p_end − p_start)`, migration :91).

**Nulo, erro, loading.** `Number(x) || 0` em todos os campos: nulo vira R$ 0,00. Em erro só há toast; os cards mostram o último valor ou zero (`:166-169`). Loading troca o grid por 8 skeletons. Não há estado vazio.

**Grid.** `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-8 gap-3` (`:335`, `:344`). O valor é `text-xl font-display font-bold` sem truncamento (`KpiCard.tsx:84`). Três cards têm rodapé de delta, um tem sub-texto e quatro não têm nada.

**Filtros.** `SegmentedControl` Dia/Mês/Período (`:279-287`). Mês: Select `w-[200px]` com os 12 últimos meses. Dia: `DatePicker`. Período: 2 `DateInput` + Aplicar (único modo que não carrega sozinho). Atualizar reexecuta `loadResumo`. Há refresh automático por `useDataEvent('financeiro:*')` (`:177`).

**Exportações.** PDF (jsPDF + autoTable, cabeçalho RGB 220,80,50) e Excel (`safeXlsx`) com a tabela Indicador/Valor; não incluem o período selecionado nem os gráficos (`:185-246`).

**Gráficos.** "Receitas vs Despesas" (BarChart) e "Resultado Mensal" (LineChart) usam a janela histórica do select 3/6/12 meses contada a partir de hoje, independente do filtro do topo (`DashboardCharts.tsx:71-72, 77`). "Despesas por Categoria (Top 8)" (PieChart + lista) usa o período do filtro do topo (`:74, 78`). Nenhum dos três indica qual janela está usando.


## Indicadores — Financeiro — análises e CMV Financeiro

| Tela | Rótulo | Significado | Fonte (RPC/hook) | Unidade/formatador | Filtros que afetam | Nulo/zero/erro | Clique | Permissão | Componente |
|---|---|---|---|---|---|---|---|---|---|
| KPIs | Receita Total | Receita do período (caixa) | `get_fin_kpis.receita_total` | R$ `fmtBRL` | Select 3/6/12 meses | nulo vira 0; erro troca a tela inteira | Não | `financeiro:kpis:view` | `KpiCard` success |
| KPIs | Despesa Total | Despesa do período | `despesa_total` | R$ | idem | idem | Não | idem | `KpiCard` danger |
| KPIs | Margem | Margem do período | `margem` | % `formatPercentBR` | idem | idem | Não | idem | `KpiCard` success/danger pelo sinal |
| KPIs | Ticket Médio | Não verificado no SQL | `ticket_medio` | R$ | idem | idem | Não | idem | `KpiCard` primary |
| KPIs | Inadimplência | Vencidos ÷ contas pendentes a receber × 100 (texto do tooltip) | `inadimplencia` | % | idem | idem | Não (tooltip) | idem | `KpiCard` danger se > 10, senão warning |
| KPIs | Total Vencido | Não verificado no SQL | `total_vencido` | R$ | idem | idem | Não | idem | `KpiCard` danger |
| KPIs | Prazo Médio Pgto | Dias | `prazo_medio_pagamento` | `N dias` | idem | idem | Não | idem | `KpiCard` warning se > 5 |
| KPIs | Prazo Médio Receb. | Dias | `prazo_medio_recebimento` | `N dias` | idem | idem | Não | idem | `KpiCard` warning se > 5 |
| KPIs | Top Fornecedores por Volume | Ranking | `top_fornecedores` | R$ | idem | Bloco some se vazio | Não | idem | Lista em `Card` |
| Comparativo | Receita / Despesa / Resultado | Valor A, valor B e variação % | `comparativo_periodos` | R$ + badge % | Período A e B (`type=month`) | Variação 0 mostra "—" | Não | `financeiro:comparativo:view` | `Card` local + `Badge` |
| Comparativo | Margem | % A, % B, diferença em pp | idem | % e pp (`formatDecimalBR`) | idem | idem | Não | idem | `Card` local |
| Comparativo | Lançamentos | Contagem A e B | idem | inteiro sem formatador | idem | idem | Não | idem | `Card` local |
| Auditoria | Total / Inserções / Alterações / Exclusões / Usuários | Contagens do filtro | `_guarded_list_fin_audit_logs.summary` | inteiro sem formatador | Entidade, ação, busca, dias | Bloco some enquanto `summary` é nulo | Não | `financeiro:auditoria:view` | `Card` local (5) |
| Orçamento | Receita e Despesa realizado / orçado | Totais do mês | `get_fin_orcamento_arvore` | R$ em texto de subtítulo | Mês; edições não salvas entram no orçado | 0 quando sem dados | Não | `financeiro:orcamento:view` | Texto (sem card) |
| Orçamento | % Exec. e Status por linha | Realizado ÷ orçado; Em linha / Atenção / Estourado / Abaixo da meta | cálculo no cliente (`computeStatus`) | % 1 casa + `StatusBadge` | Mês | Sem orçado: "—" e sem badge | Não | idem | `StatusBadge` |
| DRE / DFC | Totais, Resultado, Saldo inicial e acumulado | Linhas de total da árvore | `get_fin_dre_summary` / `get_fin_dfc_summary` | R$ + % sobre receita do próprio demonstrativo | Meses e mês âncora | Receita 0: % vira "—" | Não | `financeiro:dre:view` / `financeiro:fluxo:view` | Linhas de `Table` |
| Borderô | Contas já pagas | Despesas pagas no período | `get_fin_bordero` (`totalPaidCents`) | R$ de centavos | Semana / Mês / Período | Erro bloqueia a tela (não mostra números) | Não | `financeiro:relatorio-socios:view` | `KpiCard` success |
| Borderô | Contas a vencer | CP em aberto por vencimento | `totalPayableCents` | R$ | idem | idem | Não | idem | `KpiCard` warning |
| Borderô | Total de contas | Pagas + a vencer | `totalExpenseCents` | R$ | idem | idem | Não | idem | `KpiCard` default |
| Borderô | Saldo das contas | Saldo oficial das contas ativas | `totalAccountBalanceCents` | R$ | Não muda com o período (não verificado no SQL) | Conta sem saldo conta como 0 e gera alerta | Abre diálogo de composição | idem | `KpiCard` primary |
| Borderô | Saldo final provisionado · Positivo/Neutro/Negativo | Saldo das contas − contas a vencer | `projectedFinalBalanceCents` | R$ | Período | idem | Não | idem | `KpiCard` success/default/danger |
| Apresentação | Receita operacional | Realizado do período | `get_fin_presentation_socios` (`managerialResult.revenue`) | R$ | Período, unidade | Delta "Sem dados", "Fora do histórico", "Indisponível" ou "Base zero" | Rota `/revenue` | `financeiro:relatorio-socios:view` | `KpiCard` success |
| Apresentação | Despesa operacional | idem | `managerialResult.expense` | R$ | idem | idem | Rota `/expense` | idem | `KpiCard` danger |
| Apresentação | Resultado operacional | Receita − despesa | `managerialResult.result` | R$ | idem | idem | Rota `/result` | idem | `KpiCard` success/danger |
| Apresentação | Margem operacional | Resultado ÷ receita | `managerialResult.marginPercent` | % 1 casa; delta em p.p. | idem | idem | Rota `/margin` | idem | `KpiCard` default |
| Apresentação | CMV | Grupo gerencial `cmv` | metadados + snapshot | R$; sub "% da receita operacional" | idem | "Calculando…" ou "Indisponível" | Rota `/cmv` | idem | `KpiCard` primary |
| Apresentação | Indicadores de plano (até 5) | Realizado, Orçado, Projeção, Desvio | `get_fin_presentation_plan` | R$ ou %; desvio em R$ (%) ou p.p. | Período, modo | "Meta não configurada" / "Indisponível" | Não | idem | `IndicatorCard` local |
| Apresentação | Contas a pagar / a receber (em aberto) | Valor e nº de títulos | snapshot `openItems` | R$ + inteiro | Período | não verificado | Rotas `/payables`, `/receivables` | idem | Botão-card local |
| Apresentação (detalhe) | Total no período / vs. período anterior / vs. ano anterior / Participação | 4 cards do detalhe | snapshot + comparações | R$, % ou p.p. | Período, categoria | "Base indisponível", "Comparação indisponível", "Sem receita base", "Indisponível" | Não | idem | `Card` local |
| Apresentação (cenário) | Receita, Despesas, Resultado, Margem, CMV | Base × cenário | cálculo local (`usePresentationScenario`) | não verificado | Alavancas | não verificado | Não | `relatorio-socios:simulate` | `MetricComparisonCard` local |
| CMV | Faturamento | Faturamento bruto do Fechamento de Caixa | `get_fin_cmv_financeiro` | R$ de centavos (`formatarCentavos`) | Modo e intervalo | "Sem fechamento de caixa no período."; sem anterior: "Sem base de comparação" | Não | `financeiro:cmv:view` | `CmvIndicadorCard` local |
| CMV | CMV Financeiro | Linhas de rateio incluídas, por competência | idem | R$ | idem | idem | Não | idem | idem |
| CMV | % CMV | CMV ÷ faturamento | idem | %; variação em p.p. | idem | Mostra o motivo quando não há percentual | Não | idem | idem |
| CMV | Variação do CMV em R$ | Diferença atual − anterior | idem | R$ com sinal | idem | "—" sem período anterior | Não | idem | idem |
| CMV | Boletos vinculados ao CMV | Contagem | idem | inteiro | idem | "—" quando nulo | Não | idem | idem |
| CMV (Regras) | Pendentes de classificação / Sem data de competência | Contagens de todo o histórico | `report.pendentesGeral`, `report.semCompetencia` | inteiro + R$ | Nenhum | "—" quando nulo | Botões abrem a lista | `cmv:view`; lote exige `cmv:manage` | Blocos `dl` locais |


## Gráficos — Financeiro — análises e CMV Financeiro

| Tela | Título | Tipo | Eixos/unidades | Denominador | Legenda/tooltip | Usa chartTheme/ChartCard? | Pontos de overflow a testar |
|---|---|---|---|---|---|---|---|
| Dashboard | Receitas vs Despesas | Recharts BarChart, 2 séries | X `MMM/yy`; Y R$ compacto | — | `ChartLegend` + `ChartTooltip` | chartTheme sim; ChartCard não (usa `Card`) | 12 meses em tela estreita; altura fixa 260 |
| Dashboard | Resultado Mensal | Recharts LineChart | X `MMM/yy`; Y R$ compacto | — | Só tooltip; sem legenda | chartTheme sim; cor `hsl(var(--primary))` inline | Valores negativos; 12 pontos no mobile |
| Dashboard | Despesas por Categoria (Top 8) | Recharts PieChart + lista lateral | Fatia = R$; rótulo = nome (15 caracteres) + % | Total das 8 categorias retornadas | Rótulo direto `fontSize=10` sem linha; tooltip sem `tooltipProps`; lista com `max-w-[160px] truncate` | Cores `SERIES_COLORS`; ChartCard não | Rótulos sobrepostos em fatias pequenas; rótulo cortado fora do raio 90 no mobile |
| KPIs | Receita vs Despesa por Mês | Recharts BarChart | X `mmm/aa`; Y R$ compacto | — | Tooltip; sem legenda | chartTheme sim; ChartCard não | 12 meses no mobile |
| Comparativo | Comparativo Visual | Recharts BarChart, 2 séries | X = indicador; Y R$ compacto | — | Legenda + tooltip | chartTheme sim (`SERIES_COLORS[0..1]`); ChartCard não | Margem (%) e Lançamentos (contagem) podem dividir o eixo em R$ (não verificado o conteúdo de `grafico`) |
| Apresentação (painel) | Evolução diária/mensal/anual | Recharts LineChart, 3 séries | X rótulo da granularidade; Y R$ compacto, largura 64 | — | Legenda + tooltip | chartTheme sim; ChartCard não | Série diária longa (`minTickGap=22`) |
| Apresentação (plano) | Realizado x orçamento no período | Recharts LineChart, 4 séries (2 tracejadas) | Y R$ compacto | — | Legenda com `dashedKeys` | chartTheme sim; ChartCard não | 4 itens de legenda no mobile |
| Apresentação (plano) | CMV sobre receita | Recharts LineChart + `ReferenceLine` | Y % (`${value}%` inline) | Receita | Rótulo "Meta x%" na linha | chartTheme sim; `ReferenceLine` com cores inline | Rótulo da meta sobre a linha |
| Apresentação (detalhe) | Evolução no período | Recharts LineChart; 2º eixo % só em CMV | Y R$ compacto ou %; eixo direito % | Receita (linha "% da receita") | Legenda + tooltip | chartTheme sim; ChartCard não | Dois eixos em 360px |
| Apresentação (cenário) | Sensibilidade — uma variável por vez | Recharts LineChart, 2 eixos | Resultado (R$) e Margem (%) | — | Tooltip próprio (`SensitivityChartTooltip`) | chartTheme parcial; cores inline `--primary`, `--info` | leitura parcial |
| Apresentação (slides) | Séries mensais, sensibilidade e série temporal | SVG próprio (`viewBox` 1000×400, 1000×360, 1000×380) | Rótulos em px fixos (12 a 14) | — | Legenda desenhada no SVG | Não usa Recharts; usa tokens `--chart-*`, `--success`, `--destructive` | Texto do SVG escala com o slide; leitura parcial |
| CMV / Visão Geral | Faturamento × CMV × % CMV | Recharts ComposedChart (2 barras + linha) | Esquerda R$ compacto (64); direita % (44); X = faixa | Faturamento | Legenda própria (`LegendaItem`) no cabeçalho; tooltip próprio (`CaixaTooltip`); rótulos de % só com até 8 pontos | chartTheme parcial (`axisProps`, `gridProps`, `cursorProps`); ChartCard, `ChartTooltip` e `ChartLegend` não | Mensal com 30 dias; rótulos de % sobre as barras; `h-72` |
| CMV / Visão Geral | Composição do CMV por categoria | Recharts PieChart (rosca) + legenda clicável; cai para barras CSS se houver negativo | Fatia = centavos | CMV total | Total no centro; legenda com valor e % | Cores `corCategoriaCss`; tooltip próprio | Rosca fixa `h-52 w-52`; nomes longos na legenda (`truncate`) |
| CMV / Visão Geral e Comparativo | Comparativo de CMV — período atual × anterior / CMV por categoria — atual × anterior | Recharts BarChart, 2 séries | X = categoria (corta em 14 caracteres, inclina −25° com mais de 5); Y R$ compacto | — | Legenda própria; tooltip próprio | chartTheme parcial | Coluna estreita de 3,3fr em `xl`; 8 a 10 categorias |
| CMV / Análise | Evolução do CMV por categoria (diária/semanal/mensal) | Recharts BarChart empilhado | X = faixa; Y R$ compacto | — | Legenda com até 8 grupos; tooltip lista todos | chartTheme parcial | Altura `h-[26rem]`; mais de 8 grupos sem legenda |
| CMV / Análise | Ranking de categorias no CMV | Barras CSS (não Recharts) | Largura proporcional ao maior valor; % de participação | CMV total | `title` nativo | — | Nome fixo `w-28 truncate` |


## Indicadores — Financeiro — operações e cadastros

| Tela | Rótulo | Significado | Fonte (RPC/hook) | Unidade/formatador | Filtros que afetam | Nulo/zero/erro | Clique | Permissão | Componente |
|---|---|---|---|---|---|---|---|---|---|
| Contas Bancárias | (nome da conta) saldo | "Saldo contabilizado atual" | `get_all_saldos_contas` | R$ `fmtBRL` | Busca e tipo só filtram os cards | Ausente vira 0; erro ignorado | "Ver extrato" → Lançamentos com a conta | `financeiro:contas:view` | Card shadcn local |
| Contas Bancárias | Banco confirmado em {data} | Saldo do extrato confirmado na conciliação | sessionStorage (`loadSaldoExtrato`) | R$ `fmtBRL` | — | Linha some se não houver | — | — | Texto no card |
| Contas Bancárias | Contabilizado na mesma data / Diferença pendente no extrato | Divergência banco × razão na data do checkpoint | `get_fin_saldo_conta_em` | R$ `fmtBRL` | — | Só aparece se diferença ≥ 0,01; erro só em console | — | `financeiro:conciliacao:view` ou `:reconcile` | Bloco local warning |
| Livro Razão | Entradas | Soma de receitas do filtro | `get_fin_lancamentos_totais` | R$ `fmtBRL` | Data, tipo, origem, conta, categoria | Erro mantém valor anterior (console) | — | `financeiro:lancamentos:view` | Faixa local (span) |
| Livro Razão | Saídas | Soma de despesas do filtro | `get_fin_lancamentos_totais` | R$ | Idem | Idem | — | Idem | Faixa local |
| Livro Razão | Resultado | `resultado` devolvido pela RPC | `get_fin_lancamentos_totais` | R$ | Idem | Idem | — | Idem | Faixa local |
| Livro Razão | Total de entradas / Total de saídas / Total de transferências | Variante quando o filtro de tipo ≠ Todos | `get_fin_lancamentos_totais` | R$ | Idem | Idem | — | Idem | Faixa local |
| Livro Razão | Saldo atual | Saldo da conta filtrada (ou geral) na data final | `get_fin_saldo_atual` | R$ | Conta e data final | Erro mantém valor anterior | — | Idem | Faixa local |
| Livro Razão | saldo total (cabeçalho do dia) | Saldo de fechamento do dia | `saldo_apos` de `list_fin_lancamentos_cursor`, com carry-forward no cliente | R$ | Todos os filtros | "—" quando desconhecido | — | Idem | Cabeçalho local na tabela |
| Conciliação (Importar) | N p/ conciliar, com sugestões, p/ criar, já conciliada(s), mov. interna(s), ignorada(s), total | Contagem de linhas do extrato por situação | Estado do cliente (`linhas`) | Inteiro | Chip ativo filtra a tabela | Chips com 0 somem (exceto conciliar, criar, total) | Filtra a tabela | `financeiro:conciliacao:view` | Chip local (`importFilterChip`) |
| Conciliação (Importar) | Saldo confere / NÃO confere — diferença de | Banco × sistema na data confirmada | `get_fin_saldo_conta_em` + linhas pendentes | R$ `fmtBRL` | Conta selecionada | Só aparece com saldo confirmado | — | Idem | Card local |
| Conciliação (Lançamentos) | N pendente(s) • N conciliado(s) | Contagem na conta | count em `fin_lancamentos` | Inteiro | Conta (demais filtros: não verificado) | não verificado | — | Idem | Texto |
| Fluxo de Caixa | Entradas Realizadas | `totais.entradas` | `get_fin_cashflow` | R$ `fmtBRL` | Modo esconde o card; período fixo (mês atual + próximo) | 0 durante carga e em erro (toast) | — | `financeiro:fluxo:view` | Card shadcn local |
| Fluxo de Caixa | Saídas Realizadas | `totais.saidas` | `get_fin_cashflow` | R$ | Idem | Idem | — | Idem | Card local |
| Fluxo de Caixa | Prev. Entradas / Prev. Saídas | Previstos (só no modo Só Previsto) | `get_fin_cashflow` | R$ | Idem | Idem | — | Idem | Card local |
| Fluxo de Caixa | Saldo Real | entradas − saídas (calculado no cliente) | `get_fin_cashflow` | R$ | Idem | Idem | — | Idem | Card local |
| Fluxo de Caixa | Saldo Acumulado | `totais.saldo_acumulado` | `get_fin_cashflow` | R$ | Não muda com o modo | Idem | — | Idem | Card local |
| Fluxo de Caixa | Saldo Projetado | (entradas + previstas) − (saídas + previstas), no cliente | `get_fin_cashflow` | R$ | Não muda com o modo | Idem | — | Idem | Card local |
| Projeção | Saldo Inicial | Saldo de partida (automático ou manual) | `get_fin_fluxo_projecao` | R$ `fmtBRL` | Dias, saldo manual | Cards somem em erro/vazio | — | `financeiro:projecao:view` | Card shadcn local |
| Projeção | Entradas / Saídas | Títulos e previstos no horizonte | `get_fin_fluxo_projecao` | R$ | Dias | Idem | — | Idem | Card local |
| Projeção | Receita estimada / Despesa estimada | Média por dia da semana fora de títulos | `get_fin_fluxo_projecao.estimativa` | R$ | Switch Incluir estimativa | Cards só com estimativa disponível | — | Idem | Card local |
| Projeção | Saldo Final | Saldo no fim do horizonte | `get_fin_fluxo_projecao` | R$ | Dias, saldo manual, estimativa | Idem | — | Idem | Card local |
| Projeção | Dias Negativo | Dias com saldo < 0 | `get_fin_fluxo_projecao` | Inteiro + ícone | Idem | 0 em verde | — | Idem | Card local |
| Contas a Pagar | N vencida(s) • Total pendente | Totais gerais (independem do filtro) | `get_fin_counts_by_status` | Inteiro e R$ | Nenhum | 0 se falhar | — | `financeiro:pagar:view` | Subtítulo |
| Contas a Pagar | Total filtrado • N lançamento(s) | Soma e contagem do filtro | `list_fin_contas_pagar_cursor` (`filtered_total`, `filtered_count`) | R$ e inteiro | Todos os filtros | "Calculando..." na carga; só aparece com filtro ativo | — | Idem | Chip local |
| Contas a Pagar | Contas acima de {valor} nascem como "Aguard. Aprovacao" | Limite de aprovação | `fin_get_limite_aprovacao_atual` | R$ | — | Linha some se a RPC falhar | "alterar limite" abre dialog | `financeiro:pagar:approve` | Texto |
| Contas a Receber | N vencida(s) • Total pendente | Totais gerais | `get_fin_counts_by_status` | Inteiro e R$ | Nenhum | 0 se falhar | — | `financeiro:receber:view` | Subtítulo |
| Contas a Receber | Total filtrado • N lançamento(s) | Soma e contagem do filtro | `list_fin_contas_receber_cursor` | R$ e inteiro | Todos os filtros | Idem Pagar | — | Idem | Chip local |
| Detalhe da conta | Valor total / Valor em aberto / Valor pago | Valor do título conforme status | Props do pai | R$ (`fmt` e literal "0,00") | — | "0,00" fixo | — | — | Bloco local no dialog |
| Fechamento de Caixa | Dias registrados | Nº de fechamentos no período | `financeiro_fechamento_caixa` (length) | Inteiro | Data de/até | Skeleton na carga; erro via toast | — | `financeiro:fechamento:view` | Card shadcn local |
| Fechamento de Caixa | Total Bruto | Soma de `faturamento_bruto` (reduce no cliente) | Idem | R$ `fmtBRL` | Período | Idem | — | Idem | Card local |
| Fechamento de Caixa | Total Líquido | Soma de `faturamento_liquido` (reduce no cliente) | Idem | R$ | Período | Idem | — | Idem | Card local |
| Fechamento de Caixa | Total de pedidos / Total de pessoas | Soma das quantidades por forma de venda | `summarizeFechamentoPeriodo` sobre `financeiro_fechamento_marca_valores` | Inteiro `toLocaleString('pt-BR')` | Período | 0 se falhar a carga de marcas | — | Idem | Card local |
| Fechamento (dialog) | Faturamento bruto — soma das marcas / Total de pedidos / Total de pessoas / Líquido estimado | Resumo do formulário | Estado do formulário | R$ e inteiro | — | — | — | create/edit | Bloco local |
| Alertas | N crítico(s) • N atenção • N info • N total | Contagem por severidade | `get_fin_alertas` (montado no cliente) | Inteiro | Nenhum | Some com 0; erro via toast | Botões de severidade filtram | `financeiro:alertas:view` | Subtítulo + botões |
| Categorização | N regra(s) ativa(s) • N lançamento(s) sem categoria | Regras ativas e pendências | `fin_regras_categorizacao`, `contar_lancamentos_sem_categoria` | Inteiro | — | "..." na carga | — | `financeiro:categorizacao:view` | Subtítulo + badge no botão |
| Recorrências | Parcelas (geradas/máx) e Status no Mês | Por recorrência | `_guarded_list_recorrencias` | Inteiro; "∞" sem limite | Mês | — | — | `financeiro:recorrencias:view` | Coluna de tabela |

Nenhuma tela do escopo usa `KpiCard` de `@/components/ui/KpiCard`.


## Gráficos — Financeiro — operações e cadastros

| Tela | Título | Tipo | Eixos/unidades | Denominador | Legenda/tooltip | Usa chartTheme/ChartCard? | Pontos de overflow a testar |
|---|---|---|---|---|---|---|---|
| Projeção de Fluxo | (sem título) | Recharts AreaChart, 1 série "Saldo", ReferenceLine em 0 | X: data dd/MM (`slice(0,5)`); Y: R$ compacto (`chartValueFormatters.moneyCompact`) | Não se aplica | Sem legenda; `ChartTooltip` com `fmtBRL` | Sim para `axisProps`, `gridProps`, `tooltipProps`, `makeActiveDot`, `ChartTooltip`; NÃO usa `ChartCard` (Card manual, altura fixa 300); cores inline `hsl(var(--primary))` e `hsl(var(--primary) / 0.2)` | 90 dias de rótulos no eixo X; largura de celular; valores negativos grandes no eixo Y |
| Fechamento de Caixa | Tendência — Faturamento Líquido Diário (texto `<p>` solto) | Recharts AreaChart, 1 série "Líquido" | X: data dd/MM/yyyy completa; Y: R$ compacto | Não se aplica | Sem legenda; `ChartTooltip` com `fmtBRL` | Sim para props do chartTheme; NÃO usa `ChartCard` (Card manual, altura 180); cor por classe `fill-primary/20 stroke-primary` | Rótulo de data completo com período longo; celular; só renderiza com 2+ dias |

Fluxo de Caixa, Livro Razão, Contas a Pagar/Receber, Contas Bancárias, Alertas, Recorrências, Cadastros e Categorização não têm gráfico.


## Indicadores — Estoque, Operacional, Inventário e Salmão

| Tela | Rótulo | Significado | Fonte | Unidade/formatador | Filtros que afetam | Nulo/zero/erro | Clique | Permissão | Componente |
|---|---|---|---|---|---|---|---|---|---|
| EST-003 Dashboard | Valor em Estoque | Valor total do estoque | RPC `get_stock_dashboard` → `valor_total` | R$ (`formatCurrency`) | Período (dias) — efeito sobre este campo não verificado | "—" sem dados | — | `estoque:dashboard:view` | KpiCard (primary) |
| EST-003 | Produtos | Total de produtos; sub "N com saldo" | idem → `total_produtos`, `produtos_com_saldo` | inteiro | idem | "—" | Vai para Saldo sem filtro | idem | KpiCard |
| EST-003 | Estoque Baixo | Qtd em `atencao` | idem → `atencao` | inteiro | idem | "—" | Saldo com filtro (mapa `CARD_NAV_MAP`) | idem | KpiCard (warning) |
| EST-003 | Críticos | Qtd em `critico` | idem | inteiro | idem | "—" | Saldo filtrado | idem | KpiCard (danger) |
| EST-003 | Sem Estoque | Qtd `sem_estoque` | idem | inteiro | idem | "—" | Saldo filtrado | idem | KpiCard |
| EST-005 | Itens Sem Movimentação | Itens acima do limite de inatividade | RPC `get_inactive_stock_items` | "N item(ns) parado(s)" | Nenhum no número (filtros só na lista) | 0 → botão desabilitado; erro só no console | Expande lista | `estoque:preditivo:view` | Card local |
| EST-006 Ranking | Consumo Total | Soma do consumo; sub "N dias" | RPC `get_stock_top_consumed` → `consumo_total` | `formatQty` (unidade não exibida) | Período, categoria, ordenar | Bloco só aparece com itens | — | `estoque:ranking:view` | KpiCard (primary) |
| EST-006 | Custo Consumido | Custo do consumo | idem → `custo_total` | R$ | idem | idem | — | idem | KpiCard (primary) |
| EST-006 | Itens Críticos | Itens críticos no ranking | idem → `itens_criticos` | inteiro | idem | "—" | — | idem | KpiCard (danger) |
| EST-006 | Sem Custo | Itens sem custo | idem → `itens_sem_custo` | inteiro | idem | "—" | — | idem | KpiCard |
| EST-008 Perdas | Valor Perdido | Valor das perdas | RPC `get_stock_losses_report` → `valor_total` | R$ | Período, granularidade, categoria | "—" | — | `estoque:perdas:view` | KpiCard (danger) |
| EST-008 | Qtd Perdida | Quantidade perdida | idem → `quantidade_total` | `formatQty` | idem | "—" | — | idem | KpiCard (danger) |
| EST-008 | Itens Afetados | Produtos distintos | idem → `itens_distintos` | inteiro | idem | "—" | — | idem | KpiCard (primary) |
| EST-008 | Registros | Nº de registros | idem → `total_registros` | inteiro | idem | "—" | — | idem | KpiCard |
| EST-008 | Sem Custo | Registros sem custo | idem → `registros_sem_custo` | inteiro | idem | "—" | — | idem | KpiCard (warning) |
| EST-011 Preditivo | Ruptura em até 3 dias | Itens com ruptura prevista | RPC `get_stock_predictive_analysis_v2` → `kpis.ruptura_3d` | inteiro | Categoria, cobertura, padrão semanal, somente críticos | Bloco oculto sem `kpis` | — | `estoque:preditivo:view` | KpiCard (danger) |
| EST-011 | Pico previsto no FDS | `kpis.pico_fds` | idem | inteiro | idem | idem | — | idem | KpiCard (warning) |
| EST-011 | Com sazonalidade | `kpis.com_sazonalidade` | idem | inteiro | idem | idem | — | idem | KpiCard (primary) |
| EST-011 | Compras sugeridas (Nd) | `kpis.valor_compras_sugeridas` | idem | R$ (`fmtBRL`) | idem | idem | — | idem | KpiCard |
| EST-012 Saldo | OK / Estoque Baixo / Crítico / Sem Estoque | Contagem por saúde do estoque | Client: `countStockHealth` sobre store | inteiro | Nenhum (conta todos os ativos carregados) | 0 | Alterna filtro de status da lista | Sub-aba `estoque:saldo:view` | KpiCard (success/warning/danger/default) |
| EST-014 Movimentações | Total Entradas / Total Saídas | Valor movimentado | `store.movKpis[lado].total_valor` (fallback soma client) | R$ (`fmtBRL`) | Aba Entradas/Saídas + filtros da lista | Skeleton durante loading | — | Sub-aba `estoque:movimentacoes:view` | Card local |
| EST-014 | Qtd Total | Quantidade total | `movKpis.total_qtd` | 1 casa (`formatFixedBR`) | idem | Skeleton | — | idem | Card local |
| EST-014 | Registros (entradas) / Perdas (R$) (saídas) | Nº de registros ou valor de perdas | `movKpis.registros` / `perdasTotal` (origem de `perdasTotal` não verificada) | inteiro / R$ | idem | Skeleton | — | idem | Card local |
| EST-019 Simulador | Total Estimado / Itens Ruptura / Cobertura Atual / Itens Parados | Resumo da simulação | Edge `cmv` (ação não verificada) | R$ / inteiro / semanas (formatadores não verificados) | Filtros do simulador + qtd editada | Só após simular | — | Sub-aba `estoque:simulador:view` | Card local |
| INV-004 Detalhe | Itens | Contados / total | Client sobre `itens` | "n/N" | Nenhum (ignora busca/filtros) | 0/0 | — | Sub-aba inventário | KpiCard |
| INV-004 | Acurácia | `inv.acuracia_percent` | Edge `inventario` | % (`formatPercentBR`) | — | Só se FINALIZADO/SOB_ANALISE | — | idem | KpiCard (success) |
| INV-004 | Drift Total | Soma de `impacto_financeiro` | Client | R$ | — | idem | — | idem | KpiCard (danger/success pelo sinal) |
| INV-004 | Críticos / Alertas | Itens por classificação | Client | inteiro | — | 0 | — | idem | KpiCard (danger / warning) |
| INV-004 | Score de Risco Operacional | `inv.score_risco` + `flag_risco` | Edge `inventario` | número | — | Oculto se 0 ou não finalizado | — | idem | Card local |
| INV-010 Rápido | Itens contados / Ajustes gerados / Impacto financeiro | Resultado do salvamento | RPC `create_quick_inventory_atomic` | inteiro / inteiro / R$ | — | Só após salvar | — | `inventario:rapido:*` | Bloco local |
| INV-011 Dashboard | Última Acurácia | Acurácia do último finalizado | `store.dashboard.finalizados[0]` | % | — | Oculto sem finalizados | — | `inventario:dashboard:view` | KpiCard (success) |
| INV-011 | Drift Total | Drift do último finalizado | idem | R$ | — | idem | — | idem | KpiCard |
| INV-011 | Score Médio Risco | `avgScore`; sub Alto Risco/Atenção/Seguro | idem | número | — | — | — | idem | KpiCard (variante por faixa 30/60) |
| INV-011 | Sob Análise | Qtd de inventários sob análise | idem | inteiro | — | 0 → variante default | — | idem | KpiCard |
| SAL-002 Dashboard | Comprado | kg comprados; sub "N entradas" | RPC `_salmon_dashboard_guarded` → `totalEntriesKg` | kg inteiro | PeriodFilter | 0 kg | — | Sub-aba `salmon:dashboard:view` | KpiCard (primary) |
| SAL-002 | Consumido | kg consumidos; sub "N manip." | idem → `consumidoKg` | kg inteiro | idem | 0 | — | idem | KpiCard (variante `gold`) |
| SAL-002 | Investido | Valor comprado; sub "Médio: R$/kg" | idem → `totalValue`, `avgCostPerKg` | R$ | idem | R$ 0 | — | idem | KpiCard |
| SAL-002 | Perda Total | kg perdidos; sub "R$ • %" | idem → `perdaKg`, `perdaValor`, `avgLossPercent` | kg 1 casa | idem | 0 | — | idem | KpiCard (danger) |
| SAL-002 | Aproveitamento | Rendimento médio; sub "Média geral" | idem → `avgYieldPercent` | % | idem | 0% | — | idem | KpiCard (success) |
| SAL-002 | CMV Real | CMV do salmão; sub "Fat: R$" ou "Sem faturamento" | idem → `cmvSalmonPercent`, `revenue` | % | idem | `?? 0` → "0%" verde quando nulo | — | idem | KpiCard (danger se > 35) |
| SAL-002 | Estoque Bruto | Saldo bruto; sub valor R$ | idem → `saldoBrutoKg` | kg 1 casa | Efeito do período não verificado | — | — | idem | KpiCard (danger se `lowGross`) |
| SAL-002 | Estoque Limpo | Saldo limpo; sub "N lotes" | idem → `estoqueLimpoKg` | kg 1 casa | idem | — | — | idem | KpiCard (danger se `lowClean`) |
| SAL-002 | Estoque Limpo (Disponível / Lotes ativos / Em risco) | Resumo do limpo e risco de validade | RPC + store `lotesLimpos` | kg / inteiro / kg + R$ | — | — | — | idem | Card local |
| SAL-002 | Meta g/Cliente (mês) | Meta × Realizado × Diferença × Status (emoji) | store `metaProv` + cálculo client | g | — | Oculto sem meta | — | idem | Card local |
| SAL-002 | Custo & CMV | Custo médio/kg bruto, /kg limpo, CMV Salmão (%), Custo total período | RPC | R$ / % | PeriodFilter | — | — | idem | Card local |
| SAL-002 | Perdas no Período | Perda kg, Perda R$, Aproveitamento médio, "Custo perdido no mês" | RPC (`monthLossValue = dash.perdaValor`) | kg / R$ / % | PeriodFilter | Oculto sem manipulações | — | idem | Card local |
| SAL-002 | Risco Financeiro (Validade) | Kg vencido, Kg vencendo, R$ em risco, % estoque em risco | store `lotesLimpos` | kg / R$ / % | — | Oculto sem lotes em risco | — | idem | Card local |
| SAL-011 Estoque | Estoque Bruto | kg disponível, valor estoque, custo médio/kg | store `useSalmonStore` | kg 1 casa / R$ | Efeito do período não verificado | — | — | Sub-aba `salmon:estoque:view` | Card local |
| SAL-011 | Estoque Limpo | kg limpo, dias restantes, kg/dia consumo | store | kg / dias | idem | Infinity tratado (texto não verificado) | — | idem | Card local |
| SAL-012 Metas | Meta Provisionada | Meta / Realizado / Diferença / % | store | g / % | PeriodFilter (efeito não verificado) | "Nenhuma meta provisionada" | — | `salmon:metas:view`; editar `:edit` | Card local |


## Gráficos — Estoque, Operacional, Inventário e Salmão

| Tela | Título | Tipo | Eixos/unidades | Denominador | Legenda/tooltip | Usa chartTheme/ChartCard? | Pontos de overflow a testar |
|---|---|---|---|---|---|---|---|
| EST-003 | Distribuição por Categoria | BarChart `layout="vertical"` (até 8 categorias) | X numérico R$ compacto (`fmtBRLCompact`); Y categoria `width={90}` fonte 10 | — | `ChartTooltipContent` (R$); sem legenda | `ChartContainer` (ui/chart) + cores `SERIES_COLORS`; NÃO usa ChartCard | Nome de categoria longo em 90px; altura fixa 220px |
| EST-003 | Status do Estoque | PieChart donut (inner 45/outer 75) | — | Total de produtos com status > 0 | Legenda custom em botões ao lado; tooltip padrão | `ChartContainer` 200×200 fixo; cores de status de `SEMANTIC_CHART_COLORS`/local | Pizza 200px + legenda lado a lado em tela estreita (`flex` sem wrap) |
| EST-006 | Top N — Custo/Quantidade | BarChart vertical (top 10) | X numérico (R$ compacto só no modo custo); Y `nome_produto` `width={100}` fonte 9 | — | `ChartTooltipContent` | `ChartContainer` + `getSeriesColor` | Nome de produto longo em 100px; fonte 9px |
| EST-006 | Top Quantidade | PieChart donut com label externo (nome cortado em 12 chars + %) | — | Soma do consumo (top 8 + "Outros") | `Tooltip {...tooltipProps}` + `Legend {...legendProps}` com componentes de `@/components/ui/ChartTooltip`/legend | Sim chartTheme (`tooltipProps`, `legendProps`, `getSeriesColor`); `ResponsiveContainer` direto, sem ChartCard | Labels externos se sobrepondo com 9 fatias; legenda com 9 nomes; mistura unidades diferentes numa mesma pizza (suspeita) |
| EST-006 | Distribuição por Categoria | PieChart donut idem | — | Soma por categoria (top 8 + Outros) | idem | idem | idem |
| EST-008 | Perdas no Período | LineChart | X rótulo do período (fonte 9); Y R$ compacto | — | `ChartTooltipContent` (R$) | `ChartContainer` + `SEMANTIC_CHART_COLORS.negative` | Muitos pontos no modo diário 90 dias |
| EST-008 | Top Perdas — Valor/Quantidade | BarChart vertical (top10) | X numérico; Y `nome_produto` `width={100}` fonte 9 | — | `ChartTooltipContent` | `ChartContainer` | Nome longo |
| EST-011 | Top Itens com Menor Cobertura (dias) | BarChart vertical | X dias; Y nome `width={120}` | — | `ChartTooltipContent` | `ChartContainer`; cor inline `hsl(var(--primary))` | Nome longo em 120px |
| EST-011 | Projeção: {produto} | ComposedChart (Area "Estoque projetado" + Bar "Consumo previsto" + ReferenceLine "Ruptura") | X rótulo do dia; Y quantidade (unidade não exibida) | — | `ChartTooltipContent`; sem legenda | `ChartContainer`; cores inline com opacidade (`hsl(var(--primary) / 0.15)`, `hsl(var(--destructive) / 0.5)`) | Título com nome longo; posição do gráfico acima da tabela, longe da linha clicada |
| EST-011 | Perfil semanal (linha expandida) | Barras em `div` (sem Recharts) | 7 dias da semana; altura relativa ao máximo | Máximo da semana | Tooltip shadcn por barra | Não | Rótulos 8px |
| INV-011 | Tendência de Acurácia | Barras em `div` (até 8 inventários) | X data; altura = % acurácia | 100% | Sem tooltip | Não | Datas 9px sob 8 barras em tela estreita |
| SAL-002 | Perda em R$ por semana | BarChart | X `semana`; Y R$ compacto (`chartValueFormatters.moneyCompact`) | — | `Tooltip {...tooltipProps}` + `ChartTooltip` | Sim chartTheme (`axisProps`, `gridProps`, `tooltipProps`, `SEMANTIC_CHART_COLORS.negative`); `ResponsiveContainer` direto, sem ChartCard | Altura fixa 160px |
| SAL-004 / SAL-013 | Gasto por Semana (PurchaseRadar) | BarChart 2 séries (Gasto Real com `Cell` por status, Ideal com `fillOpacity 0.3`) | X label semana; Y oculto | Meta semanal ideal | Tooltip do chartTheme; legenda não verificada | Sim chartTheme; sem ChartCard | Sem eixo Y — leitura depende do tooltip |
| SAL-013 | Ritmo Semanal (WeeklyBreakdown) | BarChart 2 séries (Gasto Real, Ideal) | X W1–W5; Y oculto | Ideal semanal | Tooltip do chartTheme | Sim chartTheme; "Gasto Real" com cor inline `hsl(var(--primary))` | idem |


## Indicadores — Compras, Centro de CMV, Ficha, Planejamento e Relatórios

| Tela | Rótulo | Significado | Fonte | Unidade/formatador | Filtros que afetam | Nulo/zero/erro | Clique | Permissão | Componente |
|---|---|---|---|---|---|---|---|---|---|
| Cotação (lista) | Em aberto | Cotações com status em `COTACAO_STATUS_ABERTOS` | `useCotacoesStore.counts` (tabela `cotacoes`, contagem no cliente) | inteiro | nenhum (busca não afeta) | 0 exibido como "0"; erro de fetch zera a lista | não | compras:cotacao:view | KpiCard (primary) |
| Cotação (lista) | Aguardando | Status EM_COTACAO | idem | inteiro | nenhum | "0" | não | idem | KpiCard (warning) |
| Cotação (lista) | Em análise | Status RESPONDIDA ou EM_ANALISE | idem | inteiro | nenhum | "0" | não | idem | KpiCard (default) |
| Cotação (lista) | Convertidas | Status CONVERTIDA | idem | inteiro | nenhum | "0" | não | idem | KpiCard (success) |
| Cotação (lista) | Economia (mês) | Soma de `economia_estimada` das cotações criadas no mês corrente (BR) | idem | R$ `formatMoneyBR` | nenhum | R$ 0,00 | não | idem | KpiCard (success) |
| Cotação / Comparar | Total recomendado | Soma do menor preço × quantidade por item | cálculo no cliente sobre `cotacao_respostas` | R$ `formatMoneyBR` | — | R$ 0,00 + aviso "Nenhum preço registrado ainda" | não | compras:cotacao:view | KpiCard |
| Cotação / Comparar | Economia est. | Soma de (maior − menor preço) × quantidade | idem | R$ | — | R$ 0,00 | não | idem | KpiCard (success) |
| Cotação / Comparar | Fornecedores | Nº de fornecedores com subtotal > 0 | idem | inteiro | — | 0 | não | idem | KpiCard |
| Cotação / Sugestão | Total / Economia / Fornecedores | Totais do cenário selecionado (ou ajuste manual) | `optimizeCotacao` / `rebuildFromAssignment` | R$ `formatMoneyBR`; inteiro | cenário, overrides | bloco não renderiza sem preços | não | compras:cotacao:view (salvar: edit) | card local |
| Pedido (detalhe) | Total Estimado | `purchase_orders.total_estimated` | `usePurchaseOrdersStore` | R$ `fmtBRL` | — | R$ 0,00 | não | compras:pedidos:view (via módulo) | bloco local |
| Pedido (detalhe) | Total Confirmado | `purchase_orders.total_confirmed` | idem | R$ `fmtBRL` | — | R$ 0,00 | não | idem | bloco local |
| Centro de CMV | CMV Geral | `cmvGeralPct` | Edge `cmv` / `calcular_cmv` | % `formatPercentBR` | datas, método, escopo, setor | grade inteira some sem `cmvData`; erro = toast | não | módulo `cmv` (sem gate na view) | KpiCard (variante por meta) |
| Centro de CMV | CMV Salmão | `cmvSalmaoPct` | idem | % | idem | idem | não | idem | KpiCard |
| Centro de CMV | CMV Total | `cmvTotalPct` | idem | % | idem | idem | não | idem | KpiCard |
| Centro de CMV | Margem Bruta | `margemBruta` | idem | % | idem | idem | não | idem | KpiCard |
| Centro de CMV | Custo Consumido | `custoTotal` | idem | R$ `fmtBRL` | idem | idem | não | idem | KpiCard |
| Centro de CMV | Faturamento | `faturamento` (Fechamento de Caixa, segundo aviso da tela) | idem | R$ | idem | idem | não | idem | KpiCard (primary) |
| Centro de CMV | Impacto Salmão | `impactoSalmao` | idem | % | idem | idem | não | idem | KpiCard |
| Centro de CMV | Método: Ledger / Método: Inventário | Rótulo dinâmico; valor "EI: R$ …" só no método inventário, senão "—" | idem | texto | método | "—" | não | idem | KpiCard |
| Centro de CMV / Meta vs Realizado | CMV Geral / CMV Salmão / CMV Total | Realizado × `meta_cmv_*` com badge Dentro/Atenção/Fora | Edge `cmv` / `get_metas` | % | mês de Data Início | card não aparece sem meta; erro tem retry | não | editar: cmv:semanal:edit | Card shadcn local |
| Centro de CMV / Simulação Rápida | Novo CMV / Economia / Nova Margem | Simulação local sobre custo total e faturamento | cliente | % / R$ / % | 2 inputs | bloco some se faturamento ≤ 0 | não | — | bloco local |
| Ficha / Detalhe | Custo unitário / Custo total / Rendimento líq. | Custo calculado do componente | Edge `ficha-tecnica` / `get_componente_detalhe` | R$ `fmtBRL`; `formatFixedBR` + unidade | — | R$ 0,00 | não | ficha:<sub>:view | MiniStat local |
| Ficha / Simulador | Custo original / Novo custo / Economia/un | Resultado do cenário | Edge `ficha-tecnica` / `simular_cenario` | R$ | sliders, volume, preço | erro = toast | não | ficha:analise:simulate | MiniStat local |
| Planejamento / Meta | Meta de compras | `planning_metas_compra.target_value` | `usePlanningStore` | R$ `fmtBRL` | mês, origem, categoria | "Meta do mês não configurada" | não | planning:meta-compras:view (editar: edit) | card local |
| Planejamento / Meta | Progresso da meta | gasto ÷ meta | RPC `_planning_spend_summary_guarded` (`realizado_total`) | % `formatPercentBR` + "R$ x de R$ y" | mês, origem, categoria | 0 quando `spendSummary` ausente (`?? 0`); erro em faixa no cabeçalho | não | idem | card local + Progress |
| Planejamento / Meta | Status da meta | No ritmo / Atenção / Estourado + "Restam" / "Excedido" | cliente | texto + R$ | idem | "Sem meta" | não | idem | chip local |
| Planejamento / Projeção | Gasto até agora | Gasto do mês | servidor (`serverGasto`) | R$ | mês, origem, categoria | "Configure a meta…" sem meta | não | planning:projecao:view | bloco local |
| Planejamento / Projeção | Média semanal / Projeção fim do mês / Meta | `calcProjecao` sobre entradas em memória | cliente (`useSalmonStore.entries` + `useEstoqueGeralStore.movimentacoes`) | R$ (/sem) | mês, origem, categoria | idem | não | idem | bloco local |
| Planejamento / Pressão | Gasto até Wn / Esperado (histórico ou linear) / % de pressão | `calcBudgetPressure` | cliente | R$; % `formatDecimalBR` | mês, origem, categoria | "Configure a meta mensal…" | não | planning:pressao:view | card local |
| Planejamento / Pressão | Consistência do Mês | índice 0–100 | cliente | % | idem | card oculto sem histórico (< 2 meses) | não | idem | card local |
| Planejamento / Pressão | Risco de Estouro (Projeção final, Meta, %) | projeção ponderada ÷ meta | cliente | R$; % | idem | — | não | idem | card local |
| Planejamento / Radar | Estabilidade de Compra do Mês | 1 − desvio médio semanal | cliente | % `formatPercentBR` | idem | "Sem compras no período" | não | planning:radar:view | bloco local |
| Planejamento / Radar | Concentração Semanal | semana com maior % do gasto | cliente | Wn — % | idem | idem | não | idem | bloco local |
| Relatórios / CMV | 🔥 CMV Geral | `cmvGeral`; sub "Meta: x%" | `useRelatoriosData` (RPC `_relatorios_kpis_guarded`; mapeamento não verificado) | % `formatPercentBR` | período | nulo → "—"; erro → tela de erro global | não | relatorios:cmv:view | KpiCard (danger se > meta, senão success — inclusive quando nulo) |
| Relatórios / CMV | CMV Salmão | `cmvSalmao` | idem | % | período | "—" | não | idem | KpiCard (primary) |
| Relatórios / CMV | Margem Bruta | `margemBruta` | idem | % | período | "—" | não | idem | KpiCard (success) |
| Relatórios / CMV | Impacto Salmão | `impactoSalmao`; sub "no CMV total" | idem | % | período | "—" | não | idem | KpiCard (primary) |
| Relatórios / CMV | Custo Consumido | `custoConsumido` | idem | R$ `fmtBRL` | período | sem tratamento de nulo | não | idem | KpiCard |
| Relatórios / CMV | Faturamento | `faturamento` | idem | R$ | período | idem | não | idem | KpiCard (success) |
| Relatórios / Estoque | Giro de Estoque | `giroEstoque`; sub "consumo/estoque" | idem | `formatFixedBR(…,2)` | período | sem tratamento de nulo | não | relatorios:estoque:view | KpiCard |
| Relatórios / Estoque | Cobertura | `coberturaSemanas` | idem | "x,x sem" | período | idem | não | idem | KpiCard (primary) |
| Relatórios / Estoque | Ruptura | `rupturaPercent`; sub "n itens" | idem | % | período | idem | não | idem | KpiCard (danger se > 0) |
| Relatórios / Estoque | Perdas (R$) | `perdasR$`; sub "x kg" | idem | R$ | período | idem | não | idem | KpiCard (danger sempre) |
| Relatórios / Estoque | Valor em Estoque | `valorTotalEstoque` | idem | R$ | não verificado | idem | não | idem | KpiCard (primary) |
| Relatórios / Estoque | Parado | `estoqueParadoPercent`; sub "> 4 sem" | idem | % | período | idem | não | idem | KpiCard (danger se > 20) |
| Relatórios / Estoque | Bruto em Estoque / Limpo Disponível / Valor Estoque Salmão / Compras no Período | bloco Salmão | idem | kg `formatFixedBR(…,1)`; R$ | período | bloco oculto se tudo 0 | não | idem | KpiCard (primary) |
| Relatórios / Tendência | Volatilidade | `volatilidade.stddev_geral`; sub "Desvio padrão custo/kg" | RPC `_relatorios_tendencia_guarded` | R$ `fmtBRL` | período | 0 | não | relatorios:tendencia:view | KpiCard (danger se > 5) — sozinho numa grade de 2 colunas |
| Relatórios / Score | Projeção Custo | `projecao4Semanas` | `useRelatoriosData` (origem não verificada) | R$ | período | — | não | relatorios:score:view | KpiCard |
| Relatórios / Score | Status | "⚠️ Acima meta" / "✅ Dentro" | idem | texto com emoji | período | — | não | idem | KpiCard |
| Relatórios / Itens | Maior Impacto CMV / Maior Aumento Preço / Menor Giro / Maior Desperdício | VALOR do card = nome do produto; métrica vai no `sub` | RPC `get_report_items_summary` | texto; sub em % ou `formatFixedBR` | período | card omitido se nulo; erro do resumo silencioso | não | ficha:analise:view (gate real no código) | KpiCard (danger/warning) |
| Relatórios / Itens (detalhe) | Custo Base / Saldo Atual / Val. Estoque | dados do item | RPC `get_report_item_detail` | R$; quantidade | período | erro silencioso | não | idem | MiniKPI local |


## Gráficos — Compras, Centro de CMV, Ficha, Planejamento e Relatórios

| Tela | Título | Tipo | Eixos/unidades | Denominador | Legenda/tooltip | Usa chartTheme/ChartCard? | Pontos de overflow a testar |
|---|---|---|---|---|---|---|---|
| Centro de CMV / Por Categoria | Custo por Categoria | Recharts PieChart (pizza cheia, outerRadius 80, altura 250) | fatia = custo R$; rótulo externo "categoria x%" | custo total do CMV (`percentCmv` do servidor) | sem Legend; `ChartTooltip` em R$ | chartTheme sim (`SERIES_COLORS`, `tooltipProps`); ChartCard não (Card shadcn) | rótulos externos longos cortados em coluna estreita / mobile; muitas categorias (cores repetem em módulo); fatias pequenas com rótulos sobrepostos |
| Centro de CMV / Por Setor | Custo por Setor | BarChart `layout="vertical"` (altura 250) | X numérico sem formatador; Y categoria `setor` com largura fixa 100 | — | `ChartTooltip` R$ | chartTheme sim; ChartCard não | nome de setor > 100 px truncado; eixo X sem formatação de moeda (números crus) |
| Centro de CMV / Semanal | Custo Semanal (W1–W5) | BarChart (altura 250) | X `semana`; Y sem formatador | — | `ChartTooltip` R$ | chartTheme sim; ChartCard não | eixo Y com valores grandes sem compactação |
| Planejamento / Ritmo Semanal | Ritmo Ideal por Semana | BarChart 2 séries (real × ideal), contêiner `h-36` | X W1–W5; Y oculto | — | legenda manual em HTML (Real, Ideal, OK, 90%+, 100%+); `ChartTooltip` R$ | chartTheme sim (`SEMANTIC_CHART_COLORS.projected`, fillOpacity 0.3); ChartCard não | legenda manual quebra em telas estreitas; popover de info via `group-hover` (inacessível em toque) |
| Planejamento / Radar | Gasto por Semana | BarChart com `Cell` por status + série "Ideal" opcional, `h-36` | X W1–W5; Y oculto | — | sem legenda; `ChartTooltip` R$ | chartTheme sim; cores via `hsl(var(--destructive / --warning / --primary))` inline; ChartCard não | barra "Ideal" translúcida sobre fundo dark |
| Planejamento / Radar | Análise por Dia da Semana | barras CSS (div) | Seg–Dom; R$ e % | gasto do mês | — | não se aplica (não é Recharts) | colunas fixas `w-16`/`w-8` com valores de 6+ dígitos |
| Planejamento / Pressão | MiniBar / termômetros | barras CSS | razão sobre limite | meta × perfil histórico | Radix Tooltip no ícone Info | não se aplica | número `text-2xl` + barra + badge na mesma linha em 320 px |
| Relatórios / CMV | Tendência CMV (3 meses) | LineChart (altura 140) | X `mes`; Y % (`chartValueFormatters.percent`) | — | `ChartTooltip` % | chartTheme sim; ChartCard não | só renderiza se algum ponto > 0 |
| Relatórios / Tendência | 💰 Custo por Semana (W1–W5) | BarChart (altura 160) | X `semana`; Y `moneyCompact` | — | `ChartTooltip` R$ | chartTheme sim; ChartCard não | sem estado vazio (gráfico em branco) |
| Relatórios / Tendência | 📊 CMV por Semana | LineChart (altura 160), traço `hsl(var(--accent))` | X `semana`; Y `unit="%"` | faturamento da semana (não verificado) | `ChartTooltip` % | chartTheme parcial (cor `--accent` fora de `SERIES_COLORS`); ChartCard não | semanas sem faturamento viram 0 (`cmv ?? 0`) |
| Relatórios / Tendência | 🗓 Consumo por Dia da Semana | barras CSS com `style={{ background: hsl(var(--primary / --accent / --muted)) }}` | dia; altura relativa ao máximo | maior dia | sem tooltip, sem valores | não | 7 barras em `h-20`; sem rótulo de valor |
| Relatórios / Estoque | 🍕 Gastos por Setor | PieChart donut (contêiner `w-40 h-40` = 160 px, inner 35 / outer 60) + total no centro | fatia = R$ | `total_spend` | legenda manual lateral (cor, setor, R$, %); `ChartTooltip` R$ | chartTheme sim (`SERIES_COLORS`); ChartCard não | total no centro (`text-[11px]`) com 7+ dígitos dentro do furo de 70 px; layout `flex` lado a lado sem quebra no mobile; % sem formatador (`{item.percent}%`) |
| Relatórios / Itens (detalhe) | 📊 Histórico de Preço | LineChart (altura 120) dentro de Dialog | X `data` (fonte 8 px); Y sem formatador | — | `ChartTooltip` R$ | chartTheme sim, com `tick` sobrescrito inline (fontSize 8) | muitas datas no eixo X em dialog `max-w-lg` |
| Relatórios / Itens (detalhe) | 📦 Consumo Semanal | BarChart (altura 120), `fill hsl(var(--accent))` | X `semana` (fonte 9 px); Y quantidade | — | `ChartTooltip` quantidade | chartTheme parcial; ChartCard não | idem |

Nenhum gráfico deste escopo usa `ChartCard` nem `ChartLegend`. Cotação, Compras e Ficha Técnica não têm gráficos Recharts.


## Indicadores — RH, IA, Administração e auxiliares

| Tela | Rótulo | Significado | Fonte | Unidade/formatador | Filtros que afetam | Nulo/zero/erro | Clique | Permissão | Componente |
|---|---|---|---|---|---|---|---|---|---|
| RH Dashboard | Headcount | nº de colaboradores recebidos do pai (ativos, ou todos se "Mostrar inativos" estiver ligado no Prontuário) | prop `colaboradores` | inteiro `String()` | toggle de inativos do Prontuário (não o período) | 0 | não | `rh:dashboard:view` | KpiCard |
| RH Dashboard | Custo Total/mês | proventos da folha + custo empresa dos benefícios | `rh_folha_pagamento` (≤50 linhas) + `rh_beneficios` ativos (≤50) | `fmtBRL` | período | R$ 0,00 sem folha; erro ignorado | não | idem | KpiCard `danger` fixo |
| RH Dashboard | Custo Médio/colab | custo total ÷ headcount | derivado | `fmtBRL` | período | 0 se headcount 0 | não | idem | KpiCard |
| RH Dashboard | Benefícios/mês | soma `valor_empresa` dos benefícios ativos | `rh_beneficios` (≤50) | `fmtBRL` | nenhum (não usa período) | 0 | não | idem | KpiCard |
| RH Dashboard | Horas Extras | soma `horas_extras` | `rh_banco_horas` (≤50) | `formatFixedBR(…,1)` + "h" | período | "0,0h" | não | idem | KpiCard (danger se > headcount×10) |
| RH Dashboard | Absenteísmo | faltas ÷ (headcount × 22) × 100 | derivado | `formatPercentBR` | período | 0% | não | idem | KpiCard (danger se > 5) |
| RH Dashboard | Atrasos (min) | soma `atrasos_min` | `rh_banco_horas` | inteiro | período | 0 | não | idem | KpiCard |
| RH Dashboard | Férias Pendentes | registros SOLICITADA ou APROVADA no mês | `rh_ferias_afastamentos` (≤50) | inteiro | período | 0 | não | idem | KpiCard |
| RH Dashboard | Total Proventos / Total Descontos / Líquido Total / Benefícios | somas da folha do período | `rh_folha_pagamento` | `fmtBRL` | período | bloco inteiro some sem folha | não | idem | bloco local (div + p) |
| RH Custos | Custo Total | `total_geral` do cálculo mais recente | `rh_custos_mensais` | `fmtBRL`; sub "+x.x% vs mês anterior" com `toFixed(1)` (ponto decimal) | nenhum (sempre o registro mais recente, não o período do input) | KPIs somem sem cálculo | não | `rh:custos:view` | KpiCard |
| RH Custos | Salários / Encargos / Custo Médio/Colab | campos do mesmo registro | idem | `fmtBRL`; sub "~37.8% folha" (ponto) | idem | idem | não | idem | KpiCard |
| RH Custos | Composição de Custos (5 barras) | parcela de cada componente no total | idem | `fmtBRL` + `toFixed(1)%` | idem | 0% se total 0 | não | idem | `CostBar` local |
| RH Folha | Total Proventos / Total Descontos / Total Líquido | somas das folhas do período | `rh_folha_pagamento` | `"R$ " + formatFixedBR(v,2)` (prefixo manual, diferente de `fmtBRL`) | período | "R$ 0,00" | não | `rh:folha:view` | KpiCard |
| RH Folha | Folhas | nº de folhas / nº colaboradores | idem | inteiro + sub | período | 0 | não | idem | KpiCard |
| RH Benefícios | Benefícios Ativos / Custo Empresa/mês / Desc. Colaborador/mês / Colaboradores | contagens e somas dos benefícios ATIVO | `rh_beneficios` | inteiro; `"R$ " + R()` | nenhum (não seguem os filtros da tabela) | 0 | não | `rh:beneficios:view` | KpiCard |
| RH Benefícios | 7 mini-cards por tipo | nº de benefícios ativos do tipo | idem | inteiro | — | 0 | SIM: filtra a tabela pelo tipo (toggle) | idem | `Card` local clicável |
| RH Documentos | Total Documentos / Vencidos / Vencendo (30d) / Compliance | contagens; % de colaboradores com todos os obrigatórios | `rh_documentos` + lista de colaboradores | inteiro; `Math.round` + "%" | nenhum (não seguem busca/filtros) | Compliance = 100% sem colaboradores | não | `rh:documentos:view` | KpiCard |
| RH Férias | Pendentes / Aprovados / Ausentes Hoje / Férias Vencendo | contagens por status; saldo vencendo em ≤60 dias úteis | `rh_ferias_afastamentos`, `rh_ferias_saldo` | inteiro | nenhum | 0 | não | `rh:ferias:view` | KpiCard |
| RH Tarefas | Pendentes / Em Andamento / Concluídas / Atrasadas | contagens por status | `rh_tarefas` | inteiro | não verificado | 0 | não | `rh:tarefas:view` | KpiCard |
| RH Treinamento | Trilhas / Obrigatórias / Inscrições / Concluídos | contagens | `rh_trilhas_treinamento`, `rh_progresso_treinamento` | inteiro | nenhum | 0 | não | `rh:treinamento:view` | KpiCard ("Obrigatórias" fica `danger` sempre que > 0) |
| RH SST | EPIs Ativos / EPIs Vencidos / Exames Pendentes / Exames Vencidos / Incidentes Abertos / Dias Afastamento | contagens e soma de dias | `rh_epis`, `rh_exames`, `rh_incidentes` | inteiro | nenhum | 0 | não | `rh:sst:view` | KpiCard |
| RH Disciplinar | Ocorrências Ativas / Advertências / Suspensões / Elogios | contagens sobre as linhas JÁ CARREGADAS (página de 50) | `rh_ocorrencias_disciplinares` | inteiro | "Carregar mais" altera o valor | 0 | não | sem gate interno | KpiCard |
| RH Escalas | Custo projetado da semana | Σ horas dos turnos TRABALHO × valor_hora | `rh_escala_slots` + colaboradores | `fmtBRL` | semana, setor | card some sem slots | não | `rh:escalas:view` | `Card` local |
| Config Geral | Entradas salmão / Manipulações / Fornecedores / Auditorias | tamanho dos arrays do store do Salmão | `useSalmonStore` (memória) | inteiro | nenhum | 0 | não | sub-aba `configuracoes:geral` | KpiCard (sem ícone) |
| Auditoria Compras | Atenção / Estourado / Overrides | qtd + valor das auditorias no status | `store.auditorias` | inteiro + `fmtBRL` | período, status, fornecedor, "Só overrides" | 0 | não | sub-aba `auditoria-compras` | card LOCAL (div) |
| Auditoria Compras | % Override | overrides ÷ total filtrado | idem | `formatPercentBR` | idem | 0% | não | idem | card LOCAL |
| Performance | tiles de Materialized Views | duração do último refresh por view | RPC `list_restricted_logs` (GLOBAL) | `toFixed(0)` + "ms"; cor por limiar 300/800 | — | "Nenhum refresh registrado ainda." | não | `system:global:manage` | div local |
| Painel Admin | Health Counts | contagens por tabela do tenant | RPC `admin_health_counts` | `String(v)` mono | — | "Carregando..." / "ERROR: …" | botão refresh | `system:global:manage` | lista local |


## Gráficos — RH, IA, Administração e auxiliares

| Tela | Título | Tipo | Eixos/unidades | Denominador | Legenda/tooltip | Usa chartTheme/ChartCard? | Pontos de overflow a testar |
|---|---|---|---|---|---|---|---|
| RH Dashboard | Headcount por Setor | `PieChart`/`Pie` (outerRadius 70) | fatias = nº colaboradores por setor | — (contagem) | rótulo externo "nome: valor"; `ChartTooltip`; sem legenda | `SERIES_COLORS`, `tooltipProps`, `ChartTooltip` sim; `ChartCard` NÃO (Card cru `h-52`) | rótulos externos cortados em card estreito (mobile 1 coluna, 5+ setores) |
| RH Dashboard | Custo Folha por Setor | `BarChart` vertical | X = setor; Y = R$ (eixo sem formatador) | — | `ChartTooltip` com `fmtBRL`; sem legenda | `axisProps`/`gridProps`/`tooltipProps` sim; cor `hsl(var(--primary))` inline; `ChartCard` NÃO | ticks do eixo Y com números longos sem abreviação |
| RH Dashboard | Tipo de Contrato | `PieChart` | fatias = nº por tipo de contrato | — | idem Headcount | idem | rótulos externos |
| RH Dashboard | Top 10 — Horas Extras | `BarChart layout="vertical"` | X = horas; Y = primeiro nome (largura fixa 60) | — | `ChartTooltip` "x,xh" | idem; cor `hsl(var(--chart-2))` inline | nomes longos truncados em 60px; homônimos (só primeiro nome) |
| RH Custos | Composição de Custos | barras em `div` (não Recharts) | largura = % do total | `total_geral` | valor + % à direita | não se aplica | colunas fixas `w-28`/`w-24`/`w-10` em telas estreitas |

Central de IA, Configurações, Usuários, auditorias, Painel Admin e superfícies globais: nenhum gráfico Recharts.

