import { useSupabase } from '@/contexts/CompanyScopeContext';
import { Fragment, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useCan } from '@/permissions';
import { useEmitDataEvent, useDataEvent } from '@/lib/dataEvents';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useScopedToast } from '@/hooks/useScopedToast';
import { fmtBRL, formatDateBR, formatDateValueBR, todayBR, parseLocalDate } from '@/lib/formatters';
import { formatDateISO, formatInBR } from '@/lib/datetime';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/DateInput';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, TrendingDown, ArrowUpRight, RefreshCw, Repeat, ShieldAlert, Download, Edit, Trash2 } from 'lucide-react';
import { useFormDirtyGuard } from '@/hooks/useFormDirtyGuard';
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';
import ContaDetailDialog, { type ContaDetailData, type ContaDetailRateio } from './ContaDetailDialog';
import ContaFormDialog, { type ContaFormData, type RateioLine } from './ContaFormDialog';
import * as XLSX from '@/lib/safeXlsx';
import { buildCategoryOptions } from '@/lib/categoriaOptions';
import { mapFinanceiroDeleteError } from '@/lib/financeiroErrorMap';
import DateRangePresets from './DateRangePresets';
import MonthNavigator, { monthBounds } from './MonthNavigator';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { buildCategoriaFilterOptions, categoriaFiltroToParams, CATEGORIA_FILTRO_TODOS } from './categoriaFiltro';
import { traduzirErroIdempotencia } from '@/domain/financeiro/idempotencia';
import { useChavesPendentes } from '@/hooks/useChavesPendentes';

// ─── Types ───
interface Lancamento {
  id: string;
  tipo: string;
  status: string;
  valor: number;
  descricao: string | null;
  observacoes: string | null;
  conta_id: string | null;
  conta_destino_id: string | null;
  categoria_id: string | null;
  centro_custo_id: string | null;
  data_competencia: string;
  data_ledger: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  forma_pagamento: string | null;
  origem: string;
  recorrente: boolean;
  recorrencia_config: Record<string, unknown> | null;
  conciliado: boolean | null;
  referencia_id: string | null;
  updated_at: string;
  saldo_apos: number | null;
}

interface CategoriaRef { id: string; nome: string; tipo: string; parent_id: string | null; centro_custo_padrao_id: string | null; groupLabel?: string }
interface CentroCustoRef { id: string; nome: string }
interface ContaRef { id: string; nome: string }
type UntypedRpc = (name: string, params: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;


// ─── Helpers ───
function NoAccess() {
  return (
    <div className="bg-card border border-border rounded-xl p-8 text-center">
      <ShieldAlert className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p className="font-medium text-foreground">Acesso negado</p>
      <p className="text-sm text-muted-foreground">Voce nao tem permissao para visualizar lancamentos.</p>
    </div>
  );
}

function SkeletonTableRows() {
  return (
    <>
      {[...Array(5)].map((_, i) => (
        <TableRow key={i}>
          {[...Array(7)].map((_, j) => (
            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

const ORIGEM_LABEL: Record<string, { text: string; cls: string; tooltip: string }> = {
  manual: { text: 'Manual', cls: 'bg-muted text-muted-foreground border-border', tooltip: 'Lancamento criado manualmente no Livro Razao' },
  conciliacao: { text: 'Conciliacao', cls: 'bg-primary/10 text-primary border-primary/20', tooltip: 'Lancamento criado a partir da conciliacao bancaria' },
  espelho_cp: { text: 'Espelho CP', cls: 'bg-warning/10 text-warning-foreground border-warning/20', tooltip: 'Lancamento gerado pela baixa de uma Conta a Pagar' },
  espelho_cr: { text: 'Espelho CR', cls: 'bg-success/10 text-success border-success/20', tooltip: 'Lancamento gerado pelo recebimento de uma Conta a Receber' },
  transferencia: { text: 'Transferencia', cls: 'bg-accent text-accent-foreground border-border', tooltip: 'Movimentacao entre contas financeiras' },
  ajuste_pagamento: { text: 'Ajuste', cls: 'bg-info/10 text-info border-info/20', tooltip: 'Diferenca entre o valor do boleto e o valor debitado no extrato (juros, tarifa ou desconto)' },
};

const STATUS_COLOR: Record<string, string> = {
  PREVISTO: 'bg-warning/10 text-warning-foreground border-warning/20',
  REALIZADO: 'bg-success/10 text-success border-success/20',
  CANCELADO: 'bg-muted text-muted-foreground border-muted',
};

interface LivroRazaoProps {
  initialContaId?: string;
  initialDateFrom?: string;
  initialDateTo?: string;
  initialTipo?: string;
}

const dayHeaderFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'long' });
function formatDayHeaderLabel(date: Date): string {
  return dayHeaderFormatter.format(date);
}
function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function LivroRazaoSection({ initialContaId, initialDateFrom, initialDateTo, initialTipo }: LivroRazaoProps = {}) {
  const emitDataEvent = useEmitDataEvent();
  const toast = useScopedToast();
  const supabase = useSupabase();
  const callUntypedRpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
  const canView = useCan('financeiro:lancamentos:view');
  const canCreate = useCan('financeiro:lancamentos:create');
  const canEdit = useCan('financeiro:lancamentos:edit');
  const canDelete = useCan('financeiro:lancamentos:delete');
  const canExport = useCan('financeiro:lancamentos:export');

  const [items, setItems] = useState<Lancamento[]>([]);
  const [categorias, setCategorias] = useState<CategoriaRef[]>([]);
  const [centros, setCentros] = useState<CentroCustoRef[]>([]);
  const [contas, setContas] = useState<ContaRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Trava síncrona: `saving` só chega ao botão no próximo render, e o save passa
  // por awaits (checagem de duplicidade, confirmação) antes de gravar.
  const salvandoRef = useRef(false);
  // Chaves de idempotência das criações: semente por conteúdo pendente, uma
  // instância por fluxo para lançamento e transferência nunca se misturarem.
  const chavesLancamento = useChavesPendentes('lancamento');
  const chavesTransferencia = useChavesPendentes('transferencia');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editUpdatedAt, setEditUpdatedAt] = useState<string | null>(null);
  const [editPrevStatus, setEditPrevStatus] = useState<string | null>(null);
  const [editClassificationOnly, setEditClassificationOnly] = useState(false);
  const [justificativa, setJustificativa] = useState('');
  const [filtroTipo, setFiltroTipo] = useState(initialTipo || 'todos');
  const [filtroOrigem, setFiltroOrigem] = useState('todos');
  const [filtroConta, setFiltroConta] = useState(initialContaId || 'todos');
  const [filtroCategoria, setFiltroCategoria] = useState(CATEGORIA_FILTRO_TODOS);
  const [filtroDataDe, setFiltroDataDe] = useState(() => {
    if (initialDateFrom) return initialDateFrom;
    const d = new Date(); d.setDate(d.getDate() - 30);
    return formatDateISO(d);
  });
  const [filtroDataAte, setFiltroDataAte] = useState(() => initialDateTo || todayBR());
  const [mesFiltro, setMesFiltro] = useState(() => formatInBR(new Date(), 'yyyy-MM'));

  const handleMesChange = (mes: string) => {
    setMesFiltro(mes);
    const { start, end } = monthBounds(mes);
    setFiltroDataDe(start);
    setFiltroDataAte(end);
  };

  const PAGE_SIZE = 50;
  const [hasMore, setHasMore] = useState(false);
  const [cursorDate, setCursorDate] = useState<string | null>(null);
  const [cursorId, setCursorId] = useState<string | null>(null);

  const [totais, setTotais] = useState({ total_receita: 0, total_despesa: 0, total_transferencia: 0, resultado: 0 });
  const [saldoAtual, setSaldoAtual] = useState(0);

  const [form, setForm] = useState<ContaFormData>({
    tipo: 'DESPESA', valor: 0, data_competencia: todayBR(),
    data_vencimento: '', data_pagamento: '',
    descricao: '', conta_id: '', conta_destino_id: '',
    forma_pagamento: 'pix', status: 'PREVISTO',
    recorrente: false, frequencia: 'mensal', parcelas: 0,
    observacoes: '', categoria_id: '', centro_custo_id: '',
  });
  const [rateioLines, setRateioLines] = useState<RateioLine[]>([]);

  // Detail dialog state
  const [showDetail, setShowDetail] = useState(false);
  const [detailData, setDetailData] = useState<ContaDetailData | null>(null);
  const [detailRawItem, setDetailRawItem] = useState<Lancamento | null>(null);

  const { confirm, ConfirmDialog } = useConfirmDialog();

  // ─── Pagination ───
  const loadPage = useCallback(async (cDate: string | null, cId: string | null) => {
    setLoading(true);
    const { data, error } = await supabase.rpc('list_fin_lancamentos_cursor', {
      p_start: filtroDataDe || null,
      p_end: filtroDataAte || null,
      p_tipo: filtroTipo !== 'todos' ? filtroTipo : null,
      p_conta_id: filtroConta !== 'todos' ? filtroConta : null,
      p_origem: filtroOrigem !== 'todos' ? filtroOrigem : null,
      p_limit: PAGE_SIZE,
      p_cursor_date: cDate,
      p_cursor_id: cId,
      ...categoriaFiltroToParams(filtroCategoria),
    } as any);
    if (error) { console.error(error); setLoading(false); return; }
    const result = data as unknown as { items: Lancamento[]; has_more: boolean } | null;
    const newItems = result?.items || [];
    setHasMore(result?.has_more || false);
    if (!cDate) setItems(newItems);
    else setItems(prev => [...prev, ...newItems]);
    if (newItems.length > 0) {
      const last = newItems[newItems.length - 1];
      setCursorDate(last.data_ledger);
      setCursorId(last.id);
    }
    setLoading(false);
  }, [supabase, filtroDataDe, filtroDataAte, filtroTipo, filtroConta, filtroOrigem, filtroCategoria]);

  const loadTotais = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_fin_lancamentos_totais', {
      p_start: filtroDataDe || null,
      p_end: filtroDataAte || null,
      p_tipo: filtroTipo !== 'todos' ? filtroTipo : null,
      p_conta_id: filtroConta !== 'todos' ? filtroConta : null,
      p_origem: filtroOrigem !== 'todos' ? filtroOrigem : null,
      ...categoriaFiltroToParams(filtroCategoria),
    } as any);
    if (error) { console.error('[LivroRazaoSection.loadTotais]', error); return; }
    const result = data as unknown as { total_receita: number; total_despesa: number; total_transferencia: number; resultado: number } | null;
    setTotais({
      total_receita: Number(result?.total_receita) || 0,
      total_despesa: Number(result?.total_despesa) || 0,
      total_transferencia: Number(result?.total_transferencia) || 0,
      resultado: Number(result?.resultado) || 0,
    });
  }, [supabase, filtroDataDe, filtroDataAte, filtroTipo, filtroConta, filtroOrigem, filtroCategoria]);

  const loadSaldoAtual = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_fin_saldo_atual', {
      p_conta_id: filtroConta !== 'todos' ? filtroConta : null,
      p_data: filtroDataAte || null,
    });
    if (error) { console.error('[LivroRazaoSection.loadSaldoAtual]', error); return; }
    setSaldoAtual(Number(data) || 0);
  }, [filtroConta, filtroDataAte, supabase]);

  const load = useCallback(async () => {
    setCursorDate(null);
    setCursorId(null);
    const [_, catRes, ccRes, contRes] = await Promise.all([
      loadPage(null, null),
      supabase.from('fin_categorias').select('id, nome, tipo, parent_id, centro_custo_padrao_id').eq('ativo', true).order('nome'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('fin_contas').select('id, nome').eq('ativo', true).order('nome'),
      loadTotais(),
      loadSaldoAtual(),
    ]);
    setCategorias(buildCategoryOptions((catRes.data as CategoriaRef[]) || []));
    setCentros((ccRes.data as CentroCustoRef[]) || []);
    setContas((contRes.data as ContaRef[]) || []);
  }, [loadPage, supabase, loadTotais, loadSaldoAtual]);

  useEffect(() => { if (canView) load(); }, [load, canView]);
  useEffect(() => { setCursorDate(null); setCursorId(null); setItems([]); loadPage(null, null); loadTotais(); loadSaldoAtual(); }, [filtroTipo, filtroOrigem, filtroConta, filtroCategoria, filtroDataDe, filtroDataAte, loadPage, loadTotais, loadSaldoAtual]);
  useDataEvent('financeiro:lancamentos', load);

  const categoriaFilterOptions = useMemo(() => buildCategoriaFilterOptions(categorias), [categorias]);

  const fmt = fmtBRL;
  const catNome = (id: string) => categorias.find(c => c.id === id)?.nome || '';
  const contaNome = (id: string) => contas.find(c => c.id === id)?.nome || '-';

  // Saldo de fechamento por dia: primeiro saldo_apos nao-nulo dentro do grupo do dia
  // (items ja vem ordenado data_ledger DESC, id DESC — a 1a linha de cada dia
  // e a transacao mais recente daquele dia). Dias 100% PREVISTO (saldo_apos null em
  // todas as linhas) herdam o saldo do dia conhecido mais recente anterior (carry-forward).
  const dayCloseSaldo = useMemo(() => {
    const order: string[] = [];
    const firstNonNull = new Map<string, number | null>();
    for (const item of items) {
      if (!firstNonNull.has(item.data_ledger)) {
        order.push(item.data_ledger);
        firstNonNull.set(item.data_ledger, null);
      }
      if (firstNonNull.get(item.data_ledger) == null && item.saldo_apos != null) {
        firstNonNull.set(item.data_ledger, item.saldo_apos);
      }
    }
    const result = new Map<string, number | null>();
    let lastKnown: number | null = null;
    for (let i = order.length - 1; i >= 0; i--) {
      const date = order[i];
      const v = firstNonNull.get(date);
      if (v != null) lastKnown = v;
      result.set(date, lastKnown);
    }
    return result;
  }, [items]);

  /* ─── Detail view ─── */
  const openDetail = async (item: Lancamento) => {
    try {
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

      if (rateios.length === 0 && item.categoria_id) {
        rateios.push({
          categoria_nome: catNome(item.categoria_id),
          centro_custo_nome: item.centro_custo_id ? centros.find(c => c.id === item.centro_custo_id)?.nome || '' : '',
          valor: item.valor,
          percentual: 100,
        });
      }

      setDetailData({
        id: item.id,
        descricao: item.descricao || '',
        valor: item.valor,
        status: item.status,
        tipo: item.tipo,
        origem: item.origem,
        data_competencia: item.data_competencia,
        data_vencimento: item.data_vencimento,
        data_pagamento: item.data_pagamento,
        forma_pagamento: item.forma_pagamento,
        conta_nome: item.conta_id ? contaNome(item.conta_id) : null,
        categoria_nome: item.categoria_id ? catNome(item.categoria_id) : (rateios.length > 1 ? `${rateios.length} informadas` : null),
        centro_custo_nome: item.centro_custo_id ? centros.find(c => c.id === item.centro_custo_id)?.nome || null : null,
        observacoes: item.observacoes,
        conciliado: item.conciliado,
        recorrente: item.recorrente,
        rateios,
        updated_at: item.updated_at,
      });
      setDetailRawItem(item);
      setShowDetail(true);
    } catch (err: any) {
      toast.error('Erro ao carregar detalhes: ' + err.message);
    }
  };

  // ─── Form ───
  const resetForm = () => {
    setEditId(null);
    setEditUpdatedAt(null);
    setEditPrevStatus(null);
    setEditClassificationOnly(false);
    setJustificativa('');
    setForm({ tipo: 'DESPESA', valor: 0, data_competencia: todayBR(), data_vencimento: '', data_pagamento: '', descricao: '', conta_id: '', conta_destino_id: '', forma_pagamento: 'pix', status: 'PREVISTO', recorrente: false, frequencia: 'mensal', parcelas: 0, observacoes: '', categoria_id: '', centro_custo_id: '' });
    setRateioLines([]);
    setShowForm(false);
  };
  const { showConfirm, guardedClose, confirmClose, cancelClose } = useFormDirtyGuard({ current: form, onClose: resetForm });

  if (!canView) return <NoAccess />;

  const openEdit = async (item: Lancamento) => {
    if (item.origem === 'espelho_cp') {
      toast.error('Este lancamento foi gerado por uma Conta a Pagar. Edite diretamente em Contas a Pagar.');
      return;
    }
    if (item.origem === 'espelho_cr') {
      toast.error('Este lancamento foi gerado por uma Conta a Receber. Edite diretamente em Contas a Receber.');
      return;
    }
    if (item.conciliado && item.tipo === 'TRANSFERENCIA') {
      toast.error('Transferencias conciliadas nao possuem classificacao contabil editavel.');
      return;
    }

    setEditId(item.id);
    setEditUpdatedAt(item.updated_at);
    setEditPrevStatus(item.status);
    setEditClassificationOnly(!!item.conciliado);
    setJustificativa('');

    // Load rateios from database
    const { data: rates, error: rateErr } = await supabase
      .from('fin_lancamento_rateios')
      .select('id, categoria_id, centro_custo_id, valor, percentual')
      .eq('lancamento_id', item.id);
    if (rateErr) {
      toast.error('Erro ao carregar rateios: ' + rateErr.message);
      return;
    }

    const loadedRateios: RateioLine[] = (rates || []).map((r: any) => ({
      key: r.id,
      categoria_id: r.categoria_id,
      centro_custo_id: r.centro_custo_id || '',
      valor: r.valor,
      percentual: r.percentual,
    }));
    setRateioLines(loadedRateios);

    if (item.tipo === 'TRANSFERENCIA') {
      setForm({
        tipo: 'TRANSFERENCIA', valor: item.valor, data_competencia: item.data_competencia,
        data_vencimento: item.data_vencimento || '', data_pagamento: item.data_pagamento || '',
        descricao: item.observacoes || item.descricao || '', conta_id: item.conta_id || '', conta_destino_id: item.conta_destino_id || '',
        forma_pagamento: 'TRANSFERENCIA', status: item.status, recorrente: false, frequencia: 'mensal', parcelas: 0,
        observacoes: '', categoria_id: '', centro_custo_id: '',
      });
    } else {
      setForm({
        tipo: item.tipo, valor: item.valor, data_competencia: item.data_competencia,
        data_vencimento: item.data_vencimento || '', data_pagamento: item.data_pagamento || '',
        descricao: item.descricao || '', conta_id: item.conta_id || '', conta_destino_id: '',
        forma_pagamento: item.forma_pagamento || 'pix', status: item.status, recorrente: item.recorrente || false, frequencia: 'mensal', parcelas: 0,
        observacoes: item.observacoes || '',
        categoria_id: item.categoria_id || '',
        centro_custo_id: item.centro_custo_id || '',
      });
    }
    setShowDetail(false);
    setShowForm(true);
  };

  const saveReconciledClassification = async () => {
    if (saving || !editId) return;

    const totalRateio = rateioLines.reduce((sum, line) => sum + Number(line.valor || 0), 0);
    const rateioValido = rateioLines.length === 0 || Math.abs(form.valor - totalRateio) < 0.01;

    if (rateioLines.length === 0 && !form.categoria_id) {
      toast.error('Selecione uma categoria.');
      return;
    }
    if (rateioLines.length > 0 && !rateioValido) {
      toast.error(`Rateio incompleto. Ajuste os valores para totalizar ${fmt(form.valor)}.`);
      return;
    }
    if (rateioLines.some(line => !line.categoria_id || Number(line.valor || 0) <= 0)) {
      toast.error('Todas as linhas de rateio precisam de categoria e valor maior que zero.');
      return;
    }
    if (!justificativa.trim()) {
      toast.error('Justificativa obrigatoria para reclassificar um lancamento conciliado.');
      return;
    }

    setSaving(true);
    try {
      const rateiosPayload = rateioLines.map(line => ({
        categoria_id: line.categoria_id,
        centro_custo_id: line.centro_custo_id || null,
        valor: Number(line.valor),
        percentual: line.percentual || null,
        observacao: null,
      }));

      const { error } = await callUntypedRpc('_guarded_update_reconciled_classification', {
        p_id: editId,
        p_categoria_id: rateioLines.length === 0 ? (form.categoria_id || null) : null,
        p_centro_custo_id: rateioLines.length === 0 ? (form.centro_custo_id || null) : null,
        p_observacoes: form.observacoes || null,
        p_rateios: rateiosPayload,
        p_expected_updated_at: editUpdatedAt,
        p_justificativa_edicao: justificativa.trim(),
      });

      if (error) {
        console.error('[LivroRazaoSection.saveReconciledClassification]', error);
        if (error.message?.includes('OPTIMISTIC_LOCK_CONFLICT')) {
          toast.error('Este registro foi alterado por outro usuario. Recarregue a pagina.');
        } else {
          toast.error(error.message);
        }
        return;
      }

      toast.success('Classificacao atualizada sem desfazer a conciliacao.');
      resetForm();
      load();
      emitDataEvent('financeiro:lancamentos');
      emitDataEvent('financeiro:conciliacao');
    } finally {
      setSaving(false);
    }
  };

  const deleteLancamento = async (item: Lancamento) => {
    const ok = await confirm({ title: 'Excluir lancamento', description: 'Tem certeza que deseja excluir este lancamento? Esta acao nao pode ser desfeita.', confirmLabel: 'Excluir', variant: 'destructive' });
    if (!ok) return;
    setSaving(true);
    try {
      if (item.tipo === 'TRANSFERENCIA') {
        const { error } = await supabase.rpc('delete_transfer', { p_lancamento_id: item.id });
        if (error) throw error;
        toast.success('Transferencia excluida');
      } else {
        const { error } = await (supabase.rpc as any)('_guarded_delete_lancamento', {
          p_id: item.id,
          p_expected_updated_at: item.updated_at,
        });
        if (error) throw error;
        toast.success('Lancamento excluido');
      }
      load();
      emitDataEvent('financeiro:lancamentos');
    } catch (err: unknown) {
      console.error('[LivroRazaoSection.deleteLancamento]', err);
      toast.error(mapFinanceiroDeleteError(err));
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (saving || salvandoRef.current) return;
    if (!form.descricao.trim()) { toast.error('Descricao obrigatoria'); return; }

    // === TRANSFER FLOW ===
    if (form.tipo === 'TRANSFERENCIA') {
      if (!form.conta_id || !form.conta_destino_id) { toast.error('Selecione conta origem e destino'); return; }
      if (form.conta_id === form.conta_destino_id) { toast.error('Contas devem ser diferentes'); return; }
      if (!form.valor || form.valor <= 0) { toast.error('Valor obrigatorio'); return; }

      salvandoRef.current = true;
      setSaving(true);
      try {
        if (editId) {
          const { error } = await supabase.rpc('update_transfer', {
            p_lancamento_id: editId,
            p_valor: form.valor,
            p_data_competencia: form.data_competencia,
            p_descricao: form.descricao || '',
            p_conta_origem_id: form.conta_id,
            p_conta_destino_id: form.conta_destino_id,
          });
          if (error) { toast.error(error.message); return; }
          toast.success('Transferencia atualizada (ambos os lados)');
        } else {
          const transferParams = {
            p_conta_origem: form.conta_id,
            p_conta_destino: form.conta_destino_id,
            p_valor: form.valor,
            p_data: form.data_competencia,
            p_descricao: form.descricao || '',
          };
          const { data, error } = await supabase.rpc('create_transfer', {
            ...transferParams,
            p_idempotency_key: await chavesTransferencia.chave(transferParams),
          });
          if (error) {
            console.error('[LivroRazaoSection.createTransfer]', error);
            toast.error(traduzirErroIdempotencia(error.message) ?? error.message);
            return;
          }
          chavesTransferencia.confirmar(transferParams);
          const jaRegistrada = (data as { idempotente?: boolean } | null)?.idempotente === true;
          toast.success(jaRegistrada ? 'Esta transferencia ja estava registrada.' : 'Transferencia registrada com sucesso!');
        }
        resetForm();
        load();
        emitDataEvent('financeiro:lancamentos');
      } finally {
        salvandoRef.current = false;
        setSaving(false);
      }
      return;
    }

    // === NORMAL FLOW ===
    const totalRateio = rateioLines.reduce((s, l) => s + Number(l.valor || 0), 0);
    const diffRateio = (form.valor || 0) - totalRateio;
    const rateioValido = rateioLines.length === 0 || Math.abs(diffRateio) < 0.01;
    const valorFinal = rateioLines.length > 0 ? totalRateio : form.valor;
    if (!valorFinal || valorFinal <= 0) { toast.error('Valor obrigatorio'); return; }
    if (rateioLines.length > 0 && !rateioValido) { toast.error(`Rateio incompleto. Ajuste os valores para totalizar ${fmt(form.valor)}.`); return; }
    if (rateioLines.length > 0 && rateioLines.some(l => !l.categoria_id)) { toast.error('Todas as linhas de rateio precisam de categoria'); return; }

    if (editId && editPrevStatus === 'REALIZADO' && !justificativa.trim()) {
      toast.error('Justificativa obrigatoria para edicao de lancamento REALIZADO.');
      return;
    }

    // Trava antes do primeiro await: a checagem de duplicidade e a confirmação
    // abaixo deixavam um segundo clique passar e gravar dois lançamentos.
    salvandoRef.current = true;
    setSaving(true);
    try {
      // Duplicate check (new only)
      if (!editId) {
        const tolerance = valorFinal * 0.02;
        const cpTable = form.tipo === 'DESPESA' ? 'fin_contas_pagar' : 'fin_contas_receber';
        const statusFilter = form.tipo === 'DESPESA' ? ['AGUARDANDO_APROVACAO', 'APROVADO'] : ['A_RECEBER'];
        const { data: possibleDups } = await supabase.from(cpTable)
          .select('id, descricao, valor, data_vencimento, status')
          .in('status', statusFilter)
          .gte('valor', valorFinal - tolerance)
          .lte('valor', valorFinal + tolerance)
          .limit(5);

        if (possibleDups && possibleDups.length > 0) {
          const dupDescriptions = possibleDups.map((d: { descricao: string; valor: number; data_vencimento: string }) =>
            `- ${d.descricao} — ${fmt(d.valor)} (venc: ${formatDateValueBR(d.data_vencimento)})`
          ).join('\n');
          const proceed = await confirm({
            title: 'Possivel duplicidade detectada',
            description: `Encontramos ${form.tipo === 'DESPESA' ? 'Conta(s) a Pagar' : 'Conta(s) a Receber'} com valor semelhante:\n\n${dupDescriptions}\n\nDeseja criar o lancamento mesmo assim?`,
            confirmLabel: 'Criar mesmo assim',
            variant: 'destructive',
          });
          if (!proceed) return;
        }
      }

      const rateiosPayload = rateioLines.length > 0
        ? rateioLines.map(l => ({
            categoria_id: l.categoria_id,
            centro_custo_id: l.centro_custo_id || null,
            valor: l.valor,
            percentual: l.percentual || null,
            observacao: null,
          }))
        : [];

      const rpcParams: Record<string, unknown> = {
        p_id: editId || null,
        p_tipo: form.tipo,
        p_status: form.status,
        p_valor: valorFinal,
        p_conta_id: form.conta_id || null,
        p_categoria_id: rateioLines.length === 1 ? rateioLines[0].categoria_id : (form.categoria_id || null),
        p_centro_custo_id: rateioLines.length === 1 ? (rateioLines[0].centro_custo_id || null) : (form.centro_custo_id || null),
        p_data_competencia: form.data_competencia,
        p_data_vencimento: form.data_vencimento || null,
        p_data_pagamento: form.data_pagamento || (form.status === 'REALIZADO' ? form.data_competencia : null),
        p_descricao: form.descricao,
        p_observacoes: form.observacoes || null,
        p_forma_pagamento: form.forma_pagamento,
        p_origem: 'manual',
        p_recorrente: form.recorrente,
        p_recorrencia_config: form.recorrente ? JSON.stringify({ frequencia: form.frequencia, parcelas: form.parcelas || null, parcelas_geradas: 0 }) : null,
        p_rateios: rateiosPayload,
        p_updated_at: editUpdatedAt || null,
        p_justificativa_edicao: justificativa.trim() || null,
      };

      // Só a criação leva chave; a edição já é protegida pelo optimistic lock.
      const idempotencyKey = editId ? null : await chavesLancamento.chave(rpcParams);
      const { data, error } = await supabase.rpc('_guarded_upsert_lancamento' as any, { ...rpcParams, p_idempotency_key: idempotencyKey } as any);
      if (error) {
        console.error('[LivroRazaoSection.save]', error);
        if (error.message?.includes('CONFLICT')) {
          toast.error('Este registro foi alterado por outro usuario. Recarregue a pagina.');
        } else {
          toast.error(traduzirErroIdempotencia(error.message) ?? error.message);
        }
        return;
      }

      if (!editId) chavesLancamento.confirmar(rpcParams);
      const jaRegistrado = !editId && (data as { idempotente?: boolean }[] | null)?.[0]?.idempotente === true;
      toast.success(editId
        ? 'Lancamento atualizado'
        : jaRegistrado
          ? 'Este lancamento ja estava registrado.'
          : (form.recorrente ? 'Lancamento recorrente criado!' : 'Lancamento criado'));
      resetForm();
      load();
      emitDataEvent('financeiro:lancamentos');
    } finally {
      salvandoRef.current = false;
      setSaving(false);
    }
  };

  // ─── Export ───
  const exportExcel = () => {
    const rows = items.map(item => ({
      data: formatDateBR(parseLocalDate(item.data_ledger)),
      descricao: item.descricao || '',
      tipo: item.tipo,
      status: item.status,
      conta: contaNome(item.conta_id || ''),
      categoria: catNome(item.categoria_id || ''),
      valor: item.valor,
      origem: item.origem,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lancamentos');
    XLSX.writeFile(wb, 'lancamentos.xlsx');
    toast.success('Exportacao concluida');
  };

  // ─── Render ───
  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-xl font-bold text-foreground">Livro Razao</h2>
            <p className="text-sm text-muted-foreground">Ledger central — registra todas as movimentacoes financeiras realizadas</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <DateInput value={filtroDataDe} onValueChange={setFiltroDataDe} className="w-36 h-9 text-xs" />
            <span className="text-muted-foreground text-xs">ate</span>
            <DateInput value={filtroDataAte} onValueChange={setFiltroDataAte} className="w-36 h-9 text-xs" />
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="RECEITA">Receitas</SelectItem>
                <SelectItem value="DESPESA">Despesas</SelectItem>
                <SelectItem value="TRANSFERENCIA">Transferencias</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroOrigem} onValueChange={setFiltroOrigem}>
              <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas origens</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="conciliacao">Conciliacao</SelectItem>
                <SelectItem value="espelho_cp">Espelho CP</SelectItem>
                <SelectItem value="espelho_cr">Espelho CR</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="ajuste_pagamento">Ajuste de baixa</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroConta} onValueChange={setFiltroConta}>
              <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Conta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas contas</SelectItem>
                {contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <SearchableSelect
              value={filtroCategoria}
              onValueChange={v => setFiltroCategoria(v || CATEGORIA_FILTRO_TODOS)}
              options={categoriaFilterOptions}
              placeholder="Categoria"
              searchPlaceholder="Buscar categoria..."
              className="w-44 h-9"
              allowClear={false}
            />
            {canExport && (
              <Button size="sm" variant="outline" onClick={exportExcel}>
                <Download className="w-4 h-4 mr-1" /> Excel
              </Button>
            )}
            {canCreate && (
              <>
                <Button size="sm" variant="outline" onClick={() => { resetForm(); setForm(f => ({ ...f, tipo: 'DESPESA' })); setShowForm(true); }} disabled={saving}>
                  <TrendingDown className="w-4 h-4 mr-1 text-destructive" /> Nova Despesa
                </Button>
                <Button size="sm" variant="outline" onClick={() => { resetForm(); setForm(f => ({ ...f, tipo: 'RECEITA' })); setShowForm(true); }} disabled={saving}>
                  <TrendingUp className="w-4 h-4 mr-1 text-success" /> Nova Receita
                </Button>
                <Button size="sm" variant="outline" onClick={() => { resetForm(); setForm(f => ({ ...f, tipo: 'TRANSFERENCIA' })); setShowForm(true); }} disabled={saving}>
                  <ArrowUpRight className="w-4 h-4 mr-1" /> Nova Transferencia
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <MonthNavigator value={mesFiltro} onChange={handleMesChange} />
          <DateRangePresets
            from={filtroDataDe}
            to={filtroDataAte}
            onChange={(de, ate) => { setFiltroDataDe(de); setFiltroDataAte(ate); }}
            hideLastNDays
          />
        </div>

        <div className="flex items-center gap-4 flex-wrap text-sm bg-card border border-border rounded-lg px-4 py-2.5">
          {filtroTipo === 'todos' ? (
            <>
              <span className="text-muted-foreground">Entradas: <strong className="text-success">{fmt(totais.total_receita)}</strong></span>
              <span className="text-muted-foreground">Saidas: <strong className="text-destructive">{fmt(totais.total_despesa)}</strong></span>
              <span className="text-muted-foreground">Resultado: <strong className={totais.resultado >= 0 ? 'text-success' : 'text-destructive'}>{fmt(totais.resultado)}</strong></span>
            </>
          ) : filtroTipo === 'RECEITA' ? (
            <span className="text-muted-foreground">Total de entradas: <strong className="text-success">{fmt(totais.total_receita)}</strong></span>
          ) : filtroTipo === 'DESPESA' ? (
            <span className="text-muted-foreground">Total de saidas: <strong className="text-destructive">{fmt(totais.total_despesa)}</strong></span>
          ) : (
            <span className="text-muted-foreground">Total de transferencias: <strong className="text-foreground">{fmt(totais.total_transferencia)}</strong></span>
          )}
          <span className="text-muted-foreground ml-auto">Saldo atual: <strong className={saldoAtual >= 0 ? 'text-foreground' : 'text-destructive'}>{fmt(saldoAtual)}</strong></span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Descricao</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && items.length === 0 ? (
              <SkeletonTableRows />
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum lancamento encontrado</TableCell></TableRow>
            ) : items.map((item, idx) => {
              const orig = ORIGEM_LABEL[item.origem || (item.tipo === 'TRANSFERENCIA' ? 'transferencia' : 'manual')] || ORIGEM_LABEL.manual;
              const isNewDay = idx === 0 || items[idx - 1].data_ledger !== item.data_ledger;
              const diaSaldo = dayCloseSaldo.get(item.data_ledger);
              return (
                <Fragment key={item.id}>
                  {isNewDay && (
                    <TableRow className="hover:bg-transparent border-0">
                      <TableCell colSpan={7} className="p-0">
                        <div className="flex items-center justify-between px-4 py-3 my-1.5 rounded-lg bg-muted/60">
                          <span className="text-sm font-semibold text-foreground">
                            {capitalizeFirst(formatDayHeaderLabel(parseLocalDate(item.data_ledger)))}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            saldo total{' '}
                            <span className={`text-base font-bold ${diaSaldo != null && diaSaldo < 0 ? 'text-destructive' : 'text-foreground'}`}>
                              {diaSaldo != null ? fmt(diaSaldo) : '—'}
                            </span>
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openDetail(item)}
                  >
                  <TableCell className="font-mono text-sm">{formatDateBR(parseLocalDate(item.data_ledger))}</TableCell>
                  <TableCell className="font-medium max-w-xs">
                    {item.recorrente && <Repeat className="w-3 h-3 inline mr-1 text-muted-foreground" />}
                    <span className="whitespace-normal break-words">{item.descricao}</span>
                    {item.tipo === 'TRANSFERENCIA' && item.conta_id && item.conta_destino_id && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <ArrowUpRight className="w-3 h-3" />
                        {contaNome(item.conta_id)} → {contaNome(item.conta_destino_id)}
                      </span>
                    )}
                    {item.conciliado && <span className="text-[10px] text-success ml-1">Conciliado</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.tipo === 'RECEITA' ? 'default' : item.tipo === 'DESPESA' ? 'destructive' : 'outline'}>
                      {item.tipo === 'TRANSFERENCIA' ? 'Transf.' : item.tipo}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border cursor-help ${orig.cls}`}>{orig.text}</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[220px] text-xs">{orig.tooltip}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  {(() => {
                    // Transferencia numa conta filtrada tem direcao definida: entrada (credito) na conta destino,
                    // saida (debito) na conta origem. Sem filtro de conta, a transferencia zera no consolidado
                    // da empresa, entao nao ha sinal correto unico — mantem neutro.
                    const isTransferInto = item.tipo === 'TRANSFERENCIA' && filtroConta !== 'todos' && item.conta_destino_id === filtroConta;
                    const isTransferOutOf = item.tipo === 'TRANSFERENCIA' && filtroConta !== 'todos' && item.conta_id === filtroConta;
                    const isCredit = item.tipo === 'RECEITA' || isTransferInto;
                    const isDebit = item.tipo === 'DESPESA' || isTransferOutOf;
                    const cls = isCredit ? 'text-success' : isDebit ? 'text-destructive' : 'text-foreground';
                    const sign = isCredit ? '+' : isDebit ? '-' : '';
                    return (
                      <TableCell className={`font-bold ${cls}`}>
                        {sign} {fmt(item.valor)}
                      </TableCell>
                    );
                  })()}
                  <TableCell><span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLOR[item.status] || ''}`}>{item.status}</span></TableCell>
                  <TableCell>
                    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                      {canEdit && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(item)} disabled={saving} title={item.conciliado ? 'Editar classificacao' : 'Editar'}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteLancamento(item)} disabled={saving} title="Excluir">
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                </Fragment>
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
      </div>

      {/* Detail Dialog */}
      <ContaDetailDialog
        open={showDetail}
        onOpenChange={setShowDetail}
        data={detailData}
        variant="lancamento"
        canEdit={canEdit}
        saving={saving}
        onEdit={() => detailRawItem && openEdit(detailRawItem)}
      />

      {/* Form Dialog */}
      <ContaFormDialog
        open={showForm}
        onOpenChange={o => { if (!o) guardedClose(); }}
        variant="lancamento"
        form={form}
        onFormChange={setForm}
        rateioLines={rateioLines}
        onRateioLinesChange={setRateioLines}
        categorias={categorias}
        centros={centros}
        contas={contas}
        isEditing={!!editId}
        saving={saving}
        onSave={editClassificationOnly ? saveReconciledClassification : save}
        onClose={guardedClose}
        editPrevStatus={editPrevStatus}
        justificativa={justificativa}
        onJustificativaChange={setJustificativa}
        classificationOnly={editClassificationOnly}
      />

      <FormCloseConfirmDialog open={showConfirm} onConfirmLeave={confirmClose} onCancelLeave={cancelClose} />
      <ConfirmDialog />
    </>
  );
}
