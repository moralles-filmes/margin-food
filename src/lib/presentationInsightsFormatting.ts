import type {
  PresentationInsight,
  PresentationInsightPercentage,
} from '@/domain/financeiro/presentation';
import { fmtBRL, formatIntegerBR, formatPercentBR } from '@/lib/formatters';

function percentageLabel(percentage: PresentationInsightPercentage): string {
  return percentage.state === 'available'
    ? formatPercentBR(percentage.value, 1)
    : 'Percentual indisponível · base zero';
}

export function presentationInsightEvidenceLabel(insight: PresentationInsight): string {
  const evidence = insight.evidence;
  switch (evidence.type) {
    case 'period-change':
      return `${fmtBRL(evidence.current)} vs ${fmtBRL(evidence.baseline)} · Δ ${fmtBRL(evidence.absoluteChange)} · ${percentageLabel(evidence.percentageChange)}`;
    case 'weekday-concentration':
      return `${fmtBRL(evidence.amount)} · ${formatPercentBR(evidence.sharePercent, 1)} do mês · ${formatIntegerBR(evidence.occurrences)} ocorrências · média ${fmtBRL(evidence.average)}`;
    case 'history-window':
    case 'rolling-window':
      return `${fmtBRL(evidence.firstValue)} → ${fmtBRL(evidence.lastValue)} · Δ ${fmtBRL(evidence.absoluteChange)} · ${percentageLabel(evidence.percentageChange)} · ${evidence.comparableMonths} meses`;
    case 'expense-category-concentration':
      return `${fmtBRL(evidence.amount)} de ${fmtBRL(evidence.periodTotal)} · ${formatPercentBR(evidence.sharePercent, 1)} das despesas`;
  }
}

export function presentationInsightRegimeLabel(insight: PresentationInsight): string {
  return insight.regime === 'caixa' ? 'Caixa do DFC' : 'Fechamento de Caixa';
}
