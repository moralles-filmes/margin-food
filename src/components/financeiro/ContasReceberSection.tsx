import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback, useMemo, useRef, type KeyboardEvent } from 'react';
import type { CursorListResponse, FinStatusCounts } from '@/types/financeiro';
import { useEmitDataEvent, useDataEvent } from '@/lib/dataEvents';
import { fmtBRL, formatDateBR, parseLocalDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { useCan } from '@/permissions/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateInput } from '@/components/ui/DateInput';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import KpiCard from '@/components/ui/KpiCard';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import AccessDenied from '@/components/ui/AccessDenied';
import { kpiGridClassFor, longestValueLength } from '@/components/ui/kpiGrid';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useScopedToast } from '@/hooks/useScopedToast';
import { Plus, FileDown, RefreshCw, Undo2, Search, X, AlertTriangle, Wallet, Filter, Receipt } from 'lucide-react';
import { useFormDirtyGuard } from '@/hooks/useFormDirtyGuard';
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';
import { gerarPDFContasReceber } from '@/lib/pdfFinanceiro';
import { todayBR, formatInBR } from '@/lib/datetime';
import TableActions from '@/components/ui/TableActions';
import ContaDetailDialog, { type ContaDetailData, type ContaDetailRateio } from './ContaDetailDialog';
import ContaFormDialog, { type ContaFormData, type RateioLine } from './ContaFormDialog';
import EscopoSerieDialog, { type EscopoSerie } from './EscopoSerieDialog';
import * as XLSX from '@/lib/safeXlsx';
import { mapFinanceiroDeleteError } from '@/lib/financeiroErrorMap';
import { buildCategoryOptions } from '@/lib/categoriaOptions';
import MonthNavigator, { monthBounds } from './MonthNavigator';
import DateRangePresets from './DateRangePresets';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { buildCategoriaFilterOptions, categoriaFiltroToParams, CATEGORIA_FILTRO_TODOS } from './categoriaFiltro';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getRecurrenceValidationMessage, mensagemEdicaoSerie, mensagemErroEdicaoSerie, temParcelasSeguintes, type ResultadoEdicaoSerie } from '@/domain/financeiro/recurrence';
import { traduzirErroIdempotencia } from '@/domain/financeiro/idempotencia';
import { erroCategoriaObrigatoria } from '@/domain/financeiro/categoriaObrigatoria';
import { useChavesPendentes } from '@/hooks/useChavesPendentes';
import { useTravaEnvio } from '@/hooks/useTravaEnvio';
import { FinKpiGrid, FinScreenHeader, FinSectionGroup } from './finV2Layout';
import { useConteinerEstreito } from './useConteinerEstreito';
import { useRetornoFoco } from './useRetornoFoco';
import { CONTAS_LISTA_LIMITE_PX, colunasDoResumo, contaStatusBadge, contaVencida, contasCaption, totalFiltradoSub } from './contasView';
import { ListaCarregando, ResumoCarregando } from './ContasParts';
import { padronizarTexto } from '@/lib/padronizarTexto';

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
  parcela_atual?: number | null;
  parcela_total?: number | null;
}

interface Categoria { id: string; nome: string; tipo: string; codigo: string | null; parent_id: string | null; centro_custo_padrao_id: string | null; groupLabel?: string; }
interface Centro { id: string; nome: string; }
interface Conta { id: string; nome: string; }
interface SaveContaReceberResult { lancamentos_criados?: number; idempotente?: boolean; }

// Rótulos do Excel (mantidos como antes da V2 para o arquivo não mudar); os selos da tela vêm de `contasView`.
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  RASCUNHO: { label: 'Rascunho', color: 'bg-muted text-muted-foreground' },
  A_RECEBER: { label: 'A Receber', color: 'bg-primary/10 text-primary border-primary/20' },
  RECEBIDO: { label: 'Recebido', color: 'bg-success/10 text-success border-success/20' },
  VENCIDO: { label: 'Vencido', color: 'bg-destructive/10 text-destructive border-destructive/20' },
  CANCELADO: { label: 'Cancelado', color: 'bg-muted text-muted-foreground' },
};

const PAGE_SIZE = 50;

interface ContasReceberSectionProps {
  initialStatus?: string;
}

export default function ContasReceberSection({ initialStatus }: ContasReceberSectionProps = {}) {
  const emitDataEvent = useEmitDataEvent();
  const toast = useScopedToast();
  const supabase = useSupabase();
  const canView = useCan('financeiro:receber:view');
  const canCreate = useCan('financeiro:receber:create');
  const canEdit = useCan('financeiro:receber:edit');
  const canExport = useCan('financeiro:receber:export');
  const canDelete = useCan('financeiro:receber:delete');

  const [items, setItems] = useState<ContaReceber[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [centros, setCentros] = useState<Centro[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Trava síncrona do save: `saving` só chega ao botão no próximo render.
  const salvandoRef = useRef(false);
  // Chaves de idempotência da criação: semente por conteúdo ainda não confirmado.
  const chavesCriacao = useChavesPendentes('conta_receber');
  const [showForm, setShowForm] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState(initialStatus || 'todos');
  const [filtroDataDe, setFiltroDataDe] = useState('');
  const [filtroDataAte, setFiltroDataAte] = useState('');
  const [mesFiltro, setMesFiltro] = useState(() => formatInBR(new Date(), 'yyyy-MM'));
  const [filtroConta, setFiltroConta] = useState('todos');
  const [filtroCategoria, setFiltroCategoria] = useState(CATEGORIA_FILTRO_TODOS);
  const [busca, setBusca] = useState('');
  const buscaAplicada = useDebouncedValue(busca.trim(), 300);
  const [hasMore, setHasMore] = useState(false);
  const [cursorDate, setCursorDate] = useState<string | null>(null);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [serverTotals, setServerTotals] = useState({ totalPendente: 0, vencidas: 0 });
  const [filteredSummary, setFilteredSummary] = useState({ total: 0, count: 0 });
  // Só apresentação: erro de carga nunca vira lista vazia nem R$ 0,00.
  const [totaisStatus, setTotaisStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [listaErro, setListaErro] = useState<null | 'list' | 'more'>(null);
  const [listaRef, listaEstreita] = useConteinerEstreito(CONTAS_LISTA_LIMITE_PX);

  const [form, setForm] = useState<ContaFormData>({
    descricao: '', valor: 0, data_vencimento: todayBR(), data_competencia: '',
    cliente: '', categoria_id: '', centro_custo_id: '', conta_id: '', forma_pagamento: 'pix', observacoes: '',
    recorrente: false, frequencia: 'mensal', parcelas: 0,
  });
  const [rateioLines, setRateioLines] = useState<RateioLine[]>([]);
  const [editingItem, setEditingItem] = useState<ContaReceber | null>(null);
  // Parcela de série em edição: pergunta, ao salvar, se a alteração vale também para as próximas.
  const [escopoSerie, setEscopoSerie] = useState<{ atual: number; total: number } | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  // Detail dialog state
  const [showDetail, setShowDetail] = useState(false);
  const [detailData, setDetailData] = useState<ContaDetailData | null>(null);
  const [detailRawItem, setDetailRawItem] = useState<ContaReceber | null>(null);

  // Seletor de data de recebimento
  const [recOpen, setRecOpen] = useState(false);
  const [recTarget, setRecTarget] = useState<ContaReceber | null>(null);
  const [recDate, setRecDate] = useState<string>(todayBR());

  // Estorno: confirmação em AlertDialog (antes `window.confirm`), com o mesmo texto e a mesma ordem.
  const [estornoAlvo, setEstornoAlvo] = useState<ContaReceber | null>(null);
  const { executar: travaEstorno } = useTravaEnvio();

  // Diálogos abertos por estado devolvem o foco a quem os abriu (D49).
  const retornoRecebimento = useRetornoFoco();
  const retornoEstorno = useRetornoFoco();

  const categoriaFilterOptions = useMemo(
    () => buildCategoriaFilterOptions(categorias.filter(c => c.tipo === 'receita')),
    [categorias]
  );

  const loadPage = useCallback(async (cDate: string | null, cId: string | null) => {
    setLoading(true);
    setListaErro(null);
    const { data, error } = await supabase.rpc('list_fin_contas_receber_cursor', {
      p_status: filtroStatus !== 'todos' ? filtroStatus : null,
      p_limit: PAGE_SIZE, p_cursor_date: cDate, p_cursor_id: cId,
      p_data_de: filtroDataDe || null, p_data_ate: filtroDataAte || null,
      p_conta_id: filtroConta !== 'todos' ? filtroConta : null,
      p_search: buscaAplicada || null,
      ...categoriaFiltroToParams(filtroCategoria),
    } as any);
    if (error) { console.error(error); setListaErro(cDate ? 'more' : 'list'); setLoading(false); return; }
    const result = (data as unknown) as CursorListResponse<ContaReceber> | null;
    const newItems: ContaReceber[] = result?.items || [];
    setHasMore(result?.has_more || false);
    if (!cDate) {
      setItems(newItems);
      setFilteredSummary({
        total: Number(result?.filtered_total) || 0,
        count: Number(result?.filtered_count) || 0,
      });
    } else setItems(prev => [...prev, ...newItems]);
    if (newItems.length > 0) { const last = newItems[newItems.length - 1]; setCursorDate(last.data_vencimento); setCursorId(last.id); }
    setLoading(false);
  }, [supabase, filtroStatus, filtroDataDe, filtroDataAte, filtroConta, buscaAplicada, filtroCategoria]);

  const handleMesChange = (mes: string) => {
    setMesFiltro(mes);
    const { start, end } = monthBounds(mes);
    setFiltroDataDe(start);
    setFiltroDataAte(end);
  };

  const limparFiltros = () => {
    setFiltroStatus('todos');
    setFiltroDataDe('');
    setFiltroDataAte('');
    setFiltroConta('todos');
    setFiltroCategoria(CATEGORIA_FILTRO_TODOS);
    setBusca('');
  };

  const loadTotals = useCallback(async () => {
    setTotaisStatus(atual => (atual === 'ok' ? 'ok' : 'loading'));
    const { data, error } = await supabase.rpc('get_fin_counts_by_status');
    if (data) { const d = (data as unknown) as FinStatusCounts; setServerTotals({ totalPendente: Number(d.total_receber_pendente) || 0, vencidas: Number(d.vencidas_receber) || 0 }); setTotaisStatus('ok'); }
    else { if (error) console.error('[ContasReceberSection.loadTotals]', error); setTotaisStatus('error'); }
  }, [supabase]);

  const loadAux = useCallback(async () => {
    const [catRes, ccRes, contRes] = await Promise.all([
      supabase.from('fin_categorias').select('id, nome, tipo, codigo, parent_id, centro_custo_padrao_id').eq('ativo', true).order('nome'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('fin_contas').select('id, nome').eq('ativo', true).order('nome'),
    ]);
    setCategorias(buildCategoryOptions((catRes.data as Categoria[]) || []));
    setCentros((ccRes.data as Centro[]) || []);
    setContas((contRes.data as Conta[]) || []);
  }, [supabase]);

  useEffect(() => { if (canView) void loadAux(); }, [canView, loadAux]);
  useEffect(() => { if (canView) void loadTotals(); }, [canView, loadTotals]);
  useEffect(() => {
    if (!canView) return;
    setCursorDate(null);
    setCursorId(null);
    setItems([]);
    setFilteredSummary({ total: 0, count: 0 });
    void loadPage(null, null);
  }, [canView, loadPage]);
  useDataEvent('financeiro:cadastros', useCallback(() => { if (canView) void loadAux(); }, [canView, loadAux]));
  useDataEvent('financeiro:receber', useCallback(() => {
    if (canView) void Promise.all([loadPage(null, null), loadTotals()]);
  }, [canView, loadPage, loadTotals]));

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

  if (!canView) return <AccessDenied title="Acesso negado" description="Você não tem permissão para ver as contas a receber." />;

  const handleEdit = async (item: ContaReceber) => {
    setLoading(true);
    try {
      const { data: detail, error: detailErr } = await supabase
        .from('fin_contas_receber')
        .select('id, descricao, cliente, valor, status, data_competencia, data_vencimento, data_recebimento, forma_pagamento, categoria_id, centro_custo_id, conta_id, observacoes, recorrente, recorrencia_config, parcela_atual, parcela_total, updated_at')
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
      emitDataEvent('financeiro:receber');
    } catch (err: unknown) {
      console.error('[ContasReceberSection.handleDelete]', err);
      toast.error(mapFinanceiroDeleteError(err));
    } finally {
      setIsDeletingId(null);
    }
  };

  /* ─── Save via RPC ─── */
  const save = async (escopo?: EscopoSerie) => {
    if (saving || salvandoRef.current) return;
    if (!form.descricao.trim() || form.valor <= 0) { toast.error('Descrição e valor obrigatórios'); return; }
    const recurrenceError = form.recorrente
      ? getRecurrenceValidationMessage(form.frequencia, form.parcelas)
      : null;
    if (recurrenceError) { toast.error(recurrenceError); return; }
    const rateioValido = rateioLines.length === 0 || Math.abs(form.valor - rateioLines.reduce((s, l) => s + Number(l.valor || 0), 0)) < 0.01;
    if (rateioLines.length > 0 && !rateioValido) { toast.error('Rateio incompleto'); return; }
    const erroCategoria = erroCategoriaObrigatoria({ categoriaId: form.categoria_id, rateio: rateioLines });
    if (erroCategoria) { toast.error(erroCategoria); return; }
    if (editingItem && !escopo && temParcelasSeguintes(editingItem)) {
      setEscopoSerie({ atual: Number(editingItem.parcela_atual), total: Number(editingItem.parcela_total) });
      return;
    }
    // "Esta e as próximas": mesma edição, aplicada no banco também às próximas parcelas em aberto.
    const emSerie = Boolean(editingItem) && escopo === 'serie';

    salvandoRef.current = true;
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
        ? { frequencia: form.frequencia, parcelas: form.parcelas, parcelas_geradas: 0 }
        : null;

      const params = {
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
      };
      // Só a criação leva chave: um reenvio não duplica o título nem as N parcelas.
      const payload = editingItem ? params : { ...params, p_idempotency_key: await chavesCriacao.chave(params) };
      // A chave fica com o texto digitado; o banco recebe a descrição padronizada.
      const enviado = { ...payload, p_descricao: padronizarTexto(params.p_descricao) };

      const rpc = !editingItem ? '_guarded_create_conta_receber' : emSerie ? '_guarded_update_conta_receber_serie' : '_guarded_update_conta_receber';
      const { data, error } = await (supabase.rpc as any)(rpc, enviado);

      if (error) {
        console.error('[ContasReceberSection.save]', error);
        toast.error((emSerie ? mensagemErroEdicaoSerie(error) : null) ?? traduzirErroIdempotencia(error.message) ?? error.message);
        return;
      }
      const result = data as (SaveContaReceberResult & ResultadoEdicaoSerie) | null;
      const createdCount = Number(result?.lancamentos_criados) || 1;
      if (!editingItem) chavesCriacao.confirmar(params);
      toast.success(editingItem
        ? emSerie ? mensagemEdicaoSerie(result, 'recebida') : 'Conta atualizada'
        : result?.idempotente
          ? 'Esta conta a receber já estava registrada.'
          : `${createdCount} conta${createdCount > 1 ? 's' : ''} a receber criada${createdCount > 1 ? 's' : ''}`);
      handleCloseForm();
      emitDataEvent('financeiro:receber');
      emitDataEvent('financeiro:lancamentos');
    } finally {
      salvandoRef.current = false;
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
      if (error) { toast.error(error.message); void loadPage(null, null); return; }
      toast.success('Recebimento registrado + lançamento gerado');
      setRecOpen(false);
      setShowDetail(false);
      emitDataEvent('financeiro:receber');
      emitDataEvent('financeiro:lancamentos');
    } finally {
      setSaving(false);
    }
  };

  /* ─── Estornar ─── */
  // Abre a confirmação; nada é gravado antes do clique em "Estornar" no AlertDialog.
  const estornar = (item?: ContaReceber) => {
    const target = item || detailRawItem;
    if (saving || !target) return;
    setEstornoAlvo(target);
  };

  const confirmarEstorno = async () => {
    const target = estornoAlvo;
    if (!target) return;
    await travaEstorno(async () => {
      if (saving) return;
      setSaving(true);
      try {
        const { error } = await supabase.rpc('_guarded_estornar_conta_receber', { p_id: target.id } as any);
        if (error) { toast.error(error.message); void loadPage(null, null); return; }
        toast.success('Recebimento estornado');
        setShowDetail(false);
        emitDataEvent('financeiro:receber');
        emitDataEvent('financeiro:lancamentos');
      } finally {
        setSaving(false);
        setEstornoAlvo(null);
      }
    });
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
  const hasActiveFilters = filtroDataDe !== '' || filtroDataAte !== ''
    || filtroStatus !== 'todos'
    || filtroConta !== 'todos'
    || filtroCategoria !== CATEGORIA_FILTRO_TODOS
    || buscaAplicada.length > 0;

  // ─── Resumo (mesmas fontes: get_fin_counts_by_status e filtered_* da lista) ───
  const filtradoCalculando = loading && items.length === 0;
  // Lista que não carregou não tem total: o card mostra "—", nunca R$ 0,00.
  const filtradoIndisponivel = listaErro === 'list' && items.length === 0;
  const valoresResumo = [
    String(serverTotals.vencidas),
    fmt(serverTotals.totalPendente),
    ...(hasActiveFilters && !filtradoCalculando && !filtradoIndisponivel ? [fmt(filteredSummary.total)] : []),
  ];
  const cardsResumo = 2 + (hasActiveFilters ? 1 : 0);
  const resumoGrid = kpiGridClassFor(longestValueLength(valoresResumo), colunasDoResumo(cardsResumo));

  const temAcoes = (item: ContaReceber) =>
    (['A_RECEBER', 'VENCIDO'].includes(item.status) && canEdit)
    || item.status === 'RECEBIDO'
    || (['A_RECEBER', 'VENCIDO', 'RASCUNHO'].includes(item.status) && (canEdit || canDelete));

  // Mesmos botões e mesmas condições de antes; só ganharam nome acessível com a descrição.
  const acoesDaLinha = (item: ContaReceber, emLista = false) => (
    <div className={cn('flex items-center justify-end gap-1', emLista ? 'flex-wrap' : 'flex-nowrap whitespace-nowrap')}>
      {['A_RECEBER', 'VENCIDO'].includes(item.status) && canEdit && (
        <Button size="sm" variant="default" onClick={() => abrirRecebimento(item)} disabled={saving} className="h-8 text-xs" aria-label={`Receber ${item.descricao}`}>Receber</Button>
      )}
      {item.status === 'RECEBIDO' && (
        <Button size="sm" variant="outline" onClick={() => estornar(item)} disabled={saving} className="h-8 border-warning-border text-xs text-warning hover:bg-warning-soft" aria-label={`Estornar recebimento de ${item.descricao}`}>
          <Undo2 aria-hidden="true" className="w-3 h-3 mr-1" />Estornar
        </Button>
      )}
      {(item.status === 'A_RECEBER' || item.status === 'VENCIDO' || item.status === 'RASCUNHO') && (
        <TableActions
          onEdit={() => handleEdit(item)}
          onDelete={() => handleDelete(item)}
          editPermission="financeiro:receber:edit"
          deletePermission="financeiro:receber:delete"
          isDeleting={isDeletingId === item.id}
          editLabel={`Editar ${item.descricao}`}
          deleteLabel={`Excluir ${item.descricao}`}
        />
      )}
    </div>
  );

  const onRowKeyDown = (e: KeyboardEvent, item: ContaReceber) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void openDetail(item); }
  };

  const vencimentoTexto = (item: ContaReceber, vencida: boolean, prefixo = '') => (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap tabular-nums', vencida ? 'font-semibold text-destructive' : '')}>
      {vencida && <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
      {prefixo}{formatDateBR(parseLocalDate(item.data_vencimento))}
    </span>
  );

  return (
    <div className="space-y-6">
      <FinScreenHeader
        title="Contas a Receber"
        description="Recebimentos previstos: baixa e estorno."
        actions={(
          <>
            {canExport && (
              <>
                <Button variant="outline" size="sm" onClick={() => gerarPDFContasReceber({ items })} disabled={items.length === 0}>
                  <FileDown aria-hidden="true" className="w-4 h-4 mr-1" /> PDF
                </Button>
                <Button variant="outline" size="sm" onClick={exportExcel} disabled={items.length === 0}>
                  <FileDown aria-hidden="true" className="w-4 h-4 mr-1" /> Excel
                </Button>
              </>
            )}
            {canCreate && (
              <Button size="sm" onClick={() => { handleCloseForm(); setShowForm(true); }}>
                <Plus aria-hidden="true" className="w-4 h-4 mr-1" /> Nova Conta
              </Button>
            )}
          </>
        )}
      />

      <FinSectionGroup
        id="cr-resumo"
        title="Resumo"
        caption={hasActiveFilters ? 'Vencidas e pendente: toda a unidade · Total filtrado: filtros aplicados' : 'Toda a unidade, sem filtros'}
      >
        {totaisStatus === 'error' ? (
          <ErrorState compact title="Não foi possível carregar o resumo" onRetry={() => { void loadTotals(); }} />
        ) : totaisStatus === 'loading' ? (
          <ResumoCarregando cards={cardsResumo} className={resumoGrid} />
        ) : (
          <FinKpiGrid className={resumoGrid}>
            <KpiCard
              appearance="summary"
              icon={AlertTriangle}
              label="Vencidas"
              value={String(serverTotals.vencidas)}
              sub="Em aberto com vencimento antes de hoje"
              variant={serverTotals.vencidas > 0 ? 'danger' : 'default'}
              valueTone={serverTotals.vencidas > 0 ? 'negative' : 'default'}
            />
            <KpiCard
              appearance="summary"
              icon={Wallet}
              label="Total pendente"
              value={fmt(serverTotals.totalPendente)}
              sub="Em aberto (não recebidas nem canceladas)"
            />
            {hasActiveFilters && (
              <KpiCard
                appearance="summary"
                icon={Filter}
                label="Total filtrado"
                value={filtradoCalculando ? 'Calculando…' : filtradoIndisponivel ? '—' : fmt(filteredSummary.total)}
                sub={filtradoCalculando ? 'Somando as contas dos filtros aplicados' : filtradoIndisponivel ? 'Indisponível: a lista não carregou' : totalFiltradoSub(filteredSummary.count)}
              />
            )}
          </FinKpiGrid>
        )}
      </FinSectionGroup>

      <div className="space-y-3 rounded-summary border bg-card p-4 shadow-card">
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="cr-data-de" className="text-xs text-muted-foreground">De</Label>
            <DateInput id="cr-data-de" value={filtroDataDe} onValueChange={setFiltroDataDe} className="h-9 w-full text-xs sm:w-36" />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="cr-data-ate" className="text-xs text-muted-foreground">Até</Label>
            <DateInput id="cr-data-ate" value={filtroDataAte} onValueChange={setFiltroDataAte} className="h-9 w-full text-xs sm:w-36" />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="cr-status" className="text-xs text-muted-foreground">Status</Label>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger id="cr-status" className="h-9 w-full sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="A_RECEBER">A Receber</SelectItem>
                <SelectItem value="RECEBIDO">Recebido</SelectItem>
                <SelectItem value="VENCIDO">Vencido</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="cr-conta" className="text-xs text-muted-foreground">Conta</Label>
            <Select value={filtroConta} onValueChange={setFiltroConta}>
              <SelectTrigger id="cr-conta" className="h-9 w-full sm:w-48"><SelectValue placeholder="Conta de pagamento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as contas</SelectItem>
                {contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 flex min-w-0 flex-col gap-1.5 sm:col-span-1">
            <span className="text-xs font-medium leading-none text-muted-foreground">Categoria</span>
            <SearchableSelect
              value={filtroCategoria}
              onValueChange={v => setFiltroCategoria(v || CATEGORIA_FILTRO_TODOS)}
              options={categoriaFilterOptions}
              placeholder="Categoria"
              searchPlaceholder="Buscar categoria..."
              ariaLabel="Categoria"
              className="h-9 w-full sm:w-52"
              allowClear={false}
            />
          </div>
          <div className="col-span-2 flex min-w-0 flex-col gap-1.5 sm:min-w-[220px] sm:max-w-sm sm:flex-1">
            <Label htmlFor="cr-busca" className="text-xs text-muted-foreground">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                id="cr-busca"
                type="search"
                value={busca}
                onChange={event => setBusca(event.target.value)}
                placeholder="Buscar pela descrição..."
                aria-label="Buscar conta a receber pela descrição"
                className="h-9 pl-9"
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <MonthNavigator value={mesFiltro} onChange={handleMesChange} />
          <DateRangePresets
            from={filtroDataDe}
            to={filtroDataAte}
            onChange={(de, ate) => { setFiltroDataDe(de); setFiltroDataAte(ate); }}
          />
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={limparFiltros}
              className="h-8 px-2 text-muted-foreground hover:text-foreground sm:ml-auto"
              aria-label="Limpar todos os filtros"
              title="Limpar todos os filtros"
            >
              <X aria-hidden="true" className="w-4 h-4 mr-1" /> Limpar filtros
            </Button>
          )}
        </div>
      </div>

      <FinSectionGroup id="cr-lista" title="Contas" caption={contasCaption(items.length, filteredSummary.count) || undefined}>
        <div ref={listaRef} className="space-y-3">
          {listaErro === 'list' && items.length === 0 ? (
            <ErrorState title="Não foi possível carregar as contas a receber" onRetry={() => { void loadPage(null, null); }} retrying={loading} />
          ) : loading && items.length === 0 ? (
            <ListaCarregando estreito={listaEstreita} texto="Carregando contas a receber…" />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Nenhuma conta a receber"
              description={hasActiveFilters ? 'Nenhuma conta corresponde aos filtros aplicados.' : 'Use Nova Conta para cadastrar.'}
              actionLabel={hasActiveFilters ? 'Limpar filtros' : undefined}
              onAction={hasActiveFilters ? limparFiltros : undefined}
            />
          ) : listaEstreita ? (
            <ul className="space-y-2">
              {items.map(item => {
                const vencida = contaVencida('receber', item.status, item.data_vencimento, today);
                const badge = contaStatusBadge('receber', item.status, vencida);
                return (
                  <li key={item.id} className={cn('rounded-lg border bg-card', vencida && 'border-destructive-border')}>
                    <button
                      type="button"
                      className="w-full rounded-lg p-3 text-left hover:bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => { void openDetail(item); }}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0 break-words text-sm font-medium text-foreground">{item.descricao}</span>
                        <span className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-success">{fmt(item.valor)}</span>
                      </span>
                      {item.cliente && <span className="mt-1 block break-words text-xs text-muted-foreground">{item.cliente}</span>}
                      <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {vencimentoTexto(item, vencida, 'Vence ')}
                        <StatusBadge status={badge.status} label={badge.label} />
                      </span>
                    </button>
                    {temAcoes(item) && <div className="border-t px-3 py-2">{acoesDaLinha(item, true)}</div>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => {
                  const vencida = contaVencida('receber', item.status, item.data_vencimento, today);
                  const badge = contaStatusBadge('receber', item.status, vencida);
                  return (
                    <TableRow
                      key={item.id}
                      tabIndex={0}
                      className="cursor-pointer hover:bg-card-hover focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                      onClick={() => { void openDetail(item); }}
                      onKeyDown={e => onRowKeyDown(e, item)}
                    >
                      <TableCell className="text-sm">{vencimentoTexto(item, vencida)}</TableCell>
                      <TableCell className="max-w-xs whitespace-normal break-words font-medium">{item.descricao}</TableCell>
                      <TableCell className="text-muted-foreground">{item.cliente || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums text-success">{fmt(item.valor)}</TableCell>
                      <TableCell><StatusBadge status={badge.status} label={badge.label} /></TableCell>
                      <TableCell onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>{acoesDaLinha(item)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {listaErro === 'list' && items.length > 0 && (
            <ErrorState compact title="Não foi possível atualizar a lista" description="A lista abaixo é da última carga." onRetry={() => { void loadPage(null, null); }} retrying={loading} />
          )}
          {listaErro === 'more' && items.length > 0 && (
            <ErrorState compact title="Não foi possível carregar mais contas" onRetry={() => { void loadPage(cursorDate, cursorId); }} retrying={loading} />
          )}

          {hasMore && items.length > 0 && !listaErro && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={() => loadPage(cursorDate, cursorId)} disabled={loading}>
                {loading ? <RefreshCw aria-hidden="true" className="w-4 h-4 mr-1 animate-spin" /> : null}
                Carregar mais
              </Button>
            </div>
          )}
        </div>
      </FinSectionGroup>

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
        <DialogContent className="sm:max-w-sm" {...retornoRecebimento}>
          <DialogHeader>
            <DialogTitle>Registrar recebimento</DialogTitle>
            <DialogDescription>
              {recTarget ? `${recTarget.descricao} — ${fmt(recTarget.valor)}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cr-recebimento-data">Data do recebimento</Label>
            <DateInput id="cr-recebimento-data" value={recDate} max={todayBR()} onValueChange={setRecDate} aria-describedby="cr-recebimento-data-ajuda" />
            <p id="cr-recebimento-data-ajuda" className="text-xs text-muted-foreground">
              A competência da conta é preservada no DRE; o fluxo de caixa (DFC) usa esta data.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRecOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={confirmarRecebimento} disabled={saving || !recDate}>
              {saving ? <RefreshCw aria-hidden="true" className="w-4 h-4 mr-1 animate-spin" /> : null}
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
        onSave={() => { void save(); }}
        onClose={guardedClose}
      />

      <EscopoSerieDialog
        parcela={escopoSerie}
        variant="receber"
        onEscolher={escopo => { setEscopoSerie(null); void save(escopo); }}
        onVoltar={() => setEscopoSerie(null)}
      />

      {/* Estorno */}
      <AlertDialog open={estornoAlvo !== null} onOpenChange={o => { if (!o && !saving) setEstornoAlvo(null); }}>
        <AlertDialogContent {...retornoEstorno}>
          <AlertDialogHeader>
            <AlertDialogTitle>Estornar recebimento?</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja estornar este recebimento? O lançamento espelho será cancelado e a conta voltará ao status A Receber.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {estornoAlvo && (
            <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">
              <span className="font-medium text-foreground">{estornoAlvo.descricao}</span>
              <span className="text-muted-foreground"> — </span>
              <span className="font-semibold tabular-nums text-foreground">{fmt(estornoAlvo.valor)}</span>
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={e => { e.preventDefault(); void confirmarEstorno(); }}>
              {saving ? 'Estornando…' : 'Estornar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FormCloseConfirmDialog open={showConfirm} onConfirmLeave={confirmClose} onCancelLeave={cancelClose} />
    </div>
  );
}
