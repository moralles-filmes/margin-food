import {
  PRESENTATION_REVENUE_SOURCE,
  type PresentationRevenueData,
} from '@/domain/financeiro/presentation';
import {
  attachPresentationRevenue,
  type PresentationSociosData,
} from '@/lib/financeiroPresentationAdapter';
import { createPresentationSociosData } from '@/test/fixtures/presentationSocios';

export function createPresentationRevenueData(): PresentationRevenueData {
  const requestedYears = [2024, 2025, 2026];
  return {
    contractVersion: '1.2',
    source: PRESENTATION_REVENUE_SOURCE,
    availability: 'available',
    selectedMonth: '2026-03',
    previousMonth: '2026-02',
    requestedYears,
    generatedAt: '2026-08-27T15:30:00-03:00',
    coverage: { state: 'available', minDate: '2024-01-01', maxDate: '2026-03-31' },
    current: {
      state: 'available',
      month: '2026-03',
      startDate: '2026-03-01',
      endExclusive: '2026-04-01',
      total: 3_000,
      closingCount: 3,
      coverage: { state: 'covered', firstDate: '2026-03-02', lastDate: '2026-03-06' },
    },
    previous: {
      state: 'available',
      month: '2026-02',
      startDate: '2026-02-01',
      endExclusive: '2026-03-01',
      total: 1_500,
      closingCount: 2,
      coverage: { state: 'covered', firstDate: '2026-02-02', lastDate: '2026-02-03' },
    },
    delta: {
      absolute: { state: 'available', value: 1_500 },
      percentage: { state: 'available', value: 100 },
    },
    weekdays: [
      { isoWeekday: 1, label: 'Segunda-feira', state: 'available', total: 0, occurrences: 1, average: { state: 'available', value: 0 } },
      { isoWeekday: 2, label: 'Terça-feira', state: 'available', total: 1_000, occurrences: 1, average: { state: 'available', value: 1_000 } },
      { isoWeekday: 3, label: 'Quarta-feira', state: 'empty', total: 0, occurrences: 0, average: { state: 'unavailable', reason: 'no-occurrences' } },
      { isoWeekday: 4, label: 'Quinta-feira', state: 'empty', total: 0, occurrences: 0, average: { state: 'unavailable', reason: 'no-occurrences' } },
      { isoWeekday: 5, label: 'Sexta-feira', state: 'available', total: 2_000, occurrences: 1, average: { state: 'available', value: 2_000 } },
      { isoWeekday: 6, label: 'Sábado', state: 'empty', total: 0, occurrences: 0, average: { state: 'unavailable', reason: 'no-occurrences' } },
      { isoWeekday: 7, label: 'Domingo', state: 'empty', total: 0, occurrences: 0, average: { state: 'unavailable', reason: 'no-occurrences' } },
    ],
    byBrand: [
      {
        marcaId: null,
        nome: 'Salão + Jantar',
        total: 1_800,
        closingCount: 2,
        net: 1_600,
        categoriaId: '33333333-3333-4333-8333-333333333333',
        marcaIds: ['11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444444'],
      },
      {
        marcaId: '22222222-2222-4222-8222-222222222222',
        nome: 'Loja Norte',
        total: 1_200,
        closingCount: 1,
        net: null,
        categoriaId: null,
        marcaIds: ['22222222-2222-4222-8222-222222222222'],
      },
      {
        marcaId: null,
        nome: 'Sem marca vinculada',
        total: 0,
        closingCount: 0,
        net: 1_100,
        categoriaId: null,
        marcaIds: [],
      },
    ],
    netRevenue: {
      current: { month: '2026-03', total: 2_700 },
      previous: { month: '2026-02', total: 1_350 },
    },
    grossToNet: {
      current: { gross: 3_000, net: 2_700, difference: 300, differencePercent: { state: 'available', value: 10 } },
      previous: { gross: 1_500, net: 1_350, difference: 150, differencePercent: { state: 'available', value: 10 } },
    },
    history: requestedYears.flatMap(year => Array.from({ length: 12 }, (_, monthIndex) => {
      const month = monthIndex + 1;
      const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
      if (yearMonth === '2026-03') {
        return { year, month, yearMonth, state: 'available' as const, total: 3_000, closingCount: 3 };
      }
      if (yearMonth === '2026-02') {
        return { year, month, yearMonth, state: 'available' as const, total: 1_500, closingCount: 2 };
      }
      if (yearMonth === '2025-03') {
        return { year, month, yearMonth, state: 'available' as const, total: 800, closingCount: 1 };
      }
      return {
        year,
        month,
        yearMonth,
        state: year === 2026 && month > 3 ? 'unavailable' as const : 'empty' as const,
        total: 0,
        closingCount: 0,
      };
    })),
    // Receita operacional líquida do razão por mês — estado independente de
    // `history` (entryCount, não closingCount). O mês selecionado precisa
    // bater com `netRevenue.current.total` (2_700), invariante checada pelo
    // adapter.
    netHistory: requestedYears.flatMap(year => Array.from({ length: 12 }, (_, monthIndex) => {
      const month = monthIndex + 1;
      const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
      if (yearMonth === '2026-03') {
        return { year, month, yearMonth, state: 'available' as const, total: 2_700, entryCount: 4 };
      }
      if (yearMonth === '2026-02') {
        return { year, month, yearMonth, state: 'available' as const, total: 1_350, entryCount: 3 };
      }
      if (yearMonth === '2025-03') {
        return { year, month, yearMonth, state: 'available' as const, total: 700, entryCount: 2 };
      }
      return {
        year,
        month,
        yearMonth,
        state: year === 2026 && month > 3 ? 'unavailable' as const : 'empty' as const,
        total: 0,
        entryCount: 0,
      };
    })),
  };
}

export function createPresentationWithRevenue(
  base: PresentationSociosData = createPresentationSociosData(),
): PresentationSociosData {
  const revenue = createPresentationRevenueData();
  return attachPresentationRevenue(base, {
    state: 'available',
    data: revenue,
    fetchedAt: revenue.generatedAt,
  });
}
