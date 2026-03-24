import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface SolicMercado {
  id: string;
  titulo: string;
  tipo: 'MERCADO' | 'SAZONAL';
  solicitante_user_id: string;
  responsavel_user_id: string | null;
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente';
  data_necessidade: string | null;
  status: string;
  observacoes: string;
  total_estimado: number;
  total_real: number;
  created_at: string;
  updated_at: string;
}

export interface SolicMercadoItem {
  id: string;
  solicitacao_id: string;
  produto_id: string | null;
  produto_texto: string;
  categoria: string;
  quantidade_solicitada: number;
  unidade_medida: string;
  detalhes: string;
  quantidade_comprada: number;
  preco_unitario: number | null;
  comprado: boolean;
  comprado_em: string | null;
  comprado_por: string | null;
  custo_nao_informado: boolean;
}

export interface Aprovacao {
  id: string;
  solicitacao_id: string;
  aprovado_por_user_id: string;
  aprovado_em: string;
  decisao: 'APROVADO' | 'REPROVADO';
  comentario: string;
}

export interface ProdutoDB {
  id: string;
  nome_produto: string;
  sku: string;
  categoria: string;
  unidade_medida: string;
  custo_padrao: number;
  estoque_minimo: number;
  estoque_ideal: number;
  ativo: boolean;
}

const MERC_PAGE_SIZE = 50;

export interface MercadoFilters {
  status?: string;
  prioridade?: string;
  solicitante?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
}

export function useMercadoStore() {
  const { user } = useAuth();
  const [solicitacoes, setSolicitacoes] = useState<SolicMercado[]>([]);
  const [loading, setLoading] = useState(true);
  const [produtos, setProdutos] = useState<ProdutoDB[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [mercFilters, setMercFilters] = useState<MercadoFilters>({});
  const cursorRef = { created_at: null as string | null, id: null as string | null };

  const fetchSolicitacoes = useCallback(async (append = false, currentFilters?: MercadoFilters) => {
    const f = currentFilters ?? mercFilters;
    const cursor_created_at = append && cursorRef.created_at ? cursorRef.created_at : undefined;
    const cursor_id = append && cursorRef.id ? cursorRef.id : undefined;

    const { data, error } = await supabase.rpc('list_solic_compra_mercado_cursor', {
      p_limit: MERC_PAGE_SIZE,
      p_cursor_created_at: cursor_created_at ?? null,
      p_cursor_id: cursor_id ?? null,
      p_status: f.status || null,
      p_prioridade: f.prioridade || null,
      p_solicitante: f.solicitante || null,
      p_search: f.search || null,
      p_date_from: f.date_from || null,
      p_date_to: f.date_to || null,
    });
    if (error) { console.error(error); setLoading(false); return; }
    const rows = (data || []) as unknown as (SolicMercado & { has_more: boolean })[];
    setHasMore(rows.length === MERC_PAGE_SIZE);

    if (rows.length > 0) {
      const last = rows[rows.length - 1];
      cursorRef.created_at = last.created_at;
      cursorRef.id = last.id;
    }

    if (append) setSolicitacoes(prev => [...prev, ...rows]);
    else setSolicitacoes(rows);
    setLoading(false);
  }, [mercFilters]);

  const loadMoreSolicitacoes = useCallback(() => {
    if (hasMore && !loading) fetchSolicitacoes(true);
  }, [hasMore, loading, fetchSolicitacoes]);

  const applyMercFilters = useCallback((newFilters: MercadoFilters) => {
    setMercFilters(newFilters);
    cursorRef.created_at = null;
    cursorRef.id = null;
    fetchSolicitacoes(false, newFilters);
  }, [fetchSolicitacoes]);

  const [prodPage, setProdPage] = useState(0);
  const [prodHasMore, setProdHasMore] = useState(true);

  const fetchProdutos = useCallback(async (pageNum = 0, append = false) => {
    const { data } = await supabase
      .from('produtos')
      .select('id, nome_produto, sku, categoria, unidade_medida, custo_padrao, estoque_minimo, estoque_ideal, ativo')
      .eq('ativo', true)
      .order('nome_produto')
      .range(pageNum * MERC_PAGE_SIZE, (pageNum + 1) * MERC_PAGE_SIZE - 1);
    const newData = (data || []) as ProdutoDB[];
    setProdHasMore(newData.length === MERC_PAGE_SIZE);
    if (append) setProdutos(prev => [...prev, ...newData]);
    else setProdutos(newData);
    setProdPage(pageNum);
  }, []);

  const loadMoreProdutos = useCallback(() => {
    if (prodHasMore) fetchProdutos(prodPage + 1, true);
  }, [prodHasMore, prodPage, fetchProdutos]);

  useEffect(() => {
    if (user) { fetchSolicitacoes(); fetchProdutos(); }
  }, [user, fetchSolicitacoes, fetchProdutos]);

  const fetchItems = useCallback(async (solicId: string): Promise<SolicMercadoItem[]> => {
    const { data } = await supabase
      .from('solic_compra_mercado_item')
      .select('id, solicitacao_id, produto_id, produto_texto, categoria, quantidade_solicitada, unidade_medida, detalhes, quantidade_comprada, preco_unitario, comprado, comprado_em, comprado_por, custo_nao_informado')
      .eq('solicitacao_id', solicId);
    return (data || []) as SolicMercadoItem[];
  }, []);

  const fetchAprovacoes = useCallback(async (solicId: string): Promise<Aprovacao[]> => {
    const { data } = await supabase
      .from('aprovacoes_solic_compra_mercado')
      .select('id, solicitacao_id, aprovado_por_user_id, aprovado_em, decisao, comentario')
      .eq('solicitacao_id', solicId);
    return (data || []) as Aprovacao[];
  }, []);

  const createSolicitacao = useCallback(async (
    dados: { titulo: string; tipo: 'MERCADO' | 'SAZONAL'; prioridade: string; data_necessidade?: string; observacoes?: string; responsavel_user_id?: string; total_estimado?: number },
    itens: { produto_id?: string; produto_texto?: string; categoria?: string; quantidade_solicitada: number; unidade_medida: string; detalhes?: string; preco_unitario?: number }[]
  ) => {
    if (!user) return null;

    const totalEstimado = itens.reduce((s, i) => s + (i.quantidade_solicitada * (i.preco_unitario || 0)), 0);

    const { data: solic, error } = await supabase
      .from('solic_compra_mercado')
      .insert({
        titulo: dados.titulo,
        tipo: dados.tipo,
        solicitante_user_id: user.id,
        responsavel_user_id: dados.responsavel_user_id || null,
        prioridade: dados.prioridade,
        data_necessidade: dados.data_necessidade || null,
        observacoes: dados.observacoes || '',
        total_estimado: dados.total_estimado || totalEstimado,
        status: 'ENVIADA',
      })
      .select()
      .single();

    if (error) { toast.error('Erro ao criar solicitação: ' + error.message); return null; }

    // Insert items
    const itemsToInsert = itens.map(i => ({
      solicitacao_id: solic.id,
      produto_id: i.produto_id || null,
      produto_texto: i.produto_texto || '',
      categoria: i.categoria || '',
      quantidade_solicitada: i.quantidade_solicitada,
      unidade_medida: i.unidade_medida,
      detalhes: i.detalhes || '',
      preco_unitario: i.preco_unitario || null,
    }));

    await supabase.from('solic_compra_mercado_item').insert(itemsToInsert);

    // Audit
    await supabase.from('audit_log').insert({
      tabela: 'solic_compra_mercado', registro_id: solic.id,
      acao: 'CRIACAO', user_id: user.id,
    });

    // Create notification for mentioned responsible
    if (dados.responsavel_user_id && dados.responsavel_user_id !== user.id) {
      const { data: profile } = await supabase.from('profiles').select('nome').eq('id', user.id).maybeSingle();
      const senderName = profile?.nome || 'Alguém';
      await supabase.from('notifications').insert({
        recipient_user_id: dados.responsavel_user_id,
        type: 'MENTION_MARKET_SEASONAL',
        module: 'purchases',
        title: 'Você foi mencionado como responsável',
        message: `@${senderName} te mencionou como responsável na solicitação "${dados.titulo}" (${dados.tipo})`,
        entity_type: 'solic_compra_mercado',
        entity_id: solic.id,
        link_path: '/compras',
        created_by: user.id,
      });
    }

    await fetchSolicitacoes();
    return solic;
  }, [user, fetchSolicitacoes]);

  const updateStatus = useCallback(async (solicId: string, status: string) => {
    if (!user) return;
    const { error } = await supabase
      .from('solic_compra_mercado')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', solicId);
    if (error) { toast.error(error.message); return; }

    await supabase.from('audit_log').insert({
      tabela: 'solic_compra_mercado', registro_id: solicId,
      acao: 'STATUS_CHANGE', campo: 'status', valor_novo: status, user_id: user.id,
    });

    await fetchSolicitacoes();
  }, [user, fetchSolicitacoes]);

  const markItemComprado = useCallback(async (
    item: SolicMercadoItem,
    quantidadeComprada: number,
    precoUnitario: number | null,
    produtoIdFinal?: string
  ) => {
    if (!user) return;

    const custoNaoInformado = precoUnitario === null || precoUnitario === 0;
    const prodId = produtoIdFinal || item.produto_id;

    // Update item (NO auto stock entry - goes to recebimento flow)
    await supabase.from('solic_compra_mercado_item').update({
      comprado: true,
      quantidade_comprada: quantidadeComprada,
      preco_unitario: precoUnitario,
      comprado_em: new Date().toISOString(),
      comprado_por: user.id,
      custo_nao_informado: custoNaoInformado,
      produto_id: prodId,
    }).eq('id', item.id);

    // Audit
    await supabase.from('audit_log').insert({
      tabela: 'solic_compra_mercado_item', registro_id: item.id,
      acao: 'ITEM_COMPRADO', user_id: user.id,
    });

    // Recalculate total_real for the solicitation
    const items = await fetchItems(item.solicitacao_id);
    const totalReal = items.reduce((s, i) => s + (i.quantidade_comprada * (i.preco_unitario || 0)), 0);
    
    // Check if needs approval (>= 2500)
    const solic = solicitacoes.find(s => s.id === item.solicitacao_id);
    let newStatus = solic?.status;
    if (totalReal >= 2500 && solic?.status === 'EM_COMPRA') {
      newStatus = 'AGUARDANDO_APROVACAO';
    }

    await supabase.from('solic_compra_mercado').update({
      total_real: totalReal,
      ...(newStatus !== solic?.status ? { status: newStatus } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', item.solicitacao_id);

    await fetchSolicitacoes();
  }, [user, fetchItems, solicitacoes, fetchSolicitacoes]);

  const submitAprovacao = useCallback(async (solicId: string, decisao: 'APROVADO' | 'REPROVADO', comentario: string) => {
    if (!user) return;

    await supabase.from('aprovacoes_solic_compra_mercado').insert({
      solicitacao_id: solicId,
      aprovado_por_user_id: user.id,
      decisao,
      comentario,
    });

    await supabase.from('audit_log').insert({
      tabela: 'aprovacoes_solic_compra_mercado', registro_id: solicId,
      acao: decisao, user_id: user.id,
    });

    // Check approval count
    if (decisao === 'REPROVADO') {
      await updateStatus(solicId, 'REPROVADA');
    } else {
      const aprovacoes = await fetchAprovacoes(solicId);
      const aprovados = aprovacoes.filter(a => a.decisao === 'APROVADO');
      // Count distinct users
      const uniqueApprovers = new Set(aprovados.map(a => a.aprovado_por_user_id));
      if (uniqueApprovers.size >= 2) {
        await updateStatus(solicId, 'APROVADA');
      }
    }

    await fetchSolicitacoes();
  }, [user, fetchAprovacoes, updateStatus, fetchSolicitacoes]);

  const concluirSolicitacao = useCallback(async (solicId: string) => {
    const items = await fetchItems(solicId);
    const allComprado = items.every(i => i.comprado);
    if (!allComprado) {
      await updateStatus(solicId, 'PARCIAL');
      return;
    }
    // All items purchased -> move to AGUARDANDO_RECEBIMENTO
    await updateStatus(solicId, 'AGUARDANDO_RECEBIMENTO');
  }, [fetchItems, updateStatus]);

  const createProduto = useCallback(async (nome: string, categoria: string, unidade: string) => {
    const { data, error } = await supabase.from('produtos').insert({
      nome_produto: nome, categoria, unidade_medida: unidade,
    }).select().single();
    if (error) { toast.error(error.message); return null; }
    await fetchProdutos();
    return data;
  }, [fetchProdutos]);

  // Get compras assistentes for assignment
  const fetchComprasAssistentes = useCallback(async () => {
    const { data } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'compras_assistente');
    if (!data) return [];
    const userIds = data.map(r => r.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, nome, email')
      .in('id', userIds);
    return profiles || [];
  }, []);

  const pendingCount = solicitacoes.filter(s =>
    ['ENVIADA', 'EM_COMPRA', 'AGUARDANDO_APROVACAO'].includes(s.status)
  ).length;

  return {
    solicitacoes, loading, produtos, pendingCount, hasMore, prodHasMore,
    mercFilters, applyMercFilters,
    fetchSolicitacoes, fetchItems, fetchAprovacoes, fetchComprasAssistentes,
    createSolicitacao, updateStatus, markItemComprado,
    submitAprovacao, concluirSolicitacao, createProduto, loadMoreSolicitacoes, loadMoreProdutos,
  };
}
