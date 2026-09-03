import type {
  CategoryCompositionNode,
  CategoryCompositionSection,
  DataAvailability,
  PresentationRankings,
  PresentationRevenueData,
  PresentationExpensesData,
  PresentationExpenseNode,
  PresentationResultsData,
  PresentationInsightsData,
  PresentationInsight,
  PresentationRevenueExpenseMonthPoint,
  PresentationSlide,
  PresentationSlidePayload,
  PresentationTimeSeries,
} from '@/domain/financeiro/presentation';
import {
  PRESENTATION_CHAPTERS,
  PRESENTATION_INSIGHT_RULES,
  presentationPlanHasConfiguredTarget,
  type PresentationChapterId,
} from '@/domain/financeiro/presentation';
import type {
  PresentationAnalyticsSnapshot,
  PresentationSociosData,
} from '@/lib/financeiroPresentationAdapter';
import { hasPresentationNonOperationalValues } from '@/lib/resultsPresentationAdapter';

const MAX_TIME_SERIES_POINTS_PER_SLIDE = 12;
// Contadores por slide calibrados para o tamanho de fonte da apresentação
// (PresentationSlideCanvas.tsx) — se a fonte crescer, reduza aqui também,
// senão as linhas extrapolam a altura fixa do card e o texto se sobrepõe.
const MAX_CATEGORY_ROWS_PER_COLUMN = 6;
const MAX_REVENUE_BRAND_ROWS_PER_SLIDE = 5;
const MAX_RANKING_ITEMS_PER_COLUMN = 5;
const MAX_DECISION_ACTIONS_PER_SLIDE = 5;
const MAX_DECISION_ACTION_CHARACTERS_PER_SLIDE = 700;
const MAX_INSIGHT_LAYOUT_CHARACTERS_PER_SLIDE = 1_300;

export const PRESENTATION_SLIDE_SEQUENCE = [
  'chapter-foundation',
  'revenue-summary',
  'revenue-gross-net',
  'revenue-by-brand',
  'revenue-weekdays',
  'revenue-history',
  'expenses-summary',
  'expenses-tree',
  'expenses-rolling',
  'expenses-history',
  'revenue-expenses-monthly',
  'results-summary',
  'results-comparison',
  'results-evolution',
  'results-bridge',
  'results-non-operational',
  'insights',
  'cover',
  'executive-summary',
  'plan-comparison',
  'scenario-impact',
  'scenario-sensitivity',
  'decision-commitments',
  'decision-follow-up',
  'time-series',
  'category-composition',
  'rankings',
  'open-items',
  'non-operational',
] as const;

type SnapshotAvailability = DataAvailability<PresentationAnalyticsSnapshot>;

const FOUNDATION_SLIDES: readonly Omit<PresentationSlide, 'order'>[] = PRESENTATION_CHAPTERS.map(chapter => ({
  id: `chapter-${chapter.id}`,
  chapter: chapter.id,
  kind: 'chapter-foundation',
  title: chapter.label,
  subtitle: 'Estrutura preparada nesta fase; os dados canônicos serão conectados nas próximas fases.',
  availability: { state: 'unavailable', reason: 'not-requested' },
}));

function chunk<T>(items: readonly T[], size: number): T[][] {
  if (items.length === 0) return [[]];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function paginateInsights(items: readonly PresentationInsight[]): PresentationInsight[][] {
  if (items.length === 0) return [[]];
  const pages: PresentationInsight[][] = [];
  let current: PresentationInsight[] = [];
  let characters = 0;

  for (const insight of items) {
    const insightCharacters = insight.title.length
      + insight.description.length
      + insight.period.label.length
      + insight.source.label.length
      + JSON.stringify(insight.evidence).length;
    if (
      current.length > 0
      && (
        current.length >= PRESENTATION_INSIGHT_RULES.selection.maximumPerSlide
        || characters + insightCharacters > MAX_INSIGHT_LAYOUT_CHARACTERS_PER_SLIDE
      )
    ) {
      pages.push(current);
      current = [];
      characters = 0;
    }
    current.push(insight);
    characters += insightCharacters;
  }

  if (current.length > 0) pages.push(current);
  return pages;
}

function paginateDecisionActions<T extends { description: string }>(items: readonly T[]): T[][] {
  if (items.length === 0) return [[]];
  const pages: T[][] = [];
  let current: T[] = [];
  let characters = 0;
  for (const item of items) {
    const size = item.description.length;
    if (
      current.length > 0
      && (current.length >= MAX_DECISION_ACTIONS_PER_SLIDE
        || characters + size > MAX_DECISION_ACTION_CHARACTERS_PER_SLIDE)
    ) {
      pages.push(current);
      current = [];
      characters = 0;
    }
    current.push(item);
    characters += size;
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

function copyUnavailable<T>(availability: DataAvailability<unknown>): DataAvailability<T> | null {
  switch (availability.state) {
    case 'idle':
      return { state: 'idle' };
    case 'loading':
      return { state: 'loading' };
    case 'unavailable':
      return { state: 'unavailable', reason: availability.reason };
    case 'error':
      return { state: 'error', message: availability.message };
    default:
      return null;
  }
}

function revenueSlideAvailability<T extends PresentationSlidePayload>(
  availability: NonNullable<PresentationSociosData['revenue']>,
  createPayload: (revenue: PresentationRevenueData) => T,
): DataAvailability<T> {
  if (availability.state === 'available') {
    return {
      state: 'available',
      data: createPayload(availability.data),
      fetchedAt: availability.fetchedAt,
    };
  }
  if (availability.state === 'empty') {
    return {
      state: 'empty',
      data: createPayload(availability.data),
      fetchedAt: availability.fetchedAt,
    };
  }
  return copyUnavailable<T>(availability)!;
}

function expensesSlideAvailability<T extends PresentationSlidePayload>(
  availability: NonNullable<PresentationSociosData['expenses']>,
  createPayload: (expenses: PresentationExpensesData) => T,
): DataAvailability<T> {
  if (availability.state === 'available') {
    return { state: 'available', data: createPayload(availability.data), fetchedAt: availability.fetchedAt };
  }
  if (availability.state === 'empty') {
    return { state: 'empty', data: createPayload(availability.data), fetchedAt: availability.fetchedAt };
  }
  return copyUnavailable<T>(availability)!;
}

const UNAVAILABLE_STATE_RANK = { error: 3, unavailable: 2, loading: 1, idle: 0 } as const;

/**
 * Disponibilidade combinada de duas fontes independentes (faturamento e
 * despesas): "available" só se AMBAS estiverem disponíveis; "empty" se
 * ambas forem utilizáveis mas pelo menos uma vazia; senão copia o pior
 * estado não utilizável entre as duas (error > unavailable > loading > idle)
 * — nunca inventa disponibilidade a partir de uma fonte só.
 */
function combinedSlideAvailability<T extends PresentationSlidePayload>(
  revenue: NonNullable<PresentationSociosData['revenue']>,
  expenses: NonNullable<PresentationSociosData['expenses']>,
  createPayload: (revenue: PresentationRevenueData, expenses: PresentationExpensesData) => T,
): DataAvailability<T> {
  const revenueUsable = revenue.state === 'available' || revenue.state === 'empty';
  const expensesUsable = expenses.state === 'available' || expenses.state === 'empty';
  if (revenueUsable && expensesUsable) {
    const state = revenue.state === 'available' && expenses.state === 'available' ? 'available' as const : 'empty' as const;
    const fetchedAts = [revenue.fetchedAt, expenses.fetchedAt]
      .filter((value): value is string => Boolean(value))
      .sort();
    return { state, data: createPayload(revenue.data, expenses.data), fetchedAt: fetchedAts[0] };
  }
  if (revenueUsable) return copyUnavailable<T>(expenses)!;
  if (expensesUsable) return copyUnavailable<T>(revenue)!;
  const worse = UNAVAILABLE_STATE_RANK[revenue.state] >= UNAVAILABLE_STATE_RANK[expenses.state] ? revenue : expenses;
  return copyUnavailable<T>(worse)!;
}

/**
 * 12 posições Jan..Dez do `year`, cruzando `revenue.netHistory` e
 * `expenses.history` por `yearMonth`. Vazio quando `year` não está nos
 * anos solicitados de AMBAS as fontes — nunca preenche buraco com zero.
 */
function buildRevenueExpenseMonthPoints(
  revenue: PresentationRevenueData,
  expenses: PresentationExpensesData,
  year: number,
): PresentationRevenueExpenseMonthPoint[] {
  if (!revenue.requestedYears.includes(year) || !expenses.requestedYears.includes(year)) return [];
  const netByYearMonth = new Map(revenue.netHistory.map(point => [point.yearMonth, point]));
  const expenseByYearMonth = new Map(expenses.history.map(point => [point.yearMonth, point]));
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const yearMonth = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
    const netPoint = netByYearMonth.get(yearMonth);
    const expensePoint = expenseByYearMonth.get(yearMonth);
    return {
      month,
      yearMonth,
      netRevenue: { state: netPoint?.state ?? 'unavailable', total: netPoint?.total ?? 0 },
      expense: { state: expensePoint?.state ?? 'unavailable', total: expensePoint?.total ?? 0 },
    };
  });
}

function resultsSlideAvailability<T extends PresentationSlidePayload>(
  availability: NonNullable<PresentationSociosData['results']>,
  createPayload: (results: PresentationResultsData) => T,
): DataAvailability<T> {
  if (availability.state === 'available') {
    return { state: 'available', data: createPayload(availability.data), fetchedAt: availability.fetchedAt };
  }
  if (availability.state === 'empty') {
    return { state: 'empty', data: createPayload(availability.data), fetchedAt: availability.fetchedAt };
  }
  return copyUnavailable<T>(availability)!;
}

function insightsSlideAvailability<T extends PresentationSlidePayload>(
  availability: NonNullable<PresentationSociosData['insights']>,
  createPayload: (insights: PresentationInsightsData) => T,
): DataAvailability<T> {
  if (availability.state === 'available') {
    return { state: 'available', data: createPayload(availability.data), fetchedAt: availability.fetchedAt };
  }
  if (availability.state === 'empty') {
    return { state: 'empty', data: createPayload(availability.data), fetchedAt: availability.fetchedAt };
  }
  return copyUnavailable<T>(availability)!;
}

function payloadAvailability<T extends PresentationSlidePayload>(
  availability: SnapshotAvailability,
  payload: T,
  hasData: boolean,
): DataAvailability<T> {
  if (availability.state !== 'available' && availability.state !== 'empty') {
    return copyUnavailable<T>(availability)!;
  }

  const fetchedAt = availability.fetchedAt;
  return availability.state === 'empty' || !hasData
    ? { state: 'empty', data: payload, fetchedAt }
    : { state: 'available', data: payload, fetchedAt };
}

function countTreeRows(node: CategoryCompositionNode): number {
  return 1 + node.children.reduce((total, child) => total + countTreeRows(child), 0);
}

function cloneNodeWithChildren(
  node: CategoryCompositionNode,
  children: readonly CategoryCompositionNode[],
): CategoryCompositionNode {
  return { ...node, children };
}

function splitOversizedNode(
  node: CategoryCompositionNode,
  maxRows: number,
): CategoryCompositionNode[] {
  if (countTreeRows(node) <= maxRows || node.children.length === 0 || maxRows <= 1) return [node];

  const childParts = node.children.flatMap(child => splitOversizedNode(child, maxRows - 1));
  const pages: CategoryCompositionNode[] = [];
  let currentChildren: CategoryCompositionNode[] = [];
  let currentRows = 1;

  for (const child of childParts) {
    const childRows = countTreeRows(child);
    if (currentChildren.length > 0 && currentRows + childRows > maxRows) {
      pages.push(cloneNodeWithChildren(node, currentChildren));
      currentChildren = [];
      currentRows = 1;
    }
    currentChildren.push(child);
    currentRows += childRows;
  }

  if (currentChildren.length > 0) pages.push(cloneNodeWithChildren(node, currentChildren));
  return pages;
}

function paginateForest(
  nodes: readonly CategoryCompositionNode[],
  maxRows: number,
): CategoryCompositionNode[][] {
  if (nodes.length === 0) return [[]];
  const parts = nodes.flatMap(node => splitOversizedNode(node, maxRows));
  const pages: CategoryCompositionNode[][] = [];
  let current: CategoryCompositionNode[] = [];
  let currentRows = 0;

  for (const node of parts) {
    const rows = countTreeRows(node);
    if (current.length > 0 && currentRows + rows > maxRows) {
      pages.push(current);
      current = [];
      currentRows = 0;
    }
    current.push(node);
    currentRows += rows;
  }

  if (current.length > 0) pages.push(current);
  return pages;
}

function countExpenseRows(node: PresentationExpenseNode): number {
  return 1 + node.children.reduce((total, child) => total + countExpenseRows(child), 0);
}

function splitExpenseNode(node: PresentationExpenseNode, maxRows: number): PresentationExpenseNode[] {
  if (countExpenseRows(node) <= maxRows || node.children.length === 0 || maxRows <= 1) return [node];
  const childParts = node.children.flatMap(child => splitExpenseNode(child, maxRows - 1));
  const pages: PresentationExpenseNode[] = [];
  let children: PresentationExpenseNode[] = [];
  let rows = 1;
  for (const child of childParts) {
    const childRows = countExpenseRows(child);
    if (children.length > 0 && rows + childRows > maxRows) {
      pages.push({ ...node, children });
      children = [];
      rows = 1;
    }
    children.push(child);
    rows += childRows;
  }
  if (children.length > 0) pages.push({ ...node, children });
  return pages;
}

function paginateExpenseTree(nodes: readonly PresentationExpenseNode[], maxRows = 5): PresentationExpenseNode[][] {
  if (nodes.length === 0) return [[]];
  const parts = nodes.flatMap(node => splitExpenseNode(node, maxRows));
  const pages: PresentationExpenseNode[][] = [];
  let current: PresentationExpenseNode[] = [];
  let rows = 0;
  for (const node of parts) {
    const nodeRows = countExpenseRows(node);
    if (current.length > 0 && rows + nodeRows > maxRows) {
      pages.push(current);
      current = [];
      rows = 0;
    }
    current.push(node);
    rows += nodeRows;
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

function paginateComposition(
  section: CategoryCompositionSection,
  maxRows = MAX_CATEGORY_ROWS_PER_COLUMN,
): CategoryCompositionSection[] {
  const revenuePages = paginateForest(section.revenue, maxRows);
  const expensePages = paginateForest(section.expense, maxRows);
  const pageCount = Math.max(revenuePages.length, expensePages.length);
  return Array.from({ length: pageCount }, (_, index) => ({
    revenue: revenuePages[index] ?? [],
    expense: expensePages[index] ?? [],
  }));
}

function paginateRankings(rankings: PresentationRankings): PresentationRankings[] {
  const revenuePages = chunk(rankings.topRevenueCategories, MAX_RANKING_ITEMS_PER_COLUMN);
  const expensePages = chunk(rankings.topExpenseCategories, MAX_RANKING_ITEMS_PER_COLUMN);
  const pageCount = Math.max(revenuePages.length, expensePages.length);
  return Array.from({ length: pageCount }, (_, index) => ({
    topRevenueCategories: revenuePages[index] ?? [],
    topExpenseCategories: expensePages[index] ?? [],
  }));
}

function paginateTimeSeries(timeSeries: PresentationTimeSeries): PresentationTimeSeries[] {
  return chunk(timeSeries.points, MAX_TIME_SERIES_POINTS_PER_SLIDE).map(points => ({
    granularity: timeSeries.granularity,
    points,
  }));
}

function hasComposition(section: CategoryCompositionSection): boolean {
  return section.revenue.length > 0 || section.expense.length > 0;
}

function hasRankings(rankings: PresentationRankings): boolean {
  return rankings.topRevenueCategories.length > 0 || rankings.topExpenseCategories.length > 0;
}

function comparisonSubtitle(data: PresentationSociosData): string {
  const comparison = data.comparisons.previousPeriod.snapshot;
  if (comparison.state === 'unavailable') return 'Comparação anterior fora do histórico disponível.';
  if (comparison.state === 'error') return 'Comparação anterior indisponível.';
  if (comparison.state === 'empty') return 'Comparação com período anterior sem movimento.';
  return 'Comparação com o período anterior; bases zero são indicadas como indisponíveis.';
}

function withPageNumber(title: string, index: number, total: number): string {
  return total > 1 ? `${title} (${index + 1}/${total})` : title;
}

export function buildPresentationSlides(data: PresentationSociosData): PresentationSlide[] {
  const slides: PresentationSlide[] = [];
  const append = (
    slide: Omit<PresentationSlide, 'order' | 'chapter'> & { chapter?: PresentationChapterId },
  ) => {
    slides.push({ ...slide, order: slides.length } as PresentationSlide);
  };

  FOUNDATION_SLIDES.forEach((slide) => {
    if (slide.chapter === 'insights' && data.insights) {
      const pages: PresentationInsight[][] =
        data.insights.state === 'available' || data.insights.state === 'empty'
          ? paginateInsights(data.insights.data.insights)
          : [[]];
      pages.forEach((items, index) => append({
        id: index === 0 ? 'chapter-insights' : `chapter-insights-page-${index + 1}`,
        chapter: 'insights',
        kind: 'insights',
        title: withPageNumber('Insights', index, pages.length),
        subtitle: 'Motor determinístico · usa cada fonte canônica disponível e identifica a origem em cada insight · sem causalidade ou recomendação automática.',
        availability: insightsSlideAvailability(
          data.insights!,
          insights => ({ type: 'insights', insights, items }),
        ),
      }));
      return;
    }
    if (slide.chapter === 'results' && data.results) {
      append({
        id: 'chapter-results',
        chapter: 'results',
        kind: 'results-summary',
        title: 'Resultados',
        subtitle: `${data.periodLabel} · receita, despesa, resultado e margem · mesmo regime de caixa do Dashboard.`,
        availability: resultsSlideAvailability(
          data.results,
          results => ({ type: 'results-summary', results }),
        ),
      });
      append({
        id: 'results-comparison',
        chapter: 'results',
        kind: 'results-comparison',
        title: 'Comparação com o período anterior',
        subtitle: 'Períodos equivalentes · bases zero e indisponibilidade permanecem explícitas.',
        availability: resultsSlideAvailability(
          data.results,
          results => ({ type: 'results-comparison', results }),
        ),
      });
      const fallbackGranularity: PresentationTimeSeries['granularity'] =
        data.current.state === 'available' || data.current.state === 'empty'
          ? data.current.data.timeSeries.granularity
          : 'month';
      const evolutionPages: PresentationTimeSeries[] =
        data.results.state === 'available' || data.results.state === 'empty'
        ? paginateTimeSeries(data.results.data.evolution)
        : [{ granularity: fallbackGranularity, points: [] }];
      evolutionPages.forEach((timeSeries, index) => append({
        id: `results-evolution-${index + 1}`,
        chapter: 'results',
        kind: 'results-evolution',
        title: withPageNumber('Evolução do resultado', index, evolutionPages.length),
        subtitle: 'Receita, despesa e resultado operacional na granularidade selecionada · regime de caixa do Dashboard.',
        availability: resultsSlideAvailability(
          data.results!,
          results => ({ type: 'results-evolution', results, timeSeries }),
        ),
      }));
      append({
        id: 'results-bridge',
        chapter: 'results',
        kind: 'results-bridge',
        title: 'Ponte da variação do resultado',
        subtitle: 'Resultado anterior + efeito de receita + efeito econômico de despesa = resultado atual.',
        availability: resultsSlideAvailability(
          data.results,
          results => ({ type: 'results-bridge', results }),
        ),
      });
      if (data.results.state === 'available' || data.results.state === 'empty') {
        const nonOperational = data.results.data.nonOperational;
        if (hasPresentationNonOperationalValues(nonOperational.totals, nonOperational.composition)) {
          const pages = paginateComposition(nonOperational.composition, 4);
          pages.forEach((composition, index) => append({
            id: `results-non-operational-${index + 1}`,
            chapter: 'results',
            kind: 'results-non-operational',
            title: withPageNumber('Informativo não operacional', index, pages.length),
            subtitle: 'Valores informativos e separados; não entram em receita, despesa, resultado ou margem operacional.',
            availability: resultsSlideAvailability(
              data.results!,
              results => ({ type: 'results-non-operational', results, composition }),
            ),
          }));
        }
      }
      return;
    }
    if (slide.chapter === 'expenses' && data.expenses) {
      append({
        id: 'chapter-expenses',
        chapter: 'expenses',
        kind: 'expenses-summary',
        title: 'Despesas',
        subtitle: 'Despesas realizadas — regime de caixa do DFC · mês selecionado × mês imediatamente anterior · total inclui não operacionais, discriminados abaixo.',
        availability: expensesSlideAvailability(
          data.expenses,
          expenses => ({ type: 'expenses-summary', expenses }),
        ),
      });
      const tree = data.expenses.state === 'available' || data.expenses.state === 'empty'
        ? paginateExpenseTree(data.expenses.data.tree)
        : [[]];
      // Receita operacional do mesmo capítulo Resultados (get_fin_presentation_socios),
      // usada como base da coluna de % da árvore de despesas.
      const netRevenue = data.results
        && (data.results.state === 'available' || data.results.state === 'empty')
        ? data.results.data.current.revenue
        : null;
      tree.forEach((nodes, index) => append({
        id: `expenses-tree-${index + 1}`,
        chapter: 'expenses',
        kind: 'expenses-tree',
        title: withPageNumber('Árvore de despesas', index, tree.length),
        subtitle: 'Valor acumulado e % da receita operacional líquida por categoria · classes não operacionais identificadas separadamente.',
        availability: expensesSlideAvailability(
          data.expenses!,
          expenses => ({ type: 'expenses-tree', expenses, nodes, netRevenue }),
        ),
      }));
      append({
        id: 'expenses-rolling',
        chapter: 'expenses',
        kind: 'expenses-rolling',
        title: 'Despesas nos últimos três meses',
        subtitle: 'Janela móvel terminando no mês selecionado · regime de caixa do DFC.',
        availability: expensesSlideAvailability(
          data.expenses,
          expenses => ({ type: 'expenses-rolling', expenses }),
        ),
      });
      append({
        id: 'expenses-history',
        chapter: 'expenses',
        kind: 'expenses-history',
        title: 'Histórico mensal de despesas',
        subtitle: 'Despesas realizadas — regime de caixa do DFC · até três anos selecionados.',
        availability: expensesSlideAvailability(
          data.expenses,
          expenses => ({ type: 'expenses-history', expenses }),
        ),
      });
      if (data.revenue) {
        const selectedMonth = data.revenue.state === 'available' || data.revenue.state === 'empty'
          ? data.revenue.data.selectedMonth
          : data.expenses.state === 'available' || data.expenses.state === 'empty'
            ? data.expenses.data.selectedMonth
            : null;
        const year = selectedMonth ? Number(selectedMonth.slice(0, 4)) : null;
        append({
          id: 'revenue-expenses-monthly',
          chapter: 'expenses',
          kind: 'revenue-expenses-monthly',
          title: year ? `Receita líquida × Despesa por mês — ${year}` : 'Receita líquida × Despesa por mês',
          subtitle: 'Receita operacional líquida do livro razão × despesas realizadas do DFC · regime de caixa · Jan a Dez do ano do mês selecionado.',
          availability: combinedSlideAvailability(data.revenue, data.expenses, (revenue, expenses) => ({
            type: 'revenue-expenses-monthly',
            year: Number(revenue.selectedMonth.slice(0, 4)),
            points: buildRevenueExpenseMonthPoints(revenue, expenses, Number(revenue.selectedMonth.slice(0, 4))),
            revenue,
            expenses,
          })),
        });
      }
      return;
    }
    if (slide.chapter !== 'revenue' || !data.revenue) {
      append(slide);
      return;
    }
    append({
      id: 'chapter-revenue',
      chapter: 'revenue',
      kind: 'revenue-summary',
      title: 'Faturamento',
      subtitle: 'Faturamento bruto — Fechamento de Caixa · mês selecionado × mês imediatamente anterior.',
      availability: revenueSlideAvailability(
        data.revenue,
        revenue => ({ type: 'revenue-summary', revenue }),
      ),
    });
    append({
      id: 'revenue-gross-net',
      chapter: 'revenue',
      kind: 'revenue-gross-net',
      title: 'Faturamento bruto × líquido',
      subtitle: 'Bruto — Fechamento de Caixa × Líquido — receita operacional do livro razão (regime de caixa) · mês selecionado.',
      availability: revenueSlideAvailability(
        data.revenue,
        revenue => ({ type: 'revenue-gross-net', revenue }),
      ),
    });
    {
      const byBrand = data.revenue.state === 'available' || data.revenue.state === 'empty'
        ? data.revenue.data.byBrand
        : [];
      const pages = chunk(byBrand, MAX_REVENUE_BRAND_ROWS_PER_SLIDE);
      pages.forEach((items, index) => append({
        id: `revenue-by-brand-${index + 1}`,
        chapter: 'revenue',
        kind: 'revenue-by-brand',
        title: withPageNumber('Faturamento por loja', index, pages.length),
        subtitle: 'Bruto do mês selecionado (Fechamento de Caixa) e líquido do livro razão por loja — marcas na mesma categoria somam em uma linha só.',
        availability: revenueSlideAvailability(
          data.revenue,
          revenue => ({ type: 'revenue-by-brand', revenue, items }),
        ),
      }));
    }
    append({
      id: 'revenue-weekdays',
      chapter: 'revenue',
      kind: 'revenue-weekdays',
      title: 'Faturamento por dia da semana',
      subtitle: 'Faturamento bruto — Fechamento de Caixa · total, ocorrências e média no mês selecionado.',
      availability: revenueSlideAvailability(
        data.revenue,
        revenue => ({ type: 'revenue-weekdays', revenue }),
      ),
    });
    append({
      id: 'revenue-history',
      chapter: 'revenue',
      kind: 'revenue-history',
      title: 'Histórico mensal de faturamento',
      subtitle: 'Faturamento bruto — Fechamento de Caixa · até três anos selecionados.',
      availability: revenueSlideAvailability(
        data.revenue,
        revenue => ({ type: 'revenue-history', revenue }),
      ),
    });
  });

  // A experiência nova usa somente o registry dos quatro capítulos. O
  // gerencial legado continua preservado na área de preparação/governança e
  // permanece abaixo apenas como fallback para payloads anteriores à Fase 4.
  if (data.results) return slides;

  append({
    id: 'cover',
    chapter: 'insights',
    kind: 'cover',
    title: 'Apresentação Sócios',
    subtitle: 'Visão executiva financeira',
    availability: {
      state: 'available',
      data: { type: 'cover', periodLabel: data.periodLabel },
      fetchedAt: data.generatedAt,
    },
  });

  const snapshot = data.current.state === 'available' || data.current.state === 'empty'
    ? data.current.data
    : null;

  if (!snapshot) {
    const unavailableSlides: Array<{
      id: string;
      kind: Exclude<PresentationSlide['kind'], 'cover' | 'highlights'>;
      title: string;
      subtitle?: string;
    }> = [
      { id: 'executive-summary', kind: 'executive-summary', title: 'Resumo executivo', subtitle: comparisonSubtitle(data) },
      { id: 'time-series', kind: 'time-series', title: 'Evolução do resultado' },
      { id: 'category-composition', kind: 'category-composition', title: 'Composição operacional' },
      { id: 'rankings', kind: 'rankings', title: 'Rankings do período' },
      { id: 'open-items', kind: 'open-items', title: 'Contas em aberto' },
      { id: 'non-operational', kind: 'non-operational', title: 'Informativo não operacional' },
    ];
    for (const slide of unavailableSlides) {
      append({
        ...slide,
        chapter: 'insights',
        availability: copyUnavailable(data.current)!,
      } as Omit<PresentationSlide, 'order'>);
    }
    return slides;
  }

  append({
    id: 'executive-summary',
    chapter: 'insights',
    kind: 'executive-summary',
    title: 'Resumo executivo',
    subtitle: comparisonSubtitle(data),
    availability: payloadAvailability(data.current, {
      type: 'executive-summary',
      metrics: snapshot.metrics,
      deltas: snapshot.deltas,
    }, data.current.state === 'available'),
  });

  if (
    data.plan?.state === 'available'
    && presentationPlanHasConfiguredTarget(data.plan.data)
  ) {
    append({
      id: 'plan-comparison',
      chapter: 'insights',
      kind: 'plan-comparison',
      title: 'Metas mostram onde o resultado desvia do plano',
      subtitle: 'Realizado, orçamento e projeção por competência; contas em aberto permanecem fora do resultado.',
      availability: {
        state: 'available',
        data: { type: 'plan-comparison', plan: data.plan.data },
        fetchedAt: data.plan.fetchedAt,
      },
    });
  }

  if (
    data.scenario?.state === 'available'
    && data.scenario.data.activeLevers.length > 0
  ) {
    append({
      id: 'scenario-impact',
      chapter: 'insights',
      kind: 'scenario-impact',
      title: 'Cenário e impacto',
      subtitle: `${data.scenario.data.scenarioName || 'Cenário local'} · SIMULAÇÃO · base ${data.scenario.data.baselineMode === 'actual' ? 'realizada' : data.scenario.data.baselineMode === 'budget' ? 'orçada' : 'projetada'}.`,
      availability: {
        state: 'available',
        data: { type: 'scenario-impact', scenario: data.scenario.data },
      },
    });
    if (data.scenario.data.sensitivity.state === 'available') {
      append({
        id: 'scenario-sensitivity',
        chapter: 'insights',
        kind: 'scenario-sensitivity',
        title: 'Sensibilidade do cenário',
        subtitle: `${data.scenario.data.sensitivity.leverLabel} · uma variável por vez · SIMULAÇÃO.`,
        availability: {
          state: 'available',
          data: { type: 'scenario-sensitivity', scenario: data.scenario.data },
        },
      });
    }
  }

  if (data.decision?.state === 'available') {
    const { detail, comparison } = data.decision.data;
    const currentRevision = detail.revisions.find(revision => revision.id === detail.decision.currentRevisionId);
    if (currentRevision?.approvedAt && detail.decision.status !== 'DRAFT') {
      const actionPages = paginateDecisionActions(detail.actions);
      actionPages.forEach((actions, index) => append({
        id: `decision-commitments-${index + 1}`,
        chapter: 'insights',
        kind: 'decision-commitments',
        title: withPageNumber('Decisão e compromissos', index, actionPages.length),
        subtitle: `${detail.decision.title} · ${detail.decision.referenceType === 'SCENARIO' ? 'SIMULAÇÃO' : 'base canônica'} · revisão ${currentRevision.revisionNumber}.`,
        availability: {
          state: 'available',
          data: {
            type: 'decision-commitments',
            decision: { ...detail, actions },
          },
          fetchedAt: detail.fetchedAt,
        },
      }));
      if (comparison.state === 'available') {
        append({
          id: 'decision-follow-up',
          chapter: 'insights',
          kind: 'decision-follow-up',
          title: 'Acompanhamento da decisão',
          subtitle: 'Snapshot aprovado × base canônica atual; sem inferência de causalidade.',
          availability: {
            state: 'available',
            data: { type: 'decision-follow-up', decision: detail, comparison },
            fetchedAt: detail.fetchedAt,
          },
        });
      }
    }
  }

  const timeSeriesPages = paginateTimeSeries(snapshot.timeSeries);
  timeSeriesPages.forEach((timeSeries, index) => append({
    id: `time-series-${index + 1}`,
    chapter: 'insights',
    kind: 'time-series',
    title: withPageNumber('Evolução do resultado', index, timeSeriesPages.length),
    subtitle: 'Receitas, despesas e resultado operacional no regime de caixa do Dashboard.',
    availability: payloadAvailability(
      data.current,
      { type: 'time-series', timeSeries },
      timeSeries.points.length > 0,
    ),
  }));

  const operationalPages = paginateComposition(snapshot.categoryComposition.operational);
  operationalPages.forEach((composition, index) => append({
    id: `category-composition-${index + 1}`,
    chapter: 'insights',
    kind: 'category-composition',
    title: withPageNumber('Composição operacional', index, operationalPages.length),
    subtitle: 'Valores diretos e acumulados são canônicos; pais e filhos não são somados novamente.',
    availability: payloadAvailability(
      data.current,
      { type: 'category-composition', composition },
      hasComposition(composition),
    ),
  }));

  const rankingPages = paginateRankings(snapshot.rankings);
  rankingPages.forEach((rankings, index) => append({
    id: `rankings-${index + 1}`,
    chapter: 'insights',
    kind: 'rankings',
    title: withPageNumber('Rankings do período', index, rankingPages.length),
    subtitle: 'Participação na composição operacional do período.',
    availability: payloadAvailability(
      data.current,
      { type: 'rankings', rankings },
      hasRankings(rankings),
    ),
  }));

  const payable = snapshot.metrics.openItems.accountsPayableOpen;
  const receivable = snapshot.metrics.openItems.accountsReceivableOpen;
  append({
    id: 'open-items',
    chapter: 'insights',
    kind: 'open-items',
    title: 'Contas em aberto',
    subtitle: 'Indicadores por vencimento; não participam do resultado gerencial.',
    availability: payloadAvailability(data.current, {
      type: 'open-items',
      indicators: snapshot.metrics.openItems,
    }, payable.amount !== 0 || payable.count !== 0 || receivable.amount !== 0 || receivable.count !== 0),
  });

  const nonOperationalPages = paginateComposition(snapshot.categoryComposition.nonOperational);
  nonOperationalPages.forEach((composition, index) => append({
    id: `non-operational-${index + 1}`,
    chapter: 'insights',
    kind: 'non-operational',
    title: withPageNumber('Informativo não operacional', index, nonOperationalPages.length),
    subtitle: 'Exibido separadamente e fora de receita, despesa, resultado e margem operacional.',
    availability: payloadAvailability(
      data.current,
      { type: 'non-operational', composition },
      hasComposition(composition),
    ),
  }));

  return slides;
}

export function isPresentationSlideExportable(slide: PresentationSlide): boolean {
  return slide.availability.state === 'available'
    || slide.availability.state === 'empty'
    || (slide.availability.state === 'unavailable' && slide.availability.reason === 'not-requested');
}
