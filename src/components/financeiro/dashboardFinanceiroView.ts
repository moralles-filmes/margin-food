import { addDays, differenceInCalendarDays, format, startOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Funções puras de apresentação do Dashboard Financeiro (Redesign V2, Fase 03). Só derivam texto e
 * proporções dos dados já carregados — nenhum cálculo financeiro novo mora aqui.
 */

export interface DashboardRange {
  /** yyyy-MM-dd, inclusivo */
  start: string;
  /** yyyy-MM-dd, exclusivo — mesma semântica de get_fin_dashboard_summary */
  endExclusive: string;
}

/** Data local a partir de 'yyyy-MM-dd' (nunca `new Date('yyyy-MM-dd')`, que é UTC e recua um dia no BR). */
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Rótulo do período aplicado ao resumo: um dia, um mês inteiro ou um intervalo. */
export function formatDashboardRangeLabel(range: DashboardRange): string {
  const start = parseLocalDate(range.start);
  const endExclusive = parseLocalDate(range.endExclusive);
  const endInclusive = addDays(endExclusive, -1);
  const fmt = (d: Date) => format(d, 'dd/MM/yyyy');

  if (fmt(start) === fmt(endInclusive)) return fmt(start);

  const isWholeMonth = start.getDate() === 1
    && endExclusive.getDate() === 1
    && format(addDays(endExclusive, -1), 'yyyy-MM') === format(start, 'yyyy-MM');
  if (isWholeMonth) return capitalize(format(start, "MMMM 'de' yyyy", { locale: ptBR }));

  return `${fmt(start)} a ${fmt(endInclusive)}`;
}

/** O período aplicado contém hoje e ainda não terminou (os valores vão só até hoje). */
export function isDashboardRangeInProgress(range: DashboardRange, today: string): boolean {
  return range.start <= today && today < range.endExclusive;
}

/**
 * Janela do comparativo "vs. período anterior": a mesma de `get_fin_dashboard_summary`
 * (`v_prev_start := p_start - (p_end - p_start)`, até `p_start` exclusivo). Só aritmética de datas.
 */
export function previousDashboardRange(range: DashboardRange): DashboardRange {
  const start = parseLocalDate(range.start);
  const days = differenceInCalendarDays(parseLocalDate(range.endExclusive), start);
  return { start: format(addDays(start, -days), 'yyyy-MM-dd'), endExclusive: range.start };
}

/** Rótulo de intervalo sempre em datas (dd/MM/yyyy a dd/MM/yyyy), para a janela do comparativo. */
export function formatDashboardDatesLabel(range: DashboardRange): string {
  const start = parseLocalDate(range.start);
  const endInclusive = addDays(parseLocalDate(range.endExclusive), -1);
  const fmt = (d: Date) => format(d, 'dd/MM/yyyy');
  return fmt(start) === fmt(endInclusive) ? fmt(start) : `${fmt(start)} a ${fmt(endInclusive)}`;
}

export interface CategoryRankingRow {
  nome: string;
  valor: number;
  /** % sobre a soma das categorias recebidas (o Top N), nunca sobre a despesa total. */
  share: number | null;
  /** Largura da barra relativa à maior categoria (0–100). */
  barPercent: number;
}

export interface CategoryRanking {
  /** Soma das categorias recebidas — o Top N, não o total da despesa. */
  total: number;
  rows: CategoryRankingRow[];
}

export function buildCategoryRanking(items: ReadonlyArray<{ nome: string; valor: number }>): CategoryRanking {
  const total = items.reduce((sum, item) => sum + item.valor, 0);
  const max = items.reduce((m, item) => Math.max(m, item.valor), 0);
  return {
    total,
    rows: items.map(item => ({
      nome: item.nome,
      valor: item.valor,
      share: total > 0 ? (item.valor / total) * 100 : null,
      barPercent: max > 0 ? (Math.max(item.valor, 0) / max) * 100 : 0,
    })),
  };
}

export interface ProvisionedComposition {
  total: number;
  /** null quando a proporção não pode ser desenhada sem distorcer (total zero ou parcela negativa). */
  realizadaPercent: number | null;
  aPagarPercent: number | null;
}

/** Composição de Despesas Provisionadas = despesa realizada + contas a pagar (mesma fórmula do card). */
export function buildProvisionedComposition(despesa: number, aPagar: number): ProvisionedComposition {
  const total = despesa + aPagar;
  const drawable = despesa >= 0 && aPagar >= 0 && total > 0;
  return {
    total,
    realizadaPercent: drawable ? (despesa / total) * 100 : null,
    aPagarPercent: drawable ? (aPagar / total) * 100 : null,
  };
}

/**
 * Grade dos dois grupos de cards (família V2: Inter 24 px, `tabular-nums`, padding de 20 px).
 * Segue a largura do próprio grupo (container query), não a da janela — a sidebar redimensionável
 * (160–480 px) muda o espaço disponível. O limiar depende do valor mais longo exibido: cada caractere
 * ocupa ~13,5 px (medido em navegador: "R$123.456,78" = 162 px, "R$-1.234.567,89" = 197 px), e o
 * card só passa a 2 ou 4 colunas quando esse valor cabe inteiro. Nunca se reduz a fonte nem se
 * corta o valor; com valor maior, a grade reorganiza.
 *
 * As classes ficam literais para o Tailwind encontrá-las.
 */
const KPI_GRID_BY_LENGTH: ReadonlyArray<{ maxChars: number; className: string }> = [
  { maxChars: 12, className: 'grid grid-cols-1 gap-4 [@container(min-width:27rem)]:grid-cols-2 [@container(min-width:55rem)]:grid-cols-4' },
  { maxChars: 13, className: 'grid grid-cols-1 gap-4 [@container(min-width:29rem)]:grid-cols-2 [@container(min-width:59rem)]:grid-cols-4' },
  { maxChars: 14, className: 'grid grid-cols-1 gap-4 [@container(min-width:31rem)]:grid-cols-2 [@container(min-width:62rem)]:grid-cols-4' },
  { maxChars: 15, className: 'grid grid-cols-1 gap-4 [@container(min-width:33rem)]:grid-cols-2 [@container(min-width:66rem)]:grid-cols-4' },
  { maxChars: 16, className: 'grid grid-cols-1 gap-4 [@container(min-width:34rem)]:grid-cols-2 [@container(min-width:69rem)]:grid-cols-4' },
  { maxChars: 17, className: 'grid grid-cols-1 gap-4 [@container(min-width:36rem)]:grid-cols-2 [@container(min-width:72rem)]:grid-cols-4' },
];
const KPI_GRID_FALLBACK = 'grid grid-cols-1 gap-4 [@container(min-width:40rem)]:grid-cols-2';

/** Classe da grade para o valor formatado mais longo (em caracteres) entre os cards exibidos. */
export function kpiGridClassFor(longestValueChars: number): string {
  return KPI_GRID_BY_LENGTH.find(step => longestValueChars <= step.maxChars)?.className ?? KPI_GRID_FALLBACK;
}

export interface HistoryWindow {
  startKey: string;
  endKey: string;
  /** ex.: "mai/26 a out/26" */
  label: string;
}

/**
 * Janela dos gráficos de evolução: últimos `meses` meses até o mês atual — o mesmo recorte de
 * `DashboardCharts` (startOfMonth(subMonths(hoje, meses - 1)) até o fim do mês atual).
 */
export function historyWindow(meses: number, now: Date = new Date()): HistoryWindow {
  const start = startOfMonth(subMonths(now, meses - 1));
  const end = startOfMonth(now);
  const short = (d: Date) => format(d, 'MMM/yy', { locale: ptBR });
  return {
    startKey: format(start, 'yyyy-MM'),
    endKey: format(end, 'yyyy-MM'),
    label: `${short(start)} a ${short(end)}`,
  };
}
