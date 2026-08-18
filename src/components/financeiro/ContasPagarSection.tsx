import { useState, useEffect, useCallback, useMemo } from 'react';
import type { CursorListResponse, FinStatusCounts } from '@/types/financeiro';
import { emitDataEvent, useDataEvent } from '@/lib/dataEvents';
import { fmtBRL, formatDateBR, parseLocalDate } from '@/lib/formatters';
import { useCan } from '@/permissions/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BRLInput } from '@/components/ui/brl-input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, AlertTriangle, CheckCircle, Clock, Ban, FileDown, RefreshCw, Undo2 } from 'lucide-react';
import { useFormDirtyGuard } from '@/hooks/useFormDirtyGuard';
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';
import { gerarPDFContasPagar } from '@/lib/pdfFinanceiro';
import { todayBR, formatInBR } from '@/lib/datetime';
import TableActions from '@/components/ui/TableActions';
import ContaDetailDialog, { type ContaDetailData, type ContaDetailRateio } from './ContaDetailDialog';
import ContaFormDialog, { type ContaFormData, type RateioLine } from './ContaFormDialog';
import * as XLSX from '@/lib/safeXlsx';
import { mapFinanceiroDeleteError, mapPagamentoError } from '@/lib/financeiroErrorMap';
import { buildCategoryOptions } from '@/lib/categoriaOptions';
import MonthNavigator from './MonthNavigator';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { type FiltroPeriodo, computePeriodoRange } from './periodoFiltro';
import { buildCategoriaFilterOptions, categoriaFiltroToParams, CATEGORIA_FILTRO_TODOS } from './categoriaFiltro';

/* ─── Types ─── */
interface ContaPagar {
  id: string;
  descricao: string;
  fornecedor: string | null;
  valor: number;
  status: string;
  data_vencimento: string;
  categoria_id: string | null;
  updated_at: string;
}

interface Categoria { id: string; nome: string; tipo: string; codigo: string | null; parent_id: string | null; centro_custo_padrao_id: string | null; groupLabel?: string; }
interface Centro { id: string; nome: string; }
interface Conta { id: string; nome: string; }
interface Supplier { id: string; name: string; }

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  RASCUNHO: { label: 'Rascunho', color: 'bg-muted text-muted-foreground', icon: Clock },
  AGUARDANDO_APROVACAO: { label: 'Aguard. Aprovacao', color: 'bg-warning/10 text-warning border-warning/20', icon: Clock },
  APROVADO: { label: 'Aprovado', color: 'bg-primary/10 text-primary border-primary/20', icon: CheckCircle },
  PAGO: { label: 'Pago', color: 'bg-success/10 text-success border-success/20', icon: CheckCircle },
  VENCIDO: { label: 'Vencido', color: 'bg-destructive/10 text-destructive border-destructive/20', icon: AlertTriangle },
  CANCELADO: { label: 'Cancelado', color: 'bg-muted text-muted-foreground', icon: Ban },
};

const PAGE_SIZE = 50;

function SkeletonRows() {
  return (<>{Array.from({ length: 5 }).map((_, i) => (
    <TableRow key={i}>
      {Array.from({ length: 7 }).map((_, j) => (
        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
      ))}
    </TableRow>
  ))}</>);
}

function NoAccess() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Ban className="w-5 h-5 mr-2" /> Acesso negado
    </div>
  );
}

export default function ContasPagarSection() {
  const canView = useCan('financeiro:pagar:view');
  const canCreate = useCan('financeiro:pagar:create');
  const canEdit = useCan('financeiro:pagar:edit');
  const canApprove = useCan('financeiro:pagar:approve');
  const canExport = useCan('financeiro:pagar:export');

  const [items, setItems] = useState<ContaPagar[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [centros, setCentros] = useState<Centro[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>('todos');
  const [mesFiltro, setMesFiltro] = useState(() => formatInBR(new Date(), 'yyyy-MM'));
  const [filtroConta, setFiltroConta] = useState('todos');
  const [filtroCategoria, setFiltroCategoria] = useState(CATEGORIA_FILTRO_TODOS);
  const [hasMore, setHasMore] = useState(false);
  const [cursorDate, setCursorDate] = useState<string | null>(null);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [serverTotals, setServerTotals] = useState({ totalPendente: 0, vencidas: 0 });

  const [form, setForm] = useState<ContaFormData>({
    descricao: '', valor: 0, data_vencimento: todayBR(), data_competencia: '',
    fornecedor: '', supplier_id: '', categoria_id: '', centro_custo_id: '', conta_id: '',
    forma_pagamento: 'boleto', observacoes: '',
    recorrente: false, frequencia: 'mensal', parcelas: 0,
  });
  const [rateioLines, setRateioLines] = useState<RateioLine[]>([]);
  const [editingItem, setEditingItem] = useState<ContaPagar | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  // Detail dialog state
  const [showDetail, setShowDetail] = useState(false);
  const [detailData, setDetailData] = useState<ContaDetailData | null>(null);
  const [detailRawItem, setDetailRawItem] = useState<ContaPagar | null>(null);

  // Seletor de data + conta bancária do pagamento
  const [payOpen, setPayOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<ContaPagar | null>(null);
  const [payDate, setPayDate] = useState<string>(todayBR());
  const [payContaId, setPayContaId] = useState<string>('');
  const [payContaLoading, setPayContaLoading] = useState(false);

  // Limite de aprovação (fin_config) — explica o status "Aguardando Aprovação"
  const [limiteAprovacao, setLimiteAprovacao] = useState<number | null>(null);
  const [limiteOpen, setLimiteOpen] = useState(false);
  const [limiteInput, setLimiteInput] = useState(0);
  const [limiteSaving, setLimiteSaving] = useState(false);

  useEffect(() => { if (canView) load(); }, [canView]);
  useEffect(() => { if (!canView) return; setCursorDate(null); setCursorId(null); setItems([]); loadPage(null, null); loadTotals(); }, [filtroStatus, filtroPeriodo, mesFiltro, filtroConta, filtroCategoria, canView]);
  useDataEvent('financeiro:cadastros', useCallback(() => { if (canView) loadAux(); }, [canView]));
  useDataEvent('financeiro:pagar', useCallback(() => { if (canView) { loadPage(null, null); loadTotals(); } }, [canView]));

  const categoriaFilterOptions = useMemo(
    () => buildCategoriaFilterOptions(categorias.filter(c => c.tipo === 'despesa')),
    [categorias]
  );

  const loadPage = async (cDate: string | null, cId: string | null) => {
    setLoading(true);
    const { de, ate } = computePeriodoRange(filtroPeriodo, mesFiltro);
    const { data, error } = await supabase.rpc('list_fin_contas_pagar_cursor', {
      p_status: filtroStatus !== 'todos' ? filtroStatus : null,
      p_limit: PAGE_SIZE, p_cursor_date: cDate, p_cursor_id: cId,
      p_data_de: de, p_data_ate: ate,
      p_conta_id: filtroConta !== 'todos' ? filtroConta : null,
      ...categoriaFiltroToParams(filtroCategoria),
    } as any);
    if (error) { console.error(error); setLoading(false); return; }
    const result = (data as unknown) as CursorListResponse<ContaPagar> | null;
    const newItems: ContaPagar[] = result?.items || [];
    setHasMore(result?.has_more || false);
    if (!cDate) setItems(newItems); else setItems(prev => [...prev, ...newItems]);
    if (newItems.length > 0) { const last = newItems[newItems.length - 1]; setCursorDate(last.data_vencimento); setCursorId(last.id); }
    setLoading(false);
  };

  const loadTotals = async () => {
    const { data } = await supabase.rpc('get_fin_counts_by_status');
    if (data) { const d = (data as unknown) as FinStatusCounts; setServerTotals({ totalPendente: Number(d.total_pagar_pendente) || 0, vencidas: Number(d.vencidas_pagar) || 0 }); }
  };

  const loadAux = async () => {
    const [catRes, ccRes, contRes, supRes] = await Promise.all([
      supabase.from('fin_categorias').select('id, nome, tipo, codigo, parent_id, centro_custo_padrao_id').eq('ativo', true).order('nome'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('fin_contas').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('suppliers').select('id, name').eq('is_active', true).order('name'),
    ]);
    setCategorias(buildCategoryOptions((catRes.data as Categoria[]) || []));
    setCentros((ccRes.data as Centro[]) || []);
    setContas((contRes.data as Conta[]) || []);
    setSuppliers((supRes.data as Supplier[]) || []);
    loadLimiteAprovacao();
  };

  const loadLimiteAprovacao = async () => {
    const { data, error } = await (supabase.rpc as any)('fin_get_limite_aprovacao_atual');
    if (error) { console.error('[ContasPagarSection.loadLimiteAprovacao]', error); return; }
    setLimiteAprovacao(Number(data) || 0);
  };

  const salvarLimiteAprovacao = async () => {
    if (limiteSaving) return;
    if (limiteInput < 0) { toast.error('O limite não pode ser negativo'); return; }
    setLimiteSaving(true);
    try {
      const { error } = await (supabase.rpc as any)('fin_set_limite_aprovacao', { p_valor: limiteInput });
      if (error) throw error;
      setLimiteAprovacao(limiteInput);
      setLimiteOpen(false);
      toast.success(`Limite atualizado para ${fmtBRL(limiteInput)}. Vale para contas criadas a partir de agora.`);
    } catch (err: unknown) {
      console.error('[ContasPagarSection.salvarLimiteAprovacao]', err);
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar o limite');
    } finally {
      setLimiteSaving(false);
    }
  };

  const load = async () => {
    setCursorDate(null); setCursorId(null);
    await Promise.all([loadPage(null, null), loadAux()]);
    loadTotals();
  };

  /* ─── Detail view ─── */
  const openDetail = async (item: ContaPagar) => {
    try {
      const { data: detail, error: detailErr } = await supabase
        .from('fin_contas_pagar')
        .select('id, descricao, fornecedor, supplier_id, valor, status, data_competencia, data_vencimento, data_pagamento, forma_pagamento, categoria_id, centro_custo_id, conta_id, observacoes, recorrente, recorrencia_config, updated_at')
        .eq('id', item.id)
        .single();
      if (detailErr) throw detailErr;

      const { data: rates } = await supabase
        .from('fin_lancamento_rateios')
        .select('*, fin_categorias(nome), fin_centros_custo(nome)')
        .eq('lancamento_id', item.id);

      const rateios: ContaDetailRateio[] = (rates || []).map((r: any) => ({
        categoria_nome: r.fin_categorias?.nome || categorias.find(c => c.id === r.categoria_id)?.nome || '-',
        centro_custo_nome: r.fin_centros_custo?.nome || centros.find(c => c.id === r.centro_custo_id)?.nome || '',
        valor: r.valor,
        percentual: r.percentual,
      }));

      // If no rateios but has a single categoria, show it
      if (rateios.length === 0 && detail.categoria_id) {
        const catName = categorias.find(c => c.id === detail.categoria_id)?.nome || '-';
        const ccName = detail.centro_custo_id ? centros.find(c => c.id === detail.centro_custo_id)?.nome || '' : '';
        rateios.push({ categoria_nome: catName, centro_custo_nome: ccName, valor: detail.valor, percentual: 100 });
      }

      setDetailData({
        id: detail.id,
        descricao: detail.descricao,
        valor: detail.valor,
        status: detail.status,
        data_competencia: detail.data_competencia || detail.data_vencimento,
        data_vencimento: detail.data_vencimento,
        data_pagamento: detail.data_pagamento,
        forma_pagamento: detail.forma_pagamento,
        fornecedor: detail.fornecedor,
        conta_nome: detail.conta_id ? contas.find(c => c.id === detail.conta_id)?.nome || null : null,
        categoria_nome: detail.categoria_id ? categorias.find(c => c.id === detail.categoria_id)?.nome || null : (rateios.length > 1 ? `${rateios.length} informadas` : null),
        centro_custo_nome: detail.centro_custo_id ? centros.find(c => c.id === detail.centro_custo_id)?.nome || null : null,
        observacoes: detail.observacoes,
        recorrente: detail.recorrente,
        rateios,
        updated_at: detail.updated_at,
      });
      setDetailRawItem(item);
      setShowDetail(true);
    } catch (err: any) {
      toast.error('Erro ao carregar detalhes: ' + err.message);
    }
  };

  /* ─── Form close/reset ─── */
  const handleCloseForm = () => {
    setForm({ descricao: '', valor: 0, data_vencimento: todayBR(), data_competencia: '', fornecedor: '', supplier_id: '', categoria_id: '', centro_custo_id: '', conta_id: '', forma_pagamento: 'boleto', observacoes: '', recorrente: false, frequencia: 'mensal', parcelas: 0 });
    setRateioLines([]);
    setEditingItem(null);
    setShowForm(false);
  };
  const { showConfirm, guardedClose, confirmClose, cancelClose } = useFormDirtyGuard({ current: form, onClose: handleCloseForm });

  if (!canView) return <NoAccess />;

  /* ─── Open edit from detail or table ─── */
  const handleEdit = async (item: ContaPagar) => {
    setLoading(true);
    try {
      const { data: detail, error: detailErr } = await supabase
        .from('fin_contas_pagar')
        .select('id, descricao, fornecedor, supplier_id, valor, status, data_competencia, data_vencimento, data_pagamento, forma_pagamento, categoria_id, centro_custo_id, conta_id, observacoes, recorrente, recorrencia_config, updated_at')
        .eq('id', item.id)
        .single();
      if (detailErr) throw detailErr;

      const { data: rates, error: rateErr } = await supabase
        .from('fin_lancamento_rateios')
        .select('id, categoria_id, centro_custo_id, valor, percentual')
        .eq('lancamento_id', item.id);
      if (rateErr) throw rateErr;

      setEditingItem(detail);
      setForm({
        descricao: detail.descricao,
        valor: detail.valor,
        data_vencimento: detail.data_vencimento,
        data_competencia: detail.data_competencia || '',
        fornecedor: detail.fornecedor || '',
        supplier_id: detail.supplier_id || '',
        categoria_id: detail.categoria_id || '',
        centro_custo_id: detail.centro_custo_id || '',
        conta_id: detail.conta_id || '',
        forma_pagamento: detail.forma_pagamento || 'boleto',
        observacoes: detail.observacoes || '',
        recorrente: detail.recorrente || false,
        frequencia: (detail.recorrencia_config as any)?.frequencia || 'mensal',
        parcelas: (detail.recorrencia_config as any)?.parcelas || 0,
      });
      setRateioLines(rates.map((r: any) => ({
        key: r.id,
        categoria_id: r.categoria_id,
        centro_custo_id: r.centro_custo_id,
        valor: r.valor,
        percentual: r.percentual,
      })));
      setShowDetail(false);
      setShowForm(true);
    } catch (err: any) {
      toast.error('Erro ao carregar detalhes: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (item: ContaPagar) => {
    setIsDeletingId(item.id);
    try {
      const { error } = await (supabase.rpc as any)('_guarded_delete_conta_pagar', {
        p_id: item.id,
        p_expected_updated_at: item.updated_at,
      });
      if (error) throw error;
      toast.success('Conta excluída');
      load();
      emitDataEvent('financeiro:pagar');
    } catch (err: unknown) {
      console.error('[ContasPagarSection.handleDelete]', err);
      toast.error(mapFinanceiroDeleteError(err));
    } finally {
      setIsDeletingId(null);
    }
  };

  /* ─── Save via RPC ─── */
  const save = async () => {
    if (saving) return;
    if (!form.descricao.trim() || form.valor <= 0) { toast.error('Descricao e valor obrigatorios'); return; }
    const rateioValido = rateioLines.length === 0 || Math.abs(form.valor - rateioLines.reduce((s, l) => s + Number(l.valor || 0), 0)) < 0.01;
    if (rateioLines.length > 0 && !rateioValido) { toast.error('Rateio incompleto'); return; }

    setSaving(true);
    try {
      let catId: string | null = null;
      let ccId: string | null = null;
      if (rateioLines.length === 1) { catId = rateioLines[0].categoria_id || null; ccId = rateioLines[0].centro_custo_id || null; }
      else if (form.categoria_id) catId = form.categoria_id;
      if (form.centro_custo_id && !ccId) ccId = form.centro_custo_id;

      let fornecedor: string | null = null;
      if (form.supplier_id) {
        const sup = suppliers.find(s => s.id === form.supplier_id);
        fornecedor = sup?.name || form.fornecedor || null;
      } else if (form.fornecedor) {
        fornecedor = form.fornecedor;
      }

      const rateiosPayload = rateioLines.length > 0
        ? rateioLines.map(r => ({ categoria_id: r.categoria_id || null, centro_custo_id: r.centro_custo_id || null, valor: r.valor, percentual: r.percentual }))
        : [];

      const recorrencia = form.recorrente
        ? { frequencia: form.frequencia, parcelas: form.parcelas || null, parcelas_geradas: 0 }
        : null;

      const { data, error } = await (supabase.rpc as any)(editingItem ? '_guarded_update_conta_pagar' : '_guarded_create_conta_pagar', {
        p_id: editingItem?.id,
        p_descricao: form.descricao,
        p_valor: form.valor,
        p_fornecedor: fornecedor,
        p_supplier_id: form.supplier_id || null,
        p_data_vencimento: form.data_vencimento,
        p_data_competencia: form.data_competencia || form.data_vencimento || null,
        p_categoria_id: catId,
        p_centro_custo_id: ccId,
        p_conta_id: form.conta_id || null,
        p_forma_pagamento: form.forma_pagamento,
        p_observacoes: form.observacoes || null,
        p_rateios: rateiosPayload,
        p_recorrencia: recorrencia || null,
        p_expected_updated_at: editingItem?.updated_at,
      });

      if (error) { toast.error(error.message); return; }
      const result = data as any;
      const statusMsg = editingItem
        ? 'Conta atualizada'
        : result?.status === 'AGUARDANDO_APROVACAO'
          ? 'Conta criada — aguardando aprovacao'
          : 'Conta a pagar criada';
      toast.success(statusMsg);
      handleCloseForm();
      load();
      emitDataEvent('financeiro:pagar');
    } finally {
      setSaving(false);
    }
  };

  /* ─── Approve via RPC ─── */
  const aprovar = async (item?: ContaPagar) => {
    const target = item || detailRawItem;
    if (saving || !target) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('_guarded_aprovar_conta_pagar', {
        p_id: target.id,
        p_expected_updated_at: target.updated_at,
      } as any);
      if (error) { toast.error(error.message); load(); return; }
      toast.success('Aprovado');
      setShowDetail(false);
      load();
      emitDataEvent('financeiro:pagar');
    } finally {
      setSaving(false);
    }
  };

  /* ─── Pay (abre seletor de data + conta antes de confirmar) ─── */
  // A conta é opcional no cadastro do boleto, mas obrigatória na baixa: sem ela o
  // lançamento espelho nasce fora de qualquer conta bancária, some da conciliação
  // e o extrato traz a mesma despesa como nova.
  const abrirPagamento = async (item?: ContaPagar) => {
    const target = item || detailRawItem;
    if (saving || !target) return;
    setPayTarget(target);
    setPayDate(todayBR());
    setPayContaId('');
    setPayOpen(true);

    setPayContaLoading(true);
    try {
      const { data, error } = await supabase
        .from('fin_contas_pagar')
        .select('conta_id')
        .eq('id', target.id)
        .single();
      if (error) throw error;
      if (data?.conta_id) setPayContaId(data.conta_id);
    } catch (err) {
      console.error('[ContasPagarSection.abrirPagamento]', err);
    } finally {
      setPayContaLoading(false);
    }
  };

  const confirmarPagamento = async () => {
    if (saving || !payTarget) return;
    if (!payDate) { toast.error('Informe a data do pagamento'); return; }
    if (!payContaId) { toast.error('Selecione a conta bancária de onde o pagamento saiu'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('pay_conta_pagar', {
        p_id: payTarget.id,
        p_expected_updated_at: payTarget.updated_at,
        p_data_pagamento: payDate,
        p_conta_id: payContaId,
      } as any);
      if (error) {
        console.error('[ContasPagarSection.confirmarPagamento]', error);
        toast.error(mapPagamentoError(error));
        load();
        return;
      }
      toast.success('Pagamento registrado + lancamento gerado');
      setPayOpen(false);
      setShowDetail(false);
      load();
      emitDataEvent('financeiro:pagar');
      emitDataEvent('financeiro:lancamentos');
      emitDataEvent('financeiro:conciliacao');
    } finally {
      setSaving(false);
    }
  };

  /* ─── Estornar ─── */
  const estornar = async (item?: ContaPagar) => {
    const target = item || detailRawItem;
    if (saving || !target) return;
    if (!confirm('Deseja estornar este pagamento? O lancamento espelho sera cancelado e a conta voltara ao status Aprovado.')) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('_guarded_estornar_conta_pagar', { p_id: target.id } as any);
      if (error) { toast.error(error.message); load(); return; }
      toast.success('Pagamento estornado');
      setShowDetail(false);
      load();
      emitDataEvent('financeiro:pagar');
      emitDataEvent('financeiro:lancamentos');
    } finally {
      setSaving(false);
    }
  };

  /* ─── Export ─── */
  const exportExcel = () => {
    const rows = items.map(i => ({
      Descricao: i.descricao,
      Fornecedor: i.fornecedor || '',
      Valor: i.valor,
      Status: STATUS_CONFIG[i.status]?.label || i.status,
      Vencimento: formatDateBR(parseLocalDate(i.data_vencimento)),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contas a Pagar');
    XLSX.writeFile(wb, 'contas_a_pagar.xlsx');
  };

  const fmt = fmtBRL;
  const today = todayBR();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">Contas a Pagar</h2>
          <p className="text-sm text-muted-foreground">
            {serverTotals.vencidas > 0 && <span className="text-destructive font-medium">{serverTotals.vencidas} vencida(s) • </span>}
            Total pendente: {fmt(serverTotals.totalPendente)}
          </p>
          {limiteAprovacao !== null && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Contas acima de <strong>{fmt(limiteAprovacao)}</strong> nascem como “Aguard. Aprovacao”
              {canApprove && (
                <button
                  type="button"
                  className="ml-1 underline underline-offset-2 hover:text-foreground"
                  onClick={() => { setLimiteInput(limiteAprovacao); setLimiteOpen(true); }}
                >
                  alterar limite
                </button>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canExport && (
            <>
              <Button variant="outline" size="sm" onClick={() => gerarPDFContasPagar({ items })} disabled={items.length === 0}>
                <FileDown className="w-4 h-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={exportExcel} disabled={items.length === 0}>
                <FileDown className="w-4 h-4 mr-1" /> Excel
              </Button>
            </>
          )}
          {canCreate && (
            <Button size="sm" onClick={() => { handleCloseForm(); setShowForm(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Nova Conta
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={filtroPeriodo} onValueChange={v => setFiltroPeriodo(v as FiltroPeriodo)}>
          <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="dia">Dia</SelectItem>
            <SelectItem value="semana">Semana</SelectItem>
            <SelectItem value="mes">Mês</SelectItem>
          </SelectContent>
        </Select>
        {filtroPeriodo === 'mes' && (
          <MonthNavigator value={mesFiltro} onChange={setMesFiltro} />
        )}
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="RASCUNHO">Rascunho</SelectItem>
            <SelectItem value="AGUARDANDO_APROVACAO">Aguard. Aprovacao</SelectItem>
            <SelectItem value="APROVADO">Aprovado</SelectItem>
            <SelectItem value="PAGO">Pago</SelectItem>
            <SelectItem value="VENCIDO">Vencido</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroConta} onValueChange={setFiltroConta}>
          <SelectTrigger className="w-48 h-9"><SelectValue placeholder="Conta de pagamento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as contas</SelectItem>
            {contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <SearchableSelect
          value={filtroCategoria}
          onValueChange={v => setFiltroCategoria(v || CATEGORIA_FILTRO_TODOS)}
          options={categoriaFilterOptions}
          placeholder="Categoria"
          searchPlaceholder="Buscar categoria..."
          className="w-52 h-9"
          allowClear={false}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vencimento</TableHead>
            <TableHead>Descricao</TableHead>
            <TableHead>Fornecedor</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Acoes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && items.length === 0 ? (
            <SkeletonRows />
          ) : items.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma conta a pagar</TableCell></TableRow>
          ) : items.map(item => {
            const sc = STATUS_CONFIG[item.status] || STATUS_CONFIG.RASCUNHO;
            const isVencida = item.data_vencimento < today && !['PAGO', 'CANCELADO'].includes(item.status);
            return (
              <TableRow
                key={item.id}
                className={`cursor-pointer hover:bg-muted/50 ${isVencida ? 'bg-destructive/5' : ''}`}
                onClick={() => openDetail(item)}
              >
                <TableCell className={`font-mono text-sm ${isVencida ? 'text-destructive font-bold' : ''}`}>{formatDateBR(parseLocalDate(item.data_vencimento))}</TableCell>
                <TableCell className="font-medium max-w-xs whitespace-normal break-words">{item.descricao}</TableCell>
                <TableCell className="text-muted-foreground">{item.fornecedor || '-'}</TableCell>
                <TableCell className="font-bold text-destructive">{fmt(item.valor)}</TableCell>
                <TableCell><span className={`text-xs px-2 py-0.5 rounded-full border ${sc.color}`}>{sc.label}</span></TableCell>
                <TableCell>
                  <div className="flex gap-1 items-center justify-end" onClick={e => e.stopPropagation()}>
                    {item.status === 'AGUARDANDO_APROVACAO' && canApprove && (
                      <Button size="sm" variant="outline" onClick={() => aprovar(item)} disabled={saving} className="text-xs h-7">Aprovar</Button>
                    )}
                    {item.status === 'APROVADO' && (
                      <Button size="sm" variant="default" onClick={() => abrirPagamento(item)} disabled={saving} className="text-xs h-7">Pagar</Button>
                    )}
                    {item.status === 'PAGO' && (
                      <Button size="sm" variant="outline" onClick={() => estornar(item)} disabled={saving} className="text-xs h-7 text-warning border-warning/30 hover:bg-warning/10">
                        <Undo2 className="w-3 h-3 mr-1" />Estornar
                      </Button>
                    )}
                    {(['RASCUNHO', 'AGUARDANDO_APROVACAO', 'APROVADO', 'VENCIDO'].includes(item.status)) && (
                      <TableActions
                        onEdit={() => handleEdit(item)}
                        onDelete={() => handleDelete(item)}
                        editPermission="financeiro:pagar:edit"
                        deletePermission="financeiro:pagar:delete"
                        isDeleting={isDeletingId === item.id}
                      />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {hasMore && items.length > 0 && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => loadPage(cursorDate, cursorId)} disabled={loading}>
            {loading ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : null}
            Carregar mais
          </Button>
        </div>
      )}

      {/* Detail Dialog */}
      <ContaDetailDialog
        open={showDetail}
        onOpenChange={setShowDetail}
        data={detailData}
        variant="pagar"
        canEdit={canEdit}
        canApprove={canApprove}
        saving={saving}
        onEdit={() => detailRawItem && handleEdit(detailRawItem)}
        onPay={() => abrirPagamento()}
        onEstornar={() => estornar()}
        onAprovar={() => aprovar()}
      />

      {/* Payment Date Dialog */}
      <Dialog open={payOpen} onOpenChange={o => { if (!o) setPayOpen(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar pagamento</DialogTitle>
            <DialogDescription>
              {payTarget ? `${payTarget.descricao} — ${fmt(payTarget.valor)}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Data do pagamento</label>
              <Input type="date" value={payDate} max={todayBR()} onChange={e => setPayDate(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                A competência da conta é preservada no DRE; o fluxo de caixa (DFC) usa esta data.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Conta bancária <span className="text-destructive">*</span>
              </label>
              <SearchableSelect
                value={payContaId}
                onValueChange={v => setPayContaId(v || '')}
                options={contas.map(c => ({ value: c.id, label: c.nome }))}
                placeholder={payContaLoading ? 'Carregando...' : 'De onde saiu o pagamento'}
                searchPlaceholder="Buscar conta..."
                className="w-full"
                allowClear={false}
              />
              <p className="text-xs text-muted-foreground">
                Obrigatória na baixa: é ela que faz o pagamento aparecer na conciliação
                do extrato e evita lançar a mesma despesa duas vezes.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={confirmarPagamento} disabled={saving || !payDate || !payContaId}>
              {saving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : null}
              Confirmar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Form Dialog */}
      <ContaFormDialog
        open={showForm}
        onOpenChange={o => { if (!o) guardedClose(); }}
        variant="pagar"
        form={form}
        onFormChange={setForm}
        rateioLines={rateioLines}
        onRateioLinesChange={setRateioLines}
        categorias={categorias}
        centros={centros}
        contas={contas}
        suppliers={suppliers}
        isEditing={!!editingItem}
        saving={saving}
        onSave={save}
        onClose={guardedClose}
      />

      {/* Limite de aprovação */}
      <Dialog open={limiteOpen} onOpenChange={o => { if (!o) setLimiteOpen(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Limite de aprovação</DialogTitle>
            <DialogDescription>
              Contas a pagar acima deste valor entram como “Aguard. Aprovacao” e precisam
              ser aprovadas antes do pagamento. Abaixo dele, já nascem aprovadas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Valor</label>
            <BRLInput numericValue={limiteInput} onNumericChange={setLimiteInput} showPrefix />
            <p className="text-xs text-muted-foreground">
              Vale para contas criadas ou editadas a partir de agora — não altera o status das existentes.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLimiteOpen(false)} disabled={limiteSaving}>Cancelar</Button>
            <Button onClick={salvarLimiteAprovacao} disabled={limiteSaving}>
              {limiteSaving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FormCloseConfirmDialog open={showConfirm} onConfirmLeave={confirmClose} onCancelLeave={cancelClose} />
    </div>
  );
}
