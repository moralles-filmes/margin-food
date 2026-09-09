import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect } from 'react';
import { formatDateISO } from '@/lib/datetime';
import { PeriodRange } from '@/components/PeriodFilter';

export interface SalmonDashboardData {
  // Stock
  saldoBrutoKg: number;
  estoqueLimpoKg: number;
  lowGross: boolean;
  lowClean: boolean;
  minGrossKg: number;
  minCleanKg: number;
  // Entries
  totalEntriesKg: number;
  totalValue: number;
  avgCostPerKg: number;
  entriesCount: number;
  // Manipulations
  totalManipulatedKg: number;
  totalCleanKg: number;
  consumidoKg: number;
  avgYieldPercent: number;
  avgLossPercent: number;
  manipulationCount: number;
  // Loss
  perdaKg: number;
  perdaValor: number;
  // Consumption & forecast
  avgDailyConsumptionKg: number;
  daysRemaining: number;
  // Revenue & CMV
  revenue: number;
  cmvSalmonPercent: number | null;
  custoMedioKgLimpo: number;
  // FIFO & stale
  fifoRecomendados: { entry_id: string; lot: string; sif: string; supplier: string; entry_date: string; balance_kg: number; cost_per_kg: number }[];
  lotesParados: { entry_id: string; lot: string; supplier: string; balance_kg: number; last_movement_date: string; days_since_movement: number }[];
  // Meta
  loading: boolean;
  error: string | null;
}

const DEFAULT: SalmonDashboardData = {
  saldoBrutoKg: 0, estoqueLimpoKg: 0, lowGross: false, lowClean: false,
  minGrossKg: 50, minCleanKg: 30,
  totalEntriesKg: 0, totalValue: 0, avgCostPerKg: 0, entriesCount: 0,
  totalManipulatedKg: 0, totalCleanKg: 0, consumidoKg: 0,
  avgYieldPercent: 0, avgLossPercent: 0, manipulationCount: 0,
  perdaKg: 0, perdaValor: 0,
  avgDailyConsumptionKg: 0, daysRemaining: -1,
  revenue: 0, cmvSalmonPercent: null, custoMedioKgLimpo: 0,
  fifoRecomendados: [], lotesParados: [],
  loading: true, error: null,
};

export function useSalmonDashboard(period: PeriodRange): SalmonDashboardData {
  const supabase = useSupabase();
  const [data, setData] = useState<SalmonDashboardData>(DEFAULT);

  useEffect(() => {
    let cancelled = false;
    setData(prev => ({ ...prev, loading: true, error: null }));

    const pStart = formatDateISO(period.start);
    const pEnd = formatDateISO(period.end);

    supabase.rpc('_salmon_dashboard_guarded' as any, { p_start: pStart, p_end: pEnd })
      .then(({ data: result, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('get_salmon_dashboard_summary error:', error);
          setData(prev => ({ ...prev, loading: false, error: error.message }));
          return;
        }
        const r = result as any;

        setData({
          saldoBrutoKg: Number(r.saldo_bruto_kg ?? 0),
          estoqueLimpoKg: Number(r.estoque_limpo_kg ?? 0),
          lowGross: Boolean(r.low_gross ?? false),
          lowClean: Boolean(r.low_clean ?? false),
          minGrossKg: Number(r.min_gross_kg ?? 50),
          minCleanKg: Number(r.min_clean_kg ?? 30),
          totalEntriesKg: Number(r.total_entries_kg ?? 0),
          totalValue: Number(r.total_value ?? 0),
          avgCostPerKg: Number(r.avg_cost_per_kg ?? 0),
          entriesCount: Number(r.entries_count ?? 0),
          totalManipulatedKg: Number(r.total_manipulated_kg ?? 0),
          totalCleanKg: Number(r.total_clean_kg ?? 0),
          consumidoKg: Number(r.consumido_kg ?? 0),
          avgYieldPercent: Number(r.avg_yield_percent ?? 0),
          avgLossPercent: Number(r.avg_loss_percent ?? 0),
          manipulationCount: Number(r.manipulation_count ?? 0),
          perdaKg: Number(r.perda_kg ?? 0),
          perdaValor: Number(r.perda_valor ?? 0),
          avgDailyConsumptionKg: Number(r.avg_daily_consumption_kg ?? 0),
          daysRemaining: Number(r.days_remaining ?? -1),
          revenue: Number(r.revenue ?? 0),
          cmvSalmonPercent: r.cmv_salmon_percent ?? null,
          custoMedioKgLimpo: Number(r.custo_medio_kg_limpo ?? 0),
          fifoRecomendados: r.fifo_recomendados ?? [],
          lotesParados: r.lotes_parados ?? [],
          loading: false,
          error: null,
        });
      });

    return () => { cancelled = true; };
  }, [period.end, period.start, supabase]);

  return data;
}
