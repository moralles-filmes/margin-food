# Design System — Azul / Branco / Preto

Fonte única da verdade: **`src/index.css`** (valores) + **`tailwind.config.ts`** (mapeamento para classes).
Este documento explica *quando* usar cada token. Nunca escreva hex em componente.

---

## Princípios

1. **Um token por papel, não por cor.** `--primary` é "a cor de marca legível no tema atual", não "azul #2563EB".
2. **Todo token existe nos dois temas.** Se você precisa de `dark:` numa classe, provavelmente falta um token.
3. **Contraste é requisito, não acabamento.** Alvo WCAG AA: 4.5:1 texto normal, 3:1 texto grande (≥18.66px bold / 24px) e elementos de UI.
4. **Densidade operacional.** O sistema é usado o dia inteiro: dashboards podem respirar, telas de trabalho não.
5. **Sem ruído.** Sem glassmorphism, sem neumorphism, sem gradiente decorativo, sem card dentro de card dentro de card.

---

## Tipografia (NÃO ALTERAR A FAMÍLIA)

| Uso | Família | Classe |
|---|---|---|
| Corpo, UI, tabelas | **Inter** | `font-sans` (default) |
| Números de destaque, KPIs | **Space Grotesk** | `font-display` |

Escala base (definida em `@layer base`):

| Elemento | Antes | Agora |
|---|---|---|
| `h1` | `text-3xl font-extrabold` | `text-[26px] font-bold` |
| `h2` | `text-xl font-bold` | `text-xl font-semibold` |
| `h3` | `text-lg font-semibold` | `text-base font-semibold` |
| corpo | `letter-spacing: -0.01em` | `-0.011em`, `line-height: 1.5` |
| headings | `letter-spacing: -0.03em` | `-0.022em`, `line-height: 1.2` |

`th`, `td` e `.tabular-nums` recebem `font-variant-numeric: tabular-nums` — valores monetários alinham na vertical.

---

## Superfícies

| Token | Classe | Light | Dark | Quando usar |
|---|---|---|---|---|
| `--background` | `bg-background` | `#F8FAFC` | `#0A0D14` | Fundo da área de conteúdo |
| `--background-subtle` | `bg-background-subtle` | `#EEF2F7` | `#0E121A` | Faixa/well dentro de card, zebra |
| `--card` | `bg-card` | `#FFFFFF` | `#131822` | Card, painel, tabela |
| `--card-hover` | `bg-card-hover` | — | — | Card clicável em hover |
| `--surface-hover` | `bg-surface-hover` | `#F5F8FB` | `#1A2130` | Hover de linha/item de lista |
| `--surface-active` | `bg-surface-active` | `#EBF0F6` | `#212938` | Item pressionado/selecionado neutro |
| `--surface-elevated` | `bg-surface-elevated` | `#FFFFFF` | `#181E29` | Popover/dropdown/menu **acima** do card |
| `--popover` | `bg-popover` | `#FFFFFF` | `#181E29` | Radix Popover/Dropdown/Select |

> **Dark:** sidebar (`#070911`) < background (`#0A0D14`) < card (`#131822`) < elevated (`#181E29`).
> A hierarquia é feita por luminosidade crescente, nunca por `opacity`.

## Texto

| Token | Classe | Light | Dark | Contraste |
|---|---|---|---|---|
| `--foreground` / `--text-primary` | `text-foreground` / `text-ink` | `#0F172A` | `#F8FAFC` | 16:1 |
| `--text-secondary` | `text-ink-secondary` | `#334155` | `#CBD5E1` | 10:1 |
| `--muted-foreground` / `--text-muted` | `text-muted-foreground` / `text-ink-muted` | `#5A6B84` | `#98A6BC` | **4.9:1 / 6.4:1 — AA** |

> O `--muted-foreground` foi escurecido no light e clareado no dark de propósito.
> "Secundário" ≠ "quase invisível" — 1904 usos no projeto dependem disso.

## Marca (azul)

| Token | Classe | Light | Dark | Papel |
|---|---|---|---|---|
| `--primary` | `text-primary` `bg-primary` `border-primary` | `#2563EB` | `#3B82F6` | Identidade. **Legível como texto nos dois temas** (5.2:1) |
| `--primary-foreground` | `text-primary-foreground` | `#FFF` | `#FFF` | Texto sobre `--primary` |
| `--primary-strong` | `bg-primary-strong` | `#2563EB` | `#2563EB` | **Superfície de botão preenchido.** Mesmo valor nos 2 temas → label branco sempre AA (5.2:1) |
| `--primary-hover` | `hover:bg-primary-hover` | `#1D4ED8` | `#60A5FA` | Hover do botão primário |
| `--primary-active` | `active:bg-primary-active` | `#1E40AF` | — | Pressionado |
| `--primary-ink` | `text-primary-ink` | `#1B48D0` (6.7:1) | `#60A5FA` (7.6:1) | **Texto azul pequeno** (link, label de item ativo) |
| `--primary-soft` | `bg-primary-soft` | `#EFF6FF` | `#14203A` | Tint de fundo: item ativo da sidebar, badge, chip |
| `--primary-soft-foreground` | `text-primary-soft-foreground` | `#1B48D0` | `#93C5FD` | Texto sobre o tint |
| `--primary-border` | `border-primary-border` | `#BFDBFE` | `#2A3F66` | Borda do tint |

**Regra de ouro:**
`bg-primary` + texto → **só** para texto grande. Com label pequeno use `bg-primary-strong text-primary-strong-foreground`.
Azul como texto pequeno sobre fundo do tema → `text-primary-ink`.

## Semânticas

Cada uma tem 4 formas: `DEFAULT` (texto/ícone, AA), `-foreground` (sobre o DEFAULT), `-soft` (tint de fundo), `-border`.

| Token | Light | Dark | Uso |
|---|---|---|---|
| `success` | `#15803D` | `#22C55E` | Positivo, concluído, no ritmo |
| `warning` | `#9A4A0A` | `#F5A524` | Atenção, pendente |
| `destructive` / `danger` | `#B91C1C` | `#F45A5A` | Erro, negativo, cancelado |
| `info` | `#0369A1` | `#38BDF8` | Informativo — **ciano-azulado**, deliberadamente distinto de `--primary` |
| `neutral` | `#5A6B84` | `#98A6BC` | Em aberto, rascunho, sem status |

> Não pinte um card inteiro de verde/vermelho. Use ícone + valor + badge + barra fina.
> Reserve superfície vermelha grande para erro crítico.

## Bordas, foco e raio

| Token | Classe | Light | Dark |
|---|---|---|---|
| `--border` | `border-border` | `#E2E8F0` | `#252C3A` |
| `--border-strong` | `border-border-strong` | `#CBD5E1` | `#333D50` |
| `--input` | `border-input` | `#DCE3ED` | `#2B3444` |
| `--ring` | `ring-ring` | `#2563EB` | `#3B82F6` |

`:focus-visible` global: `outline: 2px solid hsl(var(--ring)); outline-offset: 2px`.
**Nunca** remover outline sem substituto.

`--radius: 0.75rem` (12px) → `rounded-lg` 12px · `rounded-md` 10px · `rounded-sm` 8px.

## Elevação

| Classe | Uso |
|---|---|
| `shadow-xs` | Separação mínima |
| `shadow-sm` / `shadow-card` | Card padrão |
| `shadow-md` | Dropdown, popover, tooltip |
| `shadow-lg` | Modal, drawer |
| `shadow-focus` | Anel de foco composto |

No dark, prefira **borda** a sombra — sombra preta sobre fundo preto não comunica elevação.

## Sidebar

| Token | Papel |
|---|---|
| `--sidebar-background` | Fundo. Light `#FFFFFF` · Dark `#070911` (mais escuro que o conteúdo) |
| `--sidebar-foreground` | Texto de item inativo |
| `--sidebar-section` | Rótulo de grupo (`ESTRATÉGICO`, `OPERAÇÃO`…) |
| `--sidebar-hover` / `-hover-foreground` | Hover — **cor cheia**, não `/[0.08]` |
| `--sidebar-active` / `-active-foreground` | Item ativo: tint azul + texto azul AA |
| `--sidebar-active-marker` | Barra/acento do item ativo |
| `--sidebar-border` | Separação da sidebar (antes era `transparent`) |

## Gráficos

| Token | Papel |
|---|---|
| `--chart-1` … `--chart-8` | Séries categóricas. **Matizes distintos** (azul, esmeralda, âmbar, violeta, ciano, rosa, slate, carmim) — nunca 5 tons do mesmo azul |
| `--chart-positive` / `--chart-negative` / `--chart-neutral` | Séries semânticas |
| `--chart-projected` | Série "ideal/orçado/projetado" (par da linha tracejada) |
| `--chart-grid` | Grade — sutil **e** visível nos dois temas |
| `--chart-axis` | Linha do eixo |
| `--chart-label` | Texto de eixo/legenda — **AA nos dois temas** |
| `--chart-cursor` | Faixa de hover |
| `--chart-tooltip` / `-foreground` / `-border` | Tooltip com superfície diferenciada do card |

Classes: `stroke-chart-grid`, `fill-chart-label`, `text-chart-1`… A camada centralizada que consome tudo isso
é criada na **Fase 6** (`src/lib/chartTheme.ts`). Até lá, consuma via `hsl(var(--chart-N))`.

---

## Aliases legados (dourado → azul)

Nomes preservados para não quebrar 35 arquivos de uma vez; **os valores já são azuis**.
São dívida técnica rastreada — migre quando tocar no arquivo.

| Legado | Substituto semântico |
|---|---|
| `--gold` / `text-gold` / `bg-gold` | `--primary` / `text-primary` |
| `--gold-dark` / `text-gold-dark` | `--primary-ink` |
| `--gold-light` | `--primary-hover` (dark) / `--primary-border` |
| `.gradient-salmon` | `.gradient-brand` (mesmo valor) |
| `.text-gradient-salmon` | `.text-gradient-brand` |
| `.glow-salmon` | `shadow-glow` |
| `--gradient-gold` | `--gradient-brand` |
| `KpiVariant: 'gold'` | `'warning'` ou `'primary'` |

> Regra de `CLAUDE.md`: **não renomear** essas classes em massa — o nome é legado, o valor é a fonte da verdade.
> A remoção definitiva dos aliases é tarefa da **Fase 11**, e só se nenhum uso restar.

## Anti-padrões

```css
/* ❌ nunca */
.dark * { color: white !important; }
svg { stroke: blue !important; }
```

```tsx
// ❌ hex em componente
<Bar fill="#2563EB" />
// ✅
<Bar fill="hsl(var(--chart-1))" />

// ❌ opacity para hierarquia
<span className="text-foreground opacity-40">
// ✅ token com contraste calculado
<span className="text-muted-foreground">

// ❌ classe dark: avulsa
<div className="bg-white dark:bg-zinc-900">
// ✅
<div className="bg-card">
```
