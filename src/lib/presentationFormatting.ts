import {
  addCalendarDays,
  formatMonthPeriodPtBR,
  type CategoryCompositionNode,
  type DataAvailability,
  type ManagerialResultMetrics,
  type MetricDelta,
  type PresentationActionStatus,
  type PresentationDecisionStatus,
  type PresentationMetricDeltas,
  type TimeSeriesGranularity,
} from '@/domain/financeiro/presentation';
import { fmtBRL, formatDateBR, formatDateTimeBR, formatPercentBR, parseLocalDate } from '@/lib/formatters';
import type { PresentationSociosData } from '@/lib/financeiroPresentationAdapter';

export const PRESENTATION_SOURCE_LABEL = 'Fonte: get_fin_presentation_socios';
export const PRESENTATION_REGIME_LABEL = 'Regime de competência';

export function presentationDecisionStatusLabel(status: PresentationDecisionStatus): string {
  return {
    DRAFT: 'Rascunho',
    APPROVED: 'Aprovada',
    IN_PROGRESS: 'Em andamento',
    COMPLETED: 'Encerrada',
    CANCELLED: 'Cancelada',
  }[status];
}

export function presentationActionStatusLabel(status: PresentationActionStatus): string {
  return {
    PENDING: 'Pendente',
    IN_PROGRESS: 'Em andamento',
    COMPLETED: 'Concluída',
    CANCELLED: 'Cancelada',
  }[status];
}

export interface CategoryDisplayRow {
  node: CategoryCompositionNode;
  depth: number;
}

export interface ExecutiveMetricDisplay {
  key: keyof PresentationMetricDeltas;
  label: string;
  value: number;
  formattedValue: string;
  comparison: string;
  tone: 'positive' | 'negative' | 'result' | 'neutral';
}

export function availabilityMessage(availability: DataAvailability<unknown>): string {
  switch (availability.state) {
    case 'idle':
      return 'Dados ainda não solicitados.';
    case 'loading':
      return 'Carregando dados consolidados...';
    case 'empty':
      return 'Nenhum dado disponível para este slide no período selecionado.';
    case 'unavailable':
      return availability.reason === 'outside-available-period'
        ? 'Conteúdo fora do histórico disponível.'
        : availability.reason === 'permission-denied'
          ? 'Conteúdo indisponível por permissão.'
          : availability.reason === 'not-requested'
            ? 'Conteúdo não solicitado nesta fase.'
          : 'Conteúdo indisponível.';
    case 'error':
      return availability.message;
    default:
      return '';
  }
}

export function formatMetricDelta(delta: MetricDelta | undefined): string {
  if (!delta) return 'Comparação indisponível';
  if (delta.state === 'unavailable') return 'Base zero - indisponível';
  if (!Number.isFinite(delta.value)) return 'Comparação indisponível';
  return delta.unit === 'percentage-points'
    ? `${delta.value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`
    : formatPercentBR(delta.value, 1);
}

export function buildExecutiveMetricDisplays(
  metrics: ManagerialResultMetrics,
  deltas?: PresentationMetricDeltas,
): ExecutiveMetricDisplay[] {
  return [
    {
      key: 'revenue',
      label: 'Receita operacional',
      value: metrics.revenue,
      formattedValue: fmtBRL(metrics.revenue),
      comparison: formatMetricDelta(deltas?.revenue),
      tone: 'positive',
    },
    {
      key: 'expense',
      label: 'Despesa operacional',
      value: metrics.expense,
      formattedValue: fmtBRL(metrics.expense),
      comparison: formatMetricDelta(deltas?.expense),
      tone: 'negative',
    },
    {
      key: 'result',
      label: 'Resultado operacional',
      value: metrics.result,
      formattedValue: fmtBRL(metrics.result),
      comparison: formatMetricDelta(deltas?.result),
      tone: 'result',
    },
    {
      key: 'margin',
      label: 'Margem operacional',
      value: metrics.marginPercent,
      formattedValue: formatPercentBR(metrics.marginPercent, 1),
      comparison: formatMetricDelta(deltas?.margin),
      tone: 'neutral',
    },
  ];
}

export function flattenPresentationCategories(
  nodes: readonly CategoryCompositionNode[],
  depth = 0,
): CategoryDisplayRow[] {
  const rows: CategoryDisplayRow[] = [];
  for (const node of nodes) {
    rows.push({ node, depth });
    rows.push(...flattenPresentationCategories(node.children, depth + 1));
  }
  return rows;
}

export function formatPresentationSeriesLabel(key: string, granularity: TimeSeriesGranularity): string {
  if (granularity === 'year') return key;
  if (granularity === 'month') return formatMonthPeriodPtBR(key).replace(' de ', '/');
  return formatDateBR(parseLocalDate(key));
}

export function revenueExpensesYearMissingMessage(year: number): string {
  return `Sem histórico de ${year}. Inclua ${year} no seletor de anos do histórico para ver este gráfico.`;
}

export function presentationGeneratedLabel(generatedAt: string): string {
  const generatedDate = new Date(generatedAt);
  return Number.isNaN(generatedDate.getTime())
    ? 'Horário de geração indisponível'
    : `Gerado em ${formatDateTimeBR(generatedDate)}`;
}

function safeFilenameSegment(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function presentationFilename(
  data: PresentationSociosData,
  extension: 'pdf' | 'pptx',
): string {
  const endInclusive = addCalendarDays(data.period.endExclusive, -1);
  const generatedDate = new Date(data.generatedAt);
  const generated = Number.isNaN(generatedDate.getTime())
    ? 'data-indisponivel'
    : formatDateBR(generatedDate).split('/').reverse().join('-');
  const period = safeFilenameSegment(`${data.period.start}-a-${endInclusive}`);
  return `apresentacao-socios-${period}-gerado-${generated}.${extension}`;
}
