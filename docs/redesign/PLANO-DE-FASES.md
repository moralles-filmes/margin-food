# Plano de fases — Redesign visual

11 fases sequenciais. Cada fase é auto-contida, termina com a bateria de validação verde e
**entrega o prompt da fase seguinte** (ver [README.md](README.md) § Protocolo).

| # | Fase | Estado |
|---|---|---|
| 1 | Auditoria + fundação de tokens | ✅ concluída |
| 2 | Layout global — Sidebar, Header, PageHeader | ✅ concluída |
| 3 | Navegação de módulos e submódulos | ✅ concluída |
| 4 | Componentes base (primitivos) | ✅ concluída |
| 5 | Datas e filtros | ✅ concluída |
| 6 | Camada central de gráficos | ✅ concluída |
| 7 | Gráficos — módulo Financeiro | ✅ concluída |
| 8 | Gráficos — Estoque, CMV, RH, Relatórios, Planejamento | ✅ concluída |
| 9 | Dashboards executivos | ✅ concluída |
| 10 | Demais módulos, tabelas, formulários e Modo Apresentação | ✅ concluída |
| 11 | QA visual, acessibilidade, regressão e limpeza | ✅ concluída |

---

## Fase 1 — Auditoria + fundação de tokens ✅

**Objetivo:** mapear o sistema e trocar a identidade dourada por azul na raiz do design system.

- [x] Auditoria completa registrada em [00-AUDITORIA.md](00-AUDITORIA.md)
- [x] Baseline de qualidade capturado (tsc 0 / lint 0 errors / 518 testes / build OK)
- [x] `src/index.css` reescrito: paleta azul-branco-preto, ~110 tokens nos dois temas
- [x] Tokens novos: `background-subtle`, `surface-*`, `primary-strong/ink/soft/border`, `*-soft`/`*-border` semânticos, `border-strong`, `chart-1..8` + `chart-grid/axis/label/tooltip`, `shadow-xs..lg`, `sidebar-*`
- [x] `--radius` 1rem → 0.75rem; escala tipográfica ajustada; `tabular-nums` em tabelas
- [x] `:focus-visible` global; `prefers-reduced-motion` global; scrollbar legível
- [x] `tailwind.config.ts` expandido (namespaces `primary`, `surface`, `ink`, `chart`, `sidebar`, semânticas, `boxShadow`, `transitionDuration`)
- [x] **Bug corrigido:** `--chart-2..5` eram usados em 5 arquivos sem nunca terem sido definidos
- [x] Aliases legados (`gold`, `gradient-salmon`, `glow-salmon`) preservados com valores azuis
- [x] Documentação: README, auditoria, design system, plano de fases, mockups
- [x] Validação verde

---

## Fase 2 — Layout global ✅

**Arquivos:** `src/components/AppLayout.tsx`, `src/hooks/useTheme.ts`, `src/components/ui/sonner.tsx`, novo `src/components/ui/PageHeader.tsx`

- [x] Sidebar redesenhada: fundo/borda por token, grupos com `--sidebar-section`, item ativo com tint + marcador, hover em cor cheia
- [x] Ícones padronizados (tamanho, stroke, alinhamento, container)
- [x] Collapse: tooltip Radix no modo recolhido, transição suave, sem layout shift, estado ativo preservado
- [x] Botão de collapse fora do fluxo `fixed` improvisado
- [x] Resize por arraste preservado (`localStorage['app:sidebar:width']`)
- [x] Header: altura, hierarquia de título, badges (offline/meta), toggle de tema, sino, menu de usuário
- [x] Menu de usuário migrado para `DropdownMenu` (hoje é `div` absoluta manual)
- [x] `PageHeader` reutilizável: título, subtítulo, ações, favoritar
- [x] `ui/sonner.tsx` deixa de usar `next-themes` e passa a consumir `@/hooks/useTheme`
- [x] Mobile: drawer, overlay, área de toque ≥40px
- [x] Nenhuma alteração em `TabId`, permissões ou visibilidade de item

## Fase 3 — Navegação de módulos e submódulos ✅

**Arquivos:** `ui/SubmoduleSwitcher.tsx`, novo `ui/ModuleNav.tsx`, `ui/SegmentedControl.tsx`, e as 8 views que os consomem

- [x] `ModuleNav`: barra de navegação contextual do módulo (Dashboard · Operações · Configurações · Relatórios Sócios), compacta, com dropdown para grupos
- [x] `SubmoduleSwitcher` redesenhado (sem `gradient-salmon`; estado ativo por tint + borda)
- [x] `SegmentedControl` novo — `Mês | Meses | Ano | Total`, `Realizado | Orçado | Projeção`, `Valor (R$) | Volume (kg)`
- [x] Estado ativo perceptível sem depender de diferença sutil de cinza
- [x] Aplicado em: `FinanceiroView`, `SalmonControlView`, `EstoqueGeralView`, `ComprasView`, `RhView`, `FichaTecnicaView`, `ConfiguracoesView`, `PedidosComprasMercadoView`
- [x] Rotas, tabs persistidas e deep links intactos

## Fase 4 — Componentes base ✅

**Arquivos:** `src/components/ui/*` (button, card, input, textarea, select, dropdown-menu, dialog, sheet, drawer, tabs, badge, alert, table, skeleton, tooltip, popover, switch, checkbox, radio, command, StatusBadge, EmptyState, KpiCard)

- [x] `Button`: primary (`bg-primary-strong`), secondary, outline, ghost, danger, link, icon — sem proliferação de variantes
- [x] `Card`: densidade revista (`CardHeader` menor), borda + `shadow-card`, sem card-em-card
- [x] Inputs: estados `default/hover/focus/disabled/error`; placeholder legível no dark (`filled`/`success` avaliados e não aplicáveis — ver PROGRESSO.md)
- [x] `Select`/`Dropdown`/`Command`: superfície `bg-popover`, `shadow-md`, item selecionado com tint azul, estados completos
- [x] `Dialog`/`Sheet`/`Drawer`: overlay, título, descrição, footer, close, scroll
- [x] `Table`: header, hover neutro, selected, zebra opcional, empty, loading
- [x] `Badge`/`StatusBadge`: `success/warning/danger/info/neutral`
- [x] `Alert`: acento lateral + ícone; superfície forte só para erro crítico
- [x] `Skeleton` visível nos dois temas; `EmptyState` padronizado
- [x] `KpiCard` reconstruído (ver Fase 9) com variantes semânticas e delta
- [x] API de props inalterada — 135 arquivos importam `Button`

## Fase 5 — Datas e filtros ✅

**Arquivos:** `ui/calendar.tsx`, `ui/DateInput.tsx`, `PeriodFilter.tsx`, `financeiro/DateRangePresets.tsx`, `financeiro/MonthNavigator.tsx`, novos `ui/DatePicker.tsx` / `ui/FilterBar.tsx` / `ui/PeriodSelector.tsx`

- [x] `Calendar`: estados `default/hover/focus/today/selected/range-start/middle/end/disabled/outside-month` com contraste real nos 2 temas
- [x] Setas de navegação e cabeçalho mês/ano visíveis (removido `opacity-50`)
- [x] `DatePicker` (popover + input) e `DateRangePicker` padronizados (ambos em `ui/DatePicker.tsx`)
- [x] Popover: `z-index`, portal (`container` prop para Dialog/Sheet), colisão com viewport, abertura acima/abaixo herdados do Radix Popover já validado na Fase 4
- [x] `FilterBar`/`FilterField`/`PeriodSelector` no padrão dos mockups (`UnitSelector` não criado — `FilterField` genérico já cobre o caso, ver PROGRESSO.md)
- [x] Substituídos os 24 arquivos com `<Input type="date">` cru por `DateInput`; as 6 composições manuais Popover+Calendar (Date-based) em 4 arquivos migradas para `DatePicker`
- [x] Teclado, clique fora, foco — herdados do Radix Popover/Select; `MonthNavigator` ganhou `focus-visible` de volta (estava zerado sem substituto)

## Fase 6 — Camada central de gráficos ✅

**Arquivos:** novo `src/lib/chartTheme.ts`, novos `ui/ChartCard.tsx` / `ui/ChartTooltip.tsx` / `ui/ChartLegend.tsx`, ajuste em `ui/chart.tsx`

- [x] `chartTheme.ts`: `axisProps`, `gridProps`, `tooltipProps`, `legendProps`, `SERIES_COLORS`, `cursorProps`, formatadores BRL/%/qtd
- [x] `ChartTooltip` único: título, período, série, valor, unidade — formato BR (`R$537.565,72`, `12,50%`, `1.826,33 kg`)
- [x] `ChartCard`: título, subtítulo, ações, legenda, altura responsiva, empty e loading
- [x] Sem `opacity` para hierarquia; `activeDot`, cursor e hover definidos
- [x] Responsivo por construção (flex-wrap, sem largura fixa em px) — sem verificação em navegador real, ver PROGRESSO.md

## Fase 7 — Gráficos do Financeiro ✅

**Arquivos:** `DashboardCharts`, `KPIsSection`, `ComparativoSection`, `ProjecaoFluxoSection`, `FechamentoCaixaSection`, `PresentationAnalytics`, `PresentationPlanComparison`, `PresentationDetailPage`, `PresentationScenarioSection`, `relatorios/GastosPorSetorChart`

- [x] Todos migrados para a camada da Fase 6
- [x] Real vs Ideal/Orçado: linha sólida vs tracejada, cores distintas, legenda clara
- [x] Nenhum `tick` sem `fill`, nenhum `Tooltip` sem estilo, nenhum hex
- [x] Cálculos e origem dos dados intocados

## Fase 8 — Gráficos dos demais módulos ✅

**Arquivos:** `RelatoriosView`, `DashboardView`, `AnaliseItemView`, `PurchaseRadar`, `WeeklyBreakdown`, `cmv/CmvTabs`, `rh/DashboardRhSection`, `estoque/StockDashboardSection`, `estoque/StockLossesSection`, `estoque/StockPredictiveSection`, `estoque/StockTopConsumedSection`

- [x] Mesma migração da Fase 7 (7 arquivos Recharts cru) + migração de cor nos 4 arquivos `ChartContainer` de Estoque (sem tocar grade/eixo, que já vem do `ui/chart.tsx` da Fase 6)
- [x] Radar de Compras (`PurchaseRadar`, na verdade um `BarChart`): grid visível, labels com contraste, séries diferenciáveis, área "ideal" preenchida sem esconder a grade
- [x] Pie/Donut: rótulo legível, legenda, ordem estável

## Fase 9 — Dashboards executivos ✅

**Telas:** Apresentação Sócios, Dashboard Financeiro, Dashboard Salmão, Planejamento, Relatórios Gerais, Centro de CMV

- [x] `KpiCard` novo aplicado (rótulo, valor, delta, comparativo, estado semântico, sem card colorido inteiro) — prop `delta` novo, adotado em `DashboardFinanceiroSection`/`PresentationAnalytics`; `KPICard` local de `RelatoriosView`/duplicata de `AnaliseItemView` eliminados
- [x] Grid, hierarquia, agrupamento e densidade revistos por tela — agrupamentos semânticos (Dashboard Salmão, `MetaCompraCard`, `PlanningProjecaoCard`) mantidos como card único, sem forçar `KpiCard` onde não fazia sentido
- [x] Filtros no padrão da Fase 5 (Período · Unidade · segmentos · Mais filtros) — `SegmentedControl` adotado em `DashboardFinanceiroSection` (Dia/Mês/Período) e `MonthNavigator` em `PlanningView`; `CmvFiltersBar` avaliado e mantido `DateInput`×2 (ver PROGRESSO.md)
- [x] Insights, comparativos e tooltips legíveis
- [x] Empty state real onde não há dado — sem número inventado

## Fase 10 — Demais módulos e Modo Apresentação ✅

**Telas:** Estoque, Compras/Cotação, Inventário, Ficha Técnica, RH, Central de IA, Admin, Configurações, Login + `financeiro/PresentationSlideCanvas`/`PresentationMode`

- [x] Propagar o padrão: tabelas, formulários, diálogos, listas, painéis (`KpiCard`/`StatusBadge`/`TableActions`/`SearchableSelect`/`DecimalInput` consolidados nos ~40 arquivos com achado real, executado em 7 fatias paralelas — ver PROGRESSO.md)
- [x] Modo Apresentação: QA confirmou que a estimativa "80 cores fixas" já estava desatualizada — `PresentationSlideCanvas.tsx`/`PresentationMode.tsx` já estavam 100% tokenizados (construídos em 2026-08-26, depois da fundação de tokens); nenhuma migração de cor necessária, só QA visual/contraste
- [x] Exports PDF/PPTX preservados byte-a-byte (`presentationPdfExport.ts`, `presentationPptxExport.ts`, `presentationMinutesPdfExport.ts`, `presentationMinutesPptxExport.ts` não tocados — paleta impressa intencional)
- [x] Últimos resquícios de `gold-*`/`gradient-salmon` migrados (3 pontos em Configurações — classe removida, não renomeada, o `Button` padrão já cobre)

## Fase 11 — QA visual, acessibilidade e limpeza ✅

- [x] Varredura Light **e** Dark em: Financeiro, Apresentação Sócios, Dashboard Salmão, Planejamento, Relatórios Gerais, Centro de CMV, Controle de Estoque, Compras, Inventário, RH, Admin — por leitura de código e grep de padrões, **sem navegador real** (ver PROGRESSO.md)
- [x] Interação: sidebar, collapse, dropdown, submenu, tabs, segmentos, datepicker, filtros, tooltip, modal, tabela, theme switcher — auditados por código (mesma limitação de navegador)
- [x] Contraste AA verificado em texto secundário, gráficos, inputs, placeholder, disabled, tabela, sidebar, tooltip, datepicker — 2 regressões reais encontradas e corrigidas (`dark:` avulso em 10 pontos, hex literal em `DemonstrativoTree.tsx`)
- [x] Responsividade: 1920, 1600, 1440, 1366, 1280, 1024, tablet — auditada por leitura de classes responsivas (sem navegador)
- [x] Aliases legados inventariados; `gold`/`gold-light`/`gold-dark`/`gold-foreground`/`gradient-gold`/`text-gradient-salmon` removidos (0 consumidores após a correção do `dark:` avulso); `gradient-salmon`/`glow-salmon` mantidos (51 + 2 usos reais)
- [x] `bun run lint && npx tsc --noEmit && bun run test && bun run build` verdes (0 erros / 676 warnings / 74 arquivos·576 testes / build OK — idêntico ao baseline da Fase 10)
- [x] `CLAUDE.md` **e** `AGENTS.md` (idênticos) atualizados com as decisões que precisam sobreviver
- [x] `docs/redesign/referencias/` e `docs/redesign/prompts/` apagadas
- [x] Relatório final ao usuário
