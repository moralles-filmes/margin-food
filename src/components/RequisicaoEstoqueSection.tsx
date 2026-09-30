import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { X, Check, Inbox, AlertTriangle, ShoppingCart, RefreshCw, Ban, ClipboardList, ChevronDown, ChevronUp, Edit3 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useCan } from '@/permissions';
import type { ProdutoExtended } from '@/types/estoque';
import { resolveListedRequisitionItemDisplay } from '@/domain/estoque/requisition';
import {
  MOTIVOS_RECUSA,
  canRejectItem,
  canAttendItem,
  canActOnRequisicao,
  hasPendingItems,
  itemStatusLabel,
  itemStatusStyle,
} from '@/domain/estoque/requisitionStatus';
import { useScopedToast } from '@/hooks/useScopedToast';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import ListaFixaSetorAdmin from './estoque/ListaFixaSetorAdmin';
import RequisicaoListaFixa from './estoque/RequisicaoListaFixa';
import RequisicaoToolbar from './estoque/RequisicaoToolbar';
import RequisicaoCardHeader from './estoque/RequisicaoCardHeader';
import RequisicaoProductPicker, { type ManualRequisitionItem } from './estoque/RequisicaoProductPicker';
import { sortByName } from '@/lib/sortByName';
import { useNavigationRecord } from '@/hooks/useNavigationRequest';
import { mensagemErroEdge } from '@/lib/edgeFunctionError';
import { conteudoRequisicaoEstoque } from '@/domain/estoque/idempotencia';
import { useChavesPendentes } from '@/hooks/useChavesPendentes';

interface Props {
  produtos: ProdutoExtended[];
  saldos: Record<string, { saldo: number }>;
  onBadgeRefresh?: () => void;
}

interface RequisicaoItem {
  id: string;
  produto_id: string;
  quantidade_solicitada: number;
  quantidade_atendida: number;
  unidade: string;
  saldo_snapshot: number;
  status: string;
  motivo_recusa: string | null;
  recusado_por: string | null;
  recusado_em: string | null;
  atendido_por: string | null;
  atendido_em: string | null;
  produtos?: { nome_produto: string; unidade_medida: string; unidade_compra: string | null };
}

interface Requisicao {
  id: string;
  setor: string;
  solicitante_user_id: string;
  status: string;
  observacao: string;
  created_at: string;
  atendido_por: string | null;
  atendido_em: string | null;
  confirmado_pelo_solicitante_em: string | null;
  ativo?: boolean;
  requisicao_estoque_itens: RequisicaoItem[];
}

// Mesmo formato da ação `listar` da Edge requisicao-estoque.
const REQUISICAO_SELECT = 'id, setor, solicitante_user_id, status, observacao, created_at, atendido_por, atendido_em, ativo, confirmado_pelo_solicitante_em, requisicao_estoque_itens(id, produto_id, quantidade_solicitada, quantidade_atendida, unidade, saldo_snapshot, status, motivo_recusa, recusado_por, recusado_em, atendido_por, atendido_em, produtos(nome_produto, unidade_medida, unidade_compra))';

/** Mesmo critério da Edge: pendente é quem ainda tem item SOLICITADO, nunca o status do cabeçalho. */
function isPendingRequisicao(req: Requisicao): boolean {
  return req.ativo !== false && hasPendingItems(req.requisicao_estoque_itens || []);
}

async function extractEdgeFnErrorMessage(error: unknown, fallback: string): Promise<string> {
  try {
    if (error && typeof error === 'object' && 'context' in error) {
      const resp = (error as { context: Response }).context;
      if (resp && typeof resp.json === 'function') {
        const body = await resp.json();
        return body?.message || body?.error || fallback;
      }
    }
  } catch { /* ignore parse errors */ }
  return fallback;
}

type FormMode = 'none' | 'manual' | 'lista-fixa';

export default function RequisicaoEstoqueSection({ produtos, saldos, onBadgeRefresh }: Props) {
  const toast = useScopedToast();
  const supabase = useSupabase();
  const { user, profile } = useAuth();
  const canManage = useCan('estoque:requisicoes:manage');
  const canCreate = useCan('estoque:requisicoes:create');
  const canApprove = useCan('estoque:requisicoes:approve');
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([]);
  const [totalRequisicoes, setTotalRequisicoes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('none');
  const [expandedReq, setExpandedReq] = useState<string | null>(null);
  const [listaFixaOpen, setListaFixaOpen] = useState(false);

  const [historicoOpen, setHistoricoOpen] = useState(false);
  const [historicoItems, setHistoricoItems] = useState<Requisicao[]>([]);
  const [historicoTotal, setHistoricoTotal] = useState(0);
  const [historicoLoading, setHistoricoLoading] = useState(false);
  const [historicoLoadingMore, setHistoricoLoadingMore] = useState(false);
  const [expandedHistReq, setExpandedHistReq] = useState<string | null>(null);

  const [setor, setSetor] = useState(profile?.sector || '');
  const [setores, setSetores] = useState<string[]>([]);
  useEffect(() => {
    supabase.from('stock_sectors').select('name').eq('is_active', true).order('name')
      .then(({ data, error }) => {
        if (error) { toast.error('Erro ao carregar setores. Tente novamente.'); return; }
        const nomes = (data || []).map((s: { name: string }) => s.name);
        setSetores(nomes);
        setSetor(current => nomes.includes(current) ? current : nomes[0] || '');
      });
  }, [supabase, toast]);
  const [observacao, setObservacao] = useState('');
  const [itens, setItens] = useState<ManualRequisitionItem[]>([]);
  // Semente por requisição ainda não confirmada (a mesma da lista fixa: é a
  // mesma RPC). Cancelar o formulário ou enviar outra requisição no meio não
  // troca a chave de uma que pode ter sido gravada sem resposta.
  const chavesRequisicao = useChavesPendentes('estoque-requisicao');
  // Trava síncrona: o estado `submitting` só chega ao botão no próximo render.
  const enviandoRef = useRef(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Reject dialog state
  const [rejectDialog, setRejectDialog] = useState<{
    open: boolean;
    reqId: string;
    itemId: string;
    productName: string;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectCustomReason, setRejectCustomReason] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  // Attend dialog state — allows quantity adjustment
  const [attendDialog, setAttendDialog] = useState<{
    open: boolean;
    reqId: string;
    itemId: string;
    productName: string;
    quantidadeSolicitada: number;
    unidade: string;
    saldoDisponivel: number;
  } | null>(null);
  const [attendQty, setAttendQty] = useState('');
  const [attendSubmitting, setAttendSubmitting] = useState(false);

  // Per-item quantity adjustments (inline editing)
  const [editingQty, setEditingQty] = useState<Record<string, string>>({});

  const PAGE_SIZE = 20;

  // Aberta pelo sininho: pode estar fora da página carregada ou já encerrada (no
  // histórico). Fica fixada no topo da lista certa até entrar na página normal.
  const [focusedReq, setFocusedReq] = useState<Requisicao | null>(null);
  const [scrollToReq, setScrollToReq] = useState<string | null>(null);
  const focusedIdRef = useRef<string | null>(null);

  const fetchRequisicao = useCallback(async (id: string): Promise<Requisicao | null> => {
    const { data, error } = await supabase.from('requisicoes_estoque').select(REQUISICAO_SELECT).eq('id', id).maybeSingle();
    if (error) {
      console.error('Error loading requisicao:', error);
      return null;
    }
    return data as unknown as Requisicao | null;
  }, [supabase]);

  /** Depois de atender/recusar, a cópia fixada também precisa refletir o novo estado. */
  const refreshFocused = useCallback(async () => {
    const id = focusedIdRef.current;
    if (!id) return;
    const fresh = await fetchRequisicao(id);
    if (focusedIdRef.current === id) setFocusedReq(fresh);
  }, [fetchRequisicao]);

  useNavigationRecord('estoque-geral', ['requisicao_estoque'], async ({ id }) => {
    focusedIdRef.current = id;
    const req = await fetchRequisicao(id);
    if (focusedIdRef.current !== id) return;
    if (!req) {
      toast.error('Requisição não encontrada.');
      return;
    }
    setFocusedReq(req);
    if (isPendingRequisicao(req)) {
      setExpandedReq(req.id);
      setScrollToReq(req.id);
    } else {
      setExpandedHistReq(req.id);
      setHistoricoOpen(true);
    }
  });

  useEffect(() => {
    if (!scrollToReq) return;
    const card = document.getElementById(`requisicao-${scrollToReq}`);
    if (!card) return;
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setScrollToReq(null);
  });

  const loadRequisicoes = useCallback(async (offset = 0, append = false) => {
    try {
      if (append) setLoadingMore(true); else setLoading(true);
      const { data, error } = await supabase.functions.invoke('requisicao-estoque', {
        body: { action: 'listar', bucket: 'pendentes', limit: PAGE_SIZE, offset },
      });
      if (error) throw error;
      if (append) {
        setRequisicoes(prev => [...prev, ...(data?.data || [])]);
      } else {
        setRequisicoes(data?.data || []);
        void refreshFocused();
      }
      setTotalRequisicoes(data?.total ?? 0);
      onBadgeRefresh?.();
    } catch (err) {
      console.error('Error loading requisicoes:', err);
      toast.error('Erro ao carregar requisições');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [onBadgeRefresh, toast, refreshFocused]);

  const loadHistorico = useCallback(async (offset = 0, append = false) => {
    try {
      if (append) setHistoricoLoadingMore(true); else setHistoricoLoading(true);
      const { data, error } = await supabase.functions.invoke('requisicao-estoque', {
        body: { action: 'listar', bucket: 'historico', limit: PAGE_SIZE, offset },
      });
      if (error) throw error;
      if (append) setHistoricoItems(prev => [...prev, ...(data?.data || [])]);
      else setHistoricoItems(data?.data || []);
      setHistoricoTotal(data?.total ?? 0);
    } catch (err) {
      console.error('Error loading historico:', err);
      toast.error('Erro ao carregar histórico');
    } finally {
      setHistoricoLoading(false);
      setHistoricoLoadingMore(false);
    }
  }, [toast]);

  useEffect(() => {
    loadRequisicoes();
  }, [loadRequisicoes]);

  useEffect(() => {
    if (historicoOpen && historicoItems.length === 0 && !historicoLoading) {
      loadHistorico();
    }
  }, [historicoOpen, historicoItems.length, historicoLoading, loadHistorico]);

  const getProdNome = (id: string) => produtos.find(p => p.id === id)?.nomeProduto || id.slice(0, 8);
  const getSaldo = (id: string) => saldos[id]?.saldo || 0;

  const resetManualForm = () => {
    setItens([]);
    setObservacao('');
    setFormMode('none');
  };

  const handleAddItem = (item: ManualRequisitionItem) => {
    setItens(prev => prev.some(current => current.produtoId === item.produtoId)
      ? prev.map(current => current.produtoId === item.produtoId
        ? { ...current, quantidade: Number((current.quantidade + item.quantidade).toFixed(6)) }
        : current)
      : [...prev, item]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviandoRef.current || !canCreate) return;
    if (!setor) { toast.error('Selecione o setor da requisição'); return; }
    if (itens.length === 0) {
      toast.error('Adicione pelo menos 1 item');
      return;
    }

    enviandoRef.current = true;
    setSubmitting(true);
    try {
      const itensPayload = itens.map(item => ({
        produto_id: item.produtoId,
        quantidade: item.quantidade,
        unidade: item.unidade,
      }));
      const conteudo = conteudoRequisicaoEstoque({ setor, observacao, itens });
      const { data, error } = await supabase.functions.invoke('requisicao-estoque', {
        body: {
          action: 'criar',
          setor,
          observacao,
          itens: itensPayload,
          client_request_id: await chavesRequisicao.chave(conteudo),
        },
      });

      if (error) {
        console.error('Error creating requisicao:', error);
        toast.error(await mensagemErroEdge(error, 'Não foi possível confirmar o envio. Tente de novo — a mesma requisição não é duplicada.'));
        return;
      }

      if (data?.success) {
        chavesRequisicao.confirmar(conteudo);
        toast.success(data.mensagem, { duration: 5000 });
        const semEstoque = data.resultados?.filter((result: Record<string, unknown>) => !result.tem_estoque) || [];
        if (semEstoque.length > 0) {
          semEstoque.forEach((result: Record<string, unknown>) => {
            toast.info(
              `${getProdNome(result.produto_id as string)}: sem estoque. Alerta enviado para Compras.`,
              { duration: 6000, icon: <AlertTriangle className="w-4 h-4" /> },
           );
          });
        }
        resetManualForm();
        loadRequisicoes();
      } else {
        toast.error(data?.error || 'Erro ao criar requisição');
      }
    } catch (err) {
      console.error('Error creating requisicao:', err);
      toast.error('Não foi possível confirmar o envio. Tente de novo — a mesma requisição não é duplicada.');
    } finally {
      enviandoRef.current = false;
      setSubmitting(false);
    }
  };

  // ── Item-level actions ──────────────────────────────────────────────

  const openAttendDialog = (reqId: string, item: RequisicaoItem) => {
    const saldo = getSaldo(item.produto_id);
    setAttendDialog({
      open: true,
      reqId,
      itemId: item.id,
      productName: item.produtos?.nome_produto || getProdNome(item.produto_id),
      quantidadeSolicitada: item.quantidade_solicitada,
      unidade: item.unidade,
      saldoDisponivel: saldo,
    });
    setAttendQty(String(item.quantidade_solicitada));
  };

  const handleConfirmAttend = async () => {
    if (!attendDialog) return;
    const qtd = parseFloat(attendQty);
    if (isNaN(qtd) || qtd <= 0) {
      toast.error('Quantidade deve ser maior que zero');
      return;
    }
    if (qtd > attendDialog.quantidadeSolicitada) {
      toast.error(`Quantidade não pode ser maior que ${attendDialog.quantidadeSolicitada}`);
      return;
    }

    setAttendSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('requisicao-estoque', {
        body: {
          action: 'atender_item',
          requisicao_id: attendDialog.reqId,
          item_id: attendDialog.itemId,
          quantidade_aprovada: qtd,
        },
      });

      if (error) {
        const msg = await extractEdgeFnErrorMessage(error, 'Erro ao atender item');
        toast.error(msg);
        return;
      }

      const result = data as {
        success?: boolean;
        mensagem?: string;
        error?: string;
        message?: string;
        movement_id?: string;
      } | null;

      if (result?.success && result.movement_id) {
        toast.success(result.mensagem || 'Item atendido com baixa registrada.');
        setAttendDialog(null);
        loadRequisicoes();
        setHistoricoItems([]); setHistoricoTotal(0);
        if (historicoOpen) loadHistorico();
      } else {
        toast.error(result?.error || result?.message || 'A baixa do estoque não foi confirmada para este item');
      }
    } catch {
      toast.error('Erro ao atender item');
    } finally {
      setAttendSubmitting(false);
    }
  };

  const handleAtenderItemDirect = async (reqId: string, itemId: string) => {
    if (actionLoading) return;
    setActionLoading(itemId);
    try {
      const { data, error } = await supabase.functions.invoke('requisicao-estoque', {
        body: { action: 'atender_item', requisicao_id: reqId, item_id: itemId },
      });

      if (error) {
        const msg = await extractEdgeFnErrorMessage(error, 'Erro ao atender item');
        toast.error(msg);
        return;
      }

      const result = data as {
        success?: boolean;
        mensagem?: string;
        error?: string;
        message?: string;
        movement_id?: string;
      } | null;

      if (result?.success && result.movement_id) {
        toast.success(result.mensagem || 'Item atendido com baixa registrada.');
        loadRequisicoes();
        setHistoricoItems([]); setHistoricoTotal(0);
        if (historicoOpen) loadHistorico();
      } else {
        toast.error(result?.error || result?.message || 'A baixa do estoque não foi confirmada para este item');
      }
    } catch {
      toast.error('Erro ao atender item');
    } finally {
      setActionLoading(null);
    }
  };

  const openRejectDialog = (reqId: string, itemId: string, productName: string) => {
    setRejectDialog({ open: true, reqId, itemId, productName });
    setRejectReason('');
    setRejectCustomReason('');
  };

  const handleConfirmReject = async () => {
    if (!rejectDialog) return;
    const motivo = rejectReason === 'Outro motivo' ? rejectCustomReason.trim() : rejectReason;
    if (!motivo) {
      toast.error('Informe o motivo da recusa');
      return;
    }

    setRejectSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('requisicao-estoque', {
        body: {
          action: 'recusar_item',
          requisicao_id: rejectDialog.reqId,
          item_id: rejectDialog.itemId,
          motivo_recusa: motivo,
        },
      });
      if (error) {
        const msg = await extractEdgeFnErrorMessage(error, 'Erro ao recusar item');
        toast.error(msg);
        return;
      }
      if (data?.success) {
        toast.success(data.mensagem);
        setRejectDialog(null);
        loadRequisicoes();
        setHistoricoItems([]); setHistoricoTotal(0);
        if (historicoOpen) loadHistorico();
      } else {
        toast.error(data?.error || data?.message || 'Erro ao recusar item');
      }
    } catch {
      toast.error('Erro ao recusar item');
    } finally {
      setRejectSubmitting(false);
    }
  };

  // ── Bulk actions (attend all pending / reject all) ──────────────────

  const handleAtenderTodos = async (reqId: string) => {
    if (actionLoading) return;
    setActionLoading(reqId);
    try {
      const { data, error } = await supabase.functions.invoke('requisicao-estoque', {
        body: { action: 'atender', requisicao_id: reqId },
      });
      if (error) {
        const msg = await extractEdgeFnErrorMessage(error, 'Erro ao atender requisição');
        toast.error(msg);
        return;
      }
      if (data?.success) {
        toast.success(data.mensagem, { duration: 5000 });
        loadRequisicoes();
        setHistoricoItems([]); setHistoricoTotal(0);
        if (historicoOpen) loadHistorico();
      } else {
        toast.error(data?.error || data?.message || 'Erro ao atender');
      }
    } catch {
      toast.error('Erro ao atender requisição');
    } finally {
      setActionLoading(null);
    }
  };

  const handleNegar = async (reqId: string) => {
    const ok = await confirm({
      title: 'Negar requisição inteira',
      description: 'Todos os itens pendentes serão recusados. Deseja continuar?',
      confirmLabel: 'Negar Tudo',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      const { data, error } = await supabase.functions.invoke('requisicao-estoque', {
        body: { action: 'negar', requisicao_id: reqId, motivo_recusa: 'Requisição negada integralmente' },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(data.mensagem);
        loadRequisicoes();
        setHistoricoItems([]); setHistoricoTotal(0);
        if (historicoOpen) loadHistorico();
      } else {
        toast.error(data?.error || 'Erro ao negar');
      }
    } catch {
      toast.error('Erro ao negar requisição');
    }
  };

  const handleCancelar = async (reqId: string) => {
    const ok = await confirm({
      title: 'Cancelar requisição',
      description: 'Tem certeza que deseja cancelar esta requisição?',
      confirmLabel: 'Cancelar requisição',
      variant: 'destructive',
    });
    if (!ok || cancelling) return;

    setCancelling(reqId);
    try {
      const { data, error } = await supabase.functions.invoke('requisicao-estoque', {
        body: { action: 'soft_delete_requisicao', requisicao_id: reqId },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(data.mensagem || 'Requisição cancelada.');
        loadRequisicoes();
        setHistoricoItems([]); setHistoricoTotal(0);
        if (historicoOpen) loadHistorico();
      } else {
        toast.error(data?.message || data?.error || 'Erro ao cancelar');
      }
    } catch {
      toast.error('Erro ao cancelar requisição');
    } finally {
      setCancelling(null);
    }
  };

  const pendentes = requisicoes.filter(req => hasPendingItems(req.requisicao_estoque_itens || [])).length;
  const pendingList = requisicoes.filter(req => hasPendingItems(req.requisicao_estoque_itens || []));
  if (focusedReq && isPendingRequisicao(focusedReq) && !pendingList.some(req => req.id === focusedReq.id)) {
    pendingList.unshift(focusedReq);
  }
  const historicoList = focusedReq && !isPendingRequisicao(focusedReq) && !historicoItems.some(req => req.id === focusedReq.id)
    ? [focusedReq, ...historicoItems]
    : historicoItems;

  return (
    <>
      <div className="min-w-0 space-y-4">
        <RequisicaoToolbar pendentes={pendentes} loading={loading} canCreate={canCreate} showActions={formMode === 'none'}
          onRefresh={() => loadRequisicoes()} onHistory={() => setHistoricoOpen(true)}
          onCreate={() => setFormMode('manual')} onFixedList={() => setFormMode('lista-fixa')} />

        {canManage && formMode === 'none' && (
          <Collapsible open={listaFixaOpen} onOpenChange={setListaFixaOpen}>
            <CollapsibleTrigger asChild>
              <button type="button" className="w-full flex flex-wrap items-center justify-between gap-2 bg-card border border-border rounded-xl px-4 py-3 hover:bg-surface-hover transition-colors">
                <div className="flex flex-wrap items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Gerenciar Listas Fixas por Setor</span>
                </div>
                {listaFixaOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <ListaFixaSetorAdmin produtos={produtos} />
            </CollapsibleContent>
          </Collapsible>
        )}

        {formMode === 'lista-fixa' && (
          <RequisicaoListaFixa
            produtos={produtos}
            saldos={saldos}
            onSuccess={() => {
              setFormMode('none');
              loadRequisicoes();
            }}
            onCancel={() => setFormMode('none')}
          />
        )}

        {formMode === 'manual' && (
          <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-4 space-y-3 animate-scale-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-sm text-muted-foreground">Setor</Label>
                <Select value={setor} onValueChange={setSetor}>
                  <SelectTrigger className="h-auto min-h-12 text-base whitespace-normal bg-secondary border-border text-foreground [&>span]:line-clamp-none [&>span]:text-left [&>span]:break-words"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {setores.map(setorOption => <SelectItem key={setorOption} value={setorOption}>{setorOption}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Observação</Label>
                <Input value={observacao} onChange={event => setObservacao(event.target.value)} className="h-12 text-base md:text-base bg-secondary border-border text-foreground" />
              </div>
            </div>

            <RequisicaoProductPicker produtos={produtos} onAdd={handleAddItem} />

            {itens.length > 0 && (
              <div className="space-y-1">
                {itens.map((item, index) => {
                  const saldo = getSaldo(item.produtoId);
                  const semEstoque = saldo < item.quantidade;
                  return (
                    <div key={index} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-3 text-base break-words ${semEstoque ? 'bg-destructive-soft border border-destructive-border' : 'bg-background-subtle'}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 break-words text-foreground">{getProdNome(item.produtoId)}</span>
                        {semEstoque && (
                          <span className="flex items-center gap-1 text-sm text-destructive">
                            <AlertTriangle className="w-3 h-3" /> Sem estoque suficiente
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-muted-foreground">{item.quantidade} {item.unidade}</span>
                        <button type="button" onClick={() => setItens(prev => prev.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remover ${getProdNome(item.produtoId)}`} className="flex h-11 w-11 shrink-0 items-center justify-center text-destructive">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {itens.some(item => getSaldo(item.produtoId) < item.quantidade) && (
                  <div className="flex flex-wrap items-center gap-2 p-2 bg-warning-soft border border-warning-border rounded-lg text-sm text-warning">
                    <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
                    <span>Itens sem estoque serão enviados como Solicitação de Compra para o setor de Compras.</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" className="min-h-12 text-base" onClick={resetManualForm}>Cancelar</Button>
              <Button type="submit" size="sm" className="min-h-12 text-base bg-primary-strong text-primary-foreground border-0" disabled={submitting}>
                {submitting ? 'Enviando...' : 'Enviar'}
              </Button>
            </div>
          </form>
        )}

        {/* ── Requisition list ─────────────────────────────────────── */}

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : pendingList.length > 0 ? (
          <div className="space-y-2">
            {pendingList.map((req, index) => {
              const isOwn = req.solicitante_user_id === user?.id;
              const isPending = canActOnRequisicao(req.status);
              const isExpanded = expandedReq === req.id;
              const pendingItemsExist = hasPendingItems(req.requisicao_estoque_itens || []);

              return (
                <div key={req.id} id={`requisicao-${req.id}`} className="bg-card border border-border rounded-xl animate-fade-up" style={{ animationDelay: `${index * 30}ms` }}>
                  {/* Header */}
                  <RequisicaoCardHeader req={req} expanded={isExpanded} onToggle={() => setExpandedReq(isExpanded ? null : req.id)} />

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
                      {/* Bulk actions */}
                      {canApprove && isPending && pendingItemsExist && (
                        <div className="flex flex-wrap items-center gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-auto min-h-11 whitespace-normal py-2 text-sm gap-1"
                            onClick={() => handleAtenderTodos(req.id)}
                            disabled={!!actionLoading}
                          >
                            <Check className="w-3 h-3" /> Atender Todos
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-auto min-h-11 whitespace-normal py-2 text-sm gap-1 text-destructive border-destructive-border hover:bg-destructive-soft"
                            onClick={() => handleNegar(req.id)}
                          >
                            <Ban className="w-3 h-3" /> Negar Tudo
                          </Button>
                        </div>
                      )}

                      {/* Item list with per-item actions */}
                      <div className="space-y-1">
                        {sortByName(req.requisicao_estoque_itens || [], item => item.produtos?.nome_produto || getProdNome(item.produto_id)).map(item => {
                          const listedItemDisplay = resolveListedRequisitionItemDisplay(item);
                          const isItemPending = canAttendItem(item.status);
                          const isItemRejectable = canRejectItem(item.status);
                          const isPartiallyFulfilled = item.status === 'ATENDIDO' && item.quantidade_atendida > 0 && item.quantidade_atendida < item.quantidade_solicitada;

                          return (
                            <div
                              key={item.id}
                              className={`rounded-lg px-3 py-3 text-base break-words ${
                                item.status === 'RECUSADO'
                                  ? 'bg-destructive-soft border border-destructive-border'
                                  : item.status === 'ATENDIDO'
                                    ? 'bg-success-soft border border-success-border'
                                    : 'bg-background-subtle'
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0 flex-1 basis-48">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-base text-foreground font-medium break-words">{item.produtos?.nome_produto || getProdNome(item.produto_id)}</span>
                                    <span className={`text-sm px-1.5 py-0.5 rounded-full font-medium ${itemStatusStyle(item.status)}`}>
                                      {itemStatusLabel(item.status)}
                                    </span>
                                  </div>
                                  {listedItemDisplay.issueCode && listedItemDisplay.issueMessage && (
                                    <div className="mt-0.5 flex items-center gap-1 text-sm text-warning">
                                      <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                                      <span>{listedItemDisplay.issueMessage}</span>
                                    </div>
                                  )}
                                  {item.status === 'RECUSADO' && item.motivo_recusa && (
                                    <p className="mt-0.5 text-sm text-destructive italic">
                                      Motivo: {item.motivo_recusa}
                                    </p>
                                  )}
                                  {isPartiallyFulfilled && (
                                    <p className="mt-0.5 text-sm text-warning italic">
                                      Atendido parcialmente: {item.quantidade_atendida} de {item.quantidade_solicitada} {listedItemDisplay.unitLabel ?? ''}
                                    </p>
                                  )}
                                </div>
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                  <div className="text-right">
                                    <span className="text-muted-foreground">
                                      {item.quantidade_solicitada} {listedItemDisplay.unitLabel ?? 'Configurar'}
                                    </span>

                                  </div>
                                  {/* Per-item actions for users with approve permission */}
                                  {canApprove && isItemPending && (
                                    <div className="flex items-center gap-1 ml-1">
                                      {/* Attend with adjustment dialog */}
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-11 w-11 p-0 text-primary hover:bg-primary-soft"
                                        onClick={() => openAttendDialog(req.id, item)}
                                        disabled={!!actionLoading}
                                        title="Atender com ajuste de quantidade"
                                      >
                                        <Edit3 className="w-3 h-3" />
                                      </Button>
                                      {/* Quick attend (full quantity) */}
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-11 w-11 p-0 text-success hover:bg-success-soft"
                                        onClick={() => handleAtenderItemDirect(req.id, item.id)}
                                        disabled={actionLoading === item.id}
                                        title="Atender quantidade total"
                                      >
                                        <Check className="w-3 h-3" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-11 w-11 p-0 text-destructive hover:bg-destructive-soft"
                                        onClick={() => openRejectDialog(req.id, item.id, item.produtos?.nome_produto || getProdNome(item.produto_id))}
                                        disabled={!!actionLoading}
                                        title="Recusar item"
                                      >
                                        <Ban className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Cancel own pending */}
                      {isOwn && req.status === 'SOLICITADA' && (
                        <div className="flex justify-end pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-auto min-h-11 whitespace-normal py-2 text-sm gap-1 text-destructive border-destructive-border hover:bg-destructive-soft"
                            onClick={() => handleCancelar(req.id)}
                            disabled={cancelling === req.id}
                          >
                            <X className="w-3 h-3" /> {cancelling === req.id ? 'Cancelando...' : 'Cancelar Requisição'}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Ver mais */}
            {requisicoes.length < totalRequisicoes && (
              <div className="flex justify-center pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-sm gap-1.5"
                  onClick={() => loadRequisicoes(requisicoes.length, true)}
                  disabled={loadingMore}
                >
                  {loadingMore ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                  {loadingMore ? 'Carregando...' : `Ver mais (${totalRequisicoes - requisicoes.length} restantes)`}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <Inbox className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">Nenhuma requisição</p>
            <p className="text-sm text-muted-foreground">Solicite produtos disponíveis em estoque para operação do dia.</p>
          </div>
        )}
      </div>

      {/* ── Reject Item Dialog ─────────────────────────────────── */}
      <Dialog open={!!rejectDialog?.open} onOpenChange={(open) => { if (!open) setRejectDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Recusar Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Recusar <strong className="text-foreground">{rejectDialog?.productName}</strong>. Os demais itens da requisição não serão afetados.
            </p>
            <div>
              <Label className="text-sm text-muted-foreground">Motivo da recusa</Label>
              <Select value={rejectReason} onValueChange={setRejectReason}>
                <SelectTrigger className="h-12 text-base md:text-base bg-secondary border-border text-foreground">
                  <SelectValue placeholder="Selecione o motivo" />
                </SelectTrigger>
                <SelectContent>
                  {MOTIVOS_RECUSA.map(motivo => (
                    <SelectItem key={motivo} value={motivo}>{motivo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {rejectReason === 'Outro motivo' && (
              <div>
                <Label className="text-sm text-muted-foreground">Descreva o motivo</Label>
                <Textarea
                  value={rejectCustomReason}
                  onChange={e => setRejectCustomReason(e.target.value)}
                  className="bg-secondary border-border text-foreground text-sm"
                  placeholder="Informe o motivo da recusa..."
                  maxLength={500}
                  rows={2}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setRejectDialog(null)} disabled={rejectSubmitting}>
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleConfirmReject}
              disabled={rejectSubmitting || !rejectReason || (rejectReason === 'Outro motivo' && !rejectCustomReason.trim())}
            >
              {rejectSubmitting ? 'Recusando...' : 'Confirmar Recusa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Attend Item Dialog (with quantity adjustment) ──────── */}
      <Dialog open={!!attendDialog?.open} onOpenChange={(open) => { if (!open) setAttendDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Atender Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Atender <strong className="text-foreground">{attendDialog?.productName}</strong>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-sm text-muted-foreground">Qtd Solicitada</Label>
                <div className="text-sm font-medium text-foreground mt-1">
                  {attendDialog?.quantidadeSolicitada} {attendDialog?.unidade}
                </div>
              </div>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Quantidade a enviar</Label>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={attendDialog?.quantidadeSolicitada}
                  value={attendQty}
                  onChange={e => setAttendQty(e.target.value)}
                  className="h-12 text-base md:text-base bg-secondary border-border text-foreground"
                  placeholder="Quantidade"
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">{attendDialog?.unidade}</span>
              </div>
              {attendDialog && parseFloat(attendQty) > 0 && parseFloat(attendQty) < attendDialog.quantidadeSolicitada && (
                <p className="mt-1 text-sm text-warning flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Atendimento parcial: {parseFloat(attendQty)} de {attendDialog.quantidadeSolicitada}. O saldo faltante gerará alerta para Compras.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAttendDialog(null)} disabled={attendSubmitting}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-primary-strong text-primary-foreground border-0"
              onClick={handleConfirmAttend}
              disabled={attendSubmitting || !attendQty || parseFloat(attendQty) <= 0}
            >
              {attendSubmitting ? 'Processando...' : 'Confirmar Atendimento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Histórico Sheet ────────────────────────────────────── */}
      <Sheet open={historicoOpen} onOpenChange={setHistoricoOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
          <SheetHeader className="pl-4 pr-12 pt-5 pb-3 border-b border-border">
            <SheetTitle className="text-lg">Histórico de Requisições</SheetTitle>
            <SheetDescription className="text-sm">
              Requisições encerradas (todos itens aceitos ou recusados) e canceladas.
              {historicoTotal > 0 && ` ${historicoTotal} encerrada${historicoTotal !== 1 ? 's' : ''}.`}
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {historicoLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : historicoList.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-8 text-center">
                <Inbox className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">Sem histórico</p>
                <p className="text-sm text-muted-foreground">Nenhuma requisição encerrada ainda.</p>
              </div>
            ) : (
              <>
                {historicoList.map((req, index) => {
                  const isExpanded = expandedHistReq === req.id;

                  return (
                    <div key={req.id} className="bg-card border border-border rounded-xl animate-fade-up" style={{ animationDelay: `${index * 20}ms` }}>
                      <RequisicaoCardHeader req={req} expanded={isExpanded} onToggle={() => setExpandedHistReq(isExpanded ? null : req.id)} />

                      {isExpanded && (
                        <div className="px-3 pb-3 space-y-1 border-t border-border pt-2">
                          {sortByName(req.requisicao_estoque_itens || [], item => item.produtos?.nome_produto || getProdNome(item.produto_id)).map(item => {
                            const listedItemDisplay = resolveListedRequisitionItemDisplay(item);
                            const isPartiallyFulfilled = item.status === 'ATENDIDO' && item.quantidade_atendida > 0 && item.quantidade_atendida < item.quantidade_solicitada;

                            return (
                              <div
                                key={item.id}
                                className={`rounded-lg px-3 py-3 text-base break-words ${
                                  item.status === 'RECUSADO'
                                    ? 'bg-destructive-soft border border-destructive-border'
                                    : item.status === 'ATENDIDO'
                                      ? 'bg-success-soft border border-success-border'
                                      : 'bg-background-subtle'
                                }`}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="min-w-0 flex-1 basis-48">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-base text-foreground font-medium break-words">{item.produtos?.nome_produto || getProdNome(item.produto_id)}</span>
                                      <span className={`text-sm px-1.5 py-0.5 rounded-full font-medium ${itemStatusStyle(item.status)}`}>
                                        {itemStatusLabel(item.status)}
                                      </span>
                                    </div>
                                    {item.status === 'RECUSADO' && item.motivo_recusa && (
                                      <p className="mt-0.5 text-sm text-destructive italic">
                                        Motivo: {item.motivo_recusa}
                                      </p>
                                    )}
                                    {isPartiallyFulfilled && (
                                      <p className="mt-0.5 text-sm text-warning italic">
                                        Atendido parcialmente: {item.quantidade_atendida} de {item.quantidade_solicitada} {listedItemDisplay.unitLabel ?? ''}
                                      </p>
                                    )}
                                  </div>
                                  <span className="text-muted-foreground break-words">
                                    {item.quantidade_solicitada} {listedItemDisplay.unitLabel ?? ''}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {historicoItems.length < historicoTotal && (
                  <div className="flex justify-center pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-sm gap-1.5"
                      onClick={() => loadHistorico(historicoItems.length, true)}
                      disabled={historicoLoadingMore}
                    >
                      {historicoLoadingMore ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                      {historicoLoadingMore ? 'Carregando...' : `Ver mais (${historicoTotal - historicoItems.length} restantes)`}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog />
    </>
  );
}
