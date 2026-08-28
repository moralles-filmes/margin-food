/**
 * Camada central de tema para gráficos (Recharts).
 *
 * Fonte única de cor/grade/eixo/tooltip/legenda para todo gráfico do sistema — nunca hex/rgb
 * literal em `fill`/`stroke`/`color` de um componente de gráfico, sempre os tokens daqui.
 * Ver docs/redesign/01-DESIGN-SYSTEM.md § Gráficos para o papel de cada token.
 *
 * Recharts recebe cor como string CSS (não classe Tailwind), por isso os valores aqui são
 * sempre `hsl(var(--chart-*))`, nunca a classe `text-chart-*`/`bg-chart-*` equivalente.
 */

import { formatMoneyBR, formatPercentBR, formatQuantityBR } from '@/lib/formatters';
import { fmtBRLCompact } from '@/lib/money';

/** Séries categóricas (produto A/B/C, categoria de despesa…) — 8 matizes distintos, nunca tons do mesmo azul. */
export const SERIES_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
  'hsl(var(--chart-7))',
  'hsl(var(--chart-8))',
] as const;

/** Cor de uma série categórica pelo índice, com wrap-around para mais de 8 séries. */
export function getSeriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

/** Cores semânticas — usar em vez de `SERIES_COLORS` quando a série TEM um significado fixo. */
export const SEMANTIC_CHART_COLORS = {
  positive: 'hsl(var(--chart-positive))',
  negative: 'hsl(var(--chart-negative))',
  neutral: 'hsl(var(--chart-neutral))',
  /** Série "ideal/orçado/projetado" — sempre pareada com `PROJECTED_DASH_ARRAY` (linha tracejada). */
  projected: 'hsl(var(--chart-projected))',
} as const;

/**
 * `strokeDasharray` padrão da série "ideal/orçado/projetado" (par da linha "real", sólida).
 * Mantido igual ao já usado em `PresentationPlanComparison`/`PresentationScenarioSection` —
 * não é um valor novo, é a convenção existente centralizada aqui.
 */
export const PROJECTED_DASH_ARRAY = '6 4';

/** Spread em `<XAxis>`/`<YAxis>`. Mesmo objeto serve para os dois eixos. */
export const axisProps = {
  tick: { fill: 'hsl(var(--chart-label))', fontSize: 12 },
  stroke: 'hsl(var(--chart-axis))',
  tickLine: false,
  axisLine: { stroke: 'hsl(var(--chart-axis))' },
} as const;

/**
 * Spread em `<CartesianGrid>`. Grade só horizontal, sem grade vertical — direção confirmada no
 * mockup 04 ("grade horizontal sutil e visível, sem grade vertical"). É o padrão recomendado para
 * todo gráfico de linha/área migrado nas Fases 7/8; um gráfico de barras que precise das duas
 * direções pode sobrescrever com `{...gridProps, vertical: true}`. `strokeDasharray: '3 3'` mantém
 * a convenção já usada em ~20 consumidores existentes — não é um estilo novo, só centralizado.
 */
export const gridProps = {
  stroke: 'hsl(var(--chart-grid))',
  strokeDasharray: '3 3',
  vertical: false,
} as const;

/** `cursor` do `<Tooltip>` — faixa de hover. Line/Area usam `stroke`, Bar usa `fill`. */
export const cursorProps = {
  stroke: 'hsl(var(--chart-cursor))',
  strokeWidth: 1,
  fill: 'hsl(var(--chart-cursor))',
} as const;

/**
 * `activeDot` de uma `<Line>`/`<Area>` — ponto de destaque no hover, com o próprio `--background`
 * como preenchimento (efeito de "anel") em vez de opacidade.
 */
export function makeActiveDot(strokeColor: string) {
  return {
    r: 4,
    strokeWidth: 2,
    stroke: strokeColor,
    fill: 'hsl(var(--background))',
  } as const;
}

/** Props prontas para `<Tooltip {...tooltipProps} content={<ChartTooltip />} />` (Recharts cru). */
export const tooltipProps = {
  cursor: cursorProps,
} as const;

/** Props prontas para `<Legend {...legendProps} content={<ChartLegend />} />` (Recharts cru). */
export const legendProps = {
  verticalAlign: 'top',
  wrapperStyle: { paddingBottom: 12 },
} as const;

/**
 * Formatadores prontos para `formatter`/`tickFormatter`. Reexportam a formatação BR de
 * `@/lib/formatters` — esta camada não duplica a lógica de formatação, só empacota "flavors" de
 * eixo/tooltip (ex.: `moneyCompact` para não estourar o eixo Y com `R$537.565,72`).
 */
export const chartValueFormatters = {
  money: (value: number | null | undefined) => formatMoneyBR(value),
  /** Eixo Y / espaços apertados — `R$2,5M`, já existente em `@/lib/money` (`fmtBRLCompact`). */
  moneyCompact: (value: number | null | undefined) => fmtBRLCompact(value),
  percent: (value: number | null | undefined) => formatPercentBR(value),
  quantity: (unit: string) => (value: number | null | undefined) => formatQuantityBR(value, unit),
} as const;
