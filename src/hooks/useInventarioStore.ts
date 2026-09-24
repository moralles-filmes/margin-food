import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useCallback } from 'react';
import { useEmitDataEvent } from '@/lib/dataEvents';
import { useScopedToast } from '@/hooks/useScopedToast';

export interface Inventario {
  id: string;
  tipo: 'completo' | 'parcial' | 'ciclico';
  metodo_contagem: 'lista' | 'codigo';
  status: 'RASCUNHO' | 'EM_CONTAGEM' | 'EM_REVISAO' | 'SOB_ANALISE' | 'FINALIZADO';
  data: string;
  hora: string;
  categorias: string[];
  responsavel_user_id: string;
  observacao: string;
  finalizado_em: string | null;
  finalizado_por: string | null;
  aprovado_por: string | null;
  flag_risco: string;
  score_risco: number;
  sob_analise_motivo: string;
  justificativa_analise: string;
  aprovacao_admin_em: string | null;
  turno_id: string | null;
  acuracia_percent: number;
  drift_total_valor: number;
  created_at: string;
  turnos?: { nome: string } | null;
}

export interface InventarioItem {
  id: string;
  inventario_id: string;
  produto_id: string | null;
  tipo_item: 'geral' | 'salmao';
  lote_id: string;
  saldo_teorico: number;
  contagem_fisica: number | null;
  diferenca_qtd: number;
  diferenca_percent: number;
  custo_snapshot: number;
  impacto_financeiro: number;
  classificacao: 'NORMAL' | 'ALERTA' | 'CRITICO';
  contado_por: string | null;
  contagem_inicio: string | null;
  contagem_fim: string | null;
  justificativa: string;
  produtos?: {
    nome_produto: string;
    categoria: string;
    local_estoque: string | null;
    unidade_medida: string | null;
    unidade_compra: string | null;
    fator_conversao_padrao: number | null;
  } | null;
}

export interface Turno {
  id: string;
  nome: string;
  hora_inicio: string;
  hora_fim: string;
}

export interface Conferente {
  id: string;
  user_id: string;
  nome: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  inventario_id: string;
  item_id: string | null;
  user_id: string;
  user_role: string;
  acao: string;
  antes: any;
  depois: any;
  ip_address: string;
  created_at: string;
}

export type BarcodeLookupResult =
  | {
      status: 'found';
      item_id: string;
      produto_id: string;
      nome_produto: string;
      sku: string;
      barcode: string;
      unidade_medida: string;
      unidade_compra: string;
      fator_conversao_padrao: number;
      saldo_teorico: number;
      contagem_fisica: number | null;
      classificacao: 'NORMAL' | 'ALERTA' | 'CRITICO';
    }
  | { status: 'not_found'; barcode: string }
  | { status: 'not_in_inventory'; barcode: string }
  | { status: 'invalid' };

export interface UpdateContagemResult {
  diferenca_qtd: number;
  diferenca_percent: number;
  impacto_financeiro: number;
  classificacao: 'NORMAL' | 'ALERTA' | 'CRITICO';
}

export interface DashboardData {
  historico: Inventario[];
  finalizados: Inventario[];
  sobAnalise: Inventario[];
  topCriticos: InventarioItem[];
  categoriasDrift: Record<string, number>;
  turnoDrift: Record<string, number>;
  userDrift: Record<string, { total: number; count: number; nome: string }>;
  avgScore: number;
}

export function useInventarioStore() {
  const emitDataEvent = useEmitDataEvent();
  const toast = useScopedToast();
  const supabase = useSupabase();
  const [inventarios, setInventarios] = useState<Inventario[]>([]);
  const [currentInventario, setCurrentInventario] = useState<Inventario | null>(null);
  const [currentItens, setCurrentItens] = useState<InventarioItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [conferentes, setConferentes] = useState<Conferente[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<{ created_at: string; id: string } | null>(null);

  const invoke = useCallback(async (action: string, payload: any = {}) => {
    const { data, error } = await supabase.functions.invoke('inventario', {
      body: { action, ...payload },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const loadTurnos = useCallback(async () => {
    try {
      const data = await invoke('list_turnos');
      setTurnos(data.turnos || []);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao carregar turnos');
    }
  }, [invoke, toast]);

  const loadList = useCallback(async (filters?: { status_filter?: string; turno_filter?: string; flag_filter?: boolean }, append = false) => {
    setLoading(true);
    try {
      const cursor = append && nextCursor ? { cursor_created_at: nextCursor.created_at, cursor_id: nextCursor.id } : {};
      const data = await invoke('list', { ...(filters || {}), ...cursor });
      if (append) {
        setInventarios(prev => [...prev, ...(data.inventarios || [])]);
      } else {
        setInventarios(data.inventarios || []);
      }
      setHasMore(data.hasMore || false);
      setNextCursor(data.nextCursor || null);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao carregar inventários');
    } finally {
      setLoading(false);
    }
  }, [invoke, nextCursor, toast]);

  const loadInventario = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const data = await invoke('get', { id });
      setCurrentInventario(data.inventario);
      setCurrentItens(data.itens || []);
      setAuditLogs(data.auditLogs || []);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao carregar inventário');
    } finally {
      setLoading(false);
    }
  }, [invoke, toast]);

  const [savingCreate, setSavingCreate] = useState(false);

  const createInventario = useCallback(async (payload: {
    tipo: string;
    data: string;
    hora: string;
    turno_id: string;
    categorias?: string[];
    observacao?: string;
    metodo_contagem?: 'lista' | 'codigo';
  }) => {
    if (savingCreate) return null;
    setSavingCreate(true);
    try {
      const idempotency_key = crypto.randomUUID();
      const data = await invoke('create', { ...payload, idempotency_key });
      if (data.idempotent) {
        toast.info('Inventário já existente (operação idempotente)');
      } else {
        toast.success(`Inventário criado com ${data.itensCount} itens`);
      }
      await loadList();
      emitDataEvent('inventario:lista');
      return data.inventario;
    } catch (e: any) {
      toast.error(e.message || 'Erro ao criar inventário');
      return null;
    } finally {
      setSavingCreate(false);
    }
  }, [invoke, loadList, savingCreate, emitDataEvent, toast]);

  const updateStatus = useCallback(async (id: string, status: string) => {
    try {
      await invoke('update_status', { id, status });
      toast.success(`Status atualizado para ${status}`);
      if (currentInventario?.id === id) {
        setCurrentInventario(prev => prev ? { ...prev, status: status as any } : null);
      }
      await loadList();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao atualizar status');
    }
  }, [invoke, currentInventario, loadList, toast]);

  const updateContagem = useCallback(async (itemId: string, contagem: number) => {
    try {
      const data = await invoke('update_contagem', { item_id: itemId, contagem_fisica: contagem });
      setCurrentItens(prev => prev.map(i =>
        i.id === itemId
          ? { ...i, contagem_fisica: contagem, diferenca_qtd: data.diferenca_qtd, diferenca_percent: data.diferenca_percent, impacto_financeiro: data.impacto_financeiro, classificacao: data.classificacao }
          : i
      ));
      return data;
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar contagem');
      return null;
    }
  }, [invoke, toast]);

  const findItemByBarcode = useCallback(async (inventarioId: string, barcode: string): Promise<BarcodeLookupResult> => {
    return (await invoke('find_by_barcode', { id: inventarioId, barcode })) as BarcodeLookupResult;
  }, [invoke]);

  const finalizar = useCallback(async (id: string, justificativa?: string) => {
    setLoading(true);
    try {
      const data = await invoke('finalizar', { id, justificativa });
      if (data.blocked) {
        toast.warning(`🔒 Inventário bloqueado: ${data.motivo}`);
        await loadInventario(id);
        return { blocked: true, ...data };
      }
      toast.success(`Inventário finalizado! Acurácia: ${data.acuracia.toFixed(1)}% | Score risco: ${data.scoreRisco}`);
      await loadInventario(id);
      await loadList();
      emitDataEvent('inventario:finalizado');
      emitDataEvent('estoque:movimentacoes');
      return data;
    } catch (e: any) {
      toast.error(e.message || 'Erro ao finalizar inventário');
      return null;
    } finally {
      setLoading(false);
    }
  }, [invoke, loadInventario, loadList, emitDataEvent, toast]);

  const aprovarAnalise = useCallback(async (id: string, justificativa: string) => {
    try {
      await invoke('aprovar_analise', { id, justificativa });
      toast.success('Inventário aprovado pelo admin');
      await loadInventario(id);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao aprovar');
    }
  }, [invoke, loadInventario, toast]);

  const correcaoPosterior = useCallback(async (inventarioId: string, produtoId: string, quantidade: number, motivo: string) => {
    try {
      await invoke('correcao_posterior', { inventario_id: inventarioId, produto_id: produtoId, quantidade, motivo });
      toast.success('Correção posterior registrada');
    } catch (e: any) {
      toast.error(e.message || 'Erro na correção');
    }
  }, [invoke, toast]);

  const reopenInventario = useCallback(async (id: string, justificativa: string) => {
    setLoading(true);
    try {
      await invoke('reopen', { id, justificativa });
      toast.success('Inventário reaberto com sucesso. Ajustes de estoque revertidos.');
      await loadInventario(id);
      await loadList();
      emitDataEvent('inventario:lista');
      emitDataEvent('estoque:movimentacoes');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao reabrir inventário');
    } finally {
      setLoading(false);
    }
  }, [invoke, loadInventario, loadList, emitDataEvent, toast]);

  const deleteInventario = useCallback(async (id: string, justificativa: string) => {
    setLoading(true);
    try {
      await invoke('delete_inventory', { id, justificativa });
      toast.success('Inventário excluído com sucesso.');
      setCurrentInventario(null);
      setCurrentItens([]);
      await loadList();
      emitDataEvent('inventario:lista');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao excluir inventário');
    } finally {
      setLoading(false);
    }
  }, [invoke, loadList, emitDataEvent, toast]);

  const loadDashboard = useCallback(async () => {
    try {
      const data = await invoke('dashboard');
      setDashboard(data);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao carregar dashboard');
    }
  }, [invoke, toast]);

  const loadConferentes = useCallback(async () => {
    try {
      const data = await invoke('list_conferentes');
      setConferentes(data.conferentes || []);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao carregar conferentes');
    }
  }, [invoke, toast]);

  const addConferente = useCallback(async (userId: string) => {
    try {
      await invoke('add_conferente', { user_id: userId });
      toast.success('Conferente adicionado');
      await loadConferentes();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao adicionar conferente');
    }
  }, [invoke, loadConferentes, toast]);

  const removeConferente = useCallback(async (conferenteId: string) => {
    try {
      await invoke('remove_conferente', { conferente_id: conferenteId });
      toast.success('Conferente removido');
      await loadConferentes();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao remover conferente');
    }
  }, [invoke, loadConferentes, toast]);

  const assignConferente = useCallback(async (inventarioId: string, conferenteUserId: string) => {
    try {
      await invoke('assign_conferente', { inventario_id: inventarioId, conferente_user_id: conferenteUserId });
      toast.success('Conferente atribuído! Status alterado para EM_REVISAO e notificação enviada.');
      await loadInventario(inventarioId);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao atribuir conferente');
    }
  }, [invoke, loadInventario, toast]);

  return {
    inventarios, currentInventario, currentItens, auditLogs, turnos, conferentes, dashboard, loading,
    hasMore, nextCursor, savingCreate,
    loadTurnos, loadList, loadInventario, createInventario, updateStatus, updateContagem, findItemByBarcode,
    finalizar, aprovarAnalise, correcaoPosterior, reopenInventario, deleteInventario, loadDashboard,
    loadConferentes, addConferente, removeConferente, assignConferente,
  };
}
