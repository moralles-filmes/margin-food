import { useSupabase } from '@/contexts/CompanyScopeContext';
import { Fragment, useState, useEffect, useCallback, useMemo, useRef, type KeyboardEvent } from 'react';
import { useCan } from '@/permissions';
import { useEmitDataEvent, useDataEvent } from '@/lib/dataEvents';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useScopedToast } from '@/hooks/useScopedToast';
import { fmtBRL, formatDateBR, formatDateValueBR, todayBR, parseLocalDate } from '@/lib/formatters';
import { formatDateISO, formatInBR } from '@/lib/datetime';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/DateInput';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import KpiCard from '@/components/ui/KpiCard';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { kpiGridClassFor, longestValueLength } from '@/components/ui/kpiGrid';
import { cn } from '@/lib/utils';
import {
  TrendingUp, TrendingDown, ArrowUpRight, ArrowLeftRight, RefreshCw, Repeat, ShieldAlert, Download, Edit, Trash2,
  Wallet, Scale, Receipt, CheckCircle2, type LucideIcon,
} from 'lucide-react';
import { useFormDirtyGuard } from '@/hooks/useFormDirtyGuard';
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';
import ContaDetailDialog, { type ContaDetailData, type ContaDetailRateio } from './ContaDetailDialog';
import ContaFormDialog, { type ContaFormCmv, type ContaFormData, type RateioLine } from './ContaFormDialog';
import { fetchCmvConfig } from '@/hooks/useCmvFinanceiro';
import { cmvDoCabecalho, conteudoChaveLancamento, rateiosComCmv } from '@/lib/cmvLancamentoPayload';
import { useNavigationRecord } from '@/hooks/useNavigationRequest';
import * as XLSX from '@/lib/safeXlsx';
import { buildCategoryOptions } from '@/lib/categoriaOptions';
import { mapFinanceiroDeleteError } from '@/lib/financeiroErrorMap';
import DateRangePresets from './DateRangePresets';
import MonthNavigator, { monthBounds } from './MonthNavigator';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { buildCategoriaFilterOptions, categoriaFiltroToParams, CATEGORIA_FILTRO_TODOS } from './categoriaFiltro';
import { traduzirErroIdempotencia } from '@/domain/financeiro/idempotencia';
import { useChavesPendentes } from '@/hooks/useChavesPendentes';
import { FinKpiGrid, FinNote, FinScreenHeader, FinSectionGroup } from './finV2Layout';
import {
  daySaldoLabel,
  formatLedgerPeriodLabel,
  ledgerOrigem,
  ledgerSaldoLabel,
  ledgerStatusBadge,
  ledgerTipoBadge,
} from './livroRazaoView';
import { padronizarTexto } from '@/lib/padronizarTexto';

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

/** Linha de `fin_lancamento_rateios` como a edição a lê (`cmv_incluir` só vem com o recurso no banco). */
interface RateioRow { id: string; categoria_id: string; centro_custo_id: string | null; valor: number; percentual: number; cmv_incluir?: boolean | null }
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
      <p className="text-sm text-muted-foreground">Você não tem permissão para visualizar lançamentos.</p>
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

function SkeletonStackedRows() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-3 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** Estado de um carregamento de apresentação — erro nunca é exibido como zero. */
type LoadStatus = 'loading' | 'ready' | 'error';

/** Cabeçalho de cada dia da lista: data à esquerda, saldo rotulado à direita. */
function DayHeader({ date, saldo, saldoLabel }: { date: string; saldo: number | null | undefined; saldoLabel: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg bg-muted px-4 py-2.5">
      <span className="text-sm font-semibold text-foreground">
        {capitalizeFirst(formatDayHeaderLabel(parseLocalDate(date)))}
      </span>
      <span className="text-xs text-muted-foreground">
        {saldoLabel}{' '}
        <span className={cn('text-sm font-bold tabular-nums', saldo != null && saldo < 0 ? 'text-destructive' : 'text-foreground')}>
          {saldo != null ? fmtBRL(saldo) : '—'}
        </span>
      </span>
    </div>
  );
}

/** Chip de origem; a explicação fica no tooltip ao passar o mouse (o texto do chip já nomeia a origem). */
function OrigemChip({ origem, tipo }: { origem: string | null | undefined; tipo: string }) {
  const orig = ledgerOrigem(origem, tipo);
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn('inline-flex whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-medium cursor-help', orig.className)}>{orig.text}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-xs">{orig.tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

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
  const [editOrigem, setEditOrigem] = useState<string | null>(null);
  const [editClassificationOnly, setEditClassificationOnly] = useState(false);
  const [justificativa, setJustificativa] = useState('');
  // CMV Financeiro: só com o recurso no banco (recursos.lancamentos). Nulo = formulário e payload como antes.
  const [cmvForm, setCmvForm] = useState<ContaFormCmv | null>(null);
  // A edição só envia a decisão se a leu ao abrir; senão o servidor preserva a que existe.
  const cmvLidoNaEdicao = useRef(false);
  const competenciaNaAbertura = useRef<string | null>(null);
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
  // 'refresh' = falhou a 1ª página (a lista na tela é da carga anterior); 'more' = falhou "carregar mais".
  const [listError, setListError] = useState<null | 'refresh' | 'more'>(null);
  const [totaisStatus, setTotaisStatus] = useState<LoadStatus>('loading');
  const [saldoStatus, setSaldoStatus] = useState<LoadStatus>('loading');
  // Filtros do pedido que trouxe os totais/saldo exibidos: a legenda e os rótulos descrevem os
  // números na tela, não o filtro recém-trocado cuja resposta ainda não chegou.
  const [totaisRef, setTotaisRef] = useState<{ de: string; ate: string; tipo: string; conta: string } | null>(null);
  const [saldoRef, setSaldoRef] = useState<{ ate: string; conta: string } | null>(null);
  // Só a resposta do pedido mais recente entra na tela: trocar o mês rápido não deixa a
  // resposta (ou o erro) de um filtro antigo sobrescrever a do filtro atual.
  const pageSeq = useRef(0);
  const totaisSeq = useRef(0);
  const saldoSeq = useRef(0);

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
  // Vindo do CMV: o detalhe só abre depois de categorias/contas/centros carregados, que dão os nomes dele
  // (a tela acabou de montar e o pedido de navegação chega antes dessas listas).
  const [refsCarregadas, setRefsCarregadas] = useState(false);
  const [lancamentoDoCmv, setLancamentoDoCmv] = useState<Lancamento | null>(null);

  const { confirm, ConfirmDialog } = useConfirmDialog();

  // ─── Pagination ───
  const loadPage = useCallback(async (cDate: string | null, cId: string | null) => {
    const seq = ++pageSeq.current;
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
    if (seq !== pageSeq.current) return;
    if (error) { console.error(error); setListError(cDate ? 'more' : 'refresh'); setLoading(false); return; }
    setListError(null);
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
    const seq = ++totaisSeq.current;
    const { data, error } = await supabase.rpc('get_fin_lancamentos_totais', {
      p_start: filtroDataDe || null,
      p_end: filtroDataAte || null,
      p_tipo: filtroTipo !== 'todos' ? filtroTipo : null,
      p_conta_id: filtroConta !== 'todos' ? filtroConta : null,
      p_origem: filtroOrigem !== 'todos' ? filtroOrigem : null,
      ...categoriaFiltroToParams(filtroCategoria),
    } as any);
    if (seq !== totaisSeq.current) return;
    if (error) { console.error('[LivroRazaoSection.loadTotais]', error); setTotaisStatus('error'); return; }
    const result = data as unknown as { total_receita: number; total_despesa: number; total_transferencia: number; resultado: number } | null;
    setTotais({
      total_receita: Number(result?.total_receita) || 0,
      total_despesa: Number(result?.total_despesa) || 0,
      total_transferencia: Number(result?.total_transferencia) || 0,
      resultado: Number(result?.resultado) || 0,
    });
    setTotaisRef({ de: filtroDataDe, ate: filtroDataAte, tipo: filtroTipo, conta: filtroConta });
    setTotaisStatus('ready');
  }, [supabase, filtroDataDe, filtroDataAte, filtroTipo, filtroConta, filtroOrigem, filtroCategoria]);

  const loadSaldoAtual = useCallback(async () => {
    const seq = ++saldoSeq.current;
    const { data, error } = await supabase.rpc('get_fin_saldo_atual', {
      p_conta_id: filtroConta !== 'todos' ? filtroConta : null,
      p_data: filtroDataAte || null,
    });
    if (seq !== saldoSeq.current) return;
    if (error) { console.error('[LivroRazaoSection.loadSaldoAtual]', error); setSaldoStatus('error'); return; }
    setSaldoAtual(Number(data) || 0);
    setSaldoRef({ ate: filtroDataAte, conta: filtroConta });
    setSaldoStatus('ready');
  }, [filtroConta, filtroDataAte, supabase]);

  const load = useCallback(async () => {
    setCursorDate(null);
    setCursorId(null);
    const [_, catRes, ccRes, contRes, , , cmvConfig] = await Promise.all([
      loadPage(null, null),
      supabase.from('fin_categorias').select('id, nome, tipo, parent_id, centro_custo_padrao_id').eq('ativo', true).order('nome'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('fin_contas').select('id, nome').eq('ativo', true).order('nome'),
      loadTotais(),
      loadSaldoAtual(),
      fetchCmvConfig(supabase),
    ]);
    setCategorias(buildCategoryOptions((catRes.data as CategoriaRef[]) || []));
    setCentros((ccRes.data as CentroCustoRef[]) || []);
    setContas((contRes.data as ContaRef[]) || []);
    // Classificação desligada = sem sugestão: a despesa nova nasce pendente (a decisão já gravada continua à vista).
    // `null` = a leitura falhou: a recarga (inclusive por evento de outra aba, com o formulário aberto)
    // mantém a última configuração boa; senão salvar ignoraria a resposta e a competência digitadas.
    // Servidor que responde sem o recurso continua tirando o CMV do formulário.
    if (cmvConfig) {
      setCmvForm(cmvConfig.recursos.lancamentos
        ? {
            ativo: cmvConfig.classificacaoAtiva,
            padroes: cmvConfig.classificacaoAtiva ? new Map(cmvConfig.categorias.map(c => [c.id, c.cmvSugerir])) : new Map(),
          }
        : null);
    }
    setRefsCarregadas(true);
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
    setEditOrigem(null);
    setEditClassificationOnly(false);
    setJustificativa('');
    cmvLidoNaEdicao.current = false;
    competenciaNaAbertura.current = null;
    setForm({ tipo: 'DESPESA', valor: 0, data_competencia: todayBR(), data_vencimento: '', data_pagamento: '', descricao: '', conta_id: '', conta_destino_id: '', forma_pagamento: 'pix', status: 'PREVISTO', recorrente: false, frequencia: 'mensal', parcelas: 0, observacoes: '', categoria_id: '', centro_custo_id: '' });
    setRateioLines([]);
    setShowForm(false);
  };
  const { showConfirm, guardedClose, confirmClose, cancelClose } = useFormDirtyGuard({ current: form, onClose: resetForm });

  // Vindo do CMV (lista de origem): busca o lançamento pelo id, mesmo fora da página carregada.
  useNavigationRecord('financeiro', ['lancamento'], async ({ id }) => {
    if (!canView) return;
    const { data, error } = await supabase.from('fin_lancamentos').select('*').eq('id', id).maybeSingle();
    if (error || !data) {
      if (error) console.error('[LivroRazaoSection.navegacao]', error);
      toast.error('Lançamento não encontrado.');
      return;
    }
    const row = data as unknown as Omit<Lancamento, 'data_ledger' | 'saldo_apos'>;
    setLancamentoDoCmv({ ...row, data_ledger: row.data_pagamento || row.data_competencia, saldo_apos: null });
  });
  // ...e abre o detalhe quando os nomes (categoria, conta, centro) já estão carregados.
  useEffect(() => {
    if (!lancamentoDoCmv || !refsCarregadas) return;
    setLancamentoDoCmv(null);
    void openDetail(lancamentoDoCmv);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openDetail é recriada a cada render e lê o estado desse render.
  }, [lancamentoDoCmv, refsCarregadas]);

  if (!canView) return <NoAccess />;

  const openEdit = async (item: Lancamento) => {
    if (item.origem === 'espelho_cp') {
      toast.error('Este lançamento foi gerado por uma Conta a Pagar. Edite diretamente em Contas a Pagar.');
      return;
    }
    if (item.origem === 'espelho_cr') {
      toast.error('Este lançamento foi gerado por uma Conta a Receber. Edite diretamente em Contas a Receber.');
      return;
    }
    if (item.conciliado && item.tipo === 'TRANSFERENCIA') {
      toast.error('Transferências conciliadas não possuem classificação contábil editável.');
      return;
    }

    setEditId(item.id);
    setEditUpdatedAt(item.updated_at);
    setEditPrevStatus(item.status);
    setEditOrigem(item.origem);
    setEditClassificationOnly(!!item.conciliado);
    setJustificativa('');

    // Rateios e, com o recurso no banco, a decisão do CMV (linhas e cabeçalho).
    const comCmv = Boolean(cmvForm) && item.tipo === 'DESPESA';
    const [ratesRes, cabecalhoRes] = await Promise.all([
      supabase
        .from('fin_lancamento_rateios')
        .select(comCmv ? 'id, categoria_id, centro_custo_id, valor, percentual, cmv_incluir' : 'id, categoria_id, centro_custo_id, valor, percentual')
        .eq('lancamento_id', item.id),
      comCmv
        ? supabase.from('fin_lancamentos').select('cmv_incluir').eq('id', item.id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (ratesRes.error) {
      console.error('[LivroRazaoSection.openEdit]', ratesRes.error);
      toast.error('Erro ao carregar rateios: ' + ratesRes.error.message);
      return;
    }
    // Sem as colunas do CMV na leitura, o salvamento não pode enviar a decisão (gravaria "pendente" por cima).
    cmvLidoNaEdicao.current = comCmv && !cabecalhoRes.error;
    competenciaNaAbertura.current = item.data_competencia;
    const cmvCabecalho = (cabecalhoRes.data as unknown as { cmv_incluir?: boolean | null } | null)?.cmv_incluir ?? null;

    const loadedRateios: RateioLine[] = ((ratesRes.data ?? []) as unknown as RateioRow[]).map(r => ({
      key: r.id,
      id: r.id,
      categoria_id: r.categoria_id,
      centro_custo_id: r.centro_custo_id || '',
      valor: r.valor,
      percentual: r.percentual,
      ...(cmvLidoNaEdicao.current ? { cmv_incluir: r.cmv_incluir ?? null } : {}),
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
        ...(cmvLidoNaEdicao.current ? { cmv_incluir: cmvCabecalho } : {}),
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
      toast.error('Justificativa obrigatória para reclassificar um lançamento conciliado.');
      return;
    }

    setSaving(true);
    try {
      // Decisão e competência só com o recurso no banco; a decisão, só se foi lida ao abrir.
      const enviaCmv = Boolean(cmvForm) && form.tipo === 'DESPESA' && cmvLidoNaEdicao.current;
      const competenciaMudou = Boolean(cmvForm) && Boolean(form.data_competencia)
        && form.data_competencia !== competenciaNaAbertura.current;

      const { error } = await callUntypedRpc('_guarded_update_reconciled_classification', {
        p_id: editId,
        p_categoria_id: rateioLines.length === 0 ? (form.categoria_id || null) : null,
        p_centro_custo_id: rateioLines.length === 0 ? (form.centro_custo_id || null) : null,
        p_observacoes: form.observacoes || null,
        p_rateios: rateiosComCmv(rateioLines, enviaCmv),
        p_expected_updated_at: editUpdatedAt,
        p_justificativa_edicao: justificativa.trim(),
        ...cmvDoCabecalho(rateioLines.length > 0, form.cmv_incluir, enviaCmv),
        ...(competenciaMudou ? { p_data_competencia: form.data_competencia } : {}),
      });

      if (error) {
        console.error('[LivroRazaoSection.saveReconciledClassification]', error);
        if (error.message?.includes('OPTIMISTIC_LOCK_CONFLICT')) {
          toast.error('Este registro foi alterado por outro usuário. Recarregue a página.');
        } else {
          toast.error(error.message);
        }
        return;
      }

      toast.success('Classificação atualizada sem desfazer a conciliação.');
      resetForm();
      load();
      emitDataEvent('financeiro:lancamentos');
      emitDataEvent('financeiro:conciliacao');
    } finally {
      setSaving(false);
    }
  };

  const deleteLancamento = async (item: Lancamento) => {
    const ok = await confirm({ title: 'Excluir lançamento', description: 'Tem certeza que deseja excluir este lançamento? Esta ação não pode ser desfeita.', confirmLabel: 'Excluir', variant: 'destructive' });
    if (!ok) return;
    setSaving(true);
    try {
      if (item.tipo === 'TRANSFERENCIA') {
        const { error } = await supabase.rpc('delete_transfer', { p_lancamento_id: item.id });
        if (error) throw error;
        toast.success('Transferência excluída');
      } else {
        const { error } = await (supabase.rpc as any)('_guarded_delete_lancamento', {
          p_id: item.id,
          p_expected_updated_at: item.updated_at,
        });
        if (error) throw error;
        toast.success('Lançamento excluído');
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
    if (!form.descricao.trim()) { toast.error('Descrição obrigatória'); return; }

    // === TRANSFER FLOW ===
    if (form.tipo === 'TRANSFERENCIA') {
      if (!form.conta_id || !form.conta_destino_id) { toast.error('Selecione conta origem e destino'); return; }
      if (form.conta_id === form.conta_destino_id) { toast.error('Contas devem ser diferentes'); return; }
      if (!form.valor || form.valor <= 0) { toast.error('Valor obrigatório'); return; }

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
          toast.success('Transferência atualizada (ambos os lados)');
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
          toast.success(jaRegistrada ? 'Esta transferência já estava registrada.' : 'Transferência registrada com sucesso!');
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
    if (!valorFinal || valorFinal <= 0) { toast.error('Valor obrigatório'); return; }
    if (rateioLines.length > 0 && !rateioValido) { toast.error(`Rateio incompleto. Ajuste os valores para totalizar ${fmt(form.valor)}.`); return; }
    if (rateioLines.length > 0 && rateioLines.some(l => !l.categoria_id)) { toast.error('Todas as linhas de rateio precisam de categoria'); return; }

    if (editId && editPrevStatus === 'REALIZADO' && !justificativa.trim()) {
      toast.error('Justificativa obrigatória para edição de lançamento REALIZADO.');
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
            title: 'Possível duplicidade detectada',
            description: `Encontramos ${form.tipo === 'DESPESA' ? 'Conta(s) a Pagar' : 'Conta(s) a Receber'} com valor semelhante:\n\n${dupDescriptions}\n\nDeseja criar o lançamento mesmo assim?`,
            confirmLabel: 'Criar mesmo assim',
            variant: 'destructive',
          });
          if (!proceed) return;
        }
      }

      // Decisão do CMV: só com o recurso, só despesa e, na edição, só se foi lida ao abrir.
      const enviaCmv = Boolean(cmvForm) && form.tipo === 'DESPESA' && (!editId || cmvLidoNaEdicao.current);
      const rateiosPayload = rateiosComCmv(rateioLines, enviaCmv);

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
        ...cmvDoCabecalho(rateioLines.length > 0, form.cmv_incluir, enviaCmv),
      };

      // Só a criação leva chave; a edição já é protegida pelo optimistic lock. A resposta do
      // CMV fica fora da chave (o servidor não a compara no reenvio): trocar Sim/Não depois de
      // uma resposta perdida não pode virar outra operação.
      const conteudoChave = conteudoChaveLancamento(rpcParams);
      const idempotencyKey = editId ? null : await chavesLancamento.chave(conteudoChave);
      // A chave fica com o texto digitado. Lançamento vindo do extrato mantém o texto do banco.
      const descricaoEnviada = editId && editOrigem !== 'manual' ? form.descricao : padronizarTexto(form.descricao);
      const { data, error } = await supabase.rpc('_guarded_upsert_lancamento' as any, { ...rpcParams, p_descricao: descricaoEnviada, p_idempotency_key: idempotencyKey } as any);
      if (error) {
        console.error('[LivroRazaoSection.save]', error);
        if (error.message?.includes('CONFLICT')) {
          toast.error('Este registro foi alterado por outro usuário. Recarregue a página.');
        } else {
          toast.error(traduzirErroIdempotencia(error.message) ?? error.message);
        }
        return;
      }

      if (!editId) chavesLancamento.confirmar(conteudoChave);
      const jaRegistrado = !editId && (data as { idempotente?: boolean }[] | null)?.[0]?.idempotente === true;
      toast.success(editId
        ? 'Lançamento atualizado'
        : jaRegistrado
          ? 'Este lançamento já estava registrado.'
          : (form.recorrente ? 'Lançamento recorrente criado!' : 'Lançamento criado'));
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

  // ─── Presentation ───
  // Transferência numa conta filtrada tem direção definida: entrada (crédito) na conta destino,
  // saída (débito) na conta origem. Sem filtro de conta, a transferência zera no consolidado
  // da empresa, então não há sinal correto único — mantém neutro.
  const valorDisplay = (item: Lancamento) => {
    const isTransferInto = item.tipo === 'TRANSFERENCIA' && filtroConta !== 'todos' && item.conta_destino_id === filtroConta;
    const isTransferOutOf = item.tipo === 'TRANSFERENCIA' && filtroConta !== 'todos' && item.conta_id === filtroConta;
    const isCredit = item.tipo === 'RECEITA' || isTransferInto;
    const isDebit = item.tipo === 'DESPESA' || isTransferOutOf;
    const cls = isCredit ? 'text-success' : isDebit ? 'text-destructive' : 'text-foreground';
    const sign = isCredit ? '+' : isDebit ? '-' : '';
    return { cls, text: sign ? `${sign} ${fmt(item.valor)}` : fmt(item.valor) };
  };

  const hasRowFilter = filtroTipo !== 'todos' || filtroOrigem !== 'todos' || filtroCategoria !== CATEGORIA_FILTRO_TODOS;
  const saldoDoDiaLabel = daySaldoLabel(hasRowFilter);
  const totaisTipo = totaisRef?.tipo ?? filtroTipo;
  const totaisPeriodoLabel = formatLedgerPeriodLabel(totaisRef?.de ?? filtroDataDe, totaisRef?.ate ?? filtroDataAte);
  const saldoAte = saldoRef?.ate ?? filtroDataAte;
  const saldoConta = saldoRef?.conta ?? filtroConta;
  const contaSelecionada = saldoConta === 'todos'
    ? 'Contas ativas'
    : contas.find(c => c.id === saldoConta)?.nome ?? 'Conta selecionada';
  // get_fin_lancamentos_totais soma realizados e previstos; get_fin_saldo_atual só realizados.
  const TOTAIS_SUB = 'Realizados e previstos';
  // Com filtro de conta, a RPC de totais só soma as transferências que saem da conta.
  const transferenciasDaConta = (totaisRef?.conta ?? filtroConta) !== 'todos';

  type TotalCard = { key: string; label: string; value: number; icon: LucideIcon; tone: 'default' | 'positive' | 'negative'; sub: string };
  const totalCards: TotalCard[] = totaisTipo === 'todos'
    ? [
        { key: 'entradas', label: 'Entradas', value: totais.total_receita, icon: TrendingUp, tone: 'positive', sub: TOTAIS_SUB },
        { key: 'saidas', label: 'Saídas', value: totais.total_despesa, icon: TrendingDown, tone: 'negative', sub: TOTAIS_SUB },
        { key: 'resultado', label: 'Resultado', value: totais.resultado, icon: Scale, tone: totais.resultado >= 0 ? 'positive' : 'negative', sub: TOTAIS_SUB },
      ]
    : totaisTipo === 'RECEITA'
      ? [{ key: 'entradas', label: 'Total de entradas', value: totais.total_receita, icon: TrendingUp, tone: 'positive', sub: TOTAIS_SUB }]
      : totaisTipo === 'DESPESA'
        ? [{ key: 'saidas', label: 'Total de saídas', value: totais.total_despesa, icon: TrendingDown, tone: 'negative', sub: TOTAIS_SUB }]
        : [transferenciasDaConta
            ? { key: 'transferencias', label: 'Transferências enviadas pela conta', value: totais.total_transferencia, icon: ArrowLeftRight, tone: 'default', sub: 'As recebidas não entram neste total' }
            : { key: 'transferencias', label: 'Total de transferências', value: totais.total_transferencia, icon: ArrowLeftRight, tone: 'default', sub: TOTAIS_SUB }];
  const cardCount = totalCards.length + 1;
  const totaisGrid = kpiGridClassFor(
    longestValueLength([...totalCards.map(c => fmt(c.value)), fmt(saldoAtual)]),
    cardCount === 4 ? 4 : 2,
  );
  const retryTotais = () => {
    setTotaisStatus('loading');
    setSaldoStatus('loading');
    loadTotais();
    loadSaldoAtual();
  };

  const openNew = (tipo: 'DESPESA' | 'RECEITA' | 'TRANSFERENCIA') => {
    resetForm();
    setForm(f => ({ ...f, tipo }));
    setShowForm(true);
  };

  // Sem editar nem excluir, a coluna "Ações" não aparece (antes ficava vazia).
  const hasRowActions = canEdit || canDelete;
  const tableColumns = hasRowActions ? 7 : 6;

  const rowActions = (item: Lancamento, vertical = false) => (
    <div className={cn('flex justify-end gap-1', vertical && 'flex-col')} onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      {canEdit && (
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => openEdit(item)}
          disabled={saving}
          title={item.conciliado ? 'Editar classificação' : 'Editar'}
          aria-label={item.conciliado ? `Editar classificação de ${item.descricao}` : `Editar lançamento ${item.descricao}`}
        >
          <Edit aria-hidden="true" className="w-3.5 h-3.5" />
        </Button>
      )}
      {canDelete && (
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => deleteLancamento(item)}
          disabled={saving}
          title="Excluir"
          aria-label={`Excluir lançamento ${item.descricao}`}
        >
          <Trash2 aria-hidden="true" className="w-3.5 h-3.5 text-destructive" />
        </Button>
      )}
    </div>
  );

  const descricaoBlock = (item: Lancamento) => (
    <>
      {item.recorrente && <Repeat role="img" aria-label="Recorrente" className="w-3 h-3 inline mr-1 text-muted-foreground" />}
      <span className="whitespace-normal break-words">{item.descricao}</span>
      {item.tipo === 'TRANSFERENCIA' && item.conta_id && item.conta_destino_id && (
        <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5 font-normal">
          <ArrowUpRight aria-hidden="true" className="w-3 h-3" />
          {contaNome(item.conta_id)} → {contaNome(item.conta_destino_id)}
        </span>
      )}
      {item.conciliado && (
        <span className="ml-1 inline-flex items-center gap-0.5 text-[11px] font-normal text-success">
          <CheckCircle2 aria-hidden="true" className="h-3 w-3" /> Conciliado
        </span>
      )}
    </>
  );

  const onRowKeyDown = (e: KeyboardEvent, item: Lancamento) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(item); }
  };

  // ─── Render ───
  return (
    <>
      <div className="space-y-6">
        <FinScreenHeader
          title="Livro Razão"
          description="Lançamentos realizados e previstos, agrupados por dia."
          actions={(
            <>
              {canExport && (
                <Button size="sm" variant="outline" onClick={exportExcel}>
                  <Download className="w-4 h-4 mr-1" /> Excel
                </Button>
              )}
              {canCreate && (
                <>
                  <Button size="sm" variant="outline" onClick={() => openNew('DESPESA')} disabled={saving}>
                    <TrendingDown className="w-4 h-4 mr-1 text-destructive" /> Nova Despesa
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openNew('RECEITA')} disabled={saving}>
                    <TrendingUp className="w-4 h-4 mr-1 text-success" /> Nova Receita
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openNew('TRANSFERENCIA')} disabled={saving}>
                    <ArrowUpRight className="w-4 h-4 mr-1" /> Nova Transferência
                  </Button>
                </>
              )}
            </>
          )}
        />

        <div className="rounded-summary border bg-card p-4 shadow-card space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="razao-data-de" className="text-xs text-muted-foreground">De</Label>
              <DateInput id="razao-data-de" value={filtroDataDe} onValueChange={setFiltroDataDe} className="h-9 w-full text-xs sm:w-36" />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="razao-data-ate" className="text-xs text-muted-foreground">Até</Label>
              <DateInput id="razao-data-ate" value={filtroDataAte} onValueChange={setFiltroDataAte} className="h-9 w-full text-xs sm:w-36" />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="razao-tipo" className="text-xs text-muted-foreground">Tipo</Label>
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger id="razao-tipo" className="h-9 w-full sm:w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="RECEITA">Receitas</SelectItem>
                  <SelectItem value="DESPESA">Despesas</SelectItem>
                  <SelectItem value="TRANSFERENCIA">Transferências</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="razao-origem" className="text-xs text-muted-foreground">Origem</Label>
              <Select value={filtroOrigem} onValueChange={setFiltroOrigem}>
                <SelectTrigger id="razao-origem" className="h-9 w-full sm:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas origens</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="conciliacao">Conciliação</SelectItem>
                  <SelectItem value="espelho_cp">Espelho CP</SelectItem>
                  <SelectItem value="espelho_cr">Espelho CR</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                  <SelectItem value="ajuste_pagamento">Ajuste de baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="razao-conta" className="text-xs text-muted-foreground">Conta</Label>
              <Select value={filtroConta} onValueChange={setFiltroConta}>
                <SelectTrigger id="razao-conta" className="h-9 w-full sm:w-44"><SelectValue placeholder="Conta" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas contas</SelectItem>
                  {contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs font-medium leading-none text-muted-foreground">Categoria</span>
              <SearchableSelect
                value={filtroCategoria}
                onValueChange={v => setFiltroCategoria(v || CATEGORIA_FILTRO_TODOS)}
                options={categoriaFilterOptions}
                placeholder="Categoria"
                searchPlaceholder="Buscar categoria..."
                ariaLabel="Categoria"
                className="h-9 w-full sm:w-48"
                allowClear={false}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <MonthNavigator value={mesFiltro} onChange={handleMesChange} />
            <DateRangePresets
              from={filtroDataDe}
              to={filtroDataAte}
              onChange={(de, ate) => { setFiltroDataDe(de); setFiltroDataAte(ate); }}
              hideLastNDays
            />
          </div>
        </div>

        <FinSectionGroup id="razao-totais" title="Totais do período" caption={totaisPeriodoLabel}>
          {totaisStatus === 'error' || saldoStatus === 'error' ? (
            <ErrorState compact title="Não foi possível carregar os totais" onRetry={retryTotais} />
          ) : totaisStatus === 'loading' || saldoStatus === 'loading' ? (
            <FinKpiGrid className={totaisGrid}>
              {Array.from({ length: cardCount }).map((_, i) => (
                <div key={i} aria-hidden="true" className="rounded-summary border bg-card p-5 space-y-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-7 w-32" />
                  <Skeleton className="h-3 w-40" />
                </div>
              ))}
            </FinKpiGrid>
          ) : (
            <FinKpiGrid className={totaisGrid}>
              {totalCards.map(card => (
                <KpiCard
                  key={card.key}
                  appearance="summary"
                  icon={card.icon}
                  label={card.label}
                  value={fmt(card.value)}
                  sub={card.sub}
                  valueTone={card.tone}
                />
              ))}
              <KpiCard
                appearance="summary"
                icon={Wallet}
                label={ledgerSaldoLabel(saldoAte)}
                value={fmt(saldoAtual)}
                sub={saldoAte ? `${contaSelecionada} · realizados até o fim do dia` : `${contaSelecionada} · só realizados`}
                valueTone={saldoAtual < 0 ? 'negative' : 'default'}
              />
            </FinKpiGrid>
          )}
          {filtroCategoria !== CATEGORIA_FILTRO_TODOS && (
            <FinNote>
              Com filtro de categoria, os totais somam só a parte rateada na categoria e nas subcategorias; a coluna Valor mostra o lançamento inteiro. Diferente do DFC, os totais incluem os previstos.
            </FinNote>
          )}
        </FinSectionGroup>

        <FinSectionGroup id="razao-lancamentos" title="Lançamentos" caption={items.length > 0 ? `${items.length}${hasMore ? '+' : ''} ${items.length === 1 ? 'lançamento' : 'lançamentos'}` : undefined}>
          {listError && items.length === 0 ? (
            <ErrorState title="Não foi possível carregar os lançamentos" onRetry={load} retrying={loading} />
          ) : !loading && items.length === 0 ? (
            <EmptyState icon={Receipt} title="Nenhum lançamento encontrado" description="Ajuste o período ou os filtros." />
          ) : (
            <div className="[container-type:inline-size]">
              {/* Larguras médias e grandes: tabela. */}
              <div className="hidden [@container(min-width:48rem)]:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Status</TableHead>
                      {hasRowActions && <TableHead className="w-20 text-right">Ações</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && items.length === 0 ? (
                      <SkeletonTableRows />
                    ) : items.map((item, idx) => {
                      const isNewDay = idx === 0 || items[idx - 1].data_ledger !== item.data_ledger;
                      const valor = valorDisplay(item);
                      const tipoBadge = ledgerTipoBadge(item.tipo);
                      const statusBadge = ledgerStatusBadge(item.status);
                      return (
                        <Fragment key={item.id}>
                          {isNewDay && (
                            <TableRow className="hover:bg-transparent border-0">
                              <TableCell colSpan={tableColumns} className="p-0 pt-2">
                                <DayHeader date={item.data_ledger} saldo={dayCloseSaldo.get(item.data_ledger)} saldoLabel={saldoDoDiaLabel} />
                              </TableCell>
                            </TableRow>
                          )}
                          <TableRow
                            className="cursor-pointer hover:bg-card-hover focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                            tabIndex={0}
                            onClick={() => openDetail(item)}
                            onKeyDown={e => onRowKeyDown(e, item)}
                          >
                            <TableCell className="whitespace-nowrap text-sm tabular-nums">{formatDateBR(parseLocalDate(item.data_ledger))}</TableCell>
                            <TableCell className="font-medium max-w-xs">{descricaoBlock(item)}</TableCell>
                            <TableCell><StatusBadge status={tipoBadge.status} label={tipoBadge.label} /></TableCell>
                            <TableCell><OrigemChip origem={item.origem} tipo={item.tipo} /></TableCell>
                            <TableCell className={cn('text-right font-semibold tabular-nums whitespace-nowrap', valor.cls)}>{valor.text}</TableCell>
                            <TableCell><StatusBadge status={statusBadge.status} label={statusBadge.label} /></TableCell>
                            {hasRowActions && <TableCell>{rowActions(item)}</TableCell>}
                          </TableRow>
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Larguras estreitas: lista empilhada, sem rolagem horizontal. */}
              <div className="[@container(min-width:48rem)]:hidden">
                {loading && items.length === 0 ? (
                  <SkeletonStackedRows />
                ) : (
                  <ul className="space-y-2">
                    {items.map((item, idx) => {
                      const isNewDay = idx === 0 || items[idx - 1].data_ledger !== item.data_ledger;
                      const valor = valorDisplay(item);
                      const tipoBadge = ledgerTipoBadge(item.tipo);
                      const statusBadge = ledgerStatusBadge(item.status);
                      return (
                        <Fragment key={item.id}>
                          {isNewDay && (
                            <li className="pt-2 first:pt-0">
                              <DayHeader date={item.data_ledger} saldo={dayCloseSaldo.get(item.data_ledger)} saldoLabel={saldoDoDiaLabel} />
                            </li>
                          )}
                          <li className="flex items-start gap-1 rounded-lg border bg-card">
                            <button
                              type="button"
                              className="min-w-0 flex-1 rounded-lg p-3 text-left hover:bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={() => openDetail(item)}
                            >
                              <span className="flex items-start justify-between gap-3">
                                <span className="min-w-0 text-sm font-medium text-foreground">{descricaoBlock(item)}</span>
                                <span className={cn('shrink-0 text-sm font-semibold tabular-nums whitespace-nowrap', valor.cls)}>{valor.text}</span>
                              </span>
                              <span className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                <span className="tabular-nums">{formatDateBR(parseLocalDate(item.data_ledger))}</span>
                                <StatusBadge status={tipoBadge.status} label={tipoBadge.label} />
                                <OrigemChip origem={item.origem} tipo={item.tipo} />
                                <StatusBadge status={statusBadge.status} label={statusBadge.label} />
                              </span>
                            </button>
                            {hasRowActions && <div className="py-2 pr-1">{rowActions(item, true)}</div>}
                          </li>
                        </Fragment>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}

          {listError === 'more' && items.length > 0 && (
            <ErrorState compact title="Não foi possível carregar mais lançamentos" onRetry={() => loadPage(cursorDate, cursorId)} retrying={loading} />
          )}
          {listError === 'refresh' && items.length > 0 && (
            <ErrorState compact title="Não foi possível atualizar os lançamentos" description="A lista abaixo é da última carga." onRetry={load} retrying={loading} />
          )}

          {hasMore && items.length > 0 && !listError && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={() => loadPage(cursorDate, cursorId)} disabled={loading}>
                {loading ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : null}
                Carregar mais
              </Button>
            </div>
          )}
        </FinSectionGroup>
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
        cmv={editId && !cmvLidoNaEdicao.current ? null : cmvForm}
        competenciaNaReclassificacao={Boolean(cmvForm)}
      />

      <FormCloseConfirmDialog open={showConfirm} onConfirmLeave={confirmClose} onCancelLeave={cancelClose} />
      <ConfirmDialog />
    </>
  );
}
