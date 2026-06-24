import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Cotacao, CotacaoCounts } from '@/types/cotacao';
import { COTACAO_STATUS_ABERTOS } from '@/types/cotacao';

// NOTA: as tabelas de cotação ainda não estão nos tipos gerados do Supabase
// (`src/integrations/supabase/types`). Após `supabase db push` + regeneração
// dos tipos, o cast `as any` abaixo pode ser removido. Padrão já usado no
// projeto para tabelas recém-criadas.
const db = supabase as any;

/**
 * Store do sub-módulo Cotação (RFQ).
 *
 * Fase 1 (base): lista cotações (RLS-enforced), calcula contadores de resumo e
 * mantém subscription Realtime própria (canal separado do de pedidos —
 * `usePurchaseOrdersStore`). CRUD/mutations chegam nas próximas fases via RPCs.
 */
export function useCotacoesStore() {
  const { user } = useAuth();
  const [cotacoes, setCotacoes] = useState<Cotacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCotacoes = useCallback(async () => {
    if (!user) {
      setCotacoes([]);
      setLoading(false);
      return;
    }
    try {
      const { data, error: err } = await db
        .from('cotacoes')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (err) throw err;
      setCotacoes((data ?? []) as Cotacao[]);
      setError(null);
    } catch (e: any) {
      // RLS bloqueia sem a permissão compras:cotacao:view → lista vazia, sem crash.
      console.error('[useCotacoesStore.fetchCotacoes]', e);
      setCotacoes([]);
      setError(e?.message ?? 'Erro ao carregar cotações');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCotacoes();
  }, [fetchCotacoes]);

  // Realtime — canal próprio, isolado do de pedidos. Refetch em qualquer mudança.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('cotacoes-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cotacoes' }, () => {
        fetchCotacoes();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cotacao_fornecedores' }, () => {
        fetchCotacoes();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchCotacoes]);

  const counts: CotacaoCounts = useMemo(() => {
    const now = new Date();
    const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return {
      emAberto: cotacoes.filter(c => COTACAO_STATUS_ABERTOS.includes(c.status)).length,
      aguardandoResposta: cotacoes.filter(c => c.status === 'EM_COTACAO').length,
      emAnalise: cotacoes.filter(c => c.status === 'RESPONDIDA' || c.status === 'EM_ANALISE').length,
      convertidas: cotacoes.filter(c => c.status === 'CONVERTIDA').length,
      economiaMes: cotacoes
        .filter(c => (c.created_at ?? '').slice(0, 7) === mesAtual)
        .reduce((sum, c) => sum + (Number(c.economia_estimada) || 0), 0),
    };
  }, [cotacoes]);

  const openCount = counts.emAberto;

  return {
    cotacoes,
    loading,
    error,
    counts,
    openCount,
    refetch: fetchCotacoes,
  };
}
