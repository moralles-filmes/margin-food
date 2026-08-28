import type {
  CategoryCompositionSection,
  ManagerialResultMetrics,
  PresentationMetricDeltas,
  PresentationTimeSeries,
} from './contracts';

export const PRESENTATION_RESULTS_CONTRACT_VERSION = '1.0' as const;

export const PRESENTATION_RESULTS_SOURCE = {
  rpc: 'public.get_fin_presentation_socios',
  regime: 'caixa',
  relations: [
    'public.fin_lancamentos',
    'public.fin_lancamento_rateios',
  ],
  dateField: 'COALESCE(data_pagamento, conciliado_em::date, data_competencia)',
  label: 'Resultado operacional — regime de caixa do Dashboard',
} as const;

export type PresentationResultEffectFavorability =
  | 'favorable'
  | 'unfavorable'
  | 'neutral';

export type PresentationResultsComparisonUnavailableReason =
  | 'outside-available-period'
  | 'comparison-unavailable';

export interface PresentationResultBridgeStep {
  key: 'previous-result' | 'revenue-effect' | 'expense-effect' | 'current-result';
  label: string;
  value: number;
  favorability: PresentationResultEffectFavorability;
}

export type PresentationResultBridge =
  | {
      state: 'available';
      previousResult: number;
      revenueEffect: number;
      expenseEffect: number;
      totalChange: number;
      currentResult: number;
      steps: readonly PresentationResultBridgeStep[];
    }
  | {
      state: 'unavailable';
      reason: PresentationResultsComparisonUnavailableReason;
    };

export type PresentationResultsComparison =
  | {
      state: 'available';
      previous: ManagerialResultMetrics;
      deltas: PresentationMetricDeltas;
    }
  | {
      state: 'unavailable';
      reason: PresentationResultsComparisonUnavailableReason;
    };

export interface PresentationNonOperationalResult {
  totals: ManagerialResultMetrics;
  composition: CategoryCompositionSection;
}

export interface PresentationResultsData {
  contractVersion: typeof PRESENTATION_RESULTS_CONTRACT_VERSION;
  source: typeof PRESENTATION_RESULTS_SOURCE;
  generatedAt: string;
  periodLabel: string;
  current: ManagerialResultMetrics;
  comparison: PresentationResultsComparison;
  evolution: PresentationTimeSeries;
  bridge: PresentationResultBridge;
  nonOperational: PresentationNonOperationalResult;
}
