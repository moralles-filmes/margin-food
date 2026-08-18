import { useState, useEffect, useCallback, useMemo } from 'react';
import type { CursorListResponse, FinStatusCounts } from '@/types/financeiro';
import { emitDataEvent, useDataEvent } from '@/lib/dataEvents';
import { fmtBRL, formatDateBR, parseLocalDate } from '@/lib/formatters';
import { useCan } from '@/permissions/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, FileDown, RefreshCw, Ban, Undo2 } from 'lucide-react';
import { useFormDirtyGuard } from '@/hooks/useFormDirtyGuard';
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';
import { gerarPDFContasReceber } from '@/lib/pdfFinanceiro';
import { todayBR, formatInBR } from '@/lib/datetime';
import TableActions from '@/components/ui/TableActions';
import ContaDetailDialog, { type ContaDetailData, type ContaDetailRateio } from './ContaDetailDialog';
import ContaFormDialog, { type ContaFormData, type RateioLine } from './ContaFormDialog';
import * as XLSX from '@/lib/safeXlsx';
import { mapFinanceiroDeleteError } from '@/lib/financeiroErrorMap';
import { buildCategoryOptions } from '@/lib/categoriaOptions';
import MonthNavigator from './MonthNavigator';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { type FiltroPeriodo, computePeriodoRange } from './periodoFiltro';
import { buildCategoriaFilterOptions, categoriaFiltroToParams, CATEGORIA_FILTRO_TODOS } from './categoriaFiltro';

/* ─── Types ─── */
interface ContaReceber {
  id: string;
  descricao: string;
  cliente: string | null;
  valor: number;
  status: string;
  data_vencimento: string;
  categoria_id: string | null;
  updated_at: string;
}

interface Categoria { id: string; nome: string; tipo: string; codigo: string | null; parent_id: string | null; centro_custo_padrao_id: string | null; groupLabel?: string; }
interface Centro { id: string; nome: string; }
interface Conta { id: string; nome: string; }

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  RASCUNHO: { label: 'Rascunho', color: 'bg-muted text-muted-foreground' },
  A_RECEBER: { label: 'A Receber', color: 'bg-primary/10 text-primary border-primary/20' },
  RECEBIDO: { label: 'Recebido', color: 'bg-success/10 text-success border-success/20' },
  VENCIDO: { label: 'Vencido', color: 'bg-destructive/10 text-destructive border-destructive/20' },
  CANCELADO: { label: 'Cancelado', color: 'bg-muted text-muted-foreground' },
};

const PAGE_SIZE = 50;

function SkeletonRows() {
  return (<>{Array.from({ length: 5 }).map((_, i) => (
    <TableRow key={i}>
      {Array.from({ length: 6 }).map((_, j) => (
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

export default function ContasReceberSection() {
  const canView = useCan('financeiro:receber:view');
  const canCreate = useCan('financeiro:receber:create');
  const canEdit = useCan('financeiro:receber:edit');
  const canExport = useCan('financeiro:receber:export');

  const [items, setItems] = useState<ContaReceber[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [centros, setCentros] = useState<Centro[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
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
    cliente: '', categoria_id: '', centro_custo_id: '', conta_id: '', forma_pagamento: 'pix', observacoes: '',
    recorrente: false, frequencia: 'mensal', parcelas: 0,
  });
  const [rateioLines, setRateioLines] = useState<RateioLine[]>([]);
  const [editingItem, setEditingItem] = useState<ContaReceber | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  // Detail dialog state
  const [showDetail, setShowDetail] = useState(false);
  const [detailData, setDetailData] = useState<ContaDetailData | null>(null);
  const [detailRawItem, setDetailRawItem] = useState<ContaReceber | null>(null);

  // Seletor de data de recebimento
  const [recOpen, setRecOpen] = useState(false);
  const [recTarget, setRecTarget] = useState<ContaReceber | null>(null);
  const [recDate, setRecDate] = useState<string>(todayBR());

  useEffect(() => { if (canView) load(); }, [canView]);
  useEffect(() => { if (!canView) return; setCursorDate(null); setCursorId(null); setItems([]); loadPage(null, null); loadTotals(); }, [filtroStatus, filtroPeriodo, mesFiltro, filtroConta, filtroCategoria, canView]);
  useDataEvent('financeiro:cadastros', useCallback(() => { if (canView) loadAux(); }, [canView]));
  useDataEvent('financeiro:receber', useCallback(() => { if (canView) { loadPage(null, null); loadTotals(); } }, [canView]));

  const categoriaFilterOptions = useMemo(
    () => buildCategoriaFilterOptions(categorias.filter(c => c.tipo === 'receita')),
    [categorias]
  );

  const loadPage = async (cDate: string | null, cId: string | null) => {
    setLoading(true);
    const { de, ate } = computePeriodoRange(filtroPeriodo, mesFiltro);
    const { data, error } = await supabase.rpc('list_fin_contas_receber_cursor', {
      p_status: filtroStatus !== 'todos' ? filtroStatus : null,
      p_limit: PAGE_SIZE, p_cursor_date: cDate, p_cursor_id: cId,
      p_data_de: de, p_data_ate: ate,
      p_conta_id: filtroConta !== 'todos' ? filtroConta : null,
      ...categoriaFiltroToParams(filtroCategoria),
    } as any);
    if (error) { console.error(error); setLoading(false); return; }
    const result = (data as unknown) as CursorListResponse<ContaReceber> | null;
    const newItems: ContaReceber[] = result?.items || [];
    setHasMore(result?.has_more || false);
    if (!cDate) setItems(newItems); else setItems(prev => [...prev, ...newItems]);
    if (newItems.length > 0) { const last = newItems[newItems.length - 1]; setCursorDate(last.data_vencimento); setCursorId(last.id); }
    setLoading(false);
  };

  const loadTotals = async () => {
    const { data } = await supabase.rpc('get_fin_counts_by_status');
    if (data) { const d = (data as unknown) as FinStatusCounts; setServerTotals({ totalPendente: Number(d.total_receber_pendente) || 0, vencidas: Number(d.vencidas_receber) || 0 }); }
  };

  const loadAux = async () => {
    const [catRes, ccRes, contRes] = await Promise.all([
      supabase.from('fin_categorias').select('id, nome, tipo, codigo, parent_id, centro_custo_padrao_id').eq('ativo', true).order('nome'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('fin_contas').select('id, nome').eq('ativo', true).order('nome'),
    ]);
    setCategorias(buildCategoryOptions((catRes.data as Categoria[]) || []));
    setCentros((ccRes.data as Centro[]) || []);
    setContas((contRes.data as Conta[]) || []);
  };

  const load = async () => {
    setCursorDate(null); setCursorId(null);
    await Promise.all([loadPage(null, null), loadAux()]);
    loadTotals();
  };

  /* ─── Detail view ─── */
  const openDetail = async (item: ContaReceber) => {
    try {
      const { data: detail, error: detailErr } = await supabase
        .from('fin_contas_receber')
        .select('id, descricao, cliente, valor, status, data_competencia, data_vencimento, data_recebimento, forma_pagamento, categoria_id, centro_custo_id, conta_id, observacoes, recorrente, recorrencia_config, updated_at')
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
        data_pagamento: detail.data_recebimento,
        forma_pagamento: detail.forma_pagamento,
        cliente: detail.cliente,
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
    setForm({ descricao: '', valor: 0, data_vencimento: todayBR(), data_competencia: '', cliente: '', categoria_id: '', centro_custo_id: '', conta_id: '', forma_pagamento: 'pix', observacoes: '', recorrente: false, frequencia: 'mensal', parcelas: 0 });
    setRateioLines([]);
    setEditingItem(null);
    setShowForm(false);
  };
  const { showConfirm, guardedClose, confirmClose, cancelClose } = useFormDirtyGuard({ current: form, onClose: handleCloseForm });

  if (!canView) return <NoAccess />;

  const handleEdit = async (item: ContaReceber) => {
    setLoading(true);
    try {
      const { data: detail, error: detailErr } = await supabase
        .from('fin_contas_receber')
        .select('id, descricao, cliente, valor, status, data_competencia, data_vencimento, data_recebimento, forma_pagamento, categoria_id, centro_custo_id, conta_id, observacoes, recorrente, recorrencia_config, updated_at')
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
        cliente: detail.cliente || '',
        categoria_id: detail.categoria_id || '',
        centro_custo_id: detail.centro_custo_id || '',
        conta_id: detail.conta_id || '',
        forma_pagamento: detail.forma_pagamento || 'pix',
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

  const handleDelete = async (item: ContaReceber) => {
    setIsDeletingId(item.id);
    try {
      const { error } = await (supabase.rpc as any)('_guarded_delete_conta_receber', {
        p_id: item.id,
        p_expected_updated_at: item.updated_at,
      });
      if (error) throw error;
      toast.success('Conta excluída');
      load();
      emitDataEvent('financeiro:receber');
    } catch (err: unknown) {
      console.error('[ContasReceberSection.handleDelete]', err);
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

      const rateiosPayload = rateioLines.length > 0
        ? rateioLines.map(r => ({ categoria_id: r.categoria_id || null, centro_custo_id: r.centro_custo_id || null, valor: r.valor, percentual: r.percentual }))
        : [];

      const recorrencia = form.recorrente
        ? { frequencia: form.frequencia, parcelas: form.parcelas || null, parcelas_geradas: 0 }
        : null;

      const { error } = await (supabase.rpc as any)(editingItem ? '_guarded_update_conta_receber' : '_guarded_create_conta_receber', {
        p_id: editingItem?.id,
        p_descricao: form.descricao,
        p_cliente: form.cliente || null,
        p_valor: form.valor,
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
      toast.success(editingItem ? 'Conta atualizada' : 'Conta a receber criada');
      handleCloseForm();
      load();
      emitDataEvent('financeiro:receber');
      emitDataEvent('financeiro:lancamentos');
    } finally {
      setSaving(false);
    }
  };

  /* ─── Receive (abre seletor de data antes de confirmar) ─── */
  const abrirRecebimento = (item?: ContaReceber) => {
    const target = item || detailRawItem;
    if (saving || !target) return;
    setRecTarget(target);
    setRecDate(todayBR());
    setRecOpen(true);
  };

  const confirmarRecebimento = async () => {
    if (saving || !recTarget) return;
    if (!recDate) { toast.error('Informe a data do recebimento'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('receive_conta_receber', {
        p_id: recTarget.id,
        p_expected_updated_at: recTarget.updated_at,
        p_data_recebimento: recDate,
      });
      if (error) { toast.error(error.message); load(); return; }
      toast.success('Recebimento registrado + lancamento gerado');
      setRecOpen(false);
      setShowDetail(false);
      load();
      emitDataEvent('financeiro:receber');
      emitDataEvent('financeiro:lancamentos');
    } finally {
      setSaving(false);
    }
  };

  /* ─── Estornar ─── */
  const estornar = async (item?: ContaReceber) => {
    const target = item || detailRawItem;
    if (saving || !target) return;
    if (!confirm('Deseja estornar este recebimento? O lancamento espelho sera cancelado e a conta voltara ao status A Receber.')) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('_guarded_estornar_conta_receber', { p_id: target.id } as any);
      if (error) { toast.error(error.message); load(); return; }
      toast.success('Recebimento estornado');
      setShowDetail(false);
      load();
      emitDataEvent('financeiro:receber');
      emitDataEvent('financeiro:lancamentos');
    } finally {
      setSaving(false);
    }
  };

  /* ─── Export ─── */
  const exportExcel = () => {
    const rows = items.map(i => ({
      Descricao: i.descricao,
      Cliente: i.cliente || '',
      Valor: i.valor,
      Status: STATUS_CONFIG[i.status]?.label || i.status,
      Vencimento: formatDateBR(parseLocalDate(i.data_vencimento)),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contas a Receber');
    XLSX.writeFile(wb, 'contas_a_receber.xlsx');
  };

  const fmt = fmtBRL;
  const today = todayBR();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">Contas a Receber</h2>
          <p className="text-sm text-muted-foreground">
            {serverTotals.vencidas > 0 && <span className="text-destructive font-medium">{serverTotals.vencidas} vencida(s) • </span>}
            Total pendente: {fmt(serverTotals.totalPendente)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canExport && (
            <>
              <Button variant="outline" size="sm" onClick={() => gerarPDFContasReceber({ items })} disabled={items.length === 0}>
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
            <SelectItem value="A_RECEBER">A Receber</SelectItem>
            <SelectItem value="RECEBIDO">Recebido</SelectItem>
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
            <TableHead>Cliente</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Acoes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && items.length === 0 ? (
            <SkeletonRows />
          ) : items.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma conta a receber</TableCell></TableRow>
          ) : items.map(item => {
            const sc = STATUS_CONFIG[item.status] || STATUS_CONFIG.RASCUNHO;
            const isVencida = item.data_vencimento < today && !['RECEBIDO', 'CANCELADO'].includes(item.status);
            return (
              <TableRow
                key={item.id}
                className={`cursor-pointer hover:bg-muted/50 ${isVencida ? 'bg-destructive/5' : ''}`}
                onClick={() => openDetail(item)}
              >
                <TableCell className={`font-mono text-sm ${isVencida ? 'text-destructive font-bold' : ''}`}>{formatDateBR(parseLocalDate(item.data_vencimento))}</TableCell>
                <TableCell className="font-medium max-w-xs whitespace-normal break-words">{item.descricao}</TableCell>
                <TableCell className="text-muted-foreground">{item.cliente || '-'}</TableCell>
                <TableCell className="font-bold text-success">{fmt(item.valor)}</TableCell>
                <TableCell><span className={`text-xs px-2 py-0.5 rounded-full border ${sc.color}`}>{sc.label}</span></TableCell>
                <TableCell>
                  <div className="flex gap-1 items-center justify-end" onClick={e => e.stopPropagation()}>
                    {item.status === 'A_RECEBER' && canEdit && (
                      <Button size="sm" variant="default" onClick={() => abrirRecebimento(item)} disabled={saving} className="text-xs h-7">Receber</Button>
                    )}
                    {item.status === 'RECEBIDO' && (
                      <Button size="sm" variant="outline" onClick={() => estornar(item)} disabled={saving} className="text-xs h-7 text-warning border-warning/30 hover:bg-warning/10">
                        <Undo2 className="w-3 h-3 mr-1" />Estornar
                      </Button>
                    )}
                    {(item.status === 'A_RECEBER' || item.status === 'VENCIDO' || item.status === 'RASCUNHO') && (
                      <TableActions
                        onEdit={() => handleEdit(item)}
                        onDelete={() => handleDelete(item)}
                        editPermission="financeiro:receber:edit"
                        deletePermission="financeiro:receber:delete"
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
        variant="receber"
        canEdit={canEdit}
        saving={saving}
        onEdit={() => detailRawItem && handleEdit(detailRawItem)}
        onPay={() => abrirRecebimento()}
        onEstornar={() => estornar()}
      />

      {/* Receive Date Dialog */}
      <Dialog open={recOpen} onOpenChange={o => { if (!o) setRecOpen(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar recebimento</DialogTitle>
            <DialogDescription>
              {recTarget ? `${recTarget.descricao} — ${fmt(recTarget.valor)}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Data do recebimento</label>
            <Input type="date" value={recDate} max={todayBR()} onChange={e => setRecDate(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              A competência da conta é preservada no DRE; o fluxo de caixa (DFC) usa esta data.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={confirmarRecebimento} disabled={saving || !recDate}>
              {saving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : null}
              Confirmar recebimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Form Dialog */}
      <ContaFormDialog
        open={showForm}
        onOpenChange={o => { if (!o) guardedClose(); }}
        variant="receber"
        form={form}
        onFormChange={setForm}
        rateioLines={rateioLines}
        onRateioLinesChange={setRateioLines}
        categorias={categorias}
        centros={centros}
        contas={contas}
        isEditing={!!editingItem}
        saving={saving}
        onSave={save}
        onClose={guardedClose}
      />

      <FormCloseConfirmDialog open={showConfirm} onConfirmLeave={confirmClose} onCancelLeave={cancelClose} />
    </div>
  );
}
