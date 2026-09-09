import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, TrendingDown, TrendingUp, DollarSign, Package, Filter, X, Edit2, Trash2, Eye, Ban, RotateCcw, Settings2 } from 'lucide-react';
import { emitDataEvent } from '@/lib/dataEvents';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/DateInput';
import { CurrencyInput } from '@/components/ui/brl-input';
import { DecimalInput } from '@/components/ui/decimal-input';
import { fmtBRL, formatDateValueBR, formatFixedBR, normalizeBRLMoneyToNumber } from '@/lib/formatters';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Produto, MovimentacaoEstoque } from '@/types/salmon';
import { useAuth } from '@/contexts/AuthContext';
import { useCan } from '@/permissions/hooks';
import { toast } from 'sonner';

type DirectionTab = 'entradas' | 'saidas';

interface MovimentacaoComStatus extends MovimentacaoEstoque {
  status?: string;
  estorno_de_id?: string;
  justificativa_cancelamento?: string;
  justificativa_edicao?: string;
  setor?: string;
  reference_type?: string;
  reference_id?: string;
  internal_transfer?: boolean;
  source_module?: string;
  salmon_lot_id?: string;
  direction?: string;
}

interface Props {
  movimentacoes: MovimentacaoComStatus[];
  produtos: Produto[];
  categorias: string[];
  getProdNome: (id: string) => string;
  canCreateMov: boolean;
  onOpenMovModal: (preset: 'entrada' | 'saida' | 'ajuste') => void;
  canEditPricing: boolean;
  recalculating: boolean;
  recalcularPrecos: () => void;
  onRefresh?: () => void;
  onFilterChange?: (filters: {
    direction?: 'IN' | 'OUT' | null;
    produtoId?: string | null;
    categoria?: string | null;
    setor?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    showCancelled?: boolean;
  }) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  movKpis?: {
    entradas: { total_valor: number; total_qtd: number; registros: number };
    saidas: { total_valor: number; total_qtd: number; registros: number };
  } | null;
  movKpisLoading?: boolean;
}

export default function MovimentacoesSection({
  movimentacoes, produtos, categorias, getProdNome,
  canCreateMov, onOpenMovModal,
  canEditPricing, recalculating, recalcularPrecos,
  onRefresh, onFilterChange, onLoadMore, hasMore, movKpis, movKpisLoading,
}: Props) {
  const supabase = useSupabase();
  const { hasPermission } = useAuth();
  const canEditMovimentacoes = useCan('estoque:movimentacoes:edit');
  const canCancelMovimentacoes = useCan('estoque:movimentacoes:cancel');
  const canEdit = hasPermission('stock:movements:edit') || canEditMovimentacoes;
  const canCancel = hasPermission('stock:movements:cancel') || canCancelMovimentacoes;

  const [direction, setDirection] = useState<DirectionTab>('entradas');
  const [filterProduto, setFilterProduto] = useState('all');
  const [filterCategoria, setFilterCategoria] = useState('all');
  const [filterSetor, setFilterSetor] = useState('all');
  const [setores, setSetores] = useState<string[]>([]);
  useEffect(() => {
    supabase.from('stock_sectors').select('name').eq('is_active', true).order('sort_order').order('name')
      .then(({ data }) => setSetores((data || []).map((s: { name: string }) => s.name)));
  }, [supabase]);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);

  // Modal states
  const [detailMov, setDetailMov] = useState<MovimentacaoComStatus | null>(null);
  const [editMov, setEditMov] = useState<MovimentacaoComStatus | null>(null);
  const [cancelMov, setCancelMov] = useState<MovimentacaoComStatus | null>(null);
  // justificativa state moved to per-modal (editJustificativa / cancelJustificativa) to prevent cross-leaks
  const [editForm, setEditForm] = useState({ quantidade: '', custoUnitario: '', data: '', observacao: '' });
  const [processing, setProcessing] = useState(false);

  // Propagate filter changes to server
  const pushFilters = useCallback((dir: DirectionTab, produto: string, categoria: string, setor: string, dateFrom: string, dateTo: string, cancelled: boolean) => {
    if (onFilterChange) {
      onFilterChange({
        direction: dir === 'entradas' ? 'IN' : 'OUT',
        produtoId: produto && produto !== 'all' ? produto : null,
        categoria: categoria && categoria !== 'all' ? categoria : null,
        setor: setor && setor !== 'all' ? setor : null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        showCancelled: cancelled,
      });
    }
  }, [onFilterChange]);

  // When direction changes, push filters
  const handleDirectionChange = useCallback((dir: DirectionTab) => {
    setDirection(dir);
    pushFilters(dir, filterProduto, filterCategoria, filterSetor, filterDateFrom, filterDateTo, showCancelled);
  }, [pushFilters, filterProduto, filterCategoria, filterSetor, filterDateFrom, filterDateTo, showCancelled]);

  // Re-sincroniza filtros de servidor quando qualquer filtro muda.
  // direction é excluída das deps: handleDirectionChange já chama pushFilters,
  // evitando o duplo disparo que causava 2x round-trips por toggle.
  useEffect(() => {
    pushFilters(direction, filterProduto, filterCategoria, filterSetor, filterDateFrom, filterDateTo, showCancelled);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterProduto, filterCategoria, filterSetor, filterDateFrom, filterDateTo, showCancelled]);

  // All movimentacoes are now already server-filtered
  const filtered = movimentacoes;

  // KPIs (only ATIVO, exclude estornos from operational totals)
  const activeFiltered = useMemo(() => filtered.filter(m => (m.status || 'ATIVO') === 'ATIVO'), [filtered]);
  const operationalFiltered = useMemo(() => activeFiltered.filter(m => {
    const t = m.tipo as string;
    return t !== 'ENTRADA_ESTORNO' && t !== 'SAIDA_ESTORNO';
  }), [activeFiltered]);
  const totalValor = useMemo(() => operationalFiltered.reduce((sum, m) => {
    const quantidade = Number(m.quantidade) || 0;
    const custoUnitario = Number(m.custoUnitario) || 0;
    const custoTotal = Number(m.custoTotal) || 0;
    return sum + (quantidade > 0 && custoUnitario >= 0 ? quantidade * custoUnitario : custoTotal);
  }, 0), [operationalFiltered]);
  const totalQtd = useMemo(() => operationalFiltered.reduce((sum, m) => sum + m.quantidade, 0), [operationalFiltered]);

  const top5 = useMemo(() => {
    const map: Record<string, { nome: string; valor: number; qtd: number }> = {};
    operationalFiltered.forEach(m => {
      if (!map[m.produtoId]) map[m.produtoId] = { nome: getProdNome(m.produtoId), valor: 0, qtd: 0 };
      map[m.produtoId].valor += (Number(m.quantidade) || 0) * (Number(m.custoUnitario) || 0);
      map[m.produtoId].qtd += m.quantidade;
    });
    return Object.values(map).sort((a, b) => b.valor - a.valor).slice(0, 5);
  }, [operationalFiltered, getProdNome]);

  const perdasTotal = useMemo(() => {
    if (direction !== 'saidas') return 0;
    return operationalFiltered
      .filter(m => m.tipo === 'BAIXA_PERDA' || m.tipo.includes('PERDA'))
      .reduce((sum, m) => sum + ((Number(m.quantidade) || 0) * (Number(m.custoUnitario) || 0)), 0);
  }, [operationalFiltered, direction]);

  const clearFilters = () => {
    setFilterProduto('all');
    setFilterCategoria('all');
    setFilterSetor('all');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

  const hasFilters = (filterProduto && filterProduto !== 'all') || (filterCategoria && filterCategoria !== 'all') || (filterSetor && filterSetor !== 'all') || filterDateFrom || filterDateTo;

  // Edit handler
  // Separate justificativa states for edit and cancel to prevent cross-modal leaks
  const [editJustificativa, setEditJustificativa] = useState('');
  const [cancelJustificativa, setCancelJustificativa] = useState('');

  const handleOpenEdit = (m: MovimentacaoComStatus) => {
    setEditMov(m);
    setEditForm({
      quantidade: String(m.quantidade),
      custoUnitario: String(m.custoUnitario),
      data: m.data,
      observacao: m.observacao || '',
    });
    setEditJustificativa('');
  };

  const handleSaveEdit = useCallback(async () => {
    if (!editMov || !editJustificativa.trim()) { toast.error('Justificativa obrigatória'); return; }
    if (editJustificativa.trim().length > 500) { toast.error('Justificativa muito longa (máx. 500 caracteres)'); return; }
    setProcessing(true);
    try {
      const updates: Record<string, any> = {};
      const newQty = normalizeBRLMoneyToNumber(editForm.quantidade);
      const newCost = normalizeBRLMoneyToNumber(editForm.custoUnitario);
      if (newQty != null && newQty > 0 && newQty !== editMov.quantidade) updates.quantidade = newQty;
      if (newCost != null && newCost >= 0 && newCost !== editMov.custoUnitario) updates.custo_unitario = newCost;
      if (editForm.data !== editMov.data) updates.data = editForm.data;
      if (editForm.observacao !== (editMov.observacao || '')) updates.observacao = (editForm.observacao || '').slice(0, 500);

      if (Object.keys(updates).length === 0) { toast.info('Nenhuma alteração detectada'); setProcessing(false); return; }

      const { data, error } = await supabase.functions.invoke('requisicao-estoque', {
        body: { action: 'editar_movimentacao', movement_id: editMov.id, justificativa: editJustificativa.trim(), updates },
      });
      if (error) {
        let msg = 'Erro ao editar';
        try {
          const body = typeof error === 'object' && 'context' in error
            ? await (error as any).context?.json?.()
            : null;
          if (body?.message) msg = body.message;
          else if (error.message) msg = error.message;
        } catch { if (error.message) msg = error.message; }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.message || data.error);
      toast.success('Movimentação editada!');
      setEditMov(null);
      emitDataEvent('estoque:movimentacoes');
      onRefresh?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao editar';
      toast.error(message);
    }
    setProcessing(false);
  }, [editMov, editForm, editJustificativa, onRefresh]);

  // Cancel handler
  const handleConfirmCancel = useCallback(async () => {
    if (!cancelMov || !cancelJustificativa.trim()) { toast.error('Justificativa obrigatória'); return; }
    if (cancelJustificativa.trim().length > 500) { toast.error('Justificativa muito longa (máx. 500 caracteres)'); return; }
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('requisicao-estoque', {
        body: { action: 'cancelar_movimentacao', movement_id: cancelMov.id, justificativa: cancelJustificativa.trim() },
      });
      if (error) {
        // Try to extract structured error from the FunctionsHttpError context
        let msg = 'Erro ao cancelar';
        try {
          const body = typeof error === 'object' && 'context' in error
            ? await (error as any).context?.json?.()
            : null;
          if (body?.message) msg = body.message;
          else if (error.message) msg = error.message;
        } catch { if (error.message) msg = error.message; }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.message || data.error);
      toast.success('Movimentação cancelada e estorno criado!');
      setCancelMov(null);
      emitDataEvent('estoque:movimentacoes');
      onRefresh?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao cancelar';
      toast.error(message);
    }
    setProcessing(false);
  }, [cancelMov, cancelJustificativa, onRefresh]);

  const cancelledCount = movimentacoes.filter(m => m.status === 'CANCELADO').length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-foreground">Movimentações</p>
        <div className="flex items-center gap-2 flex-wrap">
          {canEditPricing && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={recalcularPrecos} disabled={recalculating}>
              <span className={recalculating ? 'animate-spin' : ''}>⟳</span> Recalcular
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="w-3.5 h-3.5" /> Filtros
          </Button>
          {canCreateMov && (
            <>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs border-success-border text-success hover:bg-success-soft" onClick={() => onOpenMovModal('entrada')}>
                <ArrowDown className="w-3.5 h-3.5" /> Entrada
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs border-destructive-border text-destructive hover:bg-destructive-soft" onClick={() => onOpenMovModal('saida')}>
                <ArrowUp className="w-3.5 h-3.5" /> Saída
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs border-primary-border text-primary-ink hover:bg-primary-soft" onClick={() => onOpenMovModal('ajuste')}>
                <Settings2 className="w-3.5 h-3.5" /> Ajuste
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Direction tabs */}
      <div className="flex gap-1 bg-background-subtle rounded-lg p-1">
        <button
          onClick={() => handleDirectionChange('entradas')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
            direction === 'entradas'
              ? 'bg-success-soft text-success shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <ArrowDown className="w-3.5 h-3.5" />
          Entradas
        </button>
        <button
          onClick={() => handleDirectionChange('saidas')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
            direction === 'saidas'
              ? 'bg-destructive-soft text-destructive shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <ArrowUp className="w-3.5 h-3.5" />
          Saídas
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-card border border-border rounded-xl p-3 space-y-2 animate-scale-in">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-muted-foreground">Filtros</p>
            {hasFilters && (
              <button onClick={clearFilters} className="text-[10px] text-primary flex items-center gap-1">
                <X className="w-3 h-3" /> Limpar
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] text-muted-foreground">Produto</Label>
              <SearchableSelect
                value={filterProduto}
                onValueChange={setFilterProduto}
                options={[{ value: 'all', label: 'Todos' }, ...produtos.filter(p => p.ativo).map(p => ({ value: p.id, label: p.nomeProduto }))]}
                placeholder="Todos"
                searchPlaceholder="Buscar produto..."
                className="h-8 text-xs bg-secondary border-border"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Categoria</Label>
              <SearchableSelect
                value={filterCategoria}
                onValueChange={setFilterCategoria}
                options={[{ value: 'all', label: 'Todas' }, ...categorias.map(c => ({ value: c, label: c }))]}
                placeholder="Todas"
                searchPlaceholder="Buscar categoria..."
                className="h-8 text-xs bg-secondary border-border"
              />
            </div>
            {direction === 'saidas' && (
              <div>
                <Label className="text-[10px] text-muted-foreground">Setor</Label>
                <Select value={filterSetor} onValueChange={setFilterSetor}>
                  <SelectTrigger className="h-8 text-xs bg-secondary border-border"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {setores.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-[10px] text-muted-foreground">De</Label>
              <DateInput value={filterDateFrom} onValueChange={setFilterDateFrom} className="h-8 text-xs bg-secondary border-border" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Até</Label>
              <DateInput value={filterDateTo} onValueChange={setFilterDateTo} className="h-8 text-xs bg-secondary border-border" />
            </div>
          </div>
          {cancelledCount > 0 && (
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer pt-1">
              <input type="checkbox" checked={showCancelled} onChange={e => setShowCancelled(e.target.checked)} className="rounded border-border" />
              Mostrar cancelados ({cancelledCount})
            </label>
          )}
        </div>
      )}

      {/* KPI Cards */}
      {(() => {
        const side = movKpis?.[direction === 'entradas' ? 'entradas' : 'saidas'];
        const kpiValor = side?.total_valor ?? totalValor;
        const kpiQtd   = side?.total_qtd   ?? totalQtd;
        const kpiRegs  = side?.registros    ?? operationalFiltered.length;
        const skelClass = movKpisLoading ? 'animate-pulse bg-muted rounded' : '';
        return (
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-card border border-border rounded-xl p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-[10px] text-muted-foreground">
                  {direction === 'entradas' ? 'Total Entradas' : 'Total Saídas'}
                </p>
              </div>
              <p className={`text-lg font-bold ${direction === 'entradas' ? 'text-success' : 'text-destructive'} ${skelClass}`}>
                {movKpisLoading ? '     ' : fmtBRL(kpiValor)}
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Package className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-[10px] text-muted-foreground">Qtd Total</p>
              </div>
              <p className={`text-lg font-bold text-foreground ${skelClass}`}>
                {movKpisLoading ? '   ' : formatFixedBR(kpiQtd, 1)}
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                {direction === 'entradas'
                  ? <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                  : <TrendingDown className="w-3.5 h-3.5 text-muted-foreground" />
                }
                <p className="text-[10px] text-muted-foreground">
                  {direction === 'entradas' ? 'Registros' : 'Perdas (R$)'}
                </p>
              </div>
              <p className={`text-lg font-bold ${direction === 'saidas' && perdasTotal > 0 ? 'text-destructive' : 'text-foreground'} ${skelClass}`}>
                {movKpisLoading
                  ? '   '
                  : direction === 'entradas'
                    ? kpiRegs
                    : fmtBRL(perdasTotal)}
              </p>
            </div>
          </div>
        );
      })()}

      {/* Top 5 */}
      {top5.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-[10px] font-medium text-muted-foreground mb-2">
            Top 5 — {direction === 'entradas' ? 'Maior valor' : 'Maior impacto'}
          </p>
          <div className="space-y-1">
            {top5.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <span className="text-foreground truncate">{i + 1}. {item.nome}</span>
                <span className="text-muted-foreground font-medium">{fmtBRL(item.valor)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Movement list */}

      {/* Movement list */}
      {filtered.length > 0 ? (
        <div className="space-y-1.5">
          {filtered.map((m, i) => {
            const prod = produtos.find(p => p.id === m.produtoId);
            const isCancelled = m.status === 'CANCELADO';
            const isEstorno = m.origem === 'ESTORNO' || !!m.estorno_de_id;
            return (
              <div key={m.id} className={`bg-card border rounded-lg p-2.5 animate-fade-up ${isCancelled ? 'opacity-50 border-muted' : isEstorno ? 'border-warning-border' : 'border-border'}`} style={{ animationDelay: `${i * 20}ms` }}>
                <div className="flex items-center gap-3">
                  {isEstorno ? (
                    <RotateCcw className="w-3.5 h-3.5 text-warning shrink-0" />
                  ) : direction === 'entradas' ? (
                    <ArrowDown className="w-3.5 h-3.5 text-success shrink-0" />
                  ) : (
                    <ArrowUp className="w-3.5 h-3.5 text-destructive shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-xs font-medium truncate ${isCancelled ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{getProdNome(m.produtoId)}</p>
                      {isCancelled && <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 border-destructive-border text-destructive">Cancelado</Badge>}
                      {isEstorno && <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 border-warning-border text-warning">Estorno</Badge>}
                      {m.justificativa_edicao && <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 border-primary-border text-primary-ink">Editado</Badge>}
                      {m.source_module === 'salmon' && <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 border-info-border text-info">🐟 Salmão</Badge>}
                      {m.internal_transfer && <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 border-info-border text-info">Transf. Interna</Badge>}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span>{formatDateValueBR(m.data)}</span>
                      <span>•</span>
                      <span>{isEstorno
                        ? (m.tipo.includes('ENTRADA') ? '🔁 Entrada — Estorno' : '🔁 Saída — Estorno')
                        : m.reference_type === 'SALMON_ENTRY' ? 'Entrada Salmão Bruto (Controle de Salmão)'
                        : m.reference_type === 'SALMON_MANIPULATION' ? 'Saída para Manipulação (Salmão Bruto)'
                        : m.tipo.replace(/_/g, ' ')
                      }</span>
                      {isEstorno && m.estorno_de_id && <span className="text-warning">(Ref: #{m.estorno_de_id.slice(0, 8)})</span>}
                      {!isEstorno && m.origem && !m.source_module && <><span>•</span><span>{m.origem}</span></>}
                      {(m as any).setor && <><span>•</span><span className="font-medium text-foreground">🏷️ {(m as any).setor}</span></>}
                      {m.salmon_lot_id && <><span>•</span><span className="text-info">Lote: {m.salmon_lot_id}</span></>}
                      {prod?.categoria && <><span>•</span><span>{prod.categoria}</span></>}
                    </div>
                    {m.observacao && (
                      <p className="text-[9px] text-muted-foreground mt-0.5 truncate">{m.observacao}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-2">
                    <div>
                      {(() => {
                        const fator = (prod as any)?.fatorConversaoPadrao || 1;
                        const unCompra = (prod as any)?.unidadeCompra || prod?.unidadeMedida || '';
                        const showDual = unCompra !== (prod?.unidadeMedida || '');
                        const qtyPurchase = fator > 0 ? m.quantidade / fator : m.quantidade;
                        const sign = direction === 'entradas' ? '+' : '-';
                        return (
                          <>
                            <p className={`text-sm font-bold ${isCancelled ? 'text-muted-foreground' : direction === 'entradas' ? 'text-success' : 'text-destructive'}`}>
                              {showDual
                                ? `${sign}${formatFixedBR(qtyPurchase, 1)} ${unCompra}`
                                : `${sign}${formatFixedBR(m.quantidade, 1)} ${prod?.unidadeMedida || ''}`}
                            </p>
                            {showDual && (
                              <p className="text-[9px] text-muted-foreground">({m.quantidade} {prod?.unidadeMedida})</p>
                            )}
                          </>
                        );
                      })()}
                      {m.custoTotal > 0 && (
                        <p className="text-[10px] text-muted-foreground">{fmtBRL(m.custoTotal)}</p>
                      )}
                    </div>
                    {/* Action buttons */}
                    {!isCancelled && !isEstorno && (canEdit || canCancel) && (
                      <div className="flex flex-col gap-0.5">
                        <button onClick={(e) => { e.stopPropagation(); setDetailMov(m); }} className="p-1 rounded hover:bg-secondary" title="Detalhes">
                          <Eye className="w-3 h-3 text-muted-foreground" />
                        </button>
                        {canEdit && (
                          <button onClick={(e) => { e.stopPropagation(); handleOpenEdit(m); }} className="p-1 rounded hover:bg-secondary" title="Editar">
                            <Edit2 className="w-3 h-3 text-primary" />
                          </button>
                        )}
                        {canCancel && (
                          <button onClick={(e) => { e.stopPropagation(); setCancelMov(m); setCancelJustificativa(''); }} className="p-1 rounded hover:bg-destructive-soft" title="Cancelar">
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {hasMore && onLoadMore && (
            <div className="text-center py-2">
              <Button size="sm" variant="ghost" className="text-xs" onClick={onLoadMore}>
                Carregar mais...
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <ArrowUpDown className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">
            Nenhuma {direction === 'entradas' ? 'entrada' : 'saída'} registrada
          </p>
          <p className="text-xs text-muted-foreground">
            {direction === 'entradas'
              ? 'Registre compras, recebimentos e ajustes positivos.'
              : 'Requisições, perdas e ajustes negativos aparecerão aqui.'}
          </p>
        </div>
      )}

      {/* ===== DETAIL MODAL ===== */}
      <Dialog open={!!detailMov} onOpenChange={() => setDetailMov(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Detalhes da Movimentação</DialogTitle>
          </DialogHeader>
          {detailMov && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Produto:</span><p className="font-medium text-foreground">{getProdNome(detailMov.produtoId)}</p></div>
                <div><span className="text-muted-foreground">Tipo:</span><p className="font-medium text-foreground">{detailMov.tipo}</p></div>
                <div><span className="text-muted-foreground">Quantidade:</span><p className="font-medium text-foreground">{detailMov.quantidade}</p></div>
                <div><span className="text-muted-foreground">Custo Unit.:</span><p className="font-medium text-foreground">{fmtBRL(detailMov.custoUnitario)}</p></div>
                <div><span className="text-muted-foreground">Custo Total:</span><p className="font-medium text-foreground">{fmtBRL(detailMov.custoTotal)}</p></div>
                <div><span className="text-muted-foreground">Data:</span><p className="font-medium text-foreground">{formatDateValueBR(detailMov.data)}</p></div>
                <div><span className="text-muted-foreground">Origem:</span><p className="font-medium text-foreground">{detailMov.origem || '—'}</p></div>
                <div><span className="text-muted-foreground">Status:</span>
                  <Badge variant={detailMov.status === 'CANCELADO' ? 'destructive' : 'default'} className="text-[9px]">
                    {detailMov.status || 'ATIVO'}
                  </Badge>
                </div>
                <div><span className="text-muted-foreground">Usuário:</span><p className="font-medium text-foreground">{detailMov.createdBy?.slice(0, 8) || '—'}</p></div>
                <div><span className="text-muted-foreground">Criado em:</span><p className="font-medium text-foreground">{detailMov.createdAt?.slice(0, 16).replace('T', ' ')}</p></div>
              </div>
              {detailMov.observacao && (
                <div><span className="text-muted-foreground">Observação:</span><p className="font-medium text-foreground">{detailMov.observacao}</p></div>
              )}
              {detailMov.justificativa_edicao && (
                <div className="bg-primary-soft border border-primary-border rounded-lg p-2">
                  <span className="text-muted-foreground">Última edição:</span>
                  <p className="font-medium text-foreground">{detailMov.justificativa_edicao}</p>
                </div>
              )}
              {detailMov.justificativa_cancelamento && (
                <div className="bg-destructive-soft border border-destructive-border rounded-lg p-2">
                  <span className="text-muted-foreground">Justificativa cancelamento:</span>
                  <p className="font-medium text-foreground">{detailMov.justificativa_cancelamento}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== EDIT MODAL ===== */}
      <Dialog open={!!editMov} onOpenChange={() => setEditMov(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Editar Movimentação</DialogTitle>
          </DialogHeader>
          {editMov && (
            <div className="space-y-3">
              <div className="bg-background-subtle rounded-lg p-2 text-[11px] text-muted-foreground">
                {getProdNome(editMov.produtoId)} • {editMov.tipo} • {formatDateValueBR(editMov.data)}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Quantidade</Label>
                  <DecimalInput value={editForm.quantidade} onValueChange={(raw) => setEditForm(f => ({ ...f, quantidade: raw }))} maxDecimals={2} className="bg-secondary border-border text-foreground" />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Custo unitário</Label>
                  <CurrencyInput value={editForm.custoUnitario} onValueChange={(raw) => setEditForm(f => ({ ...f, custoUnitario: raw }))} showPrefix maxDecimals={2} className="bg-secondary border-border text-foreground" />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Data</Label>
                  <DateInput value={editForm.data} onValueChange={v => setEditForm(f => ({ ...f, data: v }))} className="bg-secondary border-border text-foreground" />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Observação</Label>
                  <Input value={editForm.observacao} onChange={e => setEditForm(f => ({ ...f, observacao: e.target.value }))} className="bg-secondary border-border text-foreground" />
                </div>
              </div>
              <div>
                <Label className="text-[11px] text-destructive font-medium">Justificativa da edição *</Label>
                <Input value={editJustificativa} onChange={e => setEditJustificativa(e.target.value)} maxLength={500} placeholder="Motivo da correção..." className="bg-secondary border-border text-foreground" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setEditMov(null)} disabled={processing}>Cancelar</Button>
            <Button size="sm" className="bg-primary-strong text-primary-foreground border-0" onClick={handleSaveEdit} disabled={processing || !editJustificativa.trim()}>
              {processing ? 'Salvando...' : 'Salvar Edição'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== CANCEL MODAL ===== */}
      <Dialog open={!!cancelMov} onOpenChange={() => setCancelMov(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2 text-destructive">
              <Ban className="w-4 h-4" /> Cancelar Movimentação
            </DialogTitle>
          </DialogHeader>
          {cancelMov && (
            <div className="space-y-3">
              <div className="bg-destructive-soft border border-destructive-border rounded-lg p-3 text-xs space-y-1">
                <p className="font-medium text-foreground">{getProdNome(cancelMov.produtoId)}</p>
                <p className="text-muted-foreground">{cancelMov.tipo} • {formatFixedBR(cancelMov.quantidade, 2)} • {fmtBRL(cancelMov.custoTotal)}</p>
                <p className="text-destructive text-[10px]">⚠️ Será criado um lançamento de estorno inverso. O saldo retornará ao estado anterior.</p>
              </div>
              <div>
                <Label className="text-[11px] text-destructive font-medium">Justificativa obrigatória *</Label>
                <Input value={cancelJustificativa} onChange={e => setCancelJustificativa(e.target.value)} maxLength={500} placeholder="Motivo do cancelamento..." className="bg-secondary border-border text-foreground" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setCancelMov(null)} disabled={processing}>Voltar</Button>
            <Button size="sm" variant="destructive" onClick={handleConfirmCancel} disabled={processing || !cancelJustificativa.trim()}>
              {processing ? 'Processando...' : 'Confirmar Cancelamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
