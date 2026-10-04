# Fase 00 — Observações visuais por módulo (leitura de código)

Tudo neste arquivo é **suspeita por leitura de código**: nenhuma tela foi aberta em navegador na Fase 00 (ver bloqueio B1 em `00-RELATORIO.md`). Cada item precisa ser confirmado em navegador na fase do módulo antes de virar tarefa.

## Financeiro — Dashboard, análises e CMV Financeiro (Fases 03, 06, 07)

Todas são suspeita por leitura de código; nenhuma foi confirmada em navegador.

- (suspeita por leitura de código) Hex literal em componente: nenhum encontrado nos arquivos do escopo. `dark:` avulso: nenhum. Único uso de tema forçado: classe `dark` fixa no "Modo reunião" (`PresentationMeetingGovernance.tsx:635`).
- (suspeita por leitura de código) Cores RGB literais em PDF fora dos 4 exports de apresentação: Dashboard usa cabeçalho `[220, 80, 50]` (laranja-avermelhado, fora da paleta azul) em `DashboardFinanceiroSection.tsx:209`; Orçamento, KPIs, Comparativo e Auditoria usam `[30, 41, 59]` (`OrcamentoSection.tsx:445`, `KPIsSection.tsx:218`, `ComparativoSection.tsx:218`, `AuditoriaFinSection.tsx:345`).
- (suspeita por leitura de código) Opacidade usada como hierarquia, contagem por arquivo (classes `x/NN` e `opacity-NN`): PresentationAnalytics 20, PresentationScenarioSection 19, AuditoriaFinSection 16, PresentationPlanComparison 14, PresentationPeriodFilters 12, PresentationDetailPage 5, OrcamentoSection 4, PresentationDecisionGovernance 4, DemonstrativoTree 3, KPIsSection 3, ComparativoSection 3; Dashboard, DRE, DFC, Borderô e `cmvCharts`/`CmvCards` com 0 ou 1. Exemplos: `bg-success/10 text-success border-success/30` nos badges de ação (`AuditoriaFinSection.tsx:61-68`); `border-success/30 bg-success/10` nos status do plano (`PresentationPlanComparison.tsx:66-73`); `bg-primary/5 ... border-primary/20` na linha de total (`DemonstrativoTree.tsx:265`, `OrcamentoSection.tsx:564`); `border-warning/25 bg-warning/[0.035]` (`PresentationAnalytics.tsx:461`); `border-destructive/50` nos cards de erro (`KPIsSection.tsx:271`, `ComparativoSection.tsx:293`).
- (suspeita por leitura de código) `ChartCard` não tem nenhum consumidor em `src/components`; todos os gráficos do escopo montam `Card` + título à mão, com três padrões de título diferentes (`CardTitle text-sm`, `h3 font-semibold`, `CmvPainel`).
- (suspeita por leitura de código) Cards de indicador fora do `KpiCard`: Auditoria (5 `Card` locais, `AuditoriaFinSection.tsx:380-401`), Comparativo (5 `Card` de linha), detalhe da Apresentação (4 `Card`), `IndicatorCard` do plano, `MetricComparisonCard` do cenário, botões-card de contas em aberto e `CmvIndicadorCard` (exceção declarada em comentário, `CmvCards.tsx:67-71`).
- (suspeita por leitura de código) Dashboard em `2xl:grid-cols-8`: valor `text-xl` sem truncar nem quebrar; valores de 7 dígitos podem estourar o card. Conteúdo desigual na mesma fileira (3 cards com delta, 1 com sub, 4 sem nada).
- (suspeita por leitura de código) Dashboard: o select "3/6/12 meses" fica solto à direita acima dos gráficos e só vale para dois deles; a pizza segue o filtro do topo, sem rótulo que explique.
- (suspeita por leitura de código) DRE e DFC: o grupo de ações usa `flex gap-2` sem `flex-wrap` (`DRESection.tsx:114`, `DFCSection.tsx:122`) com PDF, Excel, Select e `MonthNavigator`; risco de estouro horizontal no mobile.
- (suspeita por leitura de código) Alternadores inconsistentes: DRE/DFC usa dois `Button` (`FinanceiroView.tsx:89-92`); Dashboard e Borderô usam `SegmentedControl`; CMV tem radiogroup e tablist locais (`CmvFinanceiroSection.tsx:156-171, 272-295`); plano e análise rápida da Apresentação usam grupos de `Button`.
- (suspeita por leitura de código) Estados "sem permissão" com cinco aparências: `AlertTriangle` (Dashboard), `ShieldAlert` (DRE, DFC, Orçamento), `Ban` em linha (KPIs, Comparativo, Auditoria, CMV), `ShieldX` (Borderô, Apresentação) e Card com `Shield` (módulo).
- (suspeita por leitura de código) Loading inconsistente: skeleton em Dashboard, DRE, DFC, KPIs, Comparativo, Auditoria, Borderô e CMV; spinner com texto em Orçamento e em vários blocos da Apresentação.
- (suspeita por leitura de código) Ícone de Excel: `FileSpreadsheet` em Dashboard, DRE, DFC e Orçamento; `FileDown` (igual ao do PDF) em KPIs, Comparativo e Auditoria.
- (suspeita por leitura de código) Tabelas sem tratamento mobile próprio (dependem do `overflow-auto` de `ui/table.tsx`): DemonstrativoTree, Orçamento (colunas fixas 180+160+100+130px e `BRLInput` na célula), Auditoria (7 colunas), Borderô. Tabelas do CMV têm `min-w` de 460 a 1020px com `overflow-x-auto`. Nenhuma vira card no mobile.
- (suspeita por leitura de código) Comparativo: cards de linha com rótulo `w-28` + dois valores + badge em uma única linha `flex`, sem quebra; em 360px pode comprimir.
- (suspeita por leitura de código) Auditoria: `DiffView` em `grid-cols-2` fixo com JSON `break-all`; nomes de entidade e de ação aparecem crus (`lancamentos`, `INSERT`).
- (suspeita por leitura de código) Tipografia abaixo de 12px recorrente: `text-[10px]` e `text-[11px]` em KpiCard, Apresentação, Borderô; `text-[8px]` e `text-[9px]` na prévia do PDF do CMV (`CmvExportSheet.tsx:295-301`).
- (suspeita por leitura de código) CMV usa `rounded-2xl` + `shadow-sm` + gradiente nos cards, enquanto as outras telas usam `rounded-xl` sem gradiente.
- (suspeita por leitura de código) Títulos de tela: `h2 text-xl font-bold` solto em Dashboard, DRE, DFC, Orçamento, KPIs, Comparativo e Auditoria; `PageHeader` só em Borderô e CMV; `h1 text-2xl` na Apresentação.


### Arquivos sem consumidor / leitura parcial

## Financeiro — operações e cadastros (Fases 04, 05)

Todas são suspeita por leitura de código (nada foi visto em navegador).

- Nenhum indicador do escopo usa `KpiCard`: Fluxo de Caixa (5 cards), Projeção (5–7) e Fechamento (5) montam cards à mão com tamanhos diferentes (`p-4 text-lg`, `p-3 text-lg`, `p-4 text-2xl`); Livro Razão usa uma faixa de texto; Pagar/Receber põem totais no subtítulo.
- Quatro padrões diferentes de sub-navegação: `Button` default/outline (Lançamentos, Cadastros Base — FinanceiroView.tsx:57-59, 76-77), alternador feito à mão com `<button>` (ConciliacaoBancariaSection.tsx:2284-2291), `SubmoduleSwitcher` (Fechamento) e botões de filtro de severidade (Alertas). O mesmo vale para "Tipo de Registro" em CriarLancamentoExtratoDialog.tsx:384-394.
- O alternador da Conciliação usa `bg-primary text-primary-foreground` em rótulo `text-xs` (2286, 2289), contra a regra do design system de `--primary-strong` para rótulo pequeno.
- Só Códigos de Pagamento tem alternativa mobile em cards (`hidden xl:block` + `xl:hidden`). Livro Razão, Conciliação (7 e 9 colunas com até 6 botões por linha), Pagar, Receber, Fluxo, Fechamento, Recorrências, Cadastros e Categorização dependem só do `overflow-auto` do `Table`. LivroRazaoSection e ConciliacaoBancariaSection não têm nenhuma classe responsiva (`sm:`/`md:`/`lg:`).
- Grids fixos em diálogos: `ContaFormDialog` usa `grid-cols-3`/`grid-cols-4` sem breakpoint nas variantes receber e lançamento (337, 382, 585, 640); rateio em `grid-cols-12` (Conciliação 3355, Criar 465); `grid-cols-2` na revisão de baixa (3007, 3033).
- Ações de linha da árvore de categorias ficam em `opacity-0 group-hover:opacity-100` (CadastroBaseTree.tsx:276): invisíveis em toque; reordenação depende de drag-and-drop HTML5.
- Seis implementações de "sem permissão": Card com ShieldAlert (Contas Bancárias, árvore), caixa com borda (Livro Razão, shell), linha com ícone Ban (Fluxo, Projeção, Pagar, Receber), ShieldX centralizado (Alertas, Recorrências), AlertTriangle (Fechamento), texto simples (Códigos). Plano de Contas, Centros de Custo, Conciliação e CriarLancamentoExtratoDialog retornam `null` (tela em branco).
- Carregamento inconsistente: skeleton na maioria, mas texto "Carregando..." em Plano de Contas (191), Centros de Custo (157) e Conciliação/Lançamentos (2815); os cards do Fluxo de Caixa mostram R$ 0,00 enquanto carregam.
- Cabeçalhos: só Códigos de Pagamento usa `PageHeader`; os demais usam `h2 text-xl font-bold` à mão, e Plano de Contas/Centros/Marcas usam `h3`. Fechamento repete ícone no título.
- Badges de status feitos à mão com `span` + mapa de cor local, repetido em 4 arquivos (LivroRazaoSection.tsx:97-101, ContasPagarSection.tsx:62-69, ContasReceberSection, ContaDetailDialog.tsx:67-78, FluxoCaixaSection.tsx:57-68); `StatusBadge` só em Códigos de Pagamento.
- Textos sem acento em Livro Razão, Contas a Pagar/Receber e nos dois diálogos ("Livro Razao", "Descricao", "Acoes", "Aguard. Aprovacao", "Voce nao tem permissao"), enquanto as demais telas usam acentuação. Status exibido cru em maiúsculas (REALIZADO, RECEITA, DESPESA).
- Emojis em texto de interface: "🧮 Ratear Igual", "✅" em listas, "⚠️ VENCIDA", "🎉", "⚡".
- Cores: zero hex literal e zero `dark:` avulso nos arquivos do escopo. Opacidade usada como hierarquia: `text-success/80` e `text-destructive/80` para valores previstos (FluxoCaixaSection.tsx:222-227, 296-297), `text-muted-foreground/70` (CategorizacaoSection.tsx:466), `text-muted-foreground/40` e `/50` (CadastroBaseTree.tsx:230, 246), linhas `opacity-50/60/70/80` na Conciliação (2504-2511, 2831). Fundos `bg-x/5`, `/10` e bordas `/20`, `/30` são o padrão dos badges locais (39 ocorrências só na Conciliação), convivendo com tokens `-soft`/`-border` em poucos pontos (FechamentoCaixaSection.tsx:517, ConciliacaoBancariaSection.tsx:2425).
- Estorno usa `window.confirm` nativo (ContasPagarSection.tsx:666, ContasReceberSection.tsx:449), enquanto o resto usa `useConfirmDialog`/AlertDialog.
- Cabeçalho do Livro Razão concentra 2 datas, 3 selects, 1 combobox e até 4 botões numa única linha `flex-wrap` (LivroRazaoSection.tsx:708-767).
- `ContaFormDialog`: título de seção em itálico (295), aba "Anexo" com "Funcionalidade de anexos em breve" (733), select "Parcelamento" fixo e desabilitado em "A vista" (589).
- Fluxo de Caixa embrulha as linhas num `<tr style="display: contents">` contendo outras `TableRow` (FluxoCaixaSection.tsx:278), e a linha de vazio usa `colSpan={7}` numa tabela de no máximo 6 colunas (262).


### Arquivos sem consumidor / leitura parcial

- `CategoriasFinSection.tsx` — nenhum arquivo o importa (grep em `src/`); usa `profile?.company_id` em vez de `useCompanyId`. Parece substituído por `CadastroBaseTree`.
- `LegacyPresentationRedirect.tsx` — não pertence a nenhuma aba; é importado por `src/App.tsx` (redirect de rota de Apresentação/Relatório Sócios). Fica para o outro agente.
- Compartilhados sem aba própria (atribuídos ao meu escopo como apoio): `ContaDetailDialog.tsx`, `ContaFormDialog.tsx`, `CategoryCombobox.tsx`, `SupplierCombobox.tsx`, `DateRangePresets.tsx`, `MonthNavigator.tsx`, `CodigoPagamento.tsx`. `cmv/CmvDecisaoToggle.tsx` é do módulo CMV (outro agente), mas é renderizado dentro de `ContaFormDialog`.
- Fora do meu escopo e não inventariados (abas do outro agente): `DashboardFinanceiroSection`, `DashboardCharts`, `DRESection`, `DFCSection`, `DemonstrativoTree`, `OrcamentoSection`, `KPIsSection`, `ComparativoSection`, `AuditoriaFinSection`, `BorderoSection` + `bordero/*`, `ApresentacaoSociosSection` + todos os `Presentation*`, `cmv/*`.

## Estoque, Operacional, Inventário e Salmão (Fases 08–10)

Todas são suspeita por leitura de código, sem verificação em navegador.

- Nenhum hex literal nem `dark:` avulso nos arquivos de Estoque, Operacional e Inventário. Únicos hex do escopo: `EtiquetaModal.tsx:24, 39-44, 103` (`#000`, `#fff`, `#c00`, `#999`) — HTML de impressão da etiqueta e QR code; o `dark:` contado ali é a chave `dark` da cor do QR code, não classe Tailwind.
- Opacidade usada como hierarquia concentra-se no Salmão/Planejamento: `ManipulationView.tsx` 42 ocorrências (`border-primary/30`, `bg-secondary/50`, `bg-destructive/10`, `hover:bg-warning/10`…), `BudgetPressure.tsx` 21, `StockView.tsx` 15 (`bg-destructive/10 border-destructive/30`, `bg-success/10`, `border-border/30`), `SimuladorCompraGeral.tsx` 13 (`bg-accent/20 border-accent/30`), `GoalsView.tsx` 10, `SmartSuggestionCard.tsx` 8, `SimuladorCompra.tsx` 8, `EstoqueGeralView.tsx` 8 (maioria `ring-*/30` e ícone de empty state `/30`). As telas operacionais (`estoque-operacional/*`, `camera/*`, `ContagemPorCodigo`) têm zero.
- Dois padrões visuais dentro do mesmo módulo Salmão: `DashboardView` usa tokens `-soft`/`-border` (0 opacidades), enquanto `StockView`, `ManipulationView` e `GoalsView` usam `/10`, `/20`, `/30`.
- Texto de 8–10px muito frequente no Estoque administrativo e no Salmão: `SimuladorCompraGeral` 31, `CustoItemDisplay` 27, `DashboardView` 27, `StockLossesSection` 25, `MovimentacoesSection` 21, `EstoqueGeralView` 20, `ProdutoFormPanel` 20, `StockTopConsumedSection` 19. Há `text-[8px]` em badges (`EstoqueGeralView.tsx:673, 978`; `MovimentacoesSection.tsx` badges Cancelado/Estorno/Editado; `StockInactivityAlert.tsx:150-154`).
- Indicadores em três implementações diferentes: `KpiCard` (Dashboard/Ranking/Perdas/Preditivo/Saldo/Inventário/Salmão-Dashboard), cards locais centralizados em Movimentações (`MovimentacoesSection.tsx:396-433`) e cards locais com rótulo `uppercase tracking-wide` no Simulador (`SimuladorCompraGeral.tsx:191-226`) e em todo o Salmão (Estoque, Metas, blocos do Dashboard).
- Grades sem breakpoint em telas administrativas: KPIs de Saldo em `grid-cols-4` fixo (`EstoqueGeralView.tsx:583`), KPIs de Movimentações em `grid-cols-3` fixo (`MovimentacoesSection.tsx:396`), blocos do Salmão em `grid-cols-3`/`grid-cols-4` fixos (`StockView.tsx:117, 135`; `DashboardView.tsx` Meta g/Cliente `grid-cols-4`; lista de manipulações `grid-cols-4`). Nos cinco arquivos principais do Salmão há só 5 classes responsivas (`sm:/md:/lg:`) no total.
- Dashboard do Salmão: os 8 KpiCard ficam no fim da página, depois de ~10 cards locais; o estado vazio "Nenhum dado ainda" é renderizado abaixo de tudo, junto com os cards zerados.
- Gráficos: nenhum usa `ChartCard`. Estoque usa `ChartContainer` (shadcn `ui/chart`) com cores do `chartTheme`; Salmão usa `ResponsiveContainer` + props do `chartTheme`. Cores inline restantes: `StockPredictiveSection.tsx:235, 256-258`, `WeeklyBreakdown.tsx:236`, fatia "Outros" `hsl(var(--muted-foreground))` em `StockTopConsumedSection.tsx:297, 324`.
- Tabelas em três estilos: `Table` shadcn com cabeçalho 10px (Dashboard/Ranking/Perdas), 11px (Preditivo), tabela HTML nativa (`StockTransfersSection.tsx:370-376`) e listas de cards (Saldo, Catálogo, Movimentações, Requisições).
- Emojis como ícone/rótulo em títulos e opções: "🧾 Inventário", "📊 Dashboard Inventário 3.0", "🔐 Log de Auditoria", "🚨 Top Itens Críticos", "🔎 Buscar item...", "⚠️ Estoque baixo", "❌ Sem estoque", "🐟 Salmão", "➕ Nova entrada", "🖨 Etiqueta do Lote", "⚙️ Configurações de Estoque", status ✅/⚠️/❌ na Meta g/Cliente.
- Mobile-first real só no Operacional e na leitura por código do Inventário: container `max-w-xl`, alvos `h-12`/`h-14`, input `text-xl`/`text-2xl`, `inputMode` numérico/decimal, vídeo `max-h-[45vh]`, vibração no bipe, refoco automático do input. Requisições também usam `min-h-12 text-base` e botões `h-11 w-11`. O Inventário por lista troca cabeçalho de tabela por rótulos por célula abaixo de `md`.
- Sucesso do Operacional usa a paleta destrutiva (card `bg-destructive-soft`, check e número em `text-destructive`) para "Saída realizada" (`FluxoMovimentacao.tsx:705-712`).
- Cabeçalho da página do Salmão: `tabLabels.salmon = 'Dashboard Salmão'` (`AppLayout.tsx:121`) — o título global é o mesmo qualquer que seja a entrada clicada e a sub-aba ativa (uso desse mapa no header não verificado em detalhe).
- Dialogs de Reabrir/Excluir do Inventário existem duas vezes no arquivo (lista e detalhe): `InventarioView.tsx:419-455` e `922-958`.
- Botão primário escrito de formas diferentes: `bg-primary-strong text-primary-foreground border-0` (Estoque/Salmão), `Button` padrão (Inventário), `bg-success hover:bg-success/90` para Finalizar (`InventarioView.tsx:675, 747`), e o "botão" interno dos cartões de método usa `bg-primary` (`InventarioView.tsx:503, 511`).


### Arquivos sem consumidor / leitura parcial

Nenhum arquivo do escopo ficou sem consumidor no grep de imports. Pontos de atenção sobre a que módulo cada arquivo solto pertence:

- `src/components/AuditView.tsx` — NÃO é do Salmão: único importador é `ConfiguracoesView.tsx`.
- `src/components/AnaliseItemView.tsx` — NÃO é do Controle de Estoque: único importador é `RelatoriosView.tsx` (fora do escopo destas fases; não inventariado).
- `src/components/StockView.tsx` — é o Estoque do Salmão (importado só por `SalmonControlView.tsx`), não do Controle de Estoque.
- `src/components/DashboardView.tsx`, `EntriesView.tsx`, `ManipulationView.tsx`, `GoalsView.tsx` — só `SalmonControlView.tsx`.
- `src/components/EtiquetaModal.tsx` e `SmartSuggestionCard.tsx` — só `ManipulationView.tsx` (EtiquetaModal não é usado no Controle de Estoque).
- `src/components/ValidadeAlertCard.tsx` — `DashboardView.tsx` e `StockView.tsx` (ambos Salmão).
- `src/components/MetaCompraCard.tsx`, `BudgetPressure.tsx`, `WeeklyBreakdown.tsx`, `PurchaseRadar.tsx`, `SimuladorCompra.tsx`, `PlanningProjecaoCard.tsx` — compartilhados entre Salmão (`EntriesView`) e `PlanningView.tsx` (que serve tanto à aba principal Planejamento quanto à sub-aba do Salmão).
- `src/components/PeriodFilter.tsx` — compartilhado: Salmão, `AuditView`, `AnaliseItemView`, `RelatoriosView`, `relatorios/GastosPorSetorChart`, hooks `useRelatoriosData`/`useSalmonDashboard`.
- `src/components/MovimentacoesSection.tsx`, `RequisicaoEstoqueSection.tsx`, `StockCadastrosSection.tsx`, `SimuladorCompraGeral.tsx` — só `EstoqueGeralView.tsx`.
- `src/components/QuickInventorySection.tsx` — só `InventarioView.tsx`.
- `estoque-operacional/ProdutosPorSetorAdmin.tsx` e `AcessoSetorPorUsuarioAdmin.tsx` — ficam na pasta do Operacional, mas são renderizados em Controle de Estoque → Cadastros (`StockCadastrosSection.tsx`).
- `camera/LeitorCamera.tsx` — compartilhado: `FluxoMovimentacao.tsx` (Operacional) e `inventario/ContagemPorCodigo.tsx`.
- Código sem tela (não é arquivo órfão): formulário inline legado de movimentação em `EstoqueGeralView.tsx` e formulário "Nova Transferência" atrás de flag desligada em `StockTransfersSection.tsx`.

## Compras, Centro de CMV, Ficha, Planejamento e Relatórios (Fases 11–13)

Suspeita por leitura de código (nada foi renderizado).

- Hex literal: 0 ocorrências em todos os arquivos do escopo. `dark:` avulso: 0 ocorrências.
- Opacidade usada para hierarquia semântica (classes `x/NN`), por arquivo: RelatoriosView 28, BudgetPressure 21, ShoppingChecklistView 16, AnaliseItemView 12, AlertasFaltaEstoqueView 11, CotacaoSugestaoInteligente 10, SimuladorCompra 8, SuppliersView 7, CalendarioLembretesView 7, CmvMetasDialog 7, RankingFornecedoresView 5, PlanningView 5. Exemplos: `bg-warning/15 text-warning` (ShoppingChecklistView.tsx:103), `border-warning/40 bg-warning/5` (AlertasFaltaEstoqueView.tsx:207), `bg-destructive/10 border-destructive/30` (RelatoriosView.tsx:103), `bg-success/15 text-success border-success/30` (BudgetPressure.tsx:244), `bg-primary/10 text-primary border-primary/20` (CmvMetasDialog.tsx:21). No mesmo módulo, PedidosComprasMercadoView já usa os tokens `-soft`/`-border` — dois padrões convivem dentro de Compras.
- Texto de 8–10 px muito frequente: PedidosComprasMercadoView 44 ocorrências, RelatoriosView 27, ShoppingChecklistView 15, AnaliseItemView 13, BudgetPressure 13, PurchaseRadar 12. Abas do Relatórios em `text-[9px]` numa grade de até 6 colunas (RelatoriosView.tsx:127-131); abas do drawer de Cotação em `text-[10px]` numa grade fixa de 6 colunas (CotacaoDetailDrawer.tsx:157-164).
- Emojis como ícone/estado em títulos e valores: Relatórios ("🔥 CMV Geral", "🍕 Gastos por Setor", "📦 Itens", "⚠️ Acima meta"), Planejamento (selects "🔄 Tudo / 🐟 Salmão / 📦 Geral", status ✅/⚠️/❌), CMV (badges 🟢🟡🔴, aviso 💡), Ficha ("📐", "🐟 Salmão", "📊"), Pedidos ("📋 Requisição", "🔒", "✅ Entregue").
- Cabeçalhos de página inconsistentes: Compras, Cotação, Fornecedores, Planejamento e Relatórios usam `h2` manual `text-lg font-display`; Centro de CMV e Ficha Técnica não têm título; nenhum usa `PageHeader`. Título do Relatórios é "Relatórios Inteligentes" enquanto a sidebar diz "Relatórios Gerais".
- Sub-navegação com 4 padrões diferentes no escopo: `SubmoduleSwitcher` (Compras, Pedidos, Ficha), `Tabs` shadcn (CMV, Relatórios, drawer de Cotação), pílulas manuais `bg-primary text-primary-foreground` (RankingFornecedoresView.tsx:170-180), botões default/ghost (CotacaoFormDialog.tsx:227-232, ImportItensDialog.tsx:118-125). As pílulas do Ranking e os chips de categoria do lembrete (CalendarioLembretesView.tsx:359) usam `bg-primary` com label pequeno, contra a regra do design system (`--primary-strong`).
- Cards de indicador locais em vez de `KpiCard`: detalhe do pedido (PedidosComprasMercadoView.tsx:762-771), Sugestão de cotação (CotacaoSugestaoInteligente.tsx:135-149), todo o Planejamento (MetaCompraCard, PlanningProjecaoCard, BudgetPressure, PurchaseRadar), `MiniStat` (Ficha), `MiniKPI` (AnaliseItemView), cartões de fornecedor do Relatórios/Compras. `KpiCard` aparece só em Cotação, Centro de CMV e Relatórios.
- `StatusBadge` de `ui/` é usado só em Pedidos e na lista de Cotação; há dois componentes locais homônimos `StatusBadge` (BudgetPressure.tsx:242, SimuladorCompra.tsx:49) e chips manuais em Checklist, Itens em Falta, Fornecedores, Sugestão, `ScoreBadge`.
- Tabelas HTML cruas com coluna sticky e `min-w` fixos na matriz e no comparativo de Cotação, dentro de um Sheet que no mobile ocupa 100% da largura (CotacaoRespostasMatrix.tsx:121-167, CotacaoComparativoTable.tsx:77-140): rolagem horizontal com inputs `h-7` (28 px) como alvo de toque.
- Tabelas shadcn sem versão em card para mobile: Ficha Técnica (6 colunas + 4 ícones por linha, FichaTecnicaView.tsx:174-214), Top Itens do CMV (7 colunas), Precificação (8 colunas dentro de Dialog), Análise por Item (10 colunas com `overflow-x-auto`).
- Tratamento mobile explícito só em: Planejamento (Collapsibles `lg:hidden` + grade `lg:grid-cols-5`), Calendário (`md:grid-cols-7`), grades de KPI (`grid-cols-2` → `lg`/`md`). Formulários de Pedido, Fornecedor e Cotação usam `grid-cols-2` fixo em qualquer largura. `GastosPorSetorChart` mantém donut + legenda lado a lado sem quebra.
- Cabeçalho sticky do Planejamento com `-mx-4 px-4`, `bg-background/95 backdrop-blur-sm` e `z-40` (PlanningView.tsx:213): depende do padding do layout pai; conferir sobreposição com header global e dropdowns.
- `select` nativo no ajuste manual da Sugestão (CotacaoSugestaoInteligente.tsx:227) e `input type="checkbox"` nativos (SuppliersView.tsx:122, CalendarioLembretesView.tsx:371, CotacaoFormDialog.tsx:295) em vez dos componentes do design system.
- Estados de loading heterogêneos: skeleton `animate-pulse` (Pedidos, Cotação), `Skeleton` de ui (Itens em Falta), texto "Carregando..." (Calendário, Ficha), spinner central (Ranking, Relatórios, Checklist), nenhum (Centro de CMV, Fornecedores, Canais).
- Empty states heterogêneos: ícone com `text-muted-foreground/30` (Fornecedores, Calendário, Ranking, Checklist, Itens em Falta) versus ícone cheio (Pedidos, Cotação, Relatórios); alguns em card, outros soltos; Ficha usa linha de tabela.
- No KPI "🔥 CMV Geral" a variante cai em `success` quando o valor é nulo (RelatoriosView.tsx:139): card verde exibindo "—".
- KPIs de destaque da Análise por Item colocam o nome do produto como `value` (AnaliseItemView.tsx:247-281): risco de overflow/truncamento em nomes longos numa grade de 2 colunas.
- Ícone de alerta destrutivo em todos os itens de "CMV Explicado", inclusive nos informativos (CmvView.tsx:278-282).
- PDF do pedido usa cor RGB literal (`doc.setTextColor(220, 80, 50)`, lib/pdfPedidoFornecedor.ts:28) — tom alaranjado, fora da paleta azul; é cor impressa (jsPDF).
- Textos residuais de roadmap visíveis ao usuário: "A IA chega na próxima fase." (CotacaoDetailDrawer.tsx:244) e "chega na Fase 4" (CotacaoComparativoTable.tsx:151), embora IA e sugestão já existam nas abas vizinhas.


### Arquivos sem consumidor / leitura parcial

Verificação por grep de imports em `src/`.

- Nenhum arquivo de `src/components/compras/*`, `src/components/compras/cotacao/*`, `src/components/cmv/*` ou `src/components/relatorios/*` está sem importador.
- `compras/QuickSupplierDialog.tsx` mora na pasta de Compras mas não é usado por nenhuma tela de Compras (só `EntriesView` e `financeiro/SupplierCombobox`).
- `SimuladorCompraGeral.tsx` (citado no escopo de Planejamento) é importado apenas por `EstoqueGeralView.tsx:48` — pertence a Controle de Estoque.
- `SimuladorCompra.tsx`, `PurchaseRadar.tsx`, `WeeklyBreakdown.tsx`, `MetaCompraCard.tsx` são compartilhados entre Planejamento e `EntriesView` (Salmão); `BudgetPressure.tsx` entre Planejamento e `SimuladorCompra`. As variantes `compact` de `WeeklyBreakdown` e `PurchaseRadar` não são usadas pelo Planejamento (uso em `EntriesView` não verificado).
- `PeriodFilter.tsx` é compartilhado com o módulo Salmão (`DashboardView`, `EntriesView`, `GoalsView`, `ManipulationView`, `StockView`, `AuditView`).
- `AnaliseItemView.tsx` é importado apenas por `RelatoriosView`.
- `UserMentionSelect.tsx` é importado por `PedidosComprasMercadoView` e `CalendarioLembretesView` (RPC `list_profiles_minimal`, limite 200).
- `FloatingCalculator.tsx` não é órfão (lazy em `App.tsx:23,184`); fora deste escopo.
- TabId `suppliers`: caminho de código vivo mas sem ponto de entrada na UI (ver COM-029). Nenhum produtor de link `/suppliers` encontrado por grep em `supabase/functions`, `supabase/migrations` e `release/`.
- Subtabs do registry sem tela correspondente em Compras: `lista`, `recebimentos`, `confirmacoes` (registry.ts:230-238,273-283; ComprasView.tsx:69-77).


- Corpo das Edge Functions `cmv`, `ficha-tecnica`, `cotacao-ia`, `send-whatsapp-zapi` e das RPCs (apenas os nomes chamados pelo cliente).
- `useRelatoriosData.ts` além das linhas 200-300 (derivação de cada KPI a partir da resposta das RPCs).
- `SimuladorCompraGeral.tsx`, `EntriesView.tsx` e demais consumidores fora do escopo.
- Conteúdo de `SubmoduleSwitcher`, `KpiCard` (além das props), `StatusBadge`, `ProductSearchCombobox`, `SearchableSelect`, `MonthNavigator`.
- Renderização real, contraste, breakpoints e tema dark (nenhuma execução em navegador).

## RH, IA, Administração e auxiliares (Fases 14–16)

Todas são suspeita por leitura de código.

- Tokens: nenhum hex/rgb literal e nenhum `dark:` avulso nos arquivos do escopo (grep). O desvio existente é opacidade.
- Opacidade para hierarquia (≈45 ocorrências no escopo): ícones de estado vazio `opacity-30` em quase toda subseção do RH (exceção aceita); linhas/cards inativos com `opacity-50`/`opacity-60` (GestaoDisciplinar:307, ComunicacaoInterna:305, AdminUsersView:442 e 514, AdminCompaniesView:277); `text-destructive/30` em ícones de acesso negado (ConfiguracoesView:90 e 189, SecurityAuditView:78); `bg-primary/10`, `bg-primary/5`, `border-border/50`, `text-muted-foreground/70` no NotificationBell (77, 83, 101, 115); `bg-primary/15`, `bg-muted/40`, `bg-muted/80`, `hover:bg-primary/90` no FloatingCalculator (200-238); `bg-primary/10` no UserMentionSelect (70, 104); `bg-muted/30` no PermissionMatrix:88; `border-primary/20 bg-primary/5` nas caixas de aviso de senha (AdminUsersView:552, AccessManagementCard:365, AdminCompaniesView:480); `bg-secondary/40` no skeleton de Integrações:87.
- Cinco desenhos diferentes para "sem permissão": RhView:127 (ícone vermelho + título), CentralIAView:124 (ícone cinza, sem título), ConfiguracoesView:86 (Card, ícone vermelho 30%), AdminUsersView:239 (div, ícone vermelho cheio), Index:285 e AdminPanel:54 ("403"). Além disso, 11 subseções do RH e 2 de Configurações respondem `return null` (tela em branco) quando falta a chave de `view`.
- Cards de indicador fora do `KpiCard`: AuditView:109-130 (4 divs), "Resumo Financeiro" do Dashboard RH (289-306), custo projetado em Escalas (291-306), mini-cards por tipo em Benefícios (286-299), tiles de MV em Performance (100-108).
- Gráficos do Dashboard RH usam o tema central, mas dentro de `Card` cru com altura fixa `h-52` em vez de `ChartCard`.
- Controles nativos misturados aos do design system: `<select>` em AdminUsersView (557, 564, 612, 624), AuditView:140, SecurityAuditView:126; `<input type="checkbox">` em AuditView:153; `<input type="month">` cru no Dashboard RH:175 (as outras telas usam `Input type="month"`); `<table>` HTML em AccessManagementCard:190; `prompt()` do navegador em GestaoDisciplinar:132; `<button>` cru no ErrorBoundary (App.tsx:81).
- Painéis flutuantes feitos à mão em vez de Popover: NotificationBell:70 (`w-80` fixo, `absolute right-0`) e UserMentionSelect:98.
- Tipografia muito pequena recorrente: `text-[8px]` (calendário de Férias:363, badge "Obrig." em Documentos:485, badge de módulo no sininho), `text-[9px]`/`text-[10px]` em quase toda a Auditoria do Sistema e nos badges do RH.
- Mobile: formulários de dialog com `grid-cols-2`/`grid-cols-3` fixos sem breakpoint (RhView:519-561, Beneficios:359, Comunicados:206); tabelas sem `overflow-x-auto` em Ponto (RhView:723), Custos/Histórico (ControleCustos:256), Disciplinar (289), Trocas de turno (Escalas:388), Usuários (AdminUsersView:427, `overflow-hidden`) e Performance (129); grade de Escalas exige 700px e o botão "+" só aparece no hover (inacessível em toque); chat da IA com altura fixa `h-[600px]`; filtros da Auditoria de Compras em `grid-cols-3` fixo; Painel Admin `p-6` sem ajuste.
- Formatação de moeda em 3 padrões no RH: `fmtBRL` (Dashboard, Custos, Prontuário), `"R$ " + formatFixedBR` (Folha, Benefícios) e `toFixed(1)` com ponto decimal nos percentuais de Custos (208, 285, 320) e no tamanho de arquivo de Documentos:415.
- Emojis como ícone/estado em texto de UI: Onboarding (306-309), AuditView (20-22, 236), GlobalAuditView:377, Performance:126, CheckupSuite:321, BugTracker:231, chat da IA:275.
- Textos em inglês voltados ao usuário: NotFound inteiro; GlobalAuditView ("Source", "Before", "After", "Metadata", ações cruas CREATE/UPDATE na tabela); BugTracker (status e severidades crus); CheckupSuite ("ALL PASS", "HAS FAILURES").
- Cabeçalhos de tela sem padrão: nenhum usa `PageHeader`; Configurações e Central de IA têm título próprio, RH não tem título; auditorias repetem um segundo h2 abaixo do título "Configurações".
- Marca: Login e ResetPassword exibem a logo "MarginPro"; rodapé do chat cita "MarginPro"; o projeto se chama Moralles Food/margin.food no CLAUDE.md — conferir nome de marca vigente.
- Painel Admin e telas de acesso ficam fora do `AppLayout`; a calculadora flutuante aparece também sobre Login, Reset, 404 e /admin (App.tsx:184).
- Fallback do Suspense raiz é uma tela vazia (App.tsx:163) e os loadings de tela cheia não têm logo.


### Arquivos sem consumidor / leitura parcial

- Nenhum arquivo do escopo sem consumidor. Todos os `src/components/*.tsx` soltos têm importador (grep de imports; mapa completo conferido).
- Pertencimento confirmado dos soltos deste escopo: `AdminUsersView`, `AuditView`, `GlobalAuditView`, `SecurityAuditView`, `PerformanceMonitorView` ← `ConfiguracoesView`; `PermissionMatrix` ← `AdminUsersView`; `PasswordInput` ← AdminUsersView/Login/ResetPassword; `PasswordStrengthMeter` ← AdminUsersView/ResetPassword; `NotificationBell`, `CompanySelector` ← `AppLayout`; `NotificationToaster`, `RequisicaoNotificationModal`, `PwaUpdatePrompt`, `FloatingCalculator` ← `App.tsx`; `UserMentionSelect` ← só Compras (`CalendarioLembretesView`, `PedidosComprasMercadoView`); `PeriodFilter` (usado por AuditView) é compartilhado com Salmão/Relatórios.
- Código morto dentro de arquivos vivos: `AdminUsersView` estados `newSector`/`editSector`/`sectorRequired` (77, 88, 389-390) e a tela "Acesso Negado" interna (239-247); `RhView` constantes `COLORS`, `fmt`, `TIPO_PONTO` e variáveis `meusPontos`, `todosAprovados`, `canApprovePonto`, `canManageBH` (17-24, 117, 152-153, 481-482); `DashboardRhSection` `fmtCurrency`, `fmtPercent`, estado `pontos`.
- Chaves do registry sem tela neste escopo: `ia:logs:view`, `configuracoes:empresas:view` (sub-aba), `rh:folha:export`, `rh:custos:export`.


- `rh/TarefasSection`, `TreinamentoSection`, `SSTSection`: lidos por grep estrutural e trechos; campos dos formulários e o corpo das listas de incidentes/quiz não foram lidos linha a linha.
- `admin/CheckupSuiteCard` linhas 84-212 (renderizadores de detalhe) e os JSX dos diálogos de `AdminCompaniesView` (334-505), `AccessManagementCard` (314-389) e `BugTrackerView` (242-309): só títulos/campos via grep.
- Hooks e libs de apoio (`useIntegracoesConfig`, `usePasswordValidation`, `useNotifications`, `SubmoduleSwitcher`, `KpiCard`, `TableActions`, `StatusBadge`): só assinatura/trechos.
- Nada foi executado em navegador: comportamento real em mobile, tema escuro e os erros de runtime suspeitos não foram confirmados.
