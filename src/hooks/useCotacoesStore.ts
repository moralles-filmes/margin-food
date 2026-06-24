import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Cotacao, CotacaoCounts, CotacaoItem, CotacaoFornecedor } from '@/types/cotacao';
import { COTACAO_STATUS_ABERTOS } from '@/types/cotacao';

/** Payload de item enviado às RPCs create/update (snapshots montados no cliente). */
export interface CotacaoItemInput {
  produto_id?: string | null;
  produto_nome_snapshot: string;
  unidade_snapshot?: string | null;
  purchase_unit_snapshot?: string | null;
  conversion_factor_snapshot?: number;
  quantidade: number;
  observacao?: string | null;
}

/** Payload de fornecedor participante enviado às RPCs create/update. */
export interface CotacaoFornecedorInput {
  supplier_id?: string | null;
  supplier_nome_snapshot: string;
  whatsapp_snapshot?: string | null;
  pedido_minimo_snapshot?: number;
}

export interface CotacaoCreateInput {
  titulo: string;
  observacao?: string | null;
  data_validade?: string | null;
  origin_type?: 'MANUAL' | 'ALERTA' | 'REQUISICAO';
  origin_ref?: string | null;
  itens: CotacaoItemInput[];
  fornecedores: CotacaoFornecedorInput[];
}

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

  // ── Mutations (via RPCs atômicas) — lançam em erro; componente faz os toasts ──
  const createCotacao = useCallback(async (input: CotacaoCreateInput) => {
    const { data, error: err } = await db.rpc('create_cotacao_atomic', {
      p_titulo: input.titulo,
      p_observacao: input.observacao ?? null,
      p_data_validade: input.data_validade ?? null,
      p_origin_type: input.origin_type ?? 'MANUAL',
      p_origin_ref: input.origin_ref ?? null,
      p_itens: input.itens,
      p_fornecedores: input.fornecedores,
    });
    if (err) throw err;
    await fetchCotacoes();
    return data as { success: boolean; id: string; codigo: string };
  }, [fetchCotacoes]);

  const updateCotacao = useCallback(async (
    id: string,
    input: Omit<CotacaoCreateInput, 'origin_type' | 'origin_ref'>,
    expectedUpdatedAt?: string | null,
  ) => {
    const { data, error: err } = await db.rpc('update_cotacao_atomic', {
      p_id: id,
      p_titulo: input.titulo,
      p_observacao: input.observacao ?? null,
      p_data_validade: input.data_validade ?? null,
      p_itens: input.itens,
      p_fornecedores: input.fornecedores,
      p_expected_updated_at: expectedUpdatedAt ?? null,
    });
    if (err) throw err;
    await fetchCotacoes();
    return data as { success: boolean; id: string };
  }, [fetchCotacoes]);

  const deleteCotacao = useCallback(async (id: string, expectedUpdatedAt?: string | null) => {
    const { data, error: err } = await db.rpc('soft_delete_cotacao', {
      p_id: id,
      p_expected_updated_at: expectedUpdatedAt ?? null,
    });
    if (err) throw err;
    await fetchCotacoes();
    return data as { success: boolean; id: string };
  }, [fetchCotacoes]);

  /** Carrega itens + fornecedores de uma cotação (para o drawer de detalhe). */
  const fetchCotacaoDetail = useCallback(async (cotacaoId: string): Promise<{
    itens: CotacaoItem[];
    fornecedores: CotacaoFornecedor[];
  }> => {
    const [itensRes, fornRes] = await Promise.all([
      db.from('cotacao_itens').select('*').eq('cotacao_id', cotacaoId).order('created_at', { ascending: true }),
      db.from('cotacao_fornecedores').select('*').eq('cotacao_id', cotacaoId).order('created_at', { ascending: true }),
    ]);
    if (itensRes.error) throw itensRes.error;
    if (fornRes.error) throw fornRes.error;
    return {
      itens: (itensRes.data ?? []) as CotacaoItem[],
      fornecedores: (fornRes.data ?? []) as CotacaoFornecedor[],
    };
  }, []);

  return {
    cotacoes,
    loading,
    error,
    counts,
    openCount,
    refetch: fetchCotacoes,
    createCotacao,
    updateCotacao,
    deleteCotacao,
    fetchCotacaoDetail,
  };
}
