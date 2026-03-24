import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MetaCompraMensal } from '@/types/salmon';
import { toast } from 'sonner';
import { emitDataEvent } from '@/lib/dataEvents';

export interface PlanningMeta {
  id: string;
  year: number;
  month: number;
  categoria: string;
  targetValue: number;
  alertaAmareloPercent: number;
  alertaVermelhoPercent: number;
  ativo: boolean;
  updatedAt: string;
}

export interface SpendSummary {
  period: { year: number; month: number; start_date: string; end_date: string };
  metas: { id: string; categoria: string; target_value: number; alerta_amarelo_percent: number; alerta_vermelho_percent: number }[];
  realizado_por_categoria: { categoria: string; spent_value: number }[];
  realizado_total: number;
  weekly_breakdown: Record<string, number>;
  comparativo: { categoria: string; target_value: number; spent_value: number; delta_value: number; percent_of_target: number }[];
  computed_at: string;
}

function dbToMeta(row: any): PlanningMeta {
  return {
    id: row.id,
    year: row.year,
    month: row.month,
    categoria: row.categoria,
    targetValue: Number(row.target_value),
    alertaAmareloPercent: Number(row.alerta_amarelo_percent),
    alertaVermelhoPercent: Number(row.alerta_vermelho_percent),
    ativo: row.ativo,
    updatedAt: row.updated_at,
  };
}

/** Convert DB metas to legacy MetaCompraMensal format used by existing planning components */
function toLegacy(m: PlanningMeta): MetaCompraMensal {
  return {
    id: m.id,
    mesAno: `${m.year}-${String(m.month).padStart(2, '0')}`,
    categoria: m.categoria,
    metaValorCompra: m.targetValue,
    alertaAmareloPercent: m.alertaAmareloPercent,
    alertaVermelhoPercent: m.alertaVermelhoPercent,
    createdAt: '',
  };
}

export function usePlanningStore() {
  const [metas, setMetas] = useState<PlanningMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [spendSummary, setSpendSummary] = useState<SpendSummary | null>(null);
  const [spendLoading, setSpendLoading] = useState(false);
  const [spendError, setSpendError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // ── Fetch metas from DB ──
  const fetchMetas = useCallback(async (year?: number, month?: number) => {
    setLoading(true);
    try {
      let query = supabase
        .from('planning_metas_compra')
        .select('id, year, month, categoria, target_value, alerta_amarelo_percent, alerta_vermelho_percent, ativo, updated_at')
        .eq('ativo', true)
        .order('year', { ascending: false })
        .order('month', { ascending: false })
        .limit(200);

      if (year) query = query.eq('year', year);
      if (month) query = query.eq('month', month);

      const { data, error } = await query;
      if (error) throw error;
      if (mounted.current) setMetas((data || []).map(dbToMeta));
    } catch (err: any) {
      console.error('Error fetching planning metas:', err);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  // ── Upsert meta (guarded RPC) ──
  const saveMeta = useCallback(async (payload: {
    mesAno: string;
    categoria: string;
    metaValorCompra: number;
    alertaAmareloPercent: number;
    alertaVermelhoPercent: number;
  }): Promise<boolean> => {
    if (saving) return false;
    setSaving(true);
    try {
      const [yearStr, monthStr] = payload.mesAno.split('-');
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);

      const { data, error } = await supabase.rpc('_planning_upsert_meta_guarded', {
        p_year: year,
        p_month: month,
        p_categoria: payload.categoria,
        p_target_value: payload.metaValorCompra,
        p_alerta_amarelo: payload.alertaAmareloPercent,
        p_alerta_vermelho: payload.alertaVermelhoPercent,
      });

      if (error) throw error;

      await fetchMetas(year, month);
      toast.success('Meta salva com sucesso');
      emitDataEvent('planning:metas');
      return true;
    } catch (err: any) {
      console.error('Error saving planning meta:', err);
      if (err.message?.includes('permissão') || err.message?.includes('permission')) {
        toast.error('Sem permissão para gerenciar metas');
      } else {
        toast.error('Erro ao salvar meta: ' + (err.message || 'desconhecido'));
      }
      return false;
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, [saving, fetchMetas]);

  // ── Delete meta (guarded RPC) ──
  const deleteMeta = useCallback(async (id: string): Promise<boolean> => {
    if (saving) return false;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('_planning_delete_meta_guarded', { p_id: id });
      if (error) throw error;
      if (mounted.current) setMetas(prev => prev.filter(m => m.id !== id));
      toast.success('Meta removida');
      emitDataEvent('planning:metas');
      return true;
    } catch (err: any) {
      console.error('Error deleting planning meta:', err);
      toast.error('Erro ao remover meta');
      return false;
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, [saving]);

  // ── Fetch aggregated spend summary (guarded RPC) ──
  const fetchSpendSummary = useCallback(async (year: number, month: number, source?: string | null, categoria?: string | null) => {
    setSpendLoading(true);
    setSpendError(null);
    try {
      const { data, error } = await supabase.rpc('_planning_spend_summary_guarded', {
        p_year: year,
        p_month: month,
        p_source: source || null,
        p_categoria: categoria || null,
      });
      if (error) throw error;
      if (mounted.current && data) {
        setSpendSummary(data as unknown as SpendSummary);
      }
    } catch (err: any) {
      console.error('Error fetching spend summary:', err);
      if (mounted.current) setSpendError(err.message || 'Erro ao carregar resumo');
    } finally {
      if (mounted.current) setSpendLoading(false);
    }
  }, []);

  /** Legacy-compatible metas array for existing components */
  const metasCompra: MetaCompraMensal[] = metas.map(toLegacy);

  return {
    metas,
    metasCompra,
    loading,
    saving,
    spendSummary,
    spendLoading,
    spendError,
    fetchMetas,
    saveMeta,
    deleteMeta,
    fetchSpendSummary,
  };
}
