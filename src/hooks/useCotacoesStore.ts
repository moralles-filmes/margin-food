import { useSupabase, useCompanyScope } from '@/contexts/CompanyScopeContext';
import { companyRealtimeListener } from '@/lib/companyRealtime';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { Cotacao, CotacaoCounts, CotacaoItem, CotacaoFornecedor, CotacaoResposta, CotacaoWhatsappLog, CotacaoWhatsappTipo } from '@/types/cotacao';
import { COTACAO_STATUS_ABERTOS } from '@/types/cotacao';

/** Linha da matriz de respostas enviada à RPC save_cotacao_respostas_atomic. */
export interface CotacaoRespostaInput {
  cotacao_fornecedor_id: string;
  cotacao_item_id: string;
  preco_unitario?: number | string | null;
  quantidade_disponivel?: number | string | null;
  disponivel?: boolean;
  observacao?: string | null;
}

/** Meta por fornecedor (prazo/frete/condição) salva junto das respostas. */
export interface CotacaoFornecedorMetaInput {
  cotacao_fornecedor_id: string;
  prazo_entrega_dias?: number | string | null;
  frete?: number | string | null;
  condicao_pagamento?: string | null;
}

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


/**
 * Store do sub-módulo Cotação (RFQ).
 *
 * Fase 1 (base): lista cotações (RLS-enforced), calcula contadores de resumo e
 * mantém subscription Realtime própria (canal separado do de pedidos —
 * `usePurchaseOrdersStore`). CRUD/mutations chegam nas próximas fases via RPCs.
 */
export function useCotacoesStore() {
  const supabase = useSupabase();
  const companyId = useCompanyScope()?.companyId;
  const db = supabase as any;
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
        .select('id, company_id, codigo, titulo, status, data_envio, data_validade, observacao, origin_type, origin_ref, total_estimado, economia_estimada, created_by, created_at, updated_at, deleted_at, deleted_by')
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
  }, [db, user]);

  useEffect(() => {
    fetchCotacoes();
  }, [fetchCotacoes]);

  // Realtime — canal próprio, isolado do de pedidos. Refetch em qualquer mudança.
  useEffect(() => {
    if (!user || !companyId) return;
    const listener = companyRealtimeListener(companyId, () => { void fetchCotacoes(); });
    const channel = supabase
      .channel('cotacoes-rt:' + companyId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cotacoes', filter: `company_id=eq.${companyId}` }, listener.receive)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cotacao_fornecedores', filter: `company_id=eq.${companyId}` }, listener.receive)
      .subscribe();
    return () => {
      listener.dispose();
      supabase.removeChannel(channel);
    };
  }, [user, fetchCotacoes, supabase, companyId]);

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
  }, [db, fetchCotacoes]);

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
  }, [db, fetchCotacoes]);

  const deleteCotacao = useCallback(async (id: string, expectedUpdatedAt?: string | null) => {
    const { data, error: err } = await db.rpc('soft_delete_cotacao', {
      p_id: id,
      p_expected_updated_at: expectedUpdatedAt ?? null,
    });
    if (err) throw err;
    await fetchCotacoes();
    return data as { success: boolean; id: string };
  }, [db, fetchCotacoes]);

  /** Carrega itens + fornecedores + respostas de uma cotação (para o drawer de detalhe). */
  const fetchCotacaoDetail = useCallback(async (cotacaoId: string): Promise<{
    itens: CotacaoItem[];
    fornecedores: CotacaoFornecedor[];
    respostas: CotacaoResposta[];
  }> => {
    const [itensRes, fornRes] = await Promise.all([
      db.from('cotacao_itens').select('id, cotacao_id, company_id, produto_id, produto_nome_snapshot, unidade_snapshot, purchase_unit_snapshot, quantidade, observacao, created_at, updated_at').eq('cotacao_id', cotacaoId).order('produto_nome_snapshot', { ascending: true }).order('created_at', { ascending: true }),
      db.from('cotacao_fornecedores').select('id, cotacao_id, company_id, supplier_id, supplier_nome_snapshot, whatsapp_snapshot, pedido_minimo_snapshot, status, prazo_entrega_dias, condicao_pagamento, frete, observacao, mensagem_enviada_em, respondido_em, created_at, updated_at').eq('cotacao_id', cotacaoId).order('supplier_nome_snapshot', { ascending: true }).order('created_at', { ascending: true }),
    ]);
    if (itensRes.error) throw itensRes.error;
    if (fornRes.error) throw fornRes.error;
    const fornIds = (fornRes.data ?? []).map((f: any) => f.id);
    // cotacao_respostas não tem coluna cotacao_id → filtra pelos fornecedores da cotação
    let respostas: CotacaoResposta[] = [];
    if (fornIds.length > 0) {
      const respRes = await db.from('cotacao_respostas').select('id, cotacao_fornecedor_id, cotacao_item_id, company_id, preco_unitario, quantidade_disponivel, disponivel, observacao, selecionado, created_at, updated_at').in('cotacao_fornecedor_id', fornIds);
      if (respRes.error) throw respRes.error;
      respostas = (respRes.data ?? []) as CotacaoResposta[];
    }
    return {
      itens: (itensRes.data ?? []) as CotacaoItem[],
      fornecedores: (fornRes.data ?? []) as CotacaoFornecedor[],
      respostas,
    };
  }, [db]);

  /** Persiste a sugestão escolhida (marca respostas selecionadas, status → EM_ANALISE). */
  const saveSugestao = useCallback(async (
    cotacaoId: string,
    input: {
      tipo: string;
      total_estimado: number;
      economia_estimada: number;
      dados_json: unknown;
      selecoes: { cotacao_fornecedor_id: string; cotacao_item_id: string }[];
    },
  ) => {
    const { data, error: err } = await db.rpc('save_cotacao_sugestao', {
      p_cotacao_id: cotacaoId,
      p_tipo: input.tipo,
      p_total_estimado: input.total_estimado,
      p_economia_estimada: input.economia_estimada,
      p_dados_json: input.dados_json,
      p_selecoes: input.selecoes,
    });
    if (err) throw err;
    await fetchCotacoes();
    return data as { success: boolean; id: string };
  }, [db, fetchCotacoes]);

  /**
   * Converte a sugestão salva em pedido(s) de compra (1 por fornecedor vencedor).
   * RPC atômica: só INSERT em purchase_orders/_items, encerra a cotação (CONVERTIDA).
   */
  const convertToPurchaseOrders = useCallback(async (
    cotacaoId: string,
    expectedUpdatedAt?: string | null,
  ) => {
    const { data, error: err } = await db.rpc('create_purchase_orders_from_cotacao_atomic', {
      p_cotacao_id: cotacaoId,
      p_expected_updated_at: expectedUpdatedAt ?? null,
    });
    if (err) throw err;
    await fetchCotacoes();
    return data as { success: boolean; orders: number; items: number; order_ids: string[] };
  }, [db, fetchCotacoes]);

  /**
   * Envia uma mensagem de WhatsApp via Edge Function `send-whatsapp-zapi`
   * (credenciais Z-API ficam no servidor). Retorna {success, message, ...}.
   */
  const sendWhatsapp = useCallback(async (payload: {
    cotacao_id: string;
    cotacao_fornecedor_id?: string | null;
    tipo: CotacaoWhatsappTipo;
    phone: string;
    message: string;
  }) => {
    const { data, error: err } = await supabase.functions.invoke('send-whatsapp-zapi', { body: payload });
    if (err) throw err;
    await fetchCotacoes();
    return data as { success: boolean; status?: string; log_id?: string | null; message?: string };
  }, [fetchCotacoes]);

  /**
   * Assistente de IA da Cotação (Edge Function `cotacao-ia`, chave por empresa).
   * task='gerar_mensagem' (com tipo) ou 'analise_precos'. Read-only — só retorna texto.
   */
  const runIA = useCallback(async (payload: {
    cotacao_id: string;
    task: 'gerar_mensagem' | 'analise_precos';
    fornecedor_id?: string | null;
    tipo?: CotacaoWhatsappTipo;
    allow_competitor_context?: boolean;
  }) => {
    const { data, error: err } = await supabase.functions.invoke('cotacao-ia', { body: payload });
    if (err) throw err;
    return data as { success: boolean; text?: string; message?: string; provider?: string; model?: string };
  }, []);

  /** Logs de WhatsApp de uma cotação (mais recentes primeiro). */
  const fetchWhatsappLogs = useCallback(async (cotacaoId: string): Promise<CotacaoWhatsappLog[]> => {
    const { data, error: err } = await db
      .from('cotacao_whatsapp_logs')
      .select('id, cotacao_id, cotacao_fornecedor_id, company_id, tipo, phone, message, zapi_response, status, sent_at, created_by, created_at')
      .eq('cotacao_id', cotacaoId)
      .order('created_at', { ascending: false });
    if (err) throw err;
    return (data ?? []) as CotacaoWhatsappLog[];
  }, [db]);

  /** Salva a matriz de preços + meta dos fornecedores. */
  const saveRespostas = useCallback(async (
    cotacaoId: string,
    respostas: CotacaoRespostaInput[],
    fornecedoresMeta: CotacaoFornecedorMetaInput[] = [],
  ) => {
    const { data, error: err } = await db.rpc('save_cotacao_respostas_atomic', {
      p_cotacao_id: cotacaoId,
      p_respostas: respostas,
      p_fornecedores_meta: fornecedoresMeta,
    });
    if (err) throw err;
    await fetchCotacoes();
    return data as { success: boolean; upserts: number };
  }, [db, fetchCotacoes]);

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
    saveRespostas,
    saveSugestao,
    convertToPurchaseOrders,
    sendWhatsapp,
    fetchWhatsappLogs,
    runIA,
  };
}
