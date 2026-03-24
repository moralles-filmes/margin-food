import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PurchaseRequisition {
  id: string;
  codigo: string;
  data: string;
  tipo: string;
  status: string;
  observacao: string;
  total_estimado: number;
  responsavel: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  purchase_requisition_items: PurchaseRequisitionItem[];
}

export interface PurchaseRequisitionItem {
  id: string;
  requisition_id: string;
  produto_id: string | null;
  produto_nome: string;
  quantidade_sugerida: number;
  quantidade_escolhida: number;
  unidade: string;
  preco_referencia: number;
  subtotal: number;
  prioridade: string;
  motivo: string;
  is_ignored: boolean;
  ignored_by: string | null;
  ignored_at: string | null;
  ignored_reason: string | null;
  produtos?: { nome_produto: string; unidade_medida: string; custo_ultima_compra: number; categoria: string } | null;
}

export interface AuditEntry {
  id: string;
  acao: string;
  campo: string | null;
  valor_anterior: string | null;
  valor_novo: string | null;
  user_nome: string;
  created_at: string;
}

type LoadState = 'IDLE' | 'LOADING' | 'READY' | 'ERROR';

export function usePurchaseRequisitions() {
  const [requisitions, setRequisitions] = useState<PurchaseRequisition[]>([]);
  const [state, setState] = useState<LoadState>('IDLE');
  const [error, setError] = useState<string | null>(null);

  const invoke = useCallback(async (action: string, payload: any = {}) => {
    const { data, error } = await supabase.functions.invoke('purchase-requisitions', {
      body: { action, ...payload },
    });
    if (error) throw new Error(error.message || 'Erro na requisição');
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const loadList = useCallback(async () => {
    setState('LOADING');
    setError(null);
    try {
      const result = await invoke('listar');
      setRequisitions(result.data || []);
      setState('READY');
    } catch (err: any) {
      setError(err.message);
      setState('ERROR');
      toast.error('Erro ao carregar requisições: ' + err.message);
    }
  }, [invoke]);

  const loadDetail = useCallback(async (id: string) => {
    const result = await invoke('detalhe', { id });
    return { requisition: result.data, audit: result.audit as AuditEntry[] };
  }, [invoke]);

  const create = useCallback(async (payload: { tipo: string; observacao: string; itens: any[] }) => {
    const result = await invoke('criar', payload);
    toast.success(`Requisição ${result.codigo} criada!`);
    await loadList();
    return result;
  }, [invoke, loadList]);

  const edit = useCallback(async (id: string, payload: any) => {
    await invoke('editar', { id, ...payload });
    toast.success('Requisição atualizada!');
    await loadList();
  }, [invoke, loadList]);

  const ignoreItem = useCallback(async (item_id: string, ignored: boolean, reason?: string) => {
    await invoke('ignorar_item', { item_id, ignored, reason });
    toast.success(ignored ? 'Item ignorado' : 'Item restaurado');
  }, [invoke]);

  const convert = useCallback(async (id: string) => {
    await invoke('converter', { id });
    toast.success('Requisição convertida em pedido!');
    await loadList();
  }, [invoke, loadList]);

  return {
    requisitions, state, error,
    loadList, loadDetail, create, edit, ignoreItem, convert,
  };
}
