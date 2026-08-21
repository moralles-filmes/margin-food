import { useState, useEffect, useMemo, useRef } from 'react';
import { emitDataEvent, useDataEvent } from '@/lib/dataEvents';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/brl-input';
import { fmtBRL, formatDateBR, parseLocalDate, todayBR } from '@/lib/formatters';
import { Label } from '@/components/ui/label';
import { Badge, badgeVariants } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { parseExtrato, verifyContaExtrato, type ExtratoConta } from '@/lib/extratoParser';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Upload, CheckCircle, Save, RefreshCw, ArrowRight, Receipt, Eye, Plus, Trash2, PieChart, ArrowRightLeft, Search, CreditCard, FileText, EyeOff, X, AlertTriangle, Edit } from 'lucide-react';
import CriarLancamentoExtratoDialog from '@/components/financeiro/CriarLancamentoExtratoDialog';
import CategoryCombobox from '@/components/financeiro/CategoryCombobox';
import ContaFormDialog, { type ContaFormData, type RateioLine } from '@/components/financeiro/ContaFormDialog';
import ConfirmarSaldoExtratoDialog from '@/components/financeiro/ConfirmarSaldoExtratoDialog';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { mapFinanceiroDeleteError } from '@/lib/financeiroErrorMap';
import { buildCategoryOptions } from '@/lib/categoriaOptions';
import { matchesImportFilter, type ImportFilter } from '@/lib/conciliacaoFilters';
import { cn, normalizeSearchText } from '@/lib/utils';
import { runOptionalAutoBind } from '@/lib/conciliacaoAutoBind';
import { extractSupabaseErrorMessage } from '@/lib/supabaseErrors';
import { computeScore } from '@/lib/conciliacaoScore';
import { matchTransferCandidate, findTransferWarnings, type TransferCandidate, type TransferWarning } from '@/lib/conciliacaoTransferMatch';
import type { ContaBancariaRef, CategoriaFinRef, CentroCustoRef, LancamentoConciliacao, LancamentoCandidate, ContaPagarCandidate, ContaReceberCandidate, ContaPagarAberta } from '@/types/financeiro';
import { mapPagamentoError } from '@/lib/financeiroErrorMap';
import DateRangePresets from './DateRangePresets';
import { subDays } from 'date-fns';
import { formatInBR } from '@/lib/datetime';

import { useCan } from '@/permissions/hooks';
/* ───────── Types ───────── */

interface MatchSuggestion {
  id: string;
  origin: 'lancamento' | 'conta_pagar' | 'conta_receber';
  descricao: string;
  valor: number;
  data: string;
  extra?: string;
  score: number;
  raw: LancamentoCandidate | ContaPagarCandidate | ContaReceberCandidate;
  /** O lançamento já está no razão porque a baixa foi feita em Contas a
   *  Pagar/Receber. Conciliar aqui é vincular; criar um novo duplicaria. */
  jaNoRazao?: boolean;
}

interface LinhaExtrato {
  data: string;
  descricao: string;
  valor: number;
  tipo: 'RECEITA' | 'DESPESA';
  fitId?: string;
  selecionada: boolean;
  matchId?: string;
  matchOrigin?: MatchSuggestion['origin'];
  matchDescricao?: string;
  matchRaw?: MatchSuggestion['raw'];
  /** Espelho do match escolhido: já existe no razão (veio de CP/CR). */
  matchJaNoRazao?: boolean;
  suggestions?: MatchSuggestion[];
  rateioLinhas?: RateioLinha[];
  categoriaId?: string;
  jaConciliada?: boolean;
  /** Preenchido quando a linha foi resolvida por ser a contrapartida de uma
   *  transferência já lançada pelo extrato da outra conta. */
  transferReconhecida?: { id: string; data: string; conta_id: string; conta_destino_id: string };
  /** Transferências de mesmo valor e data próxima que não foram reconhecidas
   *  automaticamente — exibidas como alerta para conferência manual. */
  transferAlertas?: TransferWarning[];
  ignorada?: boolean;
}

/** Classificação da diferença entre o valor do boleto e o que saiu do banco. */
type AjusteTipo = '' | 'JUROS' | 'TARIFA' | 'DESCONTO';

interface AjusteBaixa {
  tipo: AjusteTipo;
  categoriaId: string;
}

interface RateioLinha {
  categoria_id: string;
  centro_custo_id: string;
  valor: number;
  percentual: number;
  observacao: string;
}

/* ───────── sessionStorage helpers ───────── */
const SESSION_KEY = (contaId: string) => `conciliacao_linhas_${contaId}`;

function saveLinhas(contaId: string, linhas: LinhaExtrato[]) {
  try { sessionStorage.setItem(SESSION_KEY(contaId), JSON.stringify(linhas)); } catch (_) { /* sessionStorage indisponível (modo privado/quota) — dados ficam só em memória */ }
}

function loadLinhas(contaId: string): LinhaExtrato[] | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY(contaId));
    return raw ? JSON.parse(raw) : null;
  } catch (_) { /* sessionStorage indisponível — sem persistência entre navegações */ return null; }
}

function clearLinhas(contaId: string) {
  try { sessionStorage.removeItem(SESSION_KEY(contaId)); } catch (_) { /* sessionStorage indisponível */ }
}

/** Saldo final do extrato confirmado pelo usuário — referência da conferência pós-processamento. */
const SALDO_EXTRATO_KEY = (contaId: string) => `conciliacao_saldo_extrato_${contaId}`;

interface SaldoExtratoRef { valor: number; data: string }

function saveSaldoExtrato(contaId: string, saldo: SaldoExtratoRef) {
  try { sessionStorage.setItem(SALDO_EXTRATO_KEY(contaId), JSON.stringify(saldo)); } catch (_) { /* sessionStorage indisponível */ }
}

function loadSaldoExtrato(contaId: string): SaldoExtratoRef | null {
  try {
    const raw = sessionStorage.getItem(SALDO_EXTRATO_KEY(contaId));
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function clearSaldoExtrato(contaId: string) {
  try { sessionStorage.removeItem(SALDO_EXTRATO_KEY(contaId)); } catch (_) { /* sessionStorage indisponível */ }
}

/** Lançamento já conciliado da conta, usado para reconhecer linha de extrato repetida. */
interface ConciliadoRow {
  id: string;
  data_competencia: string;
  data_pagamento: string | null;
  valor: number;
  tipo: string;
  descricao: string | null;
}

function bankLineKey(linha: { data: string; valor: number; tipo: string; descricao?: string | null }) {
  // Normalizado (sem acento/maiúsculas/espaços extras): o banco pode truncar a
  // descrição em tamanho diferente entre dois downloads do mesmo extrato, e
  // igualdade exata deixaria passar despercebida a mesma reimportação.
  return `${linha.data}|${Number(linha.valor)}|${linha.tipo}|${normalizeSearchText(linha.descricao || '')}`;
}

function consumeCount(counts: Map<string, number>, key: string): boolean {
  const remaining = counts.get(key) || 0;
  if (remaining <= 0) return false;
  if (remaining === 1) counts.delete(key);
  else counts.set(key, remaining - 1);
  return true;
}

export default function ConciliacaoBancariaSection() {
  const canViewRbac = useCan('financeiro:conciliacao:view');
  const canReconcileRbac = useCan('financeiro:conciliacao:reconcile');
  const { user } = useAuth();
  const [contas, setContas] = useState<ContaBancariaRef[]>([]);
  const [contaSel, setContaSel] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string>('');

  const [linhas, setLinhasState] = useState<LinhaExtrato[]>([]);
  const [importFilter, setImportFilter] = useState<ImportFilter>('todos');
  const [importando, setImportando] = useState(false);

  // Conferência de saldo pós-processamento: compara o saldo oficial do extrato
  // (confirmado no upload) com o saldo do sistema + linhas ainda pendentes.
  // É a rede final contra linha engolida/ignorada indevidamente: qualquer venda
  // que o processamento deixe de lançar aparece aqui como diferença em R$.
  const [saldoExtrato, setSaldoExtrato] = useState<SaldoExtratoRef | null>(null);
  const [conferenciaSaldo, setConferenciaSaldo] = useState<{
    sistema: number; projetado: number; pendentesDelta: number; diferenca: number;
  } | null>(null);

  const [lancamentos, setLancamentos] = useState<LancamentoConciliacao[]>([]);
  const [lancamentoRateioCategoryIds, setLancamentoRateioCategoryIds] = useState<Record<string, string[]>>({});
  const [filtro, setFiltro] = useState<'pendentes' | 'conciliados' | 'todos'>('pendentes');
  const [filtroDataDe, setFiltroDataDe] = useState(() => formatInBR(subDays(new Date(), 90), 'yyyy-MM-dd'));
  const [filtroDataAte, setFiltroDataAte] = useState(todayBR());
  const [view, setView] = useState<'importar' | 'conciliar'>('conciliar');
  // Totais da conta inteira (independentes do filtro/paginação da lista) — usados só no resumo do cabeçalho.
  const [totalPendentesConta, setTotalPendentesConta] = useState(0);
  const [totalConciliadosConta, setTotalConciliadosConta] = useState(0);
  const [selectedLancamentoIds, setSelectedLancamentoIds] = useState<Set<string>>(new Set());

  const [processando, setProcessando] = useState(false);

  const [suggestionsDialog, setSuggestionsDialog] = useState<{ open: boolean; linhaIndex: number }>({ open: false, linhaIndex: -1 });

  const [rateioDialog, setRateioDialog] = useState<{ open: boolean; linhaIndex: number }>({ open: false, linhaIndex: -1 });
  const [rateioLinhas, setRateioLinhas] = useState<RateioLinha[]>([]);
  const [categorias, setCategorias] = useState<CategoriaFinRef[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoRef[]>([]);

  const [transferDialog, setTransferDialog] = useState<{ open: boolean; linhaIndex: number }>({ open: false, linhaIndex: -1 });
  const [transferContaDestino, setTransferContaDestino] = useState('');

  const [criarDialog, setCriarDialog] = useState<{ open: boolean; linhaIndex: number }>({ open: false, linhaIndex: -1 });

  // Confirmação das linhas que casaram com uma baixa já registrada em CP/CR
  const [jaNoRazaoDialog, setJaNoRazaoDialog] = useState<{ open: boolean; indices: number[] }>({ open: false, indices: [] });

  // Linhas que a RPC recusou a importar por já existir um lançamento igual
  // (mesma conta/valor/data/descrição) com um FITID diferente — extrato
  // reimportado do banco. Ver reconcile_import_lancamento(p_force_duplicate).
  const [duplicataDialog, setDuplicataDialog] = useState<{
    open: boolean;
    itens: { linha: LinhaExtrato; lancamentoId: string; criadoEm?: string }[];
  }>({ open: false, itens: [] });

  // Revisão obrigatória antes de dar baixa em boleto. Sem ela, o "Processar"
  // baixou 21 contas em 3 segundos sem ninguém confirmar nada.
  const [baixaDialog, setBaixaDialog] = useState<{ open: boolean; indices: number[]; escopo: 'lote' | 'individual' }>(
    { open: false, indices: [], escopo: 'lote' },
  );
  const [ajustesBaixa, setAjustesBaixa] = useState<Record<number, AjusteBaixa>>({});

  // Seletor manual de boleto em aberto
  const [boletoDialog, setBoletoDialog] = useState<{ open: boolean; linhaIndex: number }>({ open: false, linhaIndex: -1 });
  const [boletoBusca, setBoletoBusca] = useState('');
  const [boletoLoading, setBoletoLoading] = useState(false);
  const [boletoOpcoes, setBoletoOpcoes] = useState<ContaPagarAberta[]>([]);

  // Edição de lançamento já existente (aba "Lançamentos")
  const { confirm: confirmDelete, ConfirmDialog: DeleteConfirmDialog } = useConfirmDialog();
  const [showEditForm, setShowEditForm] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editUpdatedAt, setEditUpdatedAt] = useState<string | null>(null);
  const [editPrevStatus, setEditPrevStatus] = useState<string | null>(null);
  const [editJustificativa, setEditJustificativa] = useState('');
  const [editForm, setEditForm] = useState<ContaFormData>({
    tipo: 'DESPESA', valor: 0, data_competencia: todayBR(),
    data_vencimento: '', data_pagamento: '',
    descricao: '', conta_id: '', conta_destino_id: '',
    forma_pagamento: 'pix', status: 'REALIZADO',
    recorrente: false, frequencia: 'mensal', parcelas: 0,
    observacoes: '', categoria_id: '', centro_custo_id: '',
  });
  const [editRateioLines, setEditRateioLines] = useState<RateioLine[]>([]);

  // Dialogo de alerta quando o extrato não pertence à conta selecionada
  const [contaMismatch, setContaMismatch] = useState<{
    open: boolean;
    parsed: LinhaExtrato[];
    extratoInfo: ExtratoConta;
    saldoFinalArquivo?: { valor: number; data: string };
    fileName: string;
  } | null>(null);

  // Aviso antes de substituir linhas ainda não processadas de um upload anterior
  // (desaparecerem silenciosamente da fila e do sessionStorage era o próprio bug).
  const [substituirExtratoDialog, setSubstituirExtratoDialog] = useState<{
    open: boolean;
    parsed: LinhaExtrato[];
    extratoInfo: ExtratoConta;
    saldoFinalArquivo?: { valor: number; data: string };
    fileName: string;
    pendentes: number;
  } | null>(null);

  // Dialogo de conferência do saldo final do extrato (dispara após a checagem de conta)
  const [confirmSaldoDialog, setConfirmSaldoDialog] = useState<{
    open: boolean;
    parsed: LinhaExtrato[];
    nomeArquivo: string;
    periodoInicio: string;
    periodoFim: string;
    deltaExtrato: number;
    saldoSugerido?: { valor: number; data: string };
  } | null>(null);

  // Wrapper: atualiza state e persiste no sessionStorage
  const setLinhas = (updater: LinhaExtrato[] | ((prev: LinhaExtrato[]) => LinhaExtrato[])) => {
    setLinhasState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (contaSel) saveLinhas(contaSel, next);
      return next;
    });
  };

  useEffect(() => {
    supabase.from('fin_contas').select('id, nome, numero_conta, agencia, banco').eq('ativo', true).order('nome')
      .then(({ data }) => {
        setContas(data || []);
        if (data && data.length > 0 && !contaSel) setContaSel(data[0].id);
      });
    Promise.all([
      supabase.from('fin_categorias').select('id, nome, tipo, parent_id, centro_custo_padrao_id, excluir_dos_totais').eq('ativo', true).order('nome'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
    ]).then(([catRes, ccRes]) => {
      setCategorias(buildCategoryOptions(catRes.data || []));
      setCentrosCusto(ccRes.data || []);
    });
  }, []);

  // Restaura linhas do sessionStorage quando a conta é selecionada
  useEffect(() => {
    setImportFilter('todos');
    setConferenciaSaldo(null);
    if (!contaSel) {
      setLinhasState([]);
      setSaldoExtrato(null);
      return;
    }
    setSaldoExtrato(loadSaldoExtrato(contaSel));
    const saved = loadLinhas(contaSel);
    if (saved && saved.length > 0) {
      setLinhasState(saved);
      if (view !== 'importar') setView('importar');
      // O cache pode estar desatualizado se o lançamento foi desconciliado/excluído
      // em outra aba/sessão — revalida as linhas travadas contra o banco.
      refreshLockedLinhas(saved);
    } else {
      setLinhasState([]);
    }
  }, [contaSel]);

  // Recalcula a conferência de saldo sempre que as linhas mudam (processar,
  // ignorar, desconciliar). Debounce curto para agrupar mutações em sequência.
  useEffect(() => {
    if (!contaSel || !saldoExtrato) {
      setConferenciaSaldo(null);
      return;
    }
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('get_fin_saldo_conta_em', {
        p_conta_id: contaSel,
        p_data: saldoExtrato.data,
      });
      if (error) {
        console.error('[ConciliacaoBancariaSection.conferenciaSaldo]', error);
        return;
      }
      const sistema = Number(data) || 0;
      // Linhas ainda não resolvidas entram como projeção: quando tudo for
      // processado, projetado === sistema e a comparação vira definitiva.
      const pendentesDelta = linhas
        .filter(l => !l.jaConciliada && !l.ignorada)
        .reduce((s, l) => s + (l.tipo === 'RECEITA' ? l.valor : -l.valor), 0);
      const projetado = sistema + pendentesDelta;
      setConferenciaSaldo({
        sistema,
        projetado,
        pendentesDelta,
        diferenca: saldoExtrato.valor - projetado,
      });
    }, 600);
    return () => clearTimeout(t);
  }, [contaSel, saldoExtrato, linhas]);

  useEffect(() => {
    if (contaSel && view === 'conciliar') loadLancamentos();
    // Selection refers to rows from the previous account/filter/view — drop it so the
    // "Excluir Selecionados (N)" button doesn't show a stale count after switching.
    setSelectedLancamentoIds(new Set());
  }, [contaSel, filtro, filtroDataDe, filtroDataAte, view]);
  useEffect(() => { if (contaSel && view === 'conciliar') loadLancamentosCounts(); }, [contaSel, view]);

  /** Totais reais da conta (pendente/conciliado), independentes do filtro e da paginação da lista. */
  const loadLancamentosCounts = async () => {
    const [pendRes, concRes] = await Promise.all([
      supabase.from('fin_lancamentos').select('id', { count: 'exact', head: true })
        .eq('conta_id', contaSel).eq('status', 'REALIZADO').or('conciliado.is.null,conciliado.eq.false'),
      supabase.from('fin_lancamentos').select('id', { count: 'exact', head: true })
        .eq('conta_id', contaSel).eq('status', 'REALIZADO').eq('conciliado', true),
    ]);
    setTotalPendentesConta(pendRes.count || 0);
    setTotalConciliadosConta(concRes.count || 0);
  };

  const loadLancamentos = async () => {
    setLoading(true);
    try {
      const pageSize = 1000;
      const allRows: LancamentoConciliacao[] = [];
      let from = 0;

      // O PostgREST limita a quantidade de linhas por resposta. Busca em páginas
      // sucessivas para que datas antigas nunca desapareçam silenciosamente.
      while (true) {
        let query = supabase
          .from('fin_lancamentos')
          .select('id, data_competencia, data_vencimento, data_pagamento, valor, tipo, descricao, observacoes, conta_id, categoria_id, centro_custo_id, forma_pagamento, status, origem, recorrente, conciliado, conciliado_em, conciliado_por, created_at, updated_at')
          .eq('conta_id', contaSel)
          .eq('status', 'REALIZADO');

        if (filtro === 'pendentes') query = query.or('conciliado.is.null,conciliado.eq.false');
        else if (filtro === 'conciliados') query = query.eq('conciliado', true);
        if (filtroDataDe) query = query.gte('data_competencia', filtroDataDe);
        if (filtroDataAte) query = query.lte('data_competencia', filtroDataAte);

        const { data, error } = await query
          .order('data_competencia', { ascending: false })
          .order('id', { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) throw error;
        const page = (data || []) as LancamentoConciliacao[];
        allRows.push(...page);
        if (page.length < pageSize) break;
        from += pageSize;
      }

      const rateioCategoryIds: Record<string, string[]> = {};
      const semCategoriaDireta = allRows.filter(item => !item.categoria_id);
      const rateioPageSize = 500;

      for (let from = 0; from < semCategoriaDireta.length; from += rateioPageSize) {
        const ids = semCategoriaDireta.slice(from, from + rateioPageSize).map(item => item.id);
        const { data: rateios, error: rateioError } = await supabase
          .from('fin_lancamento_rateios')
          .select('lancamento_id, categoria_id')
          .in('lancamento_id', ids)
          .not('categoria_id', 'is', null);
        if (rateioError) throw rateioError;

        for (const rateio of rateios || []) {
          const current = rateioCategoryIds[rateio.lancamento_id] || [];
          if (rateio.categoria_id && !current.includes(rateio.categoria_id)) {
            rateioCategoryIds[rateio.lancamento_id] = [...current, rateio.categoria_id];
          }
        }
      }

      setLancamentoRateioCategoryIds(rateioCategoryIds);
      setLancamentos(allRows);
    } catch (error) {
      console.error('Error loading lancamentos:', error);
      toast.error('Erro ao carregar lançamentos');
      setLancamentoRateioCategoryIds({});
      setLancamentos([]);
    } finally {
      setLoading(false);
    }
  };

  const findLancamentosSemCategoria = async (items: LancamentoConciliacao[]) => {
    const verificaveis = items.filter(item => item.tipo !== 'TRANSFERENCIA' && !item.categoria_id);
    if (verificaveis.length === 0) return [];

    const idsComRateio = new Set<string>();
    const pageSize = 500;
    for (let from = 0; from < verificaveis.length; from += pageSize) {
      const ids = verificaveis.slice(from, from + pageSize).map(item => item.id);
      const { data, error } = await supabase
        .from('fin_lancamento_rateios')
        .select('lancamento_id, categoria_id')
        .in('lancamento_id', ids)
        .not('categoria_id', 'is', null);
      if (error) throw error;
      (data || []).forEach(rateio => idsComRateio.add(rateio.lancamento_id));
    }

    return verificaveis.filter(item => !idsComRateio.has(item.id));
  };

  const conciliar = async (id: string, value: boolean) => {
    if (value) {
      const item = lancamentos.find(l => l.id === id);
      if (item) {
        try {
          const semCategoria = await findLancamentosSemCategoria([item]);
          if (semCategoria.length > 0) {
            toast.error('Selecione uma categoria antes de conciliar o lançamento.');
            return;
          }
        } catch (error) {
          console.error('Error validating reconciliation category:', error);
          toast.error('Não foi possível validar a categoria do lançamento.');
          return;
        }
      }
      const { error } = await supabase.rpc('reconcile_batch_lancamentos', {
        p_lancamento_ids: [id],
      });
      if (error) { toast.error(error.message); return; }
      toast.success('Lançamento conciliado');
    } else {
      // unreconcile_lancamento só desmarca (conciliado/conciliado_em/conciliado_por) —
      // o lançamento continua existindo para permitir corrigir categoria e conciliar de novo.
      const { error } = await supabase.rpc('unreconcile_lancamento', { p_id: id });
      if (error) { toast.error(error.message); return; }
      toast.success('Conciliação removida');
    }
    setLancamentos(prev => prev.map(l => l.id === id ? { ...l, conciliado: value } : l));
    emitDataEvent('financeiro:conciliacao');
    refreshLockedLinhas();
    loadLancamentosCounts();
  };

  const openEditLancamento = async (item: LancamentoConciliacao) => {
    if (item.conciliado) {
      toast.error('Desconcilie o lançamento antes de editar.');
      return;
    }
    if (item.origem === 'espelho_cp') {
      toast.error('Este lançamento foi gerado por uma Conta a Pagar. Edite diretamente em Contas a Pagar.');
      return;
    }
    if (item.origem === 'espelho_cr') {
      toast.error('Este lançamento foi gerado por uma Conta a Receber. Edite diretamente em Contas a Receber.');
      return;
    }

    const { data: rates, error: rateErr } = await supabase
      .from('fin_lancamento_rateios')
      .select('id, categoria_id, centro_custo_id, valor, percentual')
      .eq('lancamento_id', item.id);
    if (rateErr) {
      toast.error('Erro ao carregar rateios: ' + rateErr.message);
      return;
    }
    setEditRateioLines((rates || []).map(r => ({
      key: r.id,
      categoria_id: r.categoria_id,
      centro_custo_id: r.centro_custo_id || '',
      valor: r.valor,
      percentual: r.percentual,
    })));

    setEditId(item.id);
    setEditUpdatedAt(item.updated_at);
    setEditPrevStatus(item.status);
    setEditJustificativa('');
    setEditForm({
      tipo: item.tipo, valor: item.valor, data_competencia: item.data_competencia,
      data_vencimento: item.data_vencimento || '', data_pagamento: item.data_pagamento || '',
      descricao: item.descricao || '', conta_id: item.conta_id || '', conta_destino_id: '',
      forma_pagamento: item.forma_pagamento || 'pix', status: item.status,
      recorrente: item.recorrente || false, frequencia: 'mensal', parcelas: 0,
      observacoes: item.observacoes || '',
      categoria_id: item.categoria_id || '',
      centro_custo_id: item.centro_custo_id || '',
    });
    setShowEditForm(true);
  };

  const closeEditLancamento = () => {
    setShowEditForm(false);
    setEditId(null);
    setEditRateioLines([]);
  };

  const saveEditLancamento = async () => {
    if (editSaving) return;
    if (!editForm.descricao.trim()) { toast.error('Descrição obrigatória'); return; }

    const totalRateio = editRateioLines.reduce((s, l) => s + Number(l.valor || 0), 0);
    const diffRateio = (editForm.valor || 0) - totalRateio;
    const rateioValido = editRateioLines.length === 0 || Math.abs(diffRateio) < 0.01;
    const valorFinal = editRateioLines.length > 0 ? totalRateio : editForm.valor;
    if (!valorFinal || valorFinal <= 0) { toast.error('Valor obrigatório'); return; }
    if (editRateioLines.length > 0 && !rateioValido) { toast.error(`Rateio incompleto. Ajuste os valores para totalizar ${fmt(editForm.valor)}.`); return; }
    if (editRateioLines.length > 0 && editRateioLines.some(l => !l.categoria_id)) { toast.error('Todas as linhas de rateio precisam de categoria'); return; }
    if (editPrevStatus === 'REALIZADO' && !editJustificativa.trim()) {
      toast.error('Justificativa obrigatória para edição de lançamento REALIZADO.');
      return;
    }

    setEditSaving(true);
    try {
      const rateiosPayload = editRateioLines.length > 0
        ? editRateioLines.map(l => ({
            categoria_id: l.categoria_id,
            centro_custo_id: l.centro_custo_id || null,
            valor: l.valor,
            percentual: l.percentual || null,
            observacao: null,
          }))
        : [];

      const { error } = await supabase.rpc('_guarded_upsert_lancamento' as any, {
        p_id: editId,
        p_tipo: editForm.tipo,
        p_status: editForm.status,
        p_valor: valorFinal,
        p_conta_id: editForm.conta_id || null,
        p_categoria_id: editRateioLines.length === 1 ? editRateioLines[0].categoria_id : (editForm.categoria_id || null),
        p_centro_custo_id: editRateioLines.length === 1 ? (editRateioLines[0].centro_custo_id || null) : (editForm.centro_custo_id || null),
        p_data_competencia: editForm.data_competencia,
        p_data_vencimento: editForm.data_vencimento || null,
        p_data_pagamento: editForm.data_pagamento || (editForm.status === 'REALIZADO' ? editForm.data_competencia : null),
        p_descricao: editForm.descricao,
        p_observacoes: editForm.observacoes || null,
        p_forma_pagamento: editForm.forma_pagamento,
        p_recorrente: editForm.recorrente,
        p_recorrencia_config: null,
        p_rateios: rateiosPayload,
        p_updated_at: editUpdatedAt || null,
        p_justificativa_edicao: editJustificativa.trim() || null,
      } as any);

      if (error) {
        if (error.message?.includes('CONFLICT')) {
          toast.error('Este registro foi alterado por outro usuário. Recarregue a página.');
        } else {
          toast.error(error.message);
        }
        return;
      }

      toast.success('Lançamento atualizado');
      closeEditLancamento();
      loadLancamentos();
      emitDataEvent('financeiro:conciliacao');
      emitDataEvent('financeiro:lancamentos');
    } finally {
      setEditSaving(false);
    }
  };

  const deleteLancamentoConciliacao = async (item: LancamentoConciliacao) => {
    if (item.conciliado) {
      toast.error('Desconcilie o lançamento antes de excluir.');
      return;
    }
    if (item.origem === 'espelho_cp' || item.origem === 'espelho_cr') {
      toast.error('Este lançamento é um espelho de Conta a Pagar/Receber. Use o estorno na conta correspondente.');
      return;
    }
    const ok = await confirmDelete({ title: 'Excluir lançamento', description: 'Tem certeza que deseja excluir este lançamento? Esta ação não pode ser desfeita.', confirmLabel: 'Excluir', variant: 'destructive' });
    if (!ok) return;
    setEditSaving(true);
    try {
      const { error } = await supabase.rpc('_guarded_delete_lancamento' as any, {
        p_id: item.id,
        p_expected_updated_at: item.updated_at,
      } as any);
      if (error) throw error;
      toast.success('Lançamento excluído');
      setLancamentos(prev => prev.filter(l => l.id !== item.id));
      emitDataEvent('financeiro:conciliacao');
      emitDataEvent('financeiro:lancamentos');
      refreshLockedLinhas();
      loadLancamentosCounts();
    } catch (err: unknown) {
      console.error('[ConciliacaoBancariaSection.deleteLancamentoConciliacao]', err);
      toast.error(mapFinanceiroDeleteError(err));
    } finally {
      setEditSaving(false);
    }
  };

  const bulkDeleteLancamentos = async () => {
    if (selectedLancamentoIds.size === 0) return;
    const selecionados = lancamentos.filter(l => selectedLancamentoIds.has(l.id));

    const ok = await confirmDelete({
      title: 'Excluir lançamentos selecionados',
      description: `Tem certeza que deseja excluir ${selecionados.length} lançamento(s)? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      variant: 'destructive',
    });
    if (!ok) return;

    setEditSaving(true);
    try {
      const excluidosIds: string[] = [];
      const bloqueados: string[] = [];

      for (const item of selecionados) {
        if (item.conciliado) {
          bloqueados.push(`${item.descricao} (desconcilie antes de excluir)`);
          continue;
        }
        if (item.origem === 'espelho_cp' || item.origem === 'espelho_cr') {
          bloqueados.push(`${item.descricao} (é espelho de Conta a Pagar/Receber)`);
          continue;
        }
        const { error } = await supabase.rpc('_guarded_delete_lancamento' as any, {
          p_id: item.id,
          p_expected_updated_at: item.updated_at,
        } as any);
        if (error) {
          console.error('[ConciliacaoBancariaSection.bulkDeleteLancamentos]', error);
          bloqueados.push(`${item.descricao} (${mapFinanceiroDeleteError(error)})`);
          continue;
        }
        excluidosIds.push(item.id);
      }

      if (excluidosIds.length > 0) {
        setLancamentos(prev => prev.filter(l => !excluidosIds.includes(l.id)));
      }
      setSelectedLancamentoIds(new Set());

      if (bloqueados.length === 0) {
        toast.success(`${excluidosIds.length} lançamento(s) excluído(s)`);
      } else if (excluidosIds.length === 0) {
        toast.error(`Nenhum lançamento excluído. Bloqueados: ${bloqueados.join('; ')}`);
      } else {
        toast.warning(`${excluidosIds.length} excluído(s), ${bloqueados.length} bloqueado(s): ${bloqueados.join('; ')}`);
      }

      emitDataEvent('financeiro:conciliacao');
      emitDataEvent('financeiro:lancamentos');
      refreshLockedLinhas();
      loadLancamentosCounts();
    } finally {
      setEditSaving(false);
    }
  };

  const conciliarTodos = async () => {
    const pendentes = lancamentos.filter(l => !l.conciliado);
    if (pendentes.length === 0) return;
    try {
      const semCategoria = await findLancamentosSemCategoria(pendentes);
      if (semCategoria.length > 0) {
        toast.error(`${semCategoria.length} lançamento(s) estão sem categoria. Corrija-os antes de conciliar todos.`);
        return;
      }
    } catch (error) {
      console.error('Error validating reconciliation categories:', error);
      toast.error('Não foi possível validar as categorias dos lançamentos.');
      return;
    }
    const ids = pendentes.map(l => l.id);
    const { data, error } = await supabase.rpc('reconcile_batch_lancamentos', {
      p_lancamento_ids: ids,
    });
    if (error) { toast.error(error.message); return; }
    const count = (data as unknown as { reconciled_count?: number } | null)?.reconciled_count || ids.length;
    setLancamentos(prev => prev.map(l => ids.includes(l.id) ? { ...l, conciliado: true } : l));
    toast.success(`${count} lançamentos conciliados`);
    emitDataEvent('financeiro:conciliacao');
    refreshLockedLinhas();
    loadLancamentosCounts();
  };

  const toggleAllLancamentos = (checked: boolean) => {
    if (!checked) { setSelectedLancamentoIds(new Set()); return; }
    const selectableIds = lancamentosFiltrados
      .filter(l => !l.conciliado && l.origem !== 'espelho_cp' && l.origem !== 'espelho_cr')
      .map(l => l.id);
    setSelectedLancamentoIds(new Set(selectableIds));
  };

  // ========== File Parsing ==========

  interface MatchContext {
    allLancamentos: LancamentoCandidate[];
    contasPagar: ContaPagarCandidate[];
    contasReceber: ContaReceberCandidate[];
    conciliadosCounts: Map<string, number>;
    ignoradasCounts: Map<string, number>;
    /** `tipo|external_id` → lancamento_id do vínculo. Mapa (e não Set) de
     *  propósito: dentro de UM arquivo, cada lançamento só pode ser reivindicado
     *  por uma linha — dois FITIDs distintos do mesmo arquivo apontando para o
     *  mesmo lançamento significa que uma das linhas está sem par no razão. */
    externalIdsProcessados: Map<string, string>;
    /** Lançamentos já amarrados a alguma linha bancária — não podem ser
     *  oferecidos de novo, senão duas linhas do extrato apontariam para a mesma
     *  baixa e uma despesa real sumiria da conciliação. */
    lancamentosVinculados: Set<string>;
    transferCandidates: TransferCandidate[];
  }

  const fetchVinculosExtrato = async () => {
    if (!contaSel) return { data: [] as { external_id: string; tipo: string; lancamento_id: string }[] };
    const pageSize = 1000;
    const data: { external_id: string; tipo: string; lancamento_id: string }[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data: page, error } = await supabase.from('fin_conciliacao_vinculos')
        .select('external_id, tipo, lancamento_id')
        .eq('conta_id', contaSel)
        // Ordem estável é obrigatória: cada página é uma query separada e, sem
        // ORDER BY, o Postgres pode repetir/pular linhas entre páginas.
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      data.push(...(page || []));
      if (!page || page.length < pageSize) break;
    }
    return { data };
  };

  /**
   * Lançamentos já conciliados da conta. Pagina de verdade: uma conta com meses de
   * extrato passa de 1.000 registros e o corte padrão do PostgREST descartava o
   * excedente em silêncio, fazendo linha antiga reaparecer como nova.
   */
  const fetchConciliadosExtrato = async () => {
    if (!contaSel) return { data: [] as ConciliadoRow[] };
    const pageSize = 1000;
    const data: ConciliadoRow[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data: page, error } = await supabase.from('fin_lancamentos')
        .select('id, data_competencia, data_pagamento, valor, tipo, descricao')
        .eq('conta_id', contaSel).eq('conciliado', true).eq('status', 'REALIZADO')
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      data.push(...((page || []) as ConciliadoRow[]));
      if (!page || page.length < pageSize) break;
    }
    return { data };
  };

  /**
   * Lançamentos pendentes (não conciliados) da própria conta selecionada — fonte
   * primária de candidatos para "já existe no razão" e sugestões. Pagina de
   * verdade pelo mesmo motivo de fetchConciliadosExtrato: sem isso, uma conta com
   * muito histórico em aberto cai no limite padrão do PostgREST e um lançamento
   * pendente antigo some das sugestões, virando candidato a duplicata na próxima
   * importação.
   */
  const fetchLancamentosPendentesConta = async () => {
    if (!contaSel) return { data: [] as LancamentoCandidate[] };
    const pageSize = 1000;
    const data: LancamentoCandidate[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data: page, error } = await supabase.from('fin_lancamentos')
        .select('id, data_competencia, data_pagamento, valor, tipo, descricao, conciliado, conta_id, origem')
        .eq('conta_id', contaSel).eq('status', 'REALIZADO').or('conciliado.is.null,conciliado.eq.false')
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      data.push(...((page || []) as LancamentoCandidate[]));
      if (!page || page.length < pageSize) break;
    }
    return { data };
  };

  /** Busca lançamentos/CP/CR candidatos + sets de já-conciliadas/ignoradas para a conta selecionada. */
  const fetchMatchContext = async (): Promise<MatchContext> => {
    // Busca dados para match + entradas já conciliadas + entradas ignoradas
    const [lancRes, lancAllRes, cpRes, crRes, conciliadosRes, ignoradasRes, vinculosRes, transferRes, espelhosRes] = await Promise.all([
      fetchLancamentosPendentesConta(),
      supabase.from('fin_lancamentos').select('id, data_competencia, data_pagamento, valor, tipo, descricao, conciliado, conta_id, origem')
        .eq('status', 'REALIZADO').or('conciliado.is.null,conciliado.eq.false').limit(500),
      supabase.from('fin_contas_pagar').select('id, descricao, valor, data_vencimento, status, fornecedor, recorrente, recorrencia_config')
        .in('status', ['AGUARDANDO_APROVACAO', 'APROVADO']).order('data_vencimento'),
      supabase.from('fin_contas_receber').select('id, descricao, valor, data_vencimento, status, cliente, recorrente, recorrencia_config')
        .eq('status', 'A_RECEBER').order('data_vencimento'),
      fetchConciliadosExtrato(),
      // Entradas ignoradas para esta conta
      contaSel ? supabase.from('fin_conciliacao_ignoradas').select('data, valor, tipo, descricao')
        .eq('conta_id', contaSel) : Promise.resolve({ data: [] }),
      fetchVinculosExtrato(),
      // Transferências que tocam esta conta (origem OU destino) — candidatas a
      // contrapartida reconhecida por valor/data, sem depender de FITID/OFX.
      // Não filtra por `conciliado`: a transferência já nasce conciliado=true
      // no lado que a criou, então o filtro de "pendente" das demais queries
      // sempre a excluiria.
      contaSel ? supabase.from('fin_lancamentos').select('id, data_competencia, valor, conta_id, conta_destino_id, descricao')
        .eq('tipo', 'TRANSFERENCIA').eq('status', 'REALIZADO')
        .or(`conta_id.eq.${contaSel},conta_destino_id.eq.${contaSel}`)
        .order('data_competencia', { ascending: false }).limit(500) : Promise.resolve({ data: [] }),
      // Baixas feitas em Contas a Pagar/Receber. Já estão conciliadas, então as
      // demais queries (que filtram `conciliado = false`) nunca as trariam — e a
      // linha correspondente do extrato virava um segundo lançamento.
      contaSel ? supabase.from('fin_lancamentos').select('id, data_competencia, data_pagamento, valor, tipo, descricao, conciliado, conta_id, origem')
        .eq('conta_id', contaSel).eq('status', 'REALIZADO')
        .in('origem', ['espelho_cp', 'espelho_cr'])
        .order('data_pagamento', { ascending: false, nullsFirst: false }).limit(500) : Promise.resolve({ data: [] }),
    ]);

    const lancSameConta = ((lancRes as { data: LancamentoCandidate[] | null }).data || []) as LancamentoCandidate[];
    const lancAll = (lancAllRes.data || []) as LancamentoCandidate[];
    const contasPagar = (cpRes.data || []) as ContaPagarCandidate[];
    const contasReceber = (crRes.data || []) as ContaReceberCandidate[];

    const vinculos = (vinculosRes.data || []) as { external_id: string; tipo: string; lancamento_id: string }[];
    const externalIdsProcessados = new Map(vinculos.map(v => [`${v.tipo}|${v.external_id}`, v.lancamento_id]));
    const lancamentosVinculados = new Set(vinculos.map(v => v.lancamento_id).filter(Boolean));

    // Já conciliadas — mostrar com badge em vez de filtrar silenciosamente.
    // Lançamento que já tem vínculo de FITID fica FORA deste contador: ele é
    // reconhecido pela identidade bancária, e contá-lo aqui também faria a MESMA
    // baixa ser reivindicada duas vezes — uma pelo FITID e outra por
    // valor/data/descrição. Em vendas legítimas repetidas no mesmo dia (mesmo valor,
    // mesma bandeira) isso marcava as duas linhas como "já conciliada" e a venda que
    // de fato faltava no razão sumia da lista de pendentes.
    const conciliadosCounts = new Map<string, number>();
    for (const l of (conciliadosRes.data || []) as ConciliadoRow[]) {
      if (lancamentosVinculados.has(l.id)) continue;
      // Mesma regra do loop de sugestões abaixo: a linha do extrato traz a data em
      // que o dinheiro se moveu, que para uma baixa de CP/CR é `data_pagamento` —
      // `data_competencia` é a competência do boleto e pode estar semanas atrás.
      // Usar só `data_competencia` aqui deixava um boleto pago com atraso e
      // reimportado (sem FITID estável, ou via CSV) não bater como "já
      // conciliada", criando um segundo lançamento real para o mesmo pagamento.
      const dataChave = l.data_pagamento || l.data_competencia;
      const key = bankLineKey({ data: dataChave, valor: l.valor, tipo: l.tipo, descricao: l.descricao });
      conciliadosCounts.set(key, (conciliadosCounts.get(key) || 0) + 1);
    }

    // Ignoradas — mostrar com badge "Ignorado"
    const ignoradasCounts = new Map<string, number>();
    for (const l of (ignoradasRes.data || []) as { data: string; valor: number; tipo: string; descricao: string | null }[]) {
      const key = bankLineKey(l);
      ignoradasCounts.set(key, (ignoradasCounts.get(key) || 0) + 1);
    }

    const espelhos = ((espelhosRes as { data: LancamentoCandidate[] | null }).data || []) as LancamentoCandidate[];

    const lancMap = new Map<string, LancamentoCandidate>();
    for (const l of lancSameConta) lancMap.set(l.id, { ...l, _sameAccount: true });
    for (const l of lancAll) { if (!lancMap.has(l.id)) lancMap.set(l.id, { ...l, _sameAccount: false }); }
    // Espelhos entram por último e sobrescrevem: se o mesmo lançamento veio nas
    // duas listas, o que importa é a marca de "já está no razão".
    for (const l of espelhos) lancMap.set(l.id, { ...l, _sameAccount: true, _jaNoRazao: true });
    const allLancamentos = Array.from(lancMap.values());

    const transferCandidates = (transferRes.data || []) as TransferCandidate[];

    return { allLancamentos, contasPagar, contasReceber, conciliadosCounts, ignoradasCounts, externalIdsProcessados, lancamentosVinculados, transferCandidates };
  };

  /** Recalcula o estado de match de UMA linha (já conciliada/ignorada/sugestão) contra o contexto atual do banco. */
  const matchLinha = (linha: LinhaExtrato, ctx: MatchContext, usedIds: Set<string>): LinhaExtrato => {
    const key = bankLineKey(linha);
    const base = {
      ...linha,
      matchId: undefined, matchOrigin: undefined, matchDescricao: undefined, matchRaw: undefined,
      matchJaNoRazao: undefined, suggestions: undefined,
      transferReconhecida: undefined, transferAlertas: undefined,
    };

    // FITID é a identidade bancária estável e tem precedência sobre campos
    // editáveis do lançamento (descrição/categoria/data de competência).
    // Consumo 1:1 dentro do arquivo: se o lançamento deste vínculo já foi
    // reivindicado por OUTRA linha deste mesmo arquivo, esta linha NÃO está
    // coberta no razão — deixa cair no fluxo normal (pendente/nova) em vez de
    // marcá-la "já conciliada". Sem isso, duas vendas idênticas do mesmo dia
    // vinculadas por engano ao mesmo lançamento ficavam ambas verdes e a venda
    // que faltava sumia do saldo (15 vendas, R$ 3.060,15 em produção).
    if (linha.fitId) {
      const vincLancId = ctx.externalIdsProcessados.get(`${linha.tipo}|${linha.fitId}`);
      if (vincLancId && !usedIds.has(`vinculo-lanc-${vincLancId}`)) {
        usedIds.add(`vinculo-lanc-${vincLancId}`);
        return { ...base, selecionada: false, jaConciliada: true, ignorada: false };
      }
    }

    // Já conciliada — exibir informativo, sem ação
    if (consumeCount(ctx.conciliadosCounts, key)) {
      return { ...base, selecionada: false, jaConciliada: true, ignorada: false };
    }

    // Ignorada — exibir informativo, sem ação
    if (consumeCount(ctx.ignoradasCounts, key)) {
      return { ...base, selecionada: false, ignorada: true, jaConciliada: false };
    }

    // Contrapartida de transferência já lançada pela outra conta — reconhece por
    // valor/data (não depende de FITID, então funciona em OFX e CSV). Sem isso,
    // essa linha nunca teria candidato no loop de sugestões abaixo: uma linha de
    // extrato só é RECEITA/DESPESA, e o lançamento de transferência é sempre
    // tipo='TRANSFERENCIA' — a comparação `ex.tipo !== linha.tipo` descartaria
    // sempre, levando o usuário a recriar a transferência manualmente (duplicidade).
    let transferAlertas: TransferWarning[] | undefined;
    if (contaSel) {
      const transferMatch = matchTransferCandidate(linha, contaSel, ctx.transferCandidates, usedIds);
      if (transferMatch) {
        usedIds.add(`transfer-${transferMatch.id}`);
        const candidato = ctx.transferCandidates.find(c => c.id === transferMatch.id);
        return {
          ...base,
          selecionada: false,
          jaConciliada: true,
          ignorada: false,
          transferReconhecida: candidato ? {
            id: candidato.id,
            data: candidato.data_competencia,
            conta_id: candidato.conta_id,
            conta_destino_id: candidato.conta_destino_id,
          } : undefined,
        };
      }

      // Não deu para reconhecer com segurança, mas existe transferência de mesmo
      // valor por perto: avisa em vez de deixar a linha parecer 100% nova.
      const warnings = findTransferWarnings(linha, contaSel, ctx.transferCandidates, usedIds);
      if (warnings.length > 0) transferAlertas = warnings;
    }

    const suggestions: MatchSuggestion[] = [];

    for (const ex of ctx.allLancamentos) {
      if (usedIds.has(`lanc-${ex.id}`)) continue;
      if (ex.tipo !== linha.tipo) continue;
      // Já amarrado a outra linha bancária — oferecê-lo de novo esconderia uma
      // despesa real atrás de uma baixa que já foi conciliada.
      if (ctx.lancamentosVinculados.has(ex.id)) continue;
      // A linha do extrato traz a data em que o dinheiro se moveu. Para uma baixa
      // de CP/CR isso é `data_pagamento` — `data_competencia` guarda a competência
      // do boleto e pode estar semanas atrás, o que zerava o score e fazia a linha
      // parecer nova.
      const dataCandidato = ex.data_pagamento || ex.data_competencia;
      let score = computeScore(linha.valor, linha.data, linha.descricao, Number(ex.valor), dataCandidato, ex.descricao || '');
      if (score === 0) continue;
      if (ex._sameAccount) score += 10;
      suggestions.push({
        id: ex.id, origin: 'lancamento', descricao: ex.descricao || '(sem desc.)',
        valor: Number(ex.valor), data: dataCandidato,
        extra: ex._jaNoRazao
          ? (ex.origem === 'espelho_cr' ? 'Já baixado em Contas a Receber' : 'Já baixado em Contas a Pagar')
          : (ex._sameAccount ? 'Mesma conta' : `Conta: ${getContaNome(ex.conta_id)}`),
        score, raw: ex, jaNoRazao: ex._jaNoRazao,
      });
    }

    if (linha.tipo === 'DESPESA') {
      for (const cp of ctx.contasPagar) {
        if (usedIds.has(`cp-${cp.id}`)) continue;
        const score = computeScore(linha.valor, linha.data, linha.descricao, Number(cp.valor), cp.data_vencimento, cp.descricao || '');
        if (score === 0) continue;
        suggestions.push({
          id: cp.id, origin: 'conta_pagar', descricao: cp.descricao || '(sem desc.)',
          valor: Number(cp.valor), data: cp.data_vencimento,
          extra: cp.fornecedor || undefined, score, raw: cp,
        });
      }
    }

    if (linha.tipo === 'RECEITA') {
      for (const cr of ctx.contasReceber) {
        if (usedIds.has(`cr-${cr.id}`)) continue;
        const score = computeScore(linha.valor, linha.data, linha.descricao, Number(cr.valor), cr.data_vencimento, cr.descricao || '');
        if (score === 0) continue;
        suggestions.push({
          id: cr.id, origin: 'conta_receber', descricao: cr.descricao || '(sem desc.)',
          valor: Number(cr.valor), data: cr.data_vencimento,
          extra: cr.cliente || undefined, score, raw: cr,
        });
      }
    }

    suggestions.sort((a, b) => b.score - a.score);

    const best = suggestions[0];
    // Boleto só vira match automático com o valor batendo no centavo. A tolerância
    // de 5% do score já casou boleto de um fornecedor com linha de outro (KIDELICIA
    // 1.185,14 × 1.138,60, exatamente 60 pontos) e baixou 21 contas de uma vez.
    // Valor aproximado continua aparecendo como sugestão, para escolha manual.
    const valorExatoSeNecessario = !best
      || (best.origin === 'lancamento')
      || Math.abs(Number(best.valor) - linha.valor) < 0.01;

    if (best && best.score >= 60 && valorExatoSeNecessario) {
      usedIds.add(`${best.origin === 'lancamento' ? 'lanc' : best.origin === 'conta_pagar' ? 'cp' : 'cr'}-${best.id}`);
      return {
        ...base,
        matchId: best.id,
        matchOrigin: best.origin,
        matchDescricao: best.descricao,
        matchRaw: best.raw,
        matchJaNoRazao: best.jaNoRazao,
        suggestions,
        selecionada: false,
        jaConciliada: false,
        ignorada: false,
        transferAlertas,
      };
    }

    return { ...base, jaConciliada: false, ignorada: false, suggestions: suggestions.length > 0 ? suggestions : undefined, transferAlertas };
  };

  /**
   * Vincula o segundo extrato de uma transferência já criada pelo primeiro banco.
   * A RPC só aceita um candidato inequívoco e exige um vínculo bancário prévio na
   * conta oposta; coincidências ambíguas continuam disponíveis para revisão manual.
   */
  const autoBindTransferCounterparts = async (parsed: LinhaExtrato[]) => {
    if (!contaSel || !canReconcileRbac) return;
    const linesWithExternalId = parsed
      .filter(linha => !!linha.fitId)
      .map(linha => ({
        external_id: linha.fitId!,
        tipo: linha.tipo,
        data: linha.data,
        valor: linha.valor,
      }));
    if (linesWithExternalId.length === 0) return;

    const result = await runOptionalAutoBind(() =>
      supabase.rpc('reconcile_auto_bind_transfer_counterparts', {
        p_conta_id: contaSel,
        p_lines: linesWithExternalId,
      }),
    );

    if (!result.ok) {
      console.warn('[ConciliacaoBancariaSection.autoBindTransferCounterparts] optional step failed', {
        diagnostic: result.diagnostic,
        error: result.error,
      });
      toast.warning(
        'Extrato carregado. O reconhecimento automático de transferências ficou indisponível; revise esses vínculos manualmente.',
      );
    }
  };

  /** Busca matches e popula sugestões de conciliação para linhas já parseadas (usado ao importar um arquivo novo). */
  const processarLinhas = async (parsed: LinhaExtrato[]) => {
    try {
      await autoBindTransferCounterparts(parsed);
      const ctx = await fetchMatchContext();
      const usedIds = new Set<string>();
      const final = parsed.map(linha => matchLinha(linha, ctx, usedIds));

      const matchedLanc = final.filter(l => l.matchOrigin === 'lancamento').length;
      const matchedCP = final.filter(l => l.matchOrigin === 'conta_pagar').length;
      const matchedCR = final.filter(l => l.matchOrigin === 'conta_receber').length;
      const jaConciliadas = final.filter(l => l.jaConciliada).length;
      const ignoradas = final.filter(l => l.ignorada).length;
      const withSuggestions = final.filter(l => !l.matchId && !l.jaConciliada && !l.ignorada && l.suggestions && l.suggestions.length > 0).length;
      const unmatched = final.length - matchedLanc - matchedCP - matchedCR - jaConciliadas - ignoradas;

      const msg = `${final.length} transações: `;
      const msgParts: string[] = [];
      if (matchedLanc > 0) msgParts.push(`${matchedLanc} match lançamento`);
      if (matchedCP > 0) msgParts.push(`${matchedCP} match contas a pagar`);
      if (matchedCR > 0) msgParts.push(`${matchedCR} match contas a receber`);
      if (jaConciliadas > 0) msgParts.push(`${jaConciliadas} já conciliada(s)`);
      if (ignoradas > 0) msgParts.push(`${ignoradas} ignorada(s)`);
      if (withSuggestions > 0) msgParts.push(`${withSuggestions} com sugestões`);
      msgParts.push(`${unmatched - withSuggestions} nova(s)`);
      toast.success(msg + msgParts.join(', '));

      setLinhas(final);
      setImportFilter('todos');
    } catch (err) {
      console.error('[ConciliacaoBancariaSection.processarLinhas]', err);
      toast.error(extractSupabaseErrorMessage(err, 'Erro ao processar arquivo'));
    }
  };

  /**
   * Revalida silenciosamente as linhas marcadas como "já conciliada"/"ignorada" contra o banco.
   * Essas linhas não têm estado manual do usuário (seleção/sugestão escolhida), então podem ser
   * recalculadas com segurança — ao contrário das demais linhas (com matchId/rateio/categoria
   * escolhidos manualmente), que nunca são tocadas aqui.
   * Corrige o caso de uma linha continuar exibindo "Já conciliada anteriormente" no Importar
   * Extrato depois que o lançamento correspondente foi desconciliado/excluído na aba Lançamentos.
   */
  const refreshLockedLinhas = async (source?: LinhaExtrato[]) => {
    if (!contaSel) return;
    const base = source || linhas;
    if (!base.some(l => l.jaConciliada || l.ignorada)) return;
    try {
      const ctx = await fetchMatchContext();
      const usedIds = new Set<string>();
      for (const l of base) {
        if (!l.jaConciliada && !l.ignorada && l.matchId && l.matchOrigin) {
          usedIds.add(`${l.matchOrigin === 'lancamento' ? 'lanc' : l.matchOrigin === 'conta_pagar' ? 'cp' : 'cr'}-${l.matchId}`);
        }
      }
      setLinhas(prev => prev.map(l => (l.jaConciliada || l.ignorada) ? matchLinha(l, ctx, usedIds) : l));
    } catch (err) {
      console.error('[ConciliacaoBancariaSection.refreshLockedLinhas]', err);
    }
  };

  const openConfirmSaldo = (
    parsed: LinhaExtrato[],
    saldoFinalArquivo: { valor: number; data: string } | undefined,
    fileName: string,
  ) => {
    const datas = parsed.map(l => l.data).sort();
    setConfirmSaldoDialog({
      open: true,
      parsed,
      nomeArquivo: fileName,
      periodoInicio: datas[0],
      periodoFim: datas[datas.length - 1],
      deltaExtrato: parsed.reduce((sum, l) => sum + (l.tipo === 'RECEITA' ? l.valor : -l.valor), 0),
      saldoSugerido: saldoFinalArquivo,
    });
  };

  /** Continuação de handleFile após a checagem de linhas pendentes (direto, ou após confirmar substituição). */
  const continuarComArquivo = (
    parsed: LinhaExtrato[],
    extratoInfo: ExtratoConta,
    saldoFinalArquivo: { valor: number; data: string } | undefined,
    fileName: string,
  ) => {
    // Verifica se o extrato pertence à conta selecionada
    const contaCadastro = contas.find(c => c.id === contaSel);
    const verdict = verifyContaExtrato(extratoInfo, contaCadastro);

    if (verdict.status === 'mismatch') {
      // Bloqueia — abre dialog com opção de override
      setContaMismatch({ open: true, parsed, extratoInfo, saldoFinalArquivo, fileName });
      return;
    }

    if (verdict.status === 'unverified' && (extratoInfo.numeroConta || extratoInfo.agencia)) {
      // O extrato tem info de conta mas não foi possível comparar (ex: cadastro sem nº/agência)
      toast.warning('Não foi possível confirmar a conta do extrato — verifique se a conta selecionada está correta.');
    }

    openConfirmSaldo(parsed, saldoFinalArquivo, fileName);
  };

  const confirmarSubstituirExtrato = () => {
    if (!substituirExtratoDialog) return;
    const { parsed, extratoInfo, saldoFinalArquivo, fileName } = substituirExtratoDialog;
    setSubstituirExtratoDialog(null);
    continuarComArquivo(parsed, extratoInfo, saldoFinalArquivo, fileName);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNomeArquivo(file.name);
    setLoading(true);
    try {
      const text = await file.text();
      const result = parseExtrato(file.name, text);
      const parsed: LinhaExtrato[] = result.linhas.map(l => ({ ...l, selecionada: true }));

      if (parsed.length === 0) {
        toast.error('Nenhuma transação encontrada no arquivo.');
        return;
      }

      // Linhas de um upload anterior ainda não resolvidas (nem conciliadas, nem
      // ignoradas): substituir sem avisar as fazia sumir da fila de trabalho e
      // do sessionStorage sem qualquer confirmação — ficavam pendentes de
      // categoria/rateio já escolhidos e nunca eram reprocessadas.
      const pendentes = linhas.filter(l => !l.jaConciliada && !l.ignorada).length;
      if (pendentes > 0) {
        setSubstituirExtratoDialog({
          open: true, parsed, extratoInfo: result.conta,
          saldoFinalArquivo: result.saldoFinalArquivo, fileName: file.name, pendentes,
        });
        return;
      }

      continuarComArquivo(parsed, result.conta, result.saldoFinalArquivo, file.name);
    } catch (err) {
      console.error('[ConciliacaoBancariaSection.handleFile]', err);
      toast.error('Erro ao processar arquivo');
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
      setNomeArquivo('');
    }
  };

  const limparExtrato = () => {
    setLinhasState([]);
    setImportFilter('todos');
    setNomeArquivo('');
    setSaldoExtrato(null);
    setConferenciaSaldo(null);
    if (contaSel) clearSaldoExtrato(contaSel);
    if (contaSel) clearLinhas(contaSel);
  };

  // ========== Ignorar linha ==========
  const ignorarLinha = async (i: number) => {
    const linha = linhas[i];
    if (!linha || !contaSel) return;
    try {
      const { error } = await supabase.rpc('reconcile_ignorar_lancamento', {
        p_conta_id: contaSel,
        p_data: linha.data,
        p_valor: linha.valor,
        p_tipo: linha.tipo,
        p_descricao: linha.descricao,
        p_user_id: user?.id,
      });
      if (error) throw error;
      setLinhas(prev => prev.filter((_, j) => j !== i));
      toast.success('Entrada ignorada. Não aparecerá em reimportações.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao ignorar entrada');
    }
  };

  // ========== Rateio Functions ==========
  const openRateio = (linhaIndex: number) => {
    const linha = linhas[linhaIndex];
    const existing = linha.rateioLinhas;
    if (existing && existing.length > 0) {
      setRateioLinhas([...existing]);
    } else {
      setRateioLinhas([{ categoria_id: '', centro_custo_id: '', valor: linha.valor, percentual: 100, observacao: '' }]);
    }
    setRateioDialog({ open: true, linhaIndex });
  };

  const addRateioLinha = () => {
    setRateioLinhas(prev => [...prev, { categoria_id: '', centro_custo_id: '', valor: 0, percentual: 0, observacao: '' }]);
  };

  const removeRateioLinha = (idx: number) => {
    setRateioLinhas(prev => prev.filter((_, i) => i !== idx));
  };

  const updateRateioLinha = (idx: number, field: keyof RateioLinha, value: string | number) => {
    setRateioLinhas(prev => {
      const updated = [...prev];
      const linha = { ...updated[idx], [field]: value };
      const valorTotal = linhas[rateioDialog.linhaIndex]?.valor || 0;

      if (field === 'categoria_id') {
        const cat = categorias.find(c => c.id === value);
        if (cat?.centro_custo_padrao_id) linha.centro_custo_id = cat.centro_custo_padrao_id;
      }

      if (field === 'valor' && valorTotal > 0) {
        linha.percentual = Math.round((Number(value) / valorTotal) * 10000) / 100;
      } else if (field === 'percentual' && valorTotal > 0) {
        linha.valor = Math.round((Number(value) / 100) * valorTotal * 100) / 100;
      }

      updated[idx] = linha;
      return updated;
    });
  };

  const ratearIgual = () => {
    const valorTotal = linhas[rateioDialog.linhaIndex]?.valor || 0;
    const n = rateioLinhas.length;
    if (n === 0) return;
    const valorCada = Math.floor((valorTotal / n) * 100) / 100;
    const resto = Math.round((valorTotal - valorCada * n) * 100) / 100;
    setRateioLinhas(prev => prev.map((l, i) => ({
      ...l,
      valor: i === 0 ? valorCada + resto : valorCada,
      percentual: Math.round(((i === 0 ? valorCada + resto : valorCada) / valorTotal) * 10000) / 100,
    })));
  };

  const salvarRateio = () => {
    const valorTotal = linhas[rateioDialog.linhaIndex]?.valor || 0;
    const totalRateio = rateioLinhas.reduce((s, l) => s + Number(l.valor || 0), 0);
    if (Math.abs(totalRateio - valorTotal) > 0.01) {
      toast.error(`Rateio incompleto. Diferença: ${fmt(valorTotal - totalRateio)}`);
      return;
    }
    if (rateioLinhas.some(l => !l.categoria_id)) {
      toast.error('Todas as linhas do rateio precisam ter uma categoria.');
      return;
    }
    setLinhas(prev => prev.map((l, i) => i === rateioDialog.linhaIndex ? { ...l, rateioLinhas: [...rateioLinhas] } : l));
    setRateioDialog({ open: false, linhaIndex: -1 });
    toast.success('Rateio configurado com sucesso!');
  };

  const selectSuggestion = (linhaIndex: number, suggestion: MatchSuggestion) => {
    setLinhas(prev => prev.map((l, i) => i === linhaIndex ? {
      ...l,
      matchId: suggestion.id,
      matchOrigin: suggestion.origin,
      matchDescricao: suggestion.descricao,
      matchRaw: suggestion.raw,
      matchJaNoRazao: suggestion.jaNoRazao,
      selecionada: false,
    } : l));
    setSuggestionsDialog({ open: false, linhaIndex: -1 });
  };

  const clearMatch = (linhaIndex: number) => {
    setLinhas(prev => prev.map((l, i) => i === linhaIndex ? {
      ...l,
      matchId: undefined,
      matchOrigin: undefined,
      matchDescricao: undefined,
      matchRaw: undefined,
      matchJaNoRazao: undefined,
      selecionada: true,
    } : l));
  };

  // ========== Seletor manual de boleto em aberto ==========
  // O match automático só sugere um boleto quando valor e data estão próximos.
  // Boleto pago com atraso ficava invisível e a pessoa acabava criando um
  // lançamento novo — e depois pagando o boleto de novo em Contas a Pagar.
  const abrirBoletoDialog = (linhaIndex: number) => {
    const linha = linhas[linhaIndex];
    if (!linha) return;
    setBoletoDialog({ open: true, linhaIndex });
    setBoletoBusca('');
    buscarBoletos('', linha);
  };

  const buscarBoletos = async (termo: string, linhaRef?: LinhaExtrato) => {
    const linha = linhaRef || linhas[boletoDialog.linhaIndex];
    setBoletoLoading(true);
    try {
      const { data, error } = await supabase.rpc('list_fin_contas_pagar_abertas' as any, {
        // ILIKE não remove acentos: o termo vai normalizado para bater com as
        // colunas *_unaccent do banco.
        p_search: normalizeSearchText(termo) || null,
        p_valor: linha?.valor ?? null,
        p_data: linha?.data ?? null,
        p_limit: 30,
      } as any);
      if (error) throw error;
      setBoletoOpcoes((data as unknown as ContaPagarAberta[]) || []);
    } catch (err) {
      console.error('[ConciliacaoBancariaSection.buscarBoletos]', err);
      toast.error(mapPagamentoError(err));
      setBoletoOpcoes([]);
    } finally {
      setBoletoLoading(false);
    }
  };

  const selecionarBoleto = (boleto: ContaPagarAberta) => {
    const i = boletoDialog.linhaIndex;
    if (i < 0) return;
    if (!boleto.tem_categoria) {
      toast.error('Este boleto está sem categoria. Informe a categoria em Contas a Pagar antes de conciliar.');
      return;
    }
    setLinhas(prev => prev.map((l, j) => j === i ? {
      ...l,
      matchId: boleto.id,
      matchOrigin: 'conta_pagar' as const,
      matchDescricao: boleto.fornecedor ? `${boleto.descricao} — ${boleto.fornecedor}` : boleto.descricao,
      matchRaw: {
        id: boleto.id, descricao: boleto.descricao, valor: boleto.valor,
        data_vencimento: boleto.data_vencimento, status: boleto.status,
        fornecedor: boleto.fornecedor, recorrente: false, recorrencia_config: null,
      } as ContaPagarCandidate,
      matchJaNoRazao: false,
      selecionada: false,
    } : l));
    setBoletoDialog({ open: false, linhaIndex: -1 });
    toast.success('Boleto vinculado. Use "Baixar" ou "Processar" para dar baixa com a data do extrato.');
  };

  const bindExtratoLine = async (linha: LinhaExtrato | undefined, lancamentoId?: string | null) => {
    if (!linha?.fitId || !lancamentoId || !contaSel) return;
    const { error } = await supabase.rpc('reconcile_bind_extrato', {
      p_conta_id: contaSel,
      p_external_id: linha.fitId,
      p_tipo: linha.tipo,
      p_lancamento_id: lancamentoId,
    });
    if (error) throw error;
  };

  /** Rateio (ou categoria única) da linha, no formato que a RPC de importação espera. */
  const buildRateioPayload = (l: LinhaExtrato) => {
    if (l.rateioLinhas && l.rateioLinhas.length > 0) {
      return l.rateioLinhas.map(r => ({
        categoria_id: r.categoria_id || null,
        centro_custo_id: r.centro_custo_id || null,
        valor: r.valor,
        percentual: r.percentual || null,
        observacao: r.observacao || null,
      }));
    }
    if (l.categoriaId) {
      const cat = categorias.find(c => c.id === l.categoriaId);
      return [{
        categoria_id: l.categoriaId,
        centro_custo_id: cat?.centro_custo_padrao_id || null,
        valor: l.valor,
        percentual: 100,
        observacao: null,
      }];
    }
    return null;
  };

  /** Linha sinalizada como possível duplicata: usuário confirmou que é uma
   *  transação legítima repetida (ex.: duas vendas iguais no mesmo dia) e
   *  quer importar mesmo assim. */
  const forcarImportarDuplicata = async (item: { linha: LinhaExtrato; lancamentoId: string; criadoEm?: string }) => {
    const l = item.linha;
    try {
      const { data, error } = await supabase.rpc('reconcile_import_lancamento', {
        p_data: l.data, p_descricao: l.descricao, p_valor: l.valor, p_tipo: l.tipo,
        p_conta_id: contaSel, p_user_id: user?.id,
        p_rateio_linhas: buildRateioPayload(l),
        p_external_id: l.fitId || null,
        p_force_duplicate: true,
      });
      if (error) throw error;
      const result = data as { lancamento_id?: string } | null;
      await bindExtratoLine(l, result?.lancamento_id);
      setLinhas(prev => prev.filter(x => x !== l));
      setDuplicataDialog(prev => ({ ...prev, itens: prev.itens.filter(it => it.linha !== l) }));
      loadLancamentos();
      emitDataEvent('financeiro:lancamentos');
      emitDataEvent('financeiro:conciliacao');
      toast.success('Lançamento importado como transação legítima repetida.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao importar');
    }
  };

  /** Linha sinalizada como possível duplicata: usuário confirmou que é a mesma
   *  cobrança e prefere só marcá-la como ignorada (não entra no razão). */
  const ignorarDuplicata = (item: { linha: LinhaExtrato; lancamentoId: string; criadoEm?: string }) => {
    const idx = linhas.findIndex(x => x === item.linha);
    setDuplicataDialog(prev => ({ ...prev, itens: prev.itens.filter(it => it.linha !== item.linha) }));
    if (idx >= 0) ignorarLinha(idx);
  };

  /** Valor do boleto/título escolhido para a linha (o do extrato é `linha.valor`). */
  const valorDoTitulo = (linha: LinhaExtrato): number => {
    const raw = linha.matchRaw as ContaPagarCandidate | ContaReceberCandidate | undefined;
    return Number(raw?.valor ?? linha.valor);
  };

  /** Extrato menos boleto: positivo = pagou a mais (juros/tarifa); negativo = desconto. */
  const diferencaBaixa = (linha: LinhaExtrato): number =>
    Math.round((linha.valor - valorDoTitulo(linha)) * 100) / 100;

  const abrirRevisaoBaixa = (indices: number[], escopo: 'lote' | 'individual' = 'lote') => {
    setAjustesBaixa(prev => {
      const next = { ...prev };
      for (const i of indices) {
        if (next[i]) continue;
        const linha = linhas[i];
        const diff = linha ? diferencaBaixa(linha) : 0;
        // Sugere a classificação pelo sinal; a categoria continua escolha da pessoa,
        // menos no desconto, onde o padrão não operacional já vem escolhido — o
        // conjunto de categorias muda de lado (receita x despesa) conforme
        // matchOrigin, mas o sinal que decide DESCONTO x JUROS é o mesmo dos dois lados.
        const descontoPadraoId = linha?.matchOrigin === 'conta_receber'
          ? categoriaDescontoConcedidoPadraoId
          : categoriaDescontoPadraoId;
        next[i] = diff < 0
          ? { tipo: 'DESCONTO', categoriaId: descontoPadraoId }
          : { tipo: diff > 0 ? 'JUROS' : '', categoriaId: '' };
      }
      return next;
    });
    setBaixaDialog({ open: true, indices, escopo });
  };

  const confirmarRevisaoBaixa = () => {
    for (const i of baixaDialog.indices) {
      const linha = linhas[i];
      if (!linha) continue;
      const diff = diferencaBaixa(linha);
      if (Math.abs(diff) < 0.01) continue;

      if (linha.matchOrigin !== 'conta_pagar' && linha.matchOrigin !== 'conta_receber') {
        toast.error(`"${linha.matchDescricao}": o valor recebido difere do título. Ajuste o título antes de baixar.`);
        return;
      }
      const ajuste = ajustesBaixa[i];
      if (!ajuste?.tipo) {
        toast.error(`Classifique a diferença de ${fmt(Math.abs(diff))} em "${linha.matchDescricao}".`);
        return;
      }
      if (!ajuste.categoriaId) {
        toast.error(`Selecione a categoria da diferença em "${linha.matchDescricao}".`);
        return;
      }
    }
    const { indices, escopo } = baixaDialog;
    setBaixaDialog({ open: false, indices: [], escopo: 'lote' });
    if (escopo === 'individual') processarBaixas(indices);
    else importarEConciliar(true, true);
  };

  /** Baixa apenas as linhas indicadas (botão "Baixar" de uma linha só). */
  const processarBaixas = async (indices: number[]) => {
    if (!contaSel) return;
    const alvos = indices.map(i => linhas[i]).filter(Boolean);
    if (alvos.length === 0) return;

    setProcessando(true);
    try {
      for (const l of alvos) {
        const idx = linhas.indexOf(l);
        const ajuste = ajustesBaixa[idx];
        const temDiferenca = Math.abs(diferencaBaixa(l)) >= 0.01;

        if (l.matchOrigin === 'conta_pagar') {
          const { data, error } = await supabase.rpc('reconcile_pay_conta_pagar', {
            p_conta_pagar_id: l.matchId!, p_conta_bancaria_id: contaSel,
            p_data_pagamento: l.data, p_user_id: user?.id,
            p_valor_extrato: l.valor,
            p_ajuste_tipo: temDiferenca ? (ajuste?.tipo || null) : null,
            p_ajuste_categoria_id: temDiferenca ? (ajuste?.categoriaId || null) : null,
          } as any);
          if (error) throw error;
          const result = data as { status?: string; lancamento_id?: string } | null;
          await bindExtratoLine(l, result?.lancamento_id);
          if (result?.status === 'noop') toast.info(`"${l.matchDescricao}" já estava paga — linha vinculada ao lançamento existente.`);
        } else if (l.matchOrigin === 'conta_receber') {
          const { data, error } = await supabase.rpc('reconcile_receive_conta_receber', {
            p_conta_receber_id: l.matchId!, p_conta_bancaria_id: contaSel,
            p_data_recebimento: l.data, p_user_id: user?.id,
            p_valor_extrato: l.valor,
            p_ajuste_tipo: temDiferenca ? (ajuste?.tipo || null) : null,
            p_ajuste_categoria_id: temDiferenca ? (ajuste?.categoriaId || null) : null,
          } as any);
          if (error) throw error;
          const result = data as { lancamento_id?: string } | null;
          await bindExtratoLine(l, result?.lancamento_id);
        }
      }

      toast.success(`${alvos.length} baixa(s) registrada(s)`);
      const processadas = new Set(alvos);
      setLinhas(prev => prev.filter(l => !processadas.has(l)));
      emitDataEvent('financeiro:lancamentos');
      emitDataEvent('financeiro:conciliacao');
      emitDataEvent('financeiro:contas_pagar');
      emitDataEvent('financeiro:contas_receber');
      loadLancamentos();
    } catch (err: unknown) {
      console.error('[ConciliacaoBancariaSection.processarBaixas]', err);
      toast.error(mapPagamentoError(err));
    } finally {
      setProcessando(false);
    }
  };

  const importarEConciliar = async (jaConfirmouVinculos = false, jaConfirmouBaixas = false) => {
    if (!contaSel) { toast.error('Selecione uma conta bancária'); return; }

    // Linhas cujo match é uma baixa já registrada em Contas a Pagar/Receber:
    // antes de processar, a pessoa decide entre vincular ou lançar como novo.
    const indicesJaNoRazao = linhas
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => l.matchId && l.matchJaNoRazao && !l.jaConciliada && !l.ignorada)
      .map(({ i }) => i);

    if (indicesJaNoRazao.length > 0 && !jaConfirmouVinculos) {
      setJaNoRazaoDialog({ open: true, indices: indicesJaNoRazao });
      return;
    }

    // Dar baixa em boleto é irreversível pela tela (exige estorno para desfazer):
    // passa sempre por revisão, com o valor do extrato ao lado do valor do boleto.
    const indicesBaixa = linhas
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => l.matchId && (l.matchOrigin === 'conta_pagar' || l.matchOrigin === 'conta_receber') && !l.jaConciliada)
      .map(({ i }) => i);

    if (indicesBaixa.length > 0 && !jaConfirmouBaixas) {
      abrirRevisaoBaixa(indicesBaixa);
      return;
    }

    const toImport = linhas.filter(l => l.selecionada && !l.matchId && !l.jaConciliada && !l.ignorada);
    const toLinkExisting = linhas.filter(l => l.matchId && l.matchOrigin === 'lancamento' && l.matchJaNoRazao && !l.jaConciliada);
    const toReconcileLanc = linhas.filter(l => l.matchId && l.matchOrigin === 'lancamento' && !l.matchJaNoRazao && !l.jaConciliada);
    const pendingCP = linhas.filter(l => l.matchId && l.matchOrigin === 'conta_pagar');
    const pendingCR = linhas.filter(l => l.matchId && l.matchOrigin === 'conta_receber');
    // Conjunto das linhas que serão efetivamente processadas — usado para remover apenas elas da lista no sucesso
    const processadas = new Set<LinhaExtrato>([...toImport, ...toLinkExisting, ...toReconcileLanc, ...pendingCP, ...pendingCR]);

    if (toImport.length === 0 && toLinkExisting.length === 0 && toReconcileLanc.length === 0 && pendingCP.length === 0 && pendingCR.length === 0) {
      toast.error('Nenhuma ação a realizar');
      return;
    }

    const novasSemCategoria = toImport.filter(l => {
      if (l.categoriaId) return false;
      return !l.rateioLinhas?.length || l.rateioLinhas.some(r => !r.categoria_id);
    });
    if (novasSemCategoria.length > 0) {
      toast.error(`${novasSemCategoria.length} linha(s) selecionada(s) estão sem categoria. Selecione a categoria antes de processar.`);
      return;
    }

    const duplicatasDetectadas: { linha: LinhaExtrato; lancamentoId: string; criadoEm?: string }[] = [];

    setImportando(true);
    try {
      if (toImport.length > 0) {
        // Quantas linhas do MESMO conteúdo (mesma bankLineKey) já foram
        // reconhecidas como "já conciliada" nesta conta — a RPC precisa saber
        // isso para não recusar como duplicata uma 2ª/3ª venda idêntica no
        // mesmo dia que já sobrou depois da 1ª ocorrência ser reconhecida.
        const jaConciliadaKeyCounts = new Map<string, number>();
        for (const l of linhas) {
          if (!l.jaConciliada) continue;
          const key = bankLineKey(l);
          jaConciliadaKeyCounts.set(key, (jaConciliadaKeyCounts.get(key) || 0) + 1);
        }
        const occurrenceCounters = new Map<string, number>();

        for (const l of toImport) {
          const key = bankLineKey(l);
          const jaReconhecidas = jaConciliadaKeyCounts.get(key) || 0;
          const dentroDoLote = occurrenceCounters.get(key) || 0;
          occurrenceCounters.set(key, dentroDoLote + 1);

          const { data, error } = await supabase.rpc('reconcile_import_lancamento', {
            p_data: l.data, p_descricao: l.descricao, p_valor: l.valor, p_tipo: l.tipo,
            p_conta_id: contaSel, p_user_id: user?.id,
            p_rateio_linhas: buildRateioPayload(l),
            p_external_id: l.fitId || null,
            p_occurrence_index: jaReconhecidas + dentroDoLote,
          } as any);
          if (error) throw error;
          const result = data as { status?: string; lancamento_id?: string; criado_em?: string } | null;

          // Mesmo valor/data/descrição/conta já conciliados com um FITID
          // diferente — provável reimportação do mesmo extrato. Não insere:
          // fica pendente para a pessoa decidir (ver duplicataDialog).
          if (result?.status === 'possible_duplicate' && result.lancamento_id) {
            duplicatasDetectadas.push({ linha: l, lancamentoId: result.lancamento_id, criadoEm: result.criado_em });
            processadas.delete(l);
            continue;
          }

          await bindExtratoLine(l, result?.lancamento_id);
        }
      }

      // Baixa que já está no razão: só amarra a linha bancária ao lançamento
      // existente. Nada de lançamento novo — é o que duplicava a despesa.
      for (const l of toLinkExisting) {
        const { error } = await supabase.rpc('reconcile_link_existing_lancamento' as any, {
          p_conta_id: contaSel,
          p_lancamento_id: l.matchId!,
          p_external_id: l.fitId || null,
          p_tipo: l.tipo,
          p_data_extrato: l.data,
        } as any);
        if (error) throw error;
      }

      if (toReconcileLanc.length > 0) {
        const matchIds = toReconcileLanc.map(l => l.matchId!);
        const { error } = await supabase.rpc('reconcile_batch_lancamentos', {
          p_lancamento_ids: matchIds,
        });
        if (error) throw error;
        for (const l of toReconcileLanc) await bindExtratoLine(l, l.matchId);
      }

      for (const l of pendingCP) {
        // O valor do extrato vai junto: a RPC recusa a baixa se houver diferença
        // sem classificação, e lança juros/tarifa/desconto em categoria separada.
        const idx = linhas.indexOf(l);
        const ajuste = ajustesBaixa[idx];
        const temDiferenca = Math.abs(diferencaBaixa(l)) >= 0.01;
        const { data, error } = await supabase.rpc('reconcile_pay_conta_pagar', {
          p_conta_pagar_id: l.matchId!, p_conta_bancaria_id: contaSel,
          p_data_pagamento: l.data, p_user_id: user?.id,
          p_valor_extrato: l.valor,
          p_ajuste_tipo: temDiferenca ? (ajuste?.tipo || null) : null,
          p_ajuste_categoria_id: temDiferenca ? (ajuste?.categoriaId || null) : null,
        } as any);
        if (error) throw error;
        const result = data as { lancamento_id?: string } | null;
        await bindExtratoLine(l, result?.lancamento_id);
      }

      for (const l of pendingCR) {
        // Mesmo tratamento de pendingCP: o valor do extrato vai junto, a RPC
        // recusa a baixa se houver diferença sem classificação.
        const idx = linhas.indexOf(l);
        const ajuste = ajustesBaixa[idx];
        const temDiferenca = Math.abs(diferencaBaixa(l)) >= 0.01;
        const { data, error } = await supabase.rpc('reconcile_receive_conta_receber', {
          p_conta_receber_id: l.matchId!, p_conta_bancaria_id: contaSel,
          p_data_recebimento: l.data, p_user_id: user?.id,
          p_valor_extrato: l.valor,
          p_ajuste_tipo: temDiferenca ? (ajuste?.tipo || null) : null,
          p_ajuste_categoria_id: temDiferenca ? (ajuste?.categoriaId || null) : null,
        } as any);
        if (error) throw error;
        const result = data as { lancamento_id?: string } | null;
        await bindExtratoLine(l, result?.lancamento_id);
      }

      const total = toImport.length + toLinkExisting.length + toReconcileLanc.length + pendingCP.length + pendingCR.length - duplicatasDetectadas.length;
      const vinculadas = toLinkExisting.length > 0
        ? ` (${toLinkExisting.length} vinculada(s) a baixas já lançadas, sem duplicar)`
        : '';
      if (total > 0) toast.success(`${total} operação(ões) processada(s) com sucesso${vinculadas}`);
      if (duplicatasDetectadas.length > 0) {
        toast.warning(`${duplicatasDetectadas.length} linha(s) não foram importadas por parecerem duplicatas de um lançamento já existente — revise antes de confirmar.`);
        setDuplicataDialog({ open: true, itens: duplicatasDetectadas });
      }
      // Remove apenas as linhas processadas; as demais (não selecionadas, sem match, ignoradas, já conciliadas,
      // ou sinalizadas como possível duplicata) permanecem na lista. setLinhas já persiste no sessionStorage.
      setLinhas(prev => prev.filter(l => !processadas.has(l)));
      loadLancamentos();
      emitDataEvent('financeiro:lancamentos');
      emitDataEvent('financeiro:conciliacao');
      emitDataEvent('financeiro:contas_pagar');
      emitDataEvent('financeiro:contas_receber');
    } catch (err: unknown) {
      console.error('[ConciliacaoBancariaSection.importarEConciliar]', err);
      toast.error(mapPagamentoError(err));
    }
    setImportando(false);
  };

  const toggleAll = (checked: boolean) => {
    setLinhas(prev => prev.map(l => (l.matchId || l.jaConciliada || l.ignorada) ? l : { ...l, selecionada: checked }));
  };

  const fmt = fmtBRL;
  const pendentes = lancamentos.filter(l => !l.conciliado).length;
  const lancamentosFiltrados = lancamentos.filter(l => {
    if (filtro === 'pendentes') return !l.conciliado;
    if (filtro === 'conciliados') return !!l.conciliado;
    return true;
  });
  const conciliados = lancamentos.filter(l => l.conciliado).length;
  const selecionadas = linhas.filter(l => l.selecionada && !l.matchId && !l.jaConciliada && !l.ignorada);
  const matchedTotal = linhas.filter(l => l.matchId && !l.jaConciliada).length;
  const withSuggestions = linhas.filter(l => !l.matchId && !l.jaConciliada && !l.ignorada && l.suggestions && l.suggestions.length > 0).length;
  const jaConciliadas = linhas.filter(l => l.jaConciliada).length;
  const ignoradas = linhas.filter(l => l.ignorada).length;
  const linhasFiltradas = linhas
    .map((linha, index) => ({ linha, index }))
    .filter(({ linha }) => matchesImportFilter(linha, importFilter));

  const importFilterChip = (filter: ImportFilter, label: string, className = '') => (
    <button
      type="button"
      onClick={() => setImportFilter(filter)}
      aria-pressed={importFilter === filter}
      className={cn(
        badgeVariants({ variant: 'outline' }),
        'cursor-pointer transition-colors hover:bg-accent',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        importFilter === filter && 'ring-2 ring-primary ring-offset-1',
        className,
      )}
    >
      {label}
    </button>
  );

  const rateioValorTotal = linhas[rateioDialog.linhaIndex]?.valor || 0;
  const rateioLinhaTipo = linhas[rateioDialog.linhaIndex]?.tipo;
  const rateioTotalAtual = rateioLinhas.reduce((s, l) => s + Number(l.valor || 0), 0);
  const rateioDiff = rateioValorTotal - rateioTotalAtual;
  const rateioValido = Math.abs(rateioDiff) < 0.01;

  const getNomeCategoria = (id: string) => categorias.find(c => c.id === id)?.nome || '';
  const getNomeCentro = (id: string) => centrosCusto.find(c => c.id === id)?.nome || '';
  const getContaNome = (id: string) => contas.find(c => c.id === id)?.nome || '—';

  // Categorias filtradas pelo tipo da linha (tipo lowercase no banco; categorias sem tipo valem para ambos)
  const categoriasForTipo = (tipo: 'RECEITA' | 'DESPESA') =>
    categorias.filter(c => tipo === 'RECEITA' ? (c.tipo === 'receita' || !c.tipo) : (c.tipo === 'despesa' || !c.tipo));

  // Desconto obtido é dinheiro que deixou de sair, não venda: só categoria fora do
  // resultado (sob RECEITAS NÃO OPERACIONAIS), senão soma no faturamento do DRE.
  // `reconcile_pay_conta_pagar` recusa com CATEGORIA_OPERACIONAL de qualquer jeito.
  const categoriasDesconto = useMemo(
    () => categorias.filter(c => c.tipo === 'receita' && c.excluir_dos_totais === true),
    [categorias],
  );
  const categoriaDescontoPadraoId = useMemo(
    () => categoriasDesconto.find(c => normalizeSearchText(c.nome) === 'descontos obtidos')?.id || '',
    [categoriasDesconto],
  );
  // Espelho de categoriasDesconto para o lado de recebimento: receber a menos que o
  // título é desconto CONCEDIDO ao cliente — DESPESA fora do resultado (DESPESAS NÃO
  // OPERACIONAIS), senão infla despesas operacionais no DRE. `reconcile_receive_conta_receber`
  // recusa com CATEGORIA_OPERACIONAL do mesmo jeito.
  const categoriasDescontoConcedido = useMemo(
    () => categorias.filter(c => c.tipo === 'despesa' && c.excluir_dos_totais === true),
    [categorias],
  );
  const categoriaDescontoConcedidoPadraoId = useMemo(
    () => categoriasDescontoConcedido.find(c => normalizeSearchText(c.nome) === 'descontos concedidos')?.id || '',
    [categoriasDescontoConcedido],
  );
  const setLinhaCategoria = (i: number, categoriaId: string) =>
    setLinhas(prev => prev.map((l, j) => j === i ? { ...l, categoriaId } : l));

  const getOriginBadge = (origin?: MatchSuggestion['origin']) => {
    if (origin === 'lancamento') return <Badge className="bg-success/10 text-success border-success/20 text-[10px]">Lançamento</Badge>;
    if (origin === 'conta_pagar') return <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">Conta a Pagar</Badge>;
    if (origin === 'conta_receber') return <Badge className="bg-warning/10 text-warning border-warning/20 text-[10px]">Conta a Receber</Badge>;
    return null;
  };

  // === Transfer creation from OFX line ===
  const criarTransferenciaFromOFX = async () => {
    const linha = linhas[transferDialog.linhaIndex];
    if (!linha || !transferContaDestino || !contaSel) { toast.error('Selecione conta destino'); return; }
    if (transferContaDestino === contaSel) { toast.error('Contas devem ser diferentes'); return; }

    setProcessando(true);
    try {
      const nomeOrigem = getContaNome(contaSel);
      const nomeDestino = getContaNome(transferContaDestino);
      const isOutgoing = linha.tipo === 'DESPESA';
      const contaOrigemId = isOutgoing ? contaSel : transferContaDestino;
      const contaDestinoId = isOutgoing ? transferContaDestino : contaSel;
      const nOrigem = isOutgoing ? nomeOrigem : nomeDestino;
      const nDestino = isOutgoing ? nomeDestino : nomeOrigem;

      const { data, error } = await supabase.rpc('reconcile_create_transfer', {
        p_data: linha.data, p_valor: linha.valor, p_descricao: linha.descricao,
        p_conta_origem_id: contaOrigemId, p_conta_destino_id: contaDestinoId, p_user_id: user?.id,
      });
      if (error) throw error;
      const result = data as { status?: string; lancamento_id?: string } | null;
      await bindExtratoLine(linha, result?.lancamento_id);

      setLinhas(prev => prev.filter((_, i) => i !== transferDialog.linhaIndex));

      toast.success(
        result?.status === 'existing'
          ? `Transferência ${nOrigem} → ${nDestino} já existia — vinculada em vez de duplicada.`
          : `Transferência ${nOrigem} → ${nDestino} criada e conciliada!`,
      );
      emitDataEvent('financeiro:lancamentos');
      loadLancamentos();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao criar transferência');
    }
    setProcessando(false);
    setTransferDialog({ open: false, linhaIndex: -1 });
    setTransferContaDestino('');
  };


  if (!canViewRbac) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">Conciliação Bancária</h2>
          <p className="text-sm text-muted-foreground">Importe extratos e concilie com lançamentos, contas a pagar e a receber</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={contaSel} onValueChange={setContaSel}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Conta" /></SelectTrigger>
            <SelectContent>{contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex items-center rounded-lg border border-border overflow-hidden h-9">
            <button onClick={() => setView('importar')}
              className={`px-3 h-full text-xs font-medium transition-colors ${view === 'importar' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:text-foreground'}`}
            >Importar Extrato</button>
            <button onClick={() => setView('conciliar')}
              className={`px-3 h-full text-xs font-medium transition-colors ${view === 'conciliar' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:text-foreground'}`}
            >Lançamentos</button>
          </div>
        </div>
      </div>

      {/* ========== IMPORT VIEW ========== */}
      {view === 'importar' && (
        <>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <Label>Arquivo (CSV / OFX / QFX / OFC)</Label>
                  <label className={`flex items-center gap-2 cursor-pointer${loading ? ' opacity-50 pointer-events-none' : ''}`}>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".csv,.ofx,.qfx,.ofc,.txt"
                      onChange={handleFile}
                      disabled={loading}
                      className="hidden"
                    />
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input bg-background text-sm font-medium text-primary hover:bg-accent hover:text-accent-foreground transition-colors">
                      <Upload className="w-3.5 h-3.5" />
                      Escolher arquivo
                    </span>
                    <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                      {nomeArquivo || 'Nenhum arquivo selecionado'}
                    </span>
                  </label>
                </div>
                {linhas.length > 0 && (
                  <Button variant="ghost" size="sm" className="text-destructive h-9" onClick={limparExtrato}>
                    <X className="w-4 h-4 mr-1" /> Limpar Extrato
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                O sistema cruza automaticamente com lançamentos, <strong>contas a pagar</strong> e <strong>contas a receber</strong> pendentes. Use <EyeOff className="w-3 h-3 inline" /> para ignorar entradas que não devem gerar lançamento.
              </p>
            </CardContent>
          </Card>

          {/* Conferência de saldo contra o banco: rede final contra linha engolida/
              ignorada indevidamente. Fica fora do bloco `linhas.length > 0` de
              propósito — o veredito importa justamente DEPOIS de tudo processado. */}
          {saldoExtrato && conferenciaSaldo && (
            Math.abs(conferenciaSaldo.diferenca) < 0.01 ? (
              <Card className="border-success/30 bg-success/5">
                <CardContent className="p-3 flex items-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4 text-success shrink-0" />
                  <span>
                    Saldo confere com o extrato do banco:{' '}
                    <span className="font-mono font-medium">{fmtBRL(saldoExtrato.valor)}</span>{' '}
                    em {formatDateBR(parseLocalDate(saldoExtrato.data))}
                    {Math.abs(conferenciaSaldo.pendentesDelta) >= 0.01 && (
                      <span className="text-muted-foreground"> (projetado com as linhas ainda pendentes)</span>
                    )}
                  </span>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardContent className="p-3 space-y-1 text-sm">
                  <div className="flex items-center gap-2 font-medium text-destructive">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Saldo NÃO confere com o extrato do banco — diferença de{' '}
                    <span className="font-mono">{fmtBRL(conferenciaSaldo.diferenca)}</span>
                  </div>
                  <p className="text-muted-foreground">
                    Banco em {formatDateBR(parseLocalDate(saldoExtrato.data))}:{' '}
                    <span className="font-mono text-foreground">{fmtBRL(saldoExtrato.valor)}</span>
                    {' · '}Sistema{Math.abs(conferenciaSaldo.pendentesDelta) >= 0.01 ? ' (com linhas pendentes)' : ''}:{' '}
                    <span className="font-mono text-foreground">{fmtBRL(conferenciaSaldo.projetado)}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Pode haver linha marcada como duplicata/ignorada que na verdade é uma transação real,
                    ou lançamento incorreto no período. Revise antes de confiar no saldo.
                  </p>
                </CardContent>
              </Card>
            )
          )}

          {linhas.length > 0 && (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm text-muted-foreground flex flex-wrap gap-1">
                  {importFilterChip('conciliar', `${matchedTotal} p/ conciliar`, 'bg-success/10 text-success border-success/20')}
                  {withSuggestions > 0 && importFilterChip('sugestoes', `${withSuggestions} com sugestões`, 'bg-warning/10 text-warning border-warning/20')}
                  {importFilterChip('criar', `${selecionadas.length} p/ criar`)}
                  {jaConciliadas > 0 && importFilterChip('conciliados', `${jaConciliadas} já conciliada(s)`, 'bg-muted text-muted-foreground')}
                  {ignoradas > 0 && importFilterChip('ignorados', `${ignoradas} ignorada(s)`, 'bg-muted text-muted-foreground')}
                  {importFilterChip('todos', `${linhas.length} total`)}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => toggleAll(true)}>Selecionar Novas</Button>
                  <Button variant="outline" size="sm" onClick={() => toggleAll(false)}>Desmarcar</Button>
                  {/* Arrow function obrigatória: onClick={importarEConciliar} passaria o
                      evento como `jaConfirmouVinculos` e pularia a confirmação. */}
                  <Button size="sm" onClick={() => importarEConciliar()} disabled={importando}>
                    <Save className={`w-4 h-4 mr-1 ${importando ? 'animate-spin' : ''}`} />
                    Processar
                  </Button>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">✓</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição (Extrato)</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Ações</TableHead>
                    <TableHead className="w-[150px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhasFiltradas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        Nenhuma linha neste filtro.
                      </TableCell>
                    </TableRow>
                  ) : linhasFiltradas.map(({ linha, index: i }) => {
                    const isDone = linha.matchId?.endsWith('-done');
                    const hasMatch = !!linha.matchId && !isDone;
                    const hasSuggestions = !linha.matchId && linha.suggestions && linha.suggestions.length > 0;
                    const isJaConciliada = !!linha.jaConciliada;
                    const isIgnorada = !!linha.ignorada;
                    const isInactive = isJaConciliada || isIgnorada;

                    return (
                      <TableRow key={i} className={
                        isDone ? 'bg-success/5 opacity-70' :
                        isJaConciliada ? 'bg-muted/30 opacity-60' :
                        isIgnorada ? 'bg-muted/30 opacity-50' :
                        hasMatch ? 'bg-success/5' :
                        hasSuggestions ? 'bg-warning/5' :
                        !linha.selecionada ? 'opacity-70' : ''
                      }>
                        <TableCell>
                          {isDone || isJaConciliada ? (
                            <CheckCircle className="w-4 h-4 text-success" />
                          ) : isIgnorada ? (
                            <EyeOff className="w-4 h-4 text-muted-foreground" />
                          ) : hasMatch ? (
                            <CheckCircle className="w-4 h-4 text-success" />
                          ) : (
                            <Checkbox
                              checked={linha.selecionada}
                              onCheckedChange={(v) => setLinhas(prev => prev.map((l, j) => j === i ? { ...l, selecionada: !!v } : l))}
                            />
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{formatDateBR(parseLocalDate(linha.data))}</TableCell>
                        <TableCell className="max-w-xs">
                          <span className="font-medium whitespace-normal break-words">{linha.descricao}</span>
                          {hasMatch && (
                            <span className="text-[10px] text-success flex items-center gap-1 mt-0.5">
                              <ArrowRight className="w-3 h-3" /> {linha.matchDescricao}
                              {linha.matchOrigin && <span className="ml-1">{getOriginBadge(linha.matchOrigin)}</span>}
                            </span>
                          )}
                          {hasMatch && linha.matchJaNoRazao && (
                            <span className="text-[10px] text-warning flex items-start gap-1 mt-0.5">
                              <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
                              <span>
                                Já está no Livro Razão — veio da baixa em Contas a Pagar/Receber.
                                Ao processar, esta linha será <strong>vinculada</strong> a esse lançamento,
                                sem criar outro.
                              </span>
                            </span>
                          )}
                          {isJaConciliada && (
                            linha.transferReconhecida ? (
                              <span className="text-[10px] text-muted-foreground flex items-start gap-1 mt-0.5">
                                <ArrowRightLeft className="w-3 h-3 shrink-0 mt-px" />
                                <span>
                                  Transferência já lançada pelo extrato da outra conta em{' '}
                                  {formatDateBR(parseLocalDate(linha.transferReconhecida.data))} (
                                  {getContaNome(linha.transferReconhecida.conta_id)} → {getContaNome(linha.transferReconhecida.conta_destino_id)}
                                  ). Não precisa lançar de novo.
                                </span>
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                <CheckCircle className="w-3 h-3" /> Já conciliada anteriormente
                              </span>
                            )
                          )}
                          {!isInactive && linha.transferAlertas && linha.transferAlertas.length > 0 && (
                            <span className="text-[10px] text-warning flex items-start gap-1 mt-0.5">
                              <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
                              <span>
                                Confira antes de conciliar: já existe transferência de mesmo valor
                                {linha.transferAlertas.map(t => (
                                  <span key={t.id} className="block">
                                    • {formatDateBR(parseLocalDate(t.data))} — {getContaNome(t.conta_id)} → {getContaNome(t.conta_destino_id)}
                                    {t.direcaoInvertida ? ' (direção invertida)' : ''}
                                  </span>
                                ))}
                              </span>
                            </span>
                          )}
                          {isIgnorada && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                              <EyeOff className="w-3 h-3" /> Marcada como ignorada
                            </span>
                          )}
                          {hasSuggestions && !isInactive && (
                            <span className="text-[10px] text-warning flex items-center gap-1 mt-0.5">
                              <Search className="w-3 h-3" /> {linha.suggestions!.length} sugestão(ões) disponível(is)
                            </span>
                          )}
                          {!hasMatch && !isDone && !isInactive && !(linha.rateioLinhas && linha.rateioLinhas.length > 1) && (
                            <div className="mt-1 max-w-[220px]">
                              <CategoryCombobox
                                value={linha.categoriaId || ''}
                                onValueChange={(v) => setLinhaCategoria(i, v)}
                                options={categoriasForTipo(linha.tipo)}
                                placeholder="Categoria obrigatória..."
                                className="h-7 text-xs"
                                modal={false}
                              />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={linha.tipo === 'RECEITA' ? 'default' : 'destructive'}>{linha.tipo}</Badge>
                        </TableCell>
                        <TableCell className={`text-right font-bold ${linha.tipo === 'RECEITA' ? 'text-success' : 'text-destructive'}`}>
                          {linha.tipo === 'RECEITA' ? '+' : '-'} {fmt(linha.valor)}
                        </TableCell>
                        <TableCell>
                          {isInactive ? null : (
                            <div className="flex gap-1">
                              {!isDone && linha.suggestions && linha.suggestions.length > 0 && (
                                <Button size="sm" variant={hasMatch ? 'default' : 'outline'} className="h-7 text-xs"
                                  onClick={() => setSuggestionsDialog({ open: true, linhaIndex: i })}>
                                  <Search className="w-3 h-3 mr-1" />
                                  {hasMatch ? 'Alterar' : `${linha.suggestions.length} sugestão`}
                                </Button>
                              )}
                              {hasMatch && (
                                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => clearMatch(i)}>✕</Button>
                              )}
                              {hasMatch && (linha.matchOrigin === 'conta_pagar' || linha.matchOrigin === 'conta_receber') && (
                                <Button size="sm" variant="outline" className="h-7 text-xs"
                                  onClick={() => abrirRevisaoBaixa([i], 'individual')}>
                                  <CreditCard className="w-3 h-3 mr-1" /> Baixar
                                </Button>
                              )}
                              {!hasMatch && !isDone && linha.tipo === 'DESPESA' && (
                                <Button size="sm" variant="outline" className="h-7 text-xs"
                                  title="Vincular esta saída a um boleto em aberto e dar baixa nele"
                                  onClick={() => abrirBoletoDialog(i)}>
                                  <Receipt className="w-3 h-3 mr-1" /> Boleto
                                </Button>
                              )}
                              {!hasMatch && !isDone && (
                                <>
                                  <Button size="sm" variant={linha.rateioLinhas && linha.rateioLinhas.length > 1 ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => openRateio(i)}>
                                    <PieChart className="w-3 h-3 mr-1" />
                                    {linha.rateioLinhas && linha.rateioLinhas.length > 1 ? `${linha.rateioLinhas.length} cat.` : 'Ratear'}
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setTransferDialog({ open: true, linhaIndex: i }); setTransferContaDestino(''); }}>
                                    <ArrowRightLeft className="w-3 h-3 mr-1" /> Transf.
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCriarDialog({ open: true, linhaIndex: i })}>
                                    <FileText className="w-3 h-3 mr-1" /> Criar
                                  </Button>
                                </>
                              )}
                              {/* Botão Ignorar — disponível para qualquer entrada ainda não processada */}
                              {!isDone && (
                                <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-destructive" title="Ignorar esta entrada — não criará lançamento" onClick={() => ignorarLinha(i)}>
                                  <EyeOff className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {isDone ? (
                            <Badge className="bg-success/10 text-success border-success/20 text-[10px]">Concluído</Badge>
                          ) : isJaConciliada ? (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">Já Conciliado</Badge>
                          ) : isIgnorada ? (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">Ignorado</Badge>
                          ) : hasMatch ? (
                            <Badge className="bg-success/10 text-success border-success/20 text-[10px]">Conciliar c/ existente</Badge>
                          ) : hasSuggestions ? (
                            <Badge className="bg-warning/10 text-warning border-warning/20 text-[10px]">Sugestão p/ conciliar</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">Criar novo</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </>
          )}

          {linhas.length === 0 && (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <Upload className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Selecione um arquivo CSV, OFX, QFX ou OFC para importar</p>
              <p className="text-xs mt-2">
                <strong>CSV:</strong> data;descrição;valor (separado por ; ou ,)<br />
                <strong>OFX/QFX/OFC:</strong> formatos bancários suportados
              </p>
            </CardContent></Card>
          )}
        </>
      )}

      {/* ========== CONCILIATION VIEW ========== */}
      {view === 'conciliar' && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-muted-foreground">
              {totalPendentesConta} pendente(s) • {totalConciliadosConta} conciliado(s)
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                type="date"
                value={filtroDataDe}
                max={filtroDataAte || undefined}
                onChange={e => setFiltroDataDe(e.target.value)}
                className="w-36 h-9 text-xs"
                aria-label="Data inicial"
              />
              <span className="text-muted-foreground text-xs">até</span>
              <Input
                type="date"
                value={filtroDataAte}
                min={filtroDataDe || undefined}
                onChange={e => setFiltroDataAte(e.target.value)}
                className="w-36 h-9 text-xs"
                aria-label="Data final"
              />
              <Select value={filtro} onValueChange={v => setFiltro(v as 'pendentes' | 'conciliados' | 'todos')}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendentes">Pendentes</SelectItem>
                  <SelectItem value="conciliados">Conciliados</SelectItem>
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={loadLancamentos}>
                <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
              </Button>
              {filtro === 'pendentes' && pendentes > 0 && (
                <Button size="sm" onClick={conciliarTodos}>
                  <CheckCircle className="w-4 h-4 mr-1" /> Conciliar Todos
                </Button>
              )}
              {lancamentosFiltrados.length > 0 && (
                <>
                  <Button variant="outline" size="sm" onClick={() => toggleAllLancamentos(true)}>Selecionar Todos</Button>
                  <Button variant="outline" size="sm" onClick={() => toggleAllLancamentos(false)}>Desmarcar</Button>
                </>
              )}
              {selectedLancamentoIds.size > 0 && (
                <Button variant="destructive" size="sm" onClick={bulkDeleteLancamentos} disabled={editSaving}>
                  <Trash2 className="w-4 h-4 mr-1" /> Excluir Selecionados ({selectedLancamentoIds.size})
                </Button>
              )}
            </div>
          </div>

          <DateRangePresets
            from={filtroDataDe}
            to={filtroDataAte}
            onChange={(de, ate) => { setFiltroDataDe(de); setFiltroDataAte(ate); }}
          />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead className="w-10">✓</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
              ) : lancamentos.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  {contaSel ? 'Nenhum lançamento encontrado' : 'Selecione uma conta bancária'}
                </TableCell></TableRow>
              ) : lancamentosFiltrados.map(item => {
                const categoriaNome = categorias.find(c => c.id === item.categoria_id)?.nome;
                const rateioCategoryIds = lancamentoRateioCategoryIds[item.id] || [];
                const rateioCategoryNames = rateioCategoryIds
                  .map(categoryId => categorias.find(c => c.id === categoryId)?.nome)
                  .filter((name): name is string => Boolean(name));
                const categoryLabel = categoriaNome
                  || (rateioCategoryIds.length > 1
                    ? `${rateioCategoryIds.length} categorias`
                    : rateioCategoryNames[0]);
                return (
                <TableRow key={item.id} className={item.conciliado ? 'opacity-80' : ''}>
                  <TableCell>
                    <Checkbox
                      checked={selectedLancamentoIds.has(item.id)}
                      onCheckedChange={(v) => setSelectedLancamentoIds(prev => {
                        const next = new Set(prev);
                        if (v) next.add(item.id); else next.delete(item.id);
                        return next;
                      })}
                      aria-label={`Selecionar ${item.descricao}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={!!item.conciliado}
                      onCheckedChange={(v) => conciliar(item.id, !!v)}
                      aria-label={item.conciliado ? `Desconciliar ${item.descricao}` : `Conciliar ${item.descricao}`}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">{formatDateBR(parseLocalDate(item.data_competencia))}</TableCell>
                  <TableCell className="font-medium max-w-xs whitespace-normal break-words">{item.descricao}</TableCell>
                  <TableCell>
                    {categoryLabel ? (
                      <span className="text-xs" title={rateioCategoryNames.join(' • ') || categoriaNome}>
                        {categoryLabel}
                      </span>
                    ) : (
                      <span className="text-xs text-warning flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Sem categoria</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.tipo === 'RECEITA' ? 'default' : 'destructive'}>{item.tipo}</Badge>
                  </TableCell>
                  <TableCell className={`text-right font-bold ${item.tipo === 'RECEITA' ? 'text-success' : 'text-destructive'}`}>
                    {item.tipo === 'RECEITA' ? '+' : '-'} {fmt(item.valor)}
                  </TableCell>
                  <TableCell>
                    {item.conciliado ? (
                      <span className="text-xs text-success flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Conciliado</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Pendente</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditLancamento(item)} disabled={editSaving} title="Editar">
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteLancamentoConciliacao(item)} disabled={editSaving} title="Excluir">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </>
      )}

      {/* ========== SUGGESTIONS DIALOG ========== */}
      <Dialog open={suggestionsDialog.open} onOpenChange={(open) => !open && setSuggestionsDialog({ open: false, linhaIndex: -1 })}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="w-5 h-5 text-primary" /> Sugestões de Conciliação
            </DialogTitle>
          </DialogHeader>

          {suggestionsDialog.linhaIndex >= 0 && linhas[suggestionsDialog.linhaIndex] && (() => {
            const linha = linhas[suggestionsDialog.linhaIndex];
            const suggestions = linha.suggestions || [];
            return (
              <div className="space-y-4">
                <Card className="border-primary/20">
                  <CardContent className="p-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase">Linha do Extrato</p>
                        <p className="text-sm font-medium">{linha.descricao}</p>
                        <p className="text-xs text-muted-foreground">{formatDateBR(parseLocalDate(linha.data))}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold">{fmt(linha.valor)}</p>
                        <Badge variant={linha.tipo === 'RECEITA' ? 'default' : 'destructive'}>{linha.tipo}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-2">
                  {suggestions.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">Nenhuma sugestão encontrada</p>
                  ) : suggestions.map((s, idx) => (
                    <Card key={`${s.origin}-${s.id}`} className={`cursor-pointer transition-colors hover:border-primary/40 ${linha.matchId === s.id ? 'border-primary bg-primary/5' : ''}`}
                      onClick={() => selectSuggestion(suggestionsDialog.linhaIndex, s)}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              {getOriginBadge(s.origin)}
                              <Badge variant="outline" className="text-[10px]">Score: {s.score}</Badge>
                              {idx === 0 && <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">Melhor match</Badge>}
                            </div>
                            <p className="text-sm font-medium break-words">{s.descricao}</p>
                            <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                              <span>Data: {formatDateBR(parseLocalDate(s.data))}</span>
                              {s.extra && <span>• {s.extra}</span>}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-sm font-bold ${linha.tipo === 'RECEITA' ? 'text-success' : 'text-destructive'}`}>{fmt(s.valor)}</p>
                            {linha.matchId === s.id && <CheckCircle className="w-4 h-4 text-success ml-auto mt-1" />}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setSuggestionsDialog({ open: false, linhaIndex: -1 })}>Fechar</Button>
                  {linha.matchId && (
                    <Button variant="ghost" className="text-destructive" onClick={() => { clearMatch(suggestionsDialog.linhaIndex); setSuggestionsDialog({ open: false, linhaIndex: -1 }); }}>
                      Remover Match
                    </Button>
                  )}
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ========== REVISÃO ANTES DA BAIXA ========== */}
      <Dialog open={baixaDialog.open} onOpenChange={(open) => !open && setBaixaDialog({ open: false, indices: [], escopo: 'lote' })}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              {baixaDialog.indices.length === 1
                ? 'Confirmar baixa'
                : `Confirmar ${baixaDialog.indices.length} baixas`}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Dar baixa marca o título como pago e lança a despesa no razão. Para desfazer só pelo
              estorno — por isso confira o que o banco pagou contra o que o título cobrava.
            </p>

            <div className="space-y-2">
              {baixaDialog.indices.map(i => {
                const linha = linhas[i];
                if (!linha) return null;
                const valorTitulo = valorDoTitulo(linha);
                const diff = diferencaBaixa(linha);
                const diverge = Math.abs(diff) >= 0.01;
                const ajuste = ajustesBaixa[i] || { tipo: '' as AjusteTipo, categoriaId: '' };
                const isRecebimento = linha.matchOrigin === 'conta_receber';
                // CP: extrato maior = despesa a mais (juros/tarifa); menor = receita (desconto),
                // categoria fora do resultado — desconto não é faturamento.
                // CR (espelhado): extrato maior = receita a mais (juros/multa cobrados do
                // cliente); menor = despesa (desconto concedido), também fora do resultado.
                const categoriasAjuste = isRecebimento
                  ? (diff > 0 ? categoriasForTipo('RECEITA') : categoriasDescontoConcedido)
                  : (diff > 0 ? categoriasForTipo('DESPESA') : categoriasDesconto);

                return (
                  <Card key={i} className={diverge ? 'border-warning/40' : ''}>
                    <CardContent className="p-3 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[10px] text-muted-foreground font-medium uppercase">Linha do extrato</p>
                          <p className="text-sm font-medium break-words">{linha.descricao}</p>
                          <p className="text-xs text-muted-foreground">{formatDateBR(parseLocalDate(linha.data))}</p>
                          <p className="text-base font-bold mt-1">{fmt(linha.valor)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground font-medium uppercase">
                            {linha.matchOrigin === 'conta_pagar' ? 'Boleto' : 'Título a receber'}
                          </p>
                          <p className="text-sm font-medium break-words">{linha.matchDescricao}</p>
                          <p className="text-base font-bold mt-1">{fmt(valorTitulo)}</p>
                        </div>
                      </div>

                      {diverge ? (
                        <div className="rounded-md border border-warning/40 bg-warning/5 p-2.5 space-y-2">
                          <p className="text-xs text-warning flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              O banco {isRecebimento ? 'creditou' : 'debitou'} <strong>{fmt(Math.abs(diff))}</strong>
                              {diff > 0 ? ' a mais' : ' a menos'} que o título.
                            </span>
                          </p>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-[10px] text-muted-foreground">Lançar a diferença como</Label>
                              <Select
                                value={ajuste.tipo}
                                onValueChange={v => setAjustesBaixa(prev => ({
                                  ...prev, [i]: { tipo: v as AjusteTipo, categoriaId: prev[i]?.categoriaId || '' },
                                }))}
                              >
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                                <SelectContent>
                                  {diff > 0 ? (
                                    <>
                                      <SelectItem value="JUROS">{isRecebimento ? 'Juros / multa cobrados' : 'Juros / multa'}</SelectItem>
                                      <SelectItem value="TARIFA">Tarifa bancária</SelectItem>
                                    </>
                                  ) : (
                                    <SelectItem value="DESCONTO">{isRecebimento ? 'Desconto concedido' : 'Desconto obtido'}</SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-[10px] text-muted-foreground">Categoria da diferença</Label>
                              <CategoryCombobox
                                value={ajuste.categoriaId}
                                onValueChange={v => setAjustesBaixa(prev => ({
                                  ...prev, [i]: { tipo: prev[i]?.tipo || '', categoriaId: v },
                                }))}
                                options={categoriasAjuste}
                                placeholder="Selecione"
                                className="h-8 text-xs"
                                modal={false}
                              />
                            </div>
                          </div>

                          <p className="text-[11px] text-muted-foreground">
                            O título entra no razão por {fmt(valorTitulo)} na categoria dele, e a diferença
                            vira um lançamento separado. A soma bate com o extrato.
                            {diff < 0 && ` O desconto ${isRecebimento ? 'concedido' : 'obtido'} fica em categoria não operacional: entra no saldo da conta, mas fora do resultado no DRE, do DFC e dos relatórios.`}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-success flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5" /> Valores conferem.
                        </p>
                      )}

                      <div className="flex justify-end">
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive"
                          onClick={() => {
                            clearMatch(i);
                            setBaixaDialog(prev => ({ ...prev, indices: prev.indices.filter(idx => idx !== i) }));
                          }}>
                          Não dar baixa nesta
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {baixaDialog.indices.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-3">
                  Nenhuma baixa selecionada. As linhas voltaram para a lista.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBaixaDialog({ open: false, indices: [], escopo: 'lote' })}>
              Cancelar
            </Button>
            <Button onClick={confirmarRevisaoBaixa} disabled={processando || importando}>
              {baixaDialog.indices.length === 0 ? 'Continuar' : 'Confirmar baixa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== BOLETO EM ABERTO (vínculo manual) ========== */}
      <Dialog open={boletoDialog.open} onOpenChange={(open) => !open && setBoletoDialog({ open: false, linhaIndex: -1 })}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-primary" /> Vincular a um boleto em aberto
            </DialogTitle>
          </DialogHeader>

          {boletoDialog.linhaIndex >= 0 && linhas[boletoDialog.linhaIndex] && (
            <div className="space-y-4">
              <Card className="border-primary/20">
                <CardContent className="p-3 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase">Linha do Extrato</p>
                    <p className="text-sm font-medium">{linhas[boletoDialog.linhaIndex].descricao}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateBR(parseLocalDate(linhas[boletoDialog.linhaIndex].data))}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-destructive">{fmt(linhas[boletoDialog.linhaIndex].valor)}</p>
                </CardContent>
              </Card>

              <div className="flex gap-2">
                <Input
                  value={boletoBusca}
                  onChange={e => setBoletoBusca(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') buscarBoletos(boletoBusca); }}
                  placeholder="Buscar por descrição ou fornecedor..."
                  className="h-9"
                />
                <Button size="sm" variant="outline" className="h-9" onClick={() => buscarBoletos(boletoBusca)} disabled={boletoLoading}>
                  <Search className={`w-4 h-4 ${boletoLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>

              <div className="space-y-2">
                {boletoLoading ? (
                  <p className="text-center text-muted-foreground py-4">Buscando...</p>
                ) : boletoOpcoes.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">Nenhum boleto em aberto encontrado</p>
                ) : boletoOpcoes.map(b => {
                  const mesmoValor = Math.abs(Number(b.valor) - linhas[boletoDialog.linhaIndex].valor) < 0.01;
                  return (
                    <Card key={b.id}
                      className={`cursor-pointer transition-colors hover:border-primary/40 ${mesmoValor ? 'border-success/40' : ''}`}
                      onClick={() => selecionarBoleto(b)}>
                      <CardContent className="p-3 flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">
                              {b.status === 'AGUARDANDO_APROVACAO' ? 'Aguard. Aprovacao' : b.status}
                            </Badge>
                            {mesmoValor && <Badge className="bg-success/10 text-success border-success/20 text-[10px]">Mesmo valor</Badge>}
                            {!b.tem_categoria && (
                              <Badge className="bg-warning/10 text-warning border-warning/20 text-[10px]">Sem categoria</Badge>
                            )}
                          </div>
                          <p className="text-sm font-medium break-words">{b.descricao}</p>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
                            <span>Vence: {formatDateBR(parseLocalDate(b.data_vencimento))}</span>
                            {b.fornecedor && <span>• {b.fornecedor}</span>}
                          </div>
                        </div>
                        <p className="text-sm font-bold text-destructive shrink-0">{fmt(Number(b.valor))}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setBoletoDialog({ open: false, linhaIndex: -1 })}>Fechar</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ========== CONFIRMAÇÃO: BAIXA JÁ NO LIVRO RAZÃO ========== */}
      <AlertDialog open={jaNoRazaoDialog.open} onOpenChange={(open) => !open && setJaNoRazaoDialog({ open: false, indices: [] })}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              {jaNoRazaoDialog.indices.length === 1
                ? 'Este pagamento já está no Livro Razão'
                : `${jaNoRazaoDialog.indices.length} pagamentos já estão no Livro Razão`}
            </AlertDialogTitle>
          </AlertDialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              A baixa foi feita em <strong>Contas a Pagar/Receber</strong> e o lançamento já existe.
              Confirmando, a linha do extrato é <strong>vinculada</strong> a ele — o valor não entra duas vezes
              no DRE, no fluxo de caixa nem no saldo. Se você prefere tratar esta linha como uma despesa
              diferente, escolha “Lançar como novo”.
            </p>

            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {jaNoRazaoDialog.indices.map(i => {
                const linha = linhas[i];
                if (!linha) return null;
                return (
                  <Card key={i} className="border-warning/30">
                    <CardContent className="p-3 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium break-words">{linha.descricao}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatDateBR(parseLocalDate(linha.data))} • no razão como “{linha.matchDescricao}”
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-bold text-destructive">{fmt(linha.valor)}</span>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive"
                          onClick={() => {
                            clearMatch(i);
                            setJaNoRazaoDialog(prev => ({
                              ...prev,
                              indices: prev.indices.filter(idx => idx !== i),
                            }));
                          }}>
                          Lançar como novo
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {jaNoRazaoDialog.indices.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-3">
                  Todas as linhas foram marcadas para lançar como novas. Elas vão pedir categoria antes de processar.
                </p>
              )}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setJaNoRazaoDialog({ open: false, indices: [] })}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setJaNoRazaoDialog({ open: false, indices: [] });
              importarEConciliar(true);
            }}>
              Confirmar e processar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ========== POSSÍVEL DUPLICATA (mesma conta/valor/data/descrição já conciliados) ========== */}
      <AlertDialog open={duplicataDialog.open} onOpenChange={(open) => !open && setDuplicataDialog({ open: false, itens: [] })}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              {duplicataDialog.itens.length === 1
                ? '1 linha parece duplicada'
                : `${duplicataDialog.itens.length} linhas parecem duplicadas`}
            </AlertDialogTitle>
          </AlertDialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Já existe um lançamento com a <strong>mesma conta, valor, data e descrição</strong>, importado
              anteriormente com um identificador bancário diferente — provavelmente o extrato foi reimportado
              (alguns bancos trocam esse identificador a cada exportação). Nada foi lançado para estas linhas.
              Se for mesmo uma cobrança repetida legítima (ex.: duas vendas iguais no mesmo dia), use
              "Importar mesmo assim"; senão, marque como ignorada.
            </p>

            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {duplicataDialog.itens.map((item) => (
                <Card key={`${item.linha.data}-${item.linha.valor}-${item.linha.descricao}-${item.linha.fitId ?? ''}`} className="border-warning/30">
                  <CardContent className="p-3 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium break-words">{item.linha.descricao}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDateBR(parseLocalDate(item.linha.data))}
                        {item.criadoEm && ` • já conciliado em ${formatInBR(new Date(item.criadoEm), "dd/MM/yyyy 'às' HH:mm")}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold text-destructive">{fmt(item.linha.valor)}</span>
                      <Button size="sm" variant="ghost" className="h-7 text-xs"
                        onClick={() => ignorarDuplicata(item)}>
                        Ignorar
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => forcarImportarDuplicata(item)}>
                        Importar mesmo assim
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {duplicataDialog.itens.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-3">
                  Todas as linhas foram resolvidas.
                </p>
              )}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDuplicataDialog({ open: false, itens: [] })}>Fechar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ========== RATEIO DIALOG ========== */}
      <Dialog open={rateioDialog.open} onOpenChange={(open) => !open && setRateioDialog({ open: false, linhaIndex: -1 })}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PieChart className="w-5 h-5 text-primary" /> Rateio por Categoria
            </DialogTitle>
          </DialogHeader>

          {rateioDialog.linhaIndex >= 0 && linhas[rateioDialog.linhaIndex] && (
            <div className="space-y-4">
              <Card className="border-primary/20">
                <CardContent className="p-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium">{linhas[rateioDialog.linhaIndex].descricao}</p>
                      <p className="text-xs text-muted-foreground">{formatDateBR(parseLocalDate(linhas[rateioDialog.linhaIndex].data))}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">{fmt(rateioValorTotal)}</p>
                      <Badge variant={linhas[rateioDialog.linhaIndex].tipo === 'RECEITA' ? 'default' : 'destructive'}>
                        {linhas[rateioDialog.linhaIndex].tipo}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-2">
                {rateioLinhas.map((rl, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end border border-border rounded-lg p-2">
                    <div className="col-span-4">
                      <Label className="text-[10px] text-muted-foreground">Categoria</Label>
                      <CategoryCombobox
                        value={rl.categoria_id}
                        onValueChange={v => updateRateioLinha(idx, 'categoria_id', v)}
                        options={rateioLinhaTipo ? categoriasForTipo(rateioLinhaTipo) : categorias}
                        placeholder="Selecione"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="col-span-3">
                      <Label className="text-[10px] text-muted-foreground">Centro de Custo</Label>
                      <Select value={rl.centro_custo_id} onValueChange={v => updateRateioLinha(idx, 'centro_custo_id', v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Auto" /></SelectTrigger>
                        <SelectContent>{centrosCusto.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-[10px] text-muted-foreground">Valor (R$)</Label>
                      <CurrencyInput className="h-8 text-xs" value={String(rl.valor || '')} onValueChange={(raw, parsed) => { updateRateioLinha(idx, 'valor', parsed ?? 0); }} showPrefix maxDecimals={2} />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-[10px] text-muted-foreground">%</Label>
                      <Input className="h-8 text-xs" type="text" inputMode="decimal" value={rl.percentual || ''} onChange={e => { const v = e.target.value.replace(',', '.'); updateRateioLinha(idx, 'percentual', v === '' ? 0 : Number(v) || 0); }} />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      {rateioLinhas.length > 1 && (
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeRateioLinha(idx)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={addRateioLinha}><Plus className="w-3.5 h-3.5 mr-1" /> Linha</Button>
                  <Button size="sm" variant="outline" onClick={ratearIgual}>🧮 Ratear Igual</Button>
                </div>
                <div className="text-right text-sm">
                  <span className="text-muted-foreground">Rateado: </span>
                  <span className={`font-bold ${rateioValido ? 'text-success' : 'text-destructive'}`}>{fmt(rateioTotalAtual)}</span>
                  {!rateioValido && <span className="text-destructive text-xs ml-2">(Diferença: {fmt(rateioDiff)})</span>}
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setRateioDialog({ open: false, linhaIndex: -1 })}>Cancelar</Button>
                <Button onClick={salvarRateio} disabled={!rateioValido}><CheckCircle className="w-4 h-4 mr-1" /> Salvar Rateio</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>


      {/* ========== TRANSFER DIALOG ========== */}
      <Dialog open={transferDialog.open} onOpenChange={(open) => { if (!open) { setTransferDialog({ open: false, linhaIndex: -1 }); setTransferContaDestino(''); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-primary" /> Marcar como Transferência
            </DialogTitle>
          </DialogHeader>
          {transferDialog.linhaIndex >= 0 && linhas[transferDialog.linhaIndex] && (() => {
            const linha = linhas[transferDialog.linhaIndex];
            const isOutgoing = linha.tipo === 'DESPESA';
            const nomeOutraConta = transferContaDestino ? getContaNome(transferContaDestino) : 'conta a selecionar';
            return (
              <div className="space-y-4">
                <Card className="border-primary/20">
                  <CardContent className="p-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium">{linha.descricao}</p>
                         <p className="text-xs text-muted-foreground">{formatDateBR(parseLocalDate(linha.data))}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold">{fmt(linha.valor)}</p>
                        <Badge variant={isOutgoing ? 'destructive' : 'default'}>{isOutgoing ? 'Saída' : 'Entrada'}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">{isOutgoing ? 'Conta Origem (esta)' : 'Conta Destino (esta)'}</Label>
                    <Input value={getContaNome(contaSel)} disabled className="h-9" />
                  </div>
                  <div>
                    <Label className="text-xs">{isOutgoing ? 'Conta Destino' : 'Conta Origem'}</Label>
                    <Select value={transferContaDestino} onValueChange={setTransferContaDestino}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                      <SelectContent>
                        {contas.filter(c => c.id !== contaSel).map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {linha.transferAlertas && linha.transferAlertas.length > 0 && (
                  <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs">
                    <p className="font-medium text-warning flex items-center gap-1.5 mb-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Já existe transferência de mesmo valor
                    </p>
                    <ul className="text-muted-foreground space-y-0.5">
                      {linha.transferAlertas.map(t => (
                        <li key={t.id}>
                          • {formatDateBR(parseLocalDate(t.data))} — {getContaNome(t.conta_id)} → {getContaNome(t.conta_destino_id)}
                          {t.direcaoInvertida ? ' (direção invertida)' : ''}
                        </li>
                      ))}
                    </ul>
                    <p className="text-muted-foreground mt-1">
                      Confira no Livro Razão antes de confirmar — se for a mesma transferência, o sistema reaproveita o
                      lançamento existente em vez de duplicar, desde que as contas e a direção coincidam.
                    </p>
                  </div>
                )}

                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  <p className="font-medium text-foreground mb-1">Ao confirmar:</p>
                  <ul className="text-muted-foreground space-y-1 text-xs">
                    <li>✅ Um lançamento de transferência: saída em <strong>{isOutgoing ? getContaNome(contaSel) : nomeOutraConta}</strong> e entrada em <strong>{isOutgoing ? nomeOutraConta : getContaNome(contaSel)}</strong></li>
                    <li>✅ Tipo = TRANSFERÊNCIA (não afeta receitas/despesas)</li>
                    <li>✅ Linha do extrato será conciliada automaticamente</li>
                    <li>✅ Ao importar o extrato da outra conta, a linha correspondente é reconhecida sozinha — sem duplicar</li>
                  </ul>
                </div>

                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => { setTransferDialog({ open: false, linhaIndex: -1 }); setTransferContaDestino(''); }}>Cancelar</Button>
                  <Button onClick={criarTransferenciaFromOFX} disabled={processando || !transferContaDestino}>
                    {processando ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <ArrowRightLeft className="w-4 h-4 mr-1" />}
                    Criar Transferência
                  </Button>
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ========== CREATE LANCAMENTO FROM EXTRATO ========== */}
      <CriarLancamentoExtratoDialog
        open={criarDialog.open}
        onOpenChange={(open) => { if (!open) setCriarDialog({ open: false, linhaIndex: -1 }); }}
        linha={criarDialog.linhaIndex >= 0 ? linhas[criarDialog.linhaIndex] || null : null}
        contaBancariaId={contaSel}
        onCreated={(result) => {
          const idx = criarDialog.linhaIndex;
          setLinhas(prev => prev.filter((_, i) => i !== idx));
          setCriarDialog({ open: false, linhaIndex: -1 });
          loadLancamentos();
        }}
      />

      {/* ========== CONTA MISMATCH ALERT ========== */}
      {contaMismatch && (
        <AlertDialog open={contaMismatch.open}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                Conta do extrato diverge da selecionada
              </AlertDialogTitle>
            </AlertDialogHeader>

            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                <p className="font-semibold text-foreground">Identificação no arquivo:</p>
                {contaMismatch.extratoInfo.numeroConta && (
                  <p className="text-muted-foreground">
                    Conta: <span className="font-mono font-medium text-foreground">{contaMismatch.extratoInfo.numeroConta}</span>
                  </p>
                )}
                {contaMismatch.extratoInfo.agencia && (
                  <p className="text-muted-foreground">
                    Agência: <span className="font-mono font-medium text-foreground">{contaMismatch.extratoInfo.agencia}</span>
                  </p>
                )}
                {contaMismatch.extratoInfo.banco && (
                  <p className="text-muted-foreground">
                    Banco: <span className="font-medium text-foreground">{contaMismatch.extratoInfo.banco}</span>
                  </p>
                )}
              </div>

              {(() => {
                const cad = contas.find(c => c.id === contaSel);
                return cad ? (
                  <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
                    <p className="font-semibold text-foreground">Conta selecionada: {cad.nome}</p>
                    {(cad.numero_conta || cad.agencia) ? (
                      <>
                        {cad.numero_conta && (
                          <p className="text-muted-foreground">
                            Conta: <span className="font-mono font-medium text-foreground">{cad.numero_conta}</span>
                          </p>
                        )}
                        {cad.agencia && (
                          <p className="text-muted-foreground">
                            Agência: <span className="font-mono font-medium text-foreground">{cad.agencia}</span>
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">Número/agência não cadastrados</p>
                    )}
                  </div>
                ) : null;
              })()}

              <p className="text-muted-foreground text-xs">
                Selecione a conta correta no dropdown ou confirme para importar mesmo assim.
              </p>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setContaMismatch(null)}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                onClick={() => {
                  const pending = contaMismatch.parsed;
                  const saldoInfo = contaMismatch.saldoFinalArquivo;
                  const fname = contaMismatch.fileName;
                  setContaMismatch(null);
                  openConfirmSaldo(pending, saldoInfo, fname);
                }}
              >
                Importar mesmo assim
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* ========== SUBSTITUIR EXTRATO COM LINHAS PENDENTES ========== */}
      {substituirExtratoDialog && (
        <AlertDialog open={substituirExtratoDialog.open}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-warning">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                {substituirExtratoDialog.pendentes === 1
                  ? 'Ainda há 1 linha não processada'
                  : `Ainda há ${substituirExtratoDialog.pendentes} linhas não processadas`}
              </AlertDialogTitle>
            </AlertDialogHeader>

            <p className="text-sm text-muted-foreground">
              Importar “{substituirExtratoDialog.fileName}” substitui a lista atual — as linhas do extrato
              anterior que ainda não foram conciliadas nem ignoradas (com categoria/rateio já escolhidos, se for
              o caso) vão sumir da tela sem serem processadas. Cancele e finalize-as antes, ou continue se elas
              não importam mais.
            </p>

            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setSubstituirExtratoDialog(null)}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                onClick={confirmarSubstituirExtrato}
              >
                Substituir mesmo assim
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* ========== CONFERÊNCIA DE SALDO DO EXTRATO ========== */}
      {confirmSaldoDialog && (
        <ConfirmarSaldoExtratoDialog
          open={confirmSaldoDialog.open}
          nomeArquivo={confirmSaldoDialog.nomeArquivo}
          periodoInicio={confirmSaldoDialog.periodoInicio}
          periodoFim={confirmSaldoDialog.periodoFim}
          deltaExtrato={confirmSaldoDialog.deltaExtrato}
          saldoSugerido={confirmSaldoDialog.saldoSugerido}
          contaId={contaSel}
          onCancel={() => setConfirmSaldoDialog(null)}
          onConfirmed={async (saldoConfirmado) => {
            const pending = confirmSaldoDialog.parsed;
            setConfirmSaldoDialog(null);
            // Guarda o saldo oficial do extrato: é a referência da conferência
            // pós-processamento (banner verde/vermelho acima da lista).
            setSaldoExtrato(saldoConfirmado);
            if (contaSel) saveSaldoExtrato(contaSel, saldoConfirmado);
            setLoading(true);
            await processarLinhas(pending);
            setLoading(false);
          }}
        />
      )}

      {/* ========== EDITAR LANÇAMENTO (aba Lançamentos) ========== */}
      {showEditForm && (
        <ContaFormDialog
          open={showEditForm}
          onOpenChange={o => { if (!o) closeEditLancamento(); }}
          variant="lancamento"
          form={editForm}
          onFormChange={setEditForm}
          rateioLines={editRateioLines}
          onRateioLinesChange={setEditRateioLines}
          categorias={categorias.map(c => ({ ...c, tipo: c.tipo || '' }))}
          centros={centrosCusto}
          contas={contas}
          isEditing
          saving={editSaving}
          onSave={saveEditLancamento}
          onClose={closeEditLancamento}
          editPrevStatus={editPrevStatus}
          justificativa={editJustificativa}
          onJustificativaChange={setEditJustificativa}
        />
      )}
      <DeleteConfirmDialog />
    </div>
  );
}
