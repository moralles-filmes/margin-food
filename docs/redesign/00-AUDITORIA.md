# Auditoria inicial — estado encontrado (2026-08-27)

Levantamento feito **antes** de qualquer alteração visual. Serve de linha de base para as 11 fases.

---

## 1. Arquitetura frontend

| Camada | Encontrado |
|---|---|
| Framework | React 18.3 + TypeScript 5.9, Vite 8 + SWC, Bun |
| Roteamento | React Router DOM 6 — apenas 5 rotas (`/`, `/login`, `/admin`, `/reset-password`, `*`). A navegação real acontece **por `TabId` dentro de `pages/Index.tsx`**, com `usePersistedTab`. Redesign de navegação não pode virar rota nova. |
| Estilo | Tailwind 3.4 + CSS vars HSL em `src/index.css`. **Sem** styled-components / CSS Modules / MUI / Chakra. |
| Component library | shadcn/ui sobre Radix UI — 62 arquivos em `src/components/ui/` |
| Ícones | `lucide-react` **exclusivamente** (nenhuma biblioteca concorrente) |
| Gráficos | `recharts@3.9` — 21 arquivos + wrapper `ui/chart.tsx` |
| Datas | `react-day-picker@8` (`ui/calendar.tsx`) + `date-fns@3` + inputs `type="date"` nativos |
| Tabelas | `ui/table.tsx` (HTML puro estilizado), sem TanStack Table |
| Tema | `src/hooks/useTheme.ts` — classe `light`/`dark` no `<html>`, persistida em `localStorage['app-theme']`, fallback `prefers-color-scheme`. **Funciona; não quebrar.** |
| Total | 397 arquivos `.ts/.tsx`, ~67 mil linhas de TSX |

## 2. Design system encontrado

Já existia um design system **token-based** correto na estrutura, mas com identidade dourada:

- `src/index.css` — `:root` (light) e `.dark`, ~40 tokens HSL.
- `tailwind.config.ts` — mapeia os tokens para `colors`. Fontes: `sans: Inter`, `display: Space Grotesk`.
- Paleta antiga: `--primary: #B8860B` (light) / `#D4AF37` (dark), background off-white quente `#F7F4EC`.
- `--radius: 1rem` (16px) — arredondamento excessivo para SaaS operacional.

**Adesão aos tokens é alta** — este é o melhor achado da auditoria:

| Métrica | Valor |
|---|---|
| Classes Tailwind de paleta fixa (`slate-500`, `amber-200`…) | **91** no projeto inteiro |
| — das quais em `PresentationSlideCanvas.tsx` (slides, tema próprio) | 80 |
| Classes `dark:` avulsas | **16** |
| `bg-white` sem par `dark:` | 10 (todas no Modo Apresentação) |
| `text-primary` | 333 · `border-primary` 121 · `bg-primary/N` 117 · `bg-primary` sólido 48 |

→ Trocar a identidade dourada por azul é majoritariamente uma troca de **valores de token**, não de componentes.

## 3. Componentes globais localizados

| Papel | Arquivo |
|---|---|
| Layout + Sidebar + Header | `src/components/AppLayout.tsx` (460 linhas — sidebar, header, resize, menu de usuário, tema) |
| Shell de navegação por tabs | `src/pages/Index.tsx` |
| Sidebar shadcn (não usada pelo AppLayout) | `src/components/ui/sidebar.tsx` (637 linhas) |
| Tema | `src/hooks/useTheme.ts` |
| Navegação de submódulos | `src/components/ui/SubmoduleSwitcher.tsx` — usado por 8 views |
| KPI | `src/components/ui/KpiCard.tsx` |
| Estados | `ui/EmptyState.tsx`, `ui/StatusBadge.tsx`, `ui/skeleton.tsx` |
| Datas | `ui/calendar.tsx`, `ui/DateInput.tsx`, `PeriodFilter.tsx`, `financeiro/DateRangePresets.tsx`, `financeiro/MonthNavigator.tsx` |
| Primitivos | `ui/button.tsx` (135 arquivos importam), `ui/input.tsx` (82), `ui/select.tsx` (64), `ui/card.tsx` (58), `ui/badge.tsx` (54), `ui/dialog.tsx` (51), `ui/table.tsx` (40) |

## 4. Inventário de gráficos (Recharts)

21 arquivos. `ticks sem fill` = eixos que herdam o cinza padrão do Recharts (`#666`) — ilegíveis no dark.

| Arquivo | Tipos | Ticks sem `fill` |
|---|---|---|
| `financeiro/DashboardCharts.tsx` | Bar, Line, Pie | 0 |
| `financeiro/KPIsSection.tsx` | Bar | 2 |
| `financeiro/ComparativoSection.tsx` | Bar | 2 |
| `financeiro/ProjecaoFluxoSection.tsx` | Area | 2 |
| `financeiro/FechamentoCaixaSection.tsx` | Area | 2 |
| `financeiro/PresentationAnalytics.tsx` | Line | 2 |
| `financeiro/PresentationPlanComparison.tsx` | Line | 4 |
| `financeiro/PresentationDetailPage.tsx` | Line | 3 |
| `financeiro/PresentationScenarioSection.tsx` | Line | 3 |
| `relatorios/GastosPorSetorChart.tsx` | Pie | 0 |
| `RelatoriosView.tsx` | Bar, Line | 0 |
| `DashboardView.tsx` | Bar | 0 |
| `AnaliseItemView.tsx` | Bar, Line | 0 |
| `PurchaseRadar.tsx` | Bar (+ radar visual) | 1 |
| `WeeklyBreakdown.tsx` | Bar | 1 |
| `cmv/CmvTabs.tsx` | Bar | 0 |
| `rh/DashboardRhSection.tsx` | Bar, Pie | 4 |
| `estoque/StockDashboardSection.tsx` | Bar, Pie | 1 |
| `estoque/StockLossesSection.tsx` | Bar, Line | 4 |
| `estoque/StockPredictiveSection.tsx` | Bar, Composed | 4 |
| `estoque/StockTopConsumedSection.tsx` | Bar, Pie | 2 |

### Problemas confirmados nos gráficos

1. **`--chart-2` … `--chart-5` eram usados mas nunca existiram** em `index.css`. `hsl(var(--chart-2))` resolvia para cor inválida em 5 arquivos (`CmvView`, `CmvTabs`, `CmvMetasDialog`, `RhView`, `DashboardRhSection`). **Corrigido na Fase 1.**
2. **54 de 64 `<Tooltip>` sem `contentStyle`** → tooltip usa o padrão do Recharts (fundo branco fixo, texto escuro) → ilegível/berrante no dark mode.
3. **~37 eixos com `tick={{ fontSize: N }}` sem `fill`** → cinza `#666` fixo, apagado nos dois temas e quase invisível no escuro.
4. `CartesianGrid` inconsistente: 4 variações diferentes (`stroke="hsl(var(--border))"`, `className="stroke-border"`, `className="stroke-muted"`, sem nada).
5. Paleta de séries sem diferenciação garantida — a lista terminava em `hsl(var(--accent))`, que é um tint quase invisível.
6. Cores fixas em gráfico: `#d6b85f` (33x, Modo Apresentação), `#e2e8f0`, `#94a3b8`, `#fb7185`, `#34d399`.

## 5. Inventário de seleção de data

| Componente | Arquivo | Situação |
|---|---|---|
| Calendário base | `ui/calendar.tsx` | `react-day-picker` v8 com classes shadcn padrão. `day_today: bg-accent` — com o accent antigo ficava indistinguível; `nav_button` com `opacity-50`; `day_outside` com `opacity-50` sobre `text-muted-foreground` (duplo apagamento). |
| Input de data | `ui/DateInput.tsx` | Wrapper obrigatório (limita ano a 4 dígitos). |
| **`<Input type="date">` cru** | **26 arquivos / 49 ocorrências** | Viola a convenção do `CLAUDE.md`; visual do date picker fica a cargo do browser (péssimo no dark). |
| Filtro de período | `PeriodFilter.tsx` | Botões Dia/Semana/Mês/Ano/Período + 2 inputs nativos. |
| Presets de intervalo | `financeiro/DateRangePresets.tsx` | Strings `yyyy-MM-dd`. |
| Navegação de mês | `financeiro/MonthNavigator.tsx` | Aritmética pura em `yyyy-MM`. |
| Popover de calendário | 4 arquivos usam `<Calendar>` em `Popover` | Verificar `z-index`/portal na Fase 5. |

## 6. Outros problemas encontrados

- `ui/sonner.tsx` importa `useTheme` de **`next-themes`**, mas não existe `ThemeProvider` do next-themes montado — o valor é sempre `"system"`. Deve consumir `@/hooks/useTheme`.
- `AppLayout` tem **duas** entradas para o mesmo `TabId` (`salmon` em ESTRATÉGICO e em OPERAÇÃO) — comportamento intencional, mas o estado ativo acende nos dois itens.
- `--sidebar-border: transparent` — sidebar sem separação do conteúdo.
- Header (`h-16`) só exibe o título da tab; não há navegação contextual de módulo (o mockup pede uma).
- Sidebar redimensionável por arraste (160–480px) com persistência em `localStorage['app:sidebar:width']` — **preservar**.
- `KpiCard` tem variante `gold` que na prática renderiza `warning` (âmbar) — resquício da identidade antiga.
- `SubmoduleSwitcher` usa `gradient-salmon` no estado ativo (gradiente forte demais para um seletor de navegação).
- Densidade: `h1` era `text-3xl font-extrabold`, `--radius: 1rem`, `CardHeader p-6` — pesado para telas operacionais.
- `tr:hover td` pintava com `hsl(var(--primary)/0.06)` — hover de tabela tingido pela cor de marca.

## 7. Baseline de qualidade (antes da Fase 1)

```
npx tsc --noEmit   → 0 erros
bun run lint       → 0 errors, 678 warnings (todos `@typescript-eslint/no-explicit-any` pré-existentes)
bun run test       → 61 arquivos, 518 testes, 100% passando
bun run build      → OK (chunks: vendor-excel 929kB, vendor-charts 555kB, jspdf 430kB)
```

## 8. Riscos identificados

| Risco | Mitigação |
|---|---|
| `text-primary` (333 usos) mudar de dourado para azul e reprovar contraste | `--primary` definido por tema com AA garantido nos dois (5,2:1) |
| `bg-primary` sólido (48 usos) com label branco no dark | Token `--primary-strong` (idêntico nos 2 temas, label branco 5,2:1) para superfícies com texto |
| Classes legadas `gradient-salmon` / `glow-salmon` / `gold-*` em 35 arquivos | Nomes preservados, **valores** remapeados para azul; migração para nomes semânticos nas fases seguintes |
| Mudança em `Button`/`Card`/`Select` afeta 135/58/64 arquivos | Alterar apenas variantes de estilo, nunca a API de props |
| Modo Apresentação (`PresentationSlideCanvas`) tem tema fixo próprio (80 cores) | Tratado isoladamente na Fase 10 |
| `--radius` 1rem → 0,75rem muda o raio do sistema todo | Intencional; validado visualmente na Fase 11 |
