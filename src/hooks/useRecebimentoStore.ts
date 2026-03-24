import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { emitDataEvent } from '@/lib/dataEvents';

export interface Recebimento {
  id: string;
  solicitacao_id: string;
  status: string;
  recebido_por: string | null;
  recebido_em: string | null;
  observacoes: string;
  enviar_ao_estoque: boolean;
  estoque_atualizado_em: string | null;
  estoque_atualizado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecebimentoItem {
  id: string;
  recebimento_id: string;
  item_id: string;
  produto_id: string | null;
  qtd_solicitada: number;
  qtd_comprada: number;
  qtd_recebida: number | null;
  status_item: string;
  divergencia_tipo: string | null;
  divergencia_nota: string;
  recebido: boolean;
  created_at: string;
}

export interface ConfirmacaoRecebimento {
  id: string;
  recebimento_id: string;
  solicitacao_id: string;
  mensagem: string;
  criado_em: string;
  criado_por: string;
  visto_por: string[];
  responsavel_compra_id: string | null;
}

export function useRecebimentoStore() {
  const { user } = useAuth();
  const [recebimentos, setRecebimentos] = useState<Recebimento[]>([]);
  const [confirmacoes, setConfirmacoes] = useState<ConfirmacaoRecebimento[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecebimentos = useCallback(async () => {
    const { data, error } = await supabase
      .from('recebimentos')
      .select('id, solicitacao_id, status, recebido_por, recebido_em, observacoes, enviar_ao_estoque, estoque_atualizado_em, estoque_atualizado_por, created_at, updated_at')
      .order('created_at', { ascending: false });
    if (error) { console.error(error); return; }
    setRecebimentos((data || []) as Recebimento[]);
    setLoading(false);
  }, []);

  const fetchConfirmacoes = useCallback(async () => {
    const { data } = await supabase
      .from('confirmacoes_recebimento')
      .select('id, recebimento_id, solicitacao_id, mensagem, criado_em, criado_por, visto_por, responsavel_compra_id')
      .order('criado_em', { ascending: false });
    setConfirmacoes((data || []) as ConfirmacaoRecebimento[]);
  }, []);

  useEffect(() => {
    if (user) { fetchRecebimentos(); fetchConfirmacoes(); }
  }, [user, fetchRecebimentos, fetchConfirmacoes]);

  const fetchRecebimentoItens = useCallback(async (recebimentoId: string): Promise<RecebimentoItem[]> => {
    const { data } = await supabase
      .from('recebimento_itens')
      .select('id, recebimento_id, item_id, produto_id, qtd_solicitada, qtd_comprada, qtd_recebida, status_item, divergencia_tipo, divergencia_nota, recebido, created_at')
      .eq('recebimento_id', recebimentoId);
    return (data || []) as RecebimentoItem[];
  }, []);

  // Create recebimento when solicitation moves to AGUARDANDO_RECEBIMENTO
  const createRecebimento = useCallback(async (
    solicitacaoId: string,
    items: { item_id: string; produto_id: string | null; qtd_solicitada: number; qtd_comprada: number }[]
  ) => {
    if (!user) return null;

    const { data: rec, error } = await supabase
      .from('recebimentos')
      .insert({ solicitacao_id: solicitacaoId })
      .select()
      .single();

    if (error) { toast.error('Erro ao criar recebimento: ' + error.message); return null; }

    const itensInsert = items.map(i => ({
      recebimento_id: rec.id,
      item_id: i.item_id,
      produto_id: i.produto_id,
      qtd_solicitada: i.qtd_solicitada,
      qtd_comprada: i.qtd_comprada,
    }));

    await supabase.from('recebimento_itens').insert(itensInsert);

    await supabase.from('audit_log').insert({
      tabela: 'recebimentos', registro_id: rec.id,
      acao: 'CRIACAO', user_id: user.id,
    });

    await fetchRecebimentos();
    return rec;
  }, [user, fetchRecebimentos]);

  // Confirm individual item received
  const confirmarItem = useCallback(async (
    itemId: string,
    qtdRecebida: number,
    divergenciaTipo: string | null,
    divergenciaNota: string
  ) => {
    const statusItem = divergenciaTipo ? 'DIVERGENCIA' : 'RECEBIDO';
    await supabase.from('recebimento_itens').update({
      qtd_recebida: qtdRecebida,
      status_item: statusItem,
      divergencia_tipo: divergenciaTipo,
      divergencia_nota: divergenciaNota,
      recebido: true,
    }).eq('id', itemId);
  }, []);

  // Confirm full recebimento via RPC with permission guard
  const confirmarRecebimento = useCallback(async (
    recebimentoId: string,
    enviarAoEstoque: boolean,
    observacoes: string
  ) => {
    if (!user) return;

    const { data, error } = await supabase.rpc('rpc_recebimentos_close', {
      p_recebimento_id: recebimentoId,
      p_enviar_ao_estoque: enviarAoEstoque,
      p_observacoes: observacoes,
    });

    if (error) {
      const msg = error.message || 'Erro ao confirmar recebimento';
      toast.error(msg);
      return;
    }

    // If enviar ao estoque, use atomic RPC instead of client-side inserts
    if (enviarAoEstoque) {
      await lancarEstoqueAtomic(recebimentoId, observacoes);
    }

    await fetchRecebimentos();
    await fetchConfirmacoes();
  }, [user, fetchRecebimentos, fetchConfirmacoes]);

  // Atomic stock entry via server-side RPC (replaces old client-side lancarEstoque)
  const lancarEstoqueAtomic = useCallback(async (recebimentoId: string, observacoes: string = '') => {
    if (!user) return;

    // Fetch items to pass to the RPC
    const itens = await fetchRecebimentoItens(recebimentoId);
    const itemsPayload = itens.map(item => ({
      recebimento_item_id: item.id,
    }));

    const { data, error } = await supabase.rpc('receive_market_order_atomic', {
      p_recebimento_id: recebimentoId,
      p_items: itemsPayload as any,
      p_observacoes: observacoes,
    });

    if (error) {
      toast.error('Erro ao lançar estoque: ' + error.message);
      return;
    }

    const result = data as any;
    if (result?.already_processed) {
      toast.info('Estoque já foi atualizado para este recebimento.');
    } else {
      toast.success(`Estoque atualizado! ${result?.items_inserted || 0} itens inseridos.`);
    }

    await fetchRecebimentos();
    emitDataEvent('compras:recebimento');
    emitDataEvent('estoque:movimentacoes');
  }, [user, fetchRecebimentoItens, fetchRecebimentos]);

  // Legacy lancarEstoque kept as alias pointing to atomic version
  const lancarEstoque = useCallback(async (recebimentoId: string) => {
    await lancarEstoqueAtomic(recebimentoId);
  }, [lancarEstoqueAtomic]);

  // Mark confirmation as approved via RPC with permission guard
  const marcarVisto = useCallback(async (confirmacaoId: string) => {
    if (!user) return;

    const { error } = await supabase.rpc('rpc_confirmacoes_approve', {
      p_confirmacao_id: confirmacaoId,
    });

    if (error) {
      toast.error(error.message || 'Erro ao aprovar confirmação');
      return;
    }

    await fetchConfirmacoes();
  }, [user, fetchConfirmacoes]);

  const pendingRecebimentos = recebimentos.filter(r => r.status === 'AGUARDANDO_RECEBIMENTO').length;

  return {
    recebimentos, confirmacoes, loading, pendingRecebimentos,
    fetchRecebimentos, fetchRecebimentoItens, fetchConfirmacoes,
    createRecebimento, confirmarItem, confirmarRecebimento,
    lancarEstoque, marcarVisto,
  };
}
