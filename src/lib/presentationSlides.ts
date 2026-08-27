import type {
  CategoryCompositionNode,
  CategoryCompositionSection,
  DataAvailability,
  PresentationRankings,
  PresentationSlide,
  PresentationSlidePayload,
  PresentationTimeSeries,
} from '@/domain/financeiro/presentation';
import { presentationPlanHasConfiguredTarget } from '@/domain/financeiro/presentation';
import type {
  PresentationAnalyticsSnapshot,
  PresentationSociosData,
} from '@/lib/financeiroPresentationAdapter';

const MAX_TIME_SERIES_POINTS_PER_SLIDE = 12;
const MAX_CATEGORY_ROWS_PER_COLUMN = 8;
const MAX_RANKING_ITEMS_PER_COLUMN = 6;
const MAX_DECISION_ACTIONS_PER_SLIDE = 6;
const MAX_DECISION_ACTION_CHARACTERS_PER_SLIDE = 900;

export const PRESENTATION_SLIDE_SEQUENCE = [
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

function chunk<T>(items: readonly T[], size: number): T[][] {
  if (items.length === 0) return [[]];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
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

function copyUnavailable<T>(availability: SnapshotAvailability): DataAvailability<T> | null {
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

function paginateComposition(section: CategoryCompositionSection): CategoryCompositionSection[] {
  const revenuePages = paginateForest(section.revenue, MAX_CATEGORY_ROWS_PER_COLUMN);
  const expensePages = paginateForest(section.expense, MAX_CATEGORY_ROWS_PER_COLUMN);
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
  const append = (slide: Omit<PresentationSlide, 'order'>) => {
    slides.push({ ...slide, order: slides.length } as PresentationSlide);
  };

  append({
    id: 'cover',
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
      append({ ...slide, availability: copyUnavailable(data.current)! } as Omit<PresentationSlide, 'order'>);
    }
    return slides;
  }

  append({
    id: 'executive-summary',
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
    kind: 'time-series',
    title: withPageNumber('Evolução do resultado', index, timeSeriesPages.length),
    subtitle: 'Receitas, despesas e resultado operacional por competência.',
    availability: payloadAvailability(
      data.current,
      { type: 'time-series', timeSeries },
      timeSeries.points.length > 0,
    ),
  }));

  const operationalPages = paginateComposition(snapshot.categoryComposition.operational);
  operationalPages.forEach((composition, index) => append({
    id: `category-composition-${index + 1}`,
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
  return slide.availability.state === 'available' || slide.availability.state === 'empty';
}
