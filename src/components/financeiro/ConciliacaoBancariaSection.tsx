import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useScopeActivity } from '@/hooks/useScopeActivity';
import { bankDraftScope } from '@/lib/bankDraftScope';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useEmitDataEvent } from '@/lib/dataEvents';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/DateInput';
import { BRLInput } from '@/components/ui/brl-input';
import { DecimalInput } from '@/components/ui/decimal-input';
import { fmtBRL, formatDateBR, parseLocalDate, todayBR } from '@/lib/formatters';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import KpiCard from '@/components/ui/KpiCard';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { kpiGridClassFor, longestValueLength } from '@/components/ui/kpiGrid';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { parseExtrato, verifyContaExtrato, decodeExtratoBuffer, type ExtratoConta } from '@/lib/extratoParser';
import { useAuth } from '@/contexts/AuthContext';
import { useScopedToast } from '@/hooks/useScopedToast';
import { Upload, CheckCircle, CheckCircle2, Check, Save, RefreshCw, ArrowRight, Receipt, Plus, Trash2, PieChart, ArrowRightLeft, Search, CreditCard, FileText, EyeOff, X, AlertTriangle, Edit, RotateCcw, Loader2, Landmark, Calculator, Clock, FileUp } from 'lucide-react';
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
import { bankLineKey, buildConciliadosCounts, findStaleImportedRows, fitidKey, type ConciliadoRow, type VinculoRow } from '@/lib/conciliacaoConciliados';
import { registrarOcorrenciaUsada, reservarOcorrencias, type OcorrenciasLivres } from '@/lib/conciliacaoOcorrencia';
import { fetchCmvConfig, type CmvConfig } from '@/hooks/useCmvFinanceiro';
import { decisaoAoTrocarCategoria, type CmvAvisoDecisao, type CmvDecisao } from '@/domain/financeiro/cmv';
import CmvDecisaoToggle from '@/components/financeiro/cmv/CmvDecisaoToggle';
import ConciliacaoLinhaCmv from '@/components/financeiro/ConciliacaoLinhaCmv';
import {
  competenciaDaLinhaExtrato, decisaoDaLinhaExtrato, definirDecisaoDaLinha, rateioDaLinhaExtrato,
  resumoCmvRateio, trocarCategoriaDaLinha,
} from '@/lib/conciliacaoCmv';
import { getConsolidatedBankDelta, isAutomaticInvestmentLine, isPendingAutomaticInvestmentLine } from '@/lib/conciliacaoInvestimentoAutomatico';
import {
  classifySaldoArquivo,
  clearSaldoExtrato,
  getBankBalanceAtDate,
  getPendingDeltaAtReference,
  loadSaldoExtrato,
  saveSaldoExtrato,
  type SaldoExtratoRef,
} from '@/lib/conciliacaoSaldoExtrato';
import type { ContaBancariaRef, CategoriaFinRef, CentroCustoRef, LancamentoConciliacao, LancamentoCandidate, ContaPagarCandidate, ContaReceberCandidate, ContaPagarAberta } from '@/types/financeiro';
import { mapPagamentoError } from '@/lib/financeiroErrorMap';
import DateRangePresets from './DateRangePresets';
import { FinKpiGrid, FinNote, FinScreenHeader, FinSectionGroup } from './finV2Layout';
import { AvisoConciliacao, ConferenciaSaldoCarregando, ConferenciaSaldoErro, ConferenciaSaldoPainel, ExtratoLinhaResumo } from './ConciliacaoParts';
import {
  CHIP_TOM,
  MATCH_ORIGEM,
  extratoLinhaFundo,
  extratoLinhaResolvida,
  extratoLinhaStatus,
  extratoLinhasCaption,
  extratoTipoBadge,
  lancamentoConciliacaoBadge,
  sugestoesLabel,
  type ChipTom,
  type ExtratoLinhaEstado,
} from './conciliacaoView';
import { ledgerTipoBadge } from './livroRazaoView';
import { useConteinerEstreito } from './useConteinerEstreito';
import { useRetornoFoco } from './useRetornoFoco';
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
  /** Aplicação/resgate ContaMax persistido apenas como evidência; efeito financeiro zero. */
  movimentacaoInterna?: boolean;
  /** Identifica exatamente a ocorrência persistida para que “Reconsiderar” não
   *  remova outra transação idêntica do mesmo dia. */
  ignoradaId?: string;
  /** Índice com que a linha foi enviada e voltou `possible_duplicate`; o
   *  reenvio usa o mesmo (ver `@/lib/conciliacaoOcorrencia`). */
  ocorrencia?: number;
  /** CMV financeiro: decisão da linha sem rateio (ausente = pendente). */
  cmvIncluir?: CmvDecisao;
  cmvAviso?: CmvAvisoDecisao;
  /** Competência própria (yyyy-MM-dd); ausente = a data do banco (`data`). */
  competencia?: string;
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
  cmv_incluir?: CmvDecisao;
  cmv_aviso?: CmvAvisoDecisao;
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

// Ocorrências já usadas por linhas que saíram da lista (ver `@/lib/conciliacaoOcorrencia`).
// Acompanha as linhas: sobrevive ao recarregar a página e recomeça a cada arquivo novo.
const OCORRENCIAS_KEY = (contaId: string) => `conciliacao_ocorrencias_${contaId}`;

function loadOcorrenciasLivres(contaId: string): OcorrenciasLivres {
  try {
    const raw = sessionStorage.getItem(OCORRENCIAS_KEY(contaId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed as OcorrenciasLivres : {};
  } catch (_) { /* sessionStorage indisponível — recomeça pelas linhas reconhecidas */ return {}; }
}

function saveOcorrenciasLivres(contaId: string, livres: OcorrenciasLivres) {
  try { sessionStorage.setItem(OCORRENCIAS_KEY(contaId), JSON.stringify(livres)); } catch (_) { /* sessionStorage indisponível */ }
}

function clearOcorrenciasLivres(contaId: string) {
  try { sessionStorage.removeItem(OCORRENCIAS_KEY(contaId)); } catch (_) { /* sessionStorage indisponível */ }
}

/**
 * Localiza o dia em que o saldo do banco (reconstruído a partir de `saldoExtrato.valor`
 * subtraindo as linhas do extrato posteriores a cada data) começou a divergir do saldo
 * projetado do sistema (`get_fin_saldo_conta_em` + linhas ainda pendentes até aquela data).
 * Busca binária sobre as datas distintas do extrato — assume que, uma vez que a diferença
 * aparece, ela não se autocorrige nos dias seguintes (heurística de diagnóstico, não prova).
 */
async function localizarDiaDivergencia(supabase: typeof import("@/integrations/supabase/client").supabase,
  contaId: string,
  saldoExtrato: SaldoExtratoRef,
  linhas: LinhaExtrato[],
): Promise<{ status: 'found' | 'before_period'; data: string } | null> {
  const dateSet = new Set(linhas.map(l => l.data).filter(d => d <= saldoExtrato.data));
  if (dateSet.size === 0) return null;
  dateSet.add(saldoExtrato.data);
  const dates = Array.from(dateSet).sort();

  const bancoAt = (date: string) => getBankBalanceAtDate(saldoExtrato, linhas, date);
  const pendingUpTo = (date: string) => getPendingDeltaAtReference(linhas, date);

  const sistemaCache = new Map<string, number>();
  const sistemaAt = async (date: string) => {
    if (sistemaCache.has(date)) return sistemaCache.get(date)!;
    const { data, error } = await supabase.rpc('get_fin_saldo_conta_em', { p_conta_id: contaId, p_data: date });
    if (error) throw error;
    const v = Number(data) || 0;
    sistemaCache.set(date, v);
    return v;
  };
  const match = async (date: string) => Math.abs(bancoAt(date) - ((await sistemaAt(date)) + pendingUpTo(date))) < 0.01;

  const baselineDate = formatInBR(subDays(parseLocalDate(dates[0]), 1), 'yyyy-MM-dd');
  if (!(await match(baselineDate))) {
    return { status: 'before_period', data: dates[0] };
  }

  // Busca o primeiro índice em que a comparação deixa de bater — dates[dates.length - 1]
  // é sempre saldoExtrato.data, cujo `match` reproduz a `diferenca` do card (por construção
  // é falso aqui, já que esta função só roda quando o card está vermelho).
  let lo = 0;
  let hi = dates.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    // eslint-disable-next-line no-await-in-loop -- busca binária sequencial, cada passo depende do anterior
    if (await match(dates[mid])) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return { status: 'found', data: dates[lo] };
}

function consumeCount(counts: Map<string, number>, key: string): boolean {
  const remaining = counts.get(key) || 0;
  if (remaining <= 0) return false;
  if (remaining === 1) counts.delete(key);
  else counts.set(key, remaining - 1);
  return true;
}

/** Chaves `tipo|fitId` de todas as linhas do arquivo — insumo de buildConciliadosCounts. */
function fitidsDasLinhas(linhas: Pick<LinhaExtrato, 'tipo' | 'fitId'>[]): Set<string> {
  const set = new Set<string>();
  for (const l of linhas) {
    if (l.fitId) set.add(fitidKey(l.tipo, l.fitId));
  }
  return set;
}

const CONCILIACAO_VISOES = [
  { value: 'importar', label: 'Importar Extrato' },
  { value: 'conciliar', label: 'Lançamentos' },
];

export default function ConciliacaoBancariaSection() {
  const emitDataEvent = useEmitDataEvent();
  const toast = useScopedToast();
  const supabase = useSupabase();
  const canViewRbac = useCan('financeiro:conciliacao:view');
  const canReconcileRbac = useCan('financeiro:conciliacao:reconcile');
  const { user } = useAuth();
  const { companyId } = useCompanyId();
  const isScopeActive = useScopeActivity();
  const [contas, setContas] = useState<ContaBancariaRef[]>([]);
  // Apresentação: distingue "contas ainda carregando", "falhou" e "nenhuma conta ativa".
  const [contasStatus, setContasStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [contasTentativa, setContasTentativa] = useState(0);
  const [contaSel, setContaSel] = useState('');
  const draftKey = bankDraftScope(user?.id, companyId, contaSel);
  const currentAccount = useRef(contaSel);
  currentAccount.current = contaSel;
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string>('');

  const [linhas, setLinhasState] = useState<LinhaExtrato[]>([]);
  const [importFilter, setImportFilter] = useState<ImportFilter>('todos');
  const [importando, setImportando] = useState(false);
  // Travas síncronas: `importando` só chega ao `disabled` no próximo render.
  const importandoRef = useRef(false);
  const forcandoRef = useRef(false);

  // Conferência de saldo pós-processamento: compara o saldo oficial do extrato
  // (confirmado no upload) com o saldo do sistema + linhas ainda pendentes.
  // É a rede final contra linha engolida/ignorada indevidamente: qualquer venda
  // que o processamento deixe de lançar aparece aqui como diferença em R$.
  const [saldoExtrato, setSaldoExtrato] = useState<SaldoExtratoRef | null>(null);
  const [conferenciaSaldo, setConferenciaSaldo] = useState<{
    sistema: number; projetado: number; pendentesDelta: number; diferenca: number;
  } | null>(null);
  /** Dia em que a diferença acima começou a existir — best-effort, calculado por busca
   *  binária (ver `localizarDiaDivergencia`), só quando o card de conferência está vermelho. */
  const [diaDivergencia, setDiaDivergencia] = useState<{ status: 'found' | 'before_period'; data: string } | null>(null);
  // Apresentação da conferência: recalculando (o veredito exibido ainda é o anterior) e falha
  // na leitura do saldo do sistema (antes o banner sumia ou ficava com o veredito velho).
  const [conferenciaAtualizando, setConferenciaAtualizando] = useState(false);
  const [conferenciaErro, setConferenciaErro] = useState(false);
  const [conferenciaTentativa, setConferenciaTentativa] = useState(0);
  // Saldo do extrato e linhas com que o veredito exibido foi calculado. Comparar no render diz se
  // ele ficou velho sem um setState a mais (marcar "atualizando" no efeito renderizava a lista
  // inteira de novo a cada clique).
  const [conferenciaBase, setConferenciaBase] = useState<{ saldo: SaldoExtratoRef; linhas: LinhaExtrato[] } | null>(null);

  const [lancamentos, setLancamentos] = useState<LancamentoConciliacao[]>([]);
  const [lancamentoRateioCategoryIds, setLancamentoRateioCategoryIds] = useState<Record<string, string[]>>({});
  const [filtro, setFiltro] = useState<'pendentes' | 'conciliados' | 'todos'>('pendentes');
  const [filtroDataDe, setFiltroDataDe] = useState(() => formatInBR(subDays(new Date(), 90), 'yyyy-MM-dd'));
  const [filtroDataAte, setFiltroDataAte] = useState(todayBR());
  const [view, setView] = useState<'importar' | 'conciliar'>('conciliar');
  // Totais da conta inteira (independentes do filtro/paginação da lista) — usados só no resumo do cabeçalho.
  const [totalPendentesConta, setTotalPendentesConta] = useState(0);
  const [totalConciliadosConta, setTotalConciliadosConta] = useState(0);
  // Apresentação: contagem ainda não lida ou que falhou nunca aparece como zero.
  const [contagemStatus, setContagemStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  // Apresentação: falha na lista não aparece como "Nenhum lançamento encontrado".
  const [lancamentosErro, setLancamentosErro] = useState(false);
  const [selectedLancamentoIds, setSelectedLancamentoIds] = useState<Set<string>>(new Set());

  const [processando, setProcessando] = useState(false);
  const [reconsiderandoId, setReconsiderandoId] = useState<string | null>(null);

  const [suggestionsDialog, setSuggestionsDialog] = useState<{ open: boolean; linhaIndex: number }>({ open: false, linhaIndex: -1 });

  const [rateioDialog, setRateioDialog] = useState<{ open: boolean; linhaIndex: number }>({ open: false, linhaIndex: -1 });
  const [rateioLinhas, setRateioLinhas] = useState<RateioLinha[]>([]);
  const [categorias, setCategorias] = useState<CategoriaFinRef[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoRef[]>([]);
  // CMV Financeiro da unidade. Os controles novos só existem com `recursos.lancamentos`.
  const [cmvConfig, setCmvConfig] = useState<CmvConfig | null>(null);
  const cmvRecurso = cmvConfig?.recursos.lancamentos === true;
  // Sugestão pelo padrão da categoria só com a classificação ativa.
  const cmvPadroes = useMemo(
    () => (cmvRecurso && cmvConfig?.classificacaoAtiva ? new Map(cmvConfig.categorias.map(c => [c.id, c.cmvSugerir])) : null),
    [cmvConfig, cmvRecurso],
  );

  const [transferDialog, setTransferDialog] = useState<{ open: boolean; linhaIndex: number }>({ open: false, linhaIndex: -1 });
  const [transferContaDestino, setTransferContaDestino] = useState('');
  const [linhasAntigasAusentes, setLinhasAntigasAusentes] = useState<ConciliadoRow[]>([]);

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
    saldoSugerido?: { valor: number; data: string };
    saldoContaCorrenteArquivo?: { valor: number; data: string };
  } | null>(null);

  // Wrapper: atualiza state e persiste no sessionStorage
  const setLinhas = (updater: LinhaExtrato[] | ((prev: LinhaExtrato[]) => LinhaExtrato[])) => {
    if (!isScopeActive() || currentAccount.current !== contaSel) return;
    setLinhasState(prev => {
      if (!isScopeActive() || currentAccount.current !== contaSel) return prev;
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (draftKey) saveLinhas(draftKey, next);
      return next;
    });
  };

  const automaticInvestmentLines = useMemo(
    () => linhas.filter(isPendingAutomaticInvestmentLine),
    [linhas],
  );
  useEffect(() => {
    supabase.from('fin_contas').select('id, nome, numero_conta, agencia, banco').eq('ativo', true).order('nome')
      .then(({ data, error }) => {
        if (error) console.error('[ConciliacaoBancariaSection.contas]', error);
        setContasStatus(error ? 'error' : 'ready');
        setContas(data || []);
        if (data && data.length > 0 && !contaSel) setContaSel(data[0].id);
      });
    Promise.all([
      supabase.from('fin_categorias').select('id, nome, tipo, parent_id, centro_custo_padrao_id, excluir_dos_totais').eq('ativo', true).order('nome'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
      fetchCmvConfig(supabase),
    ]).then(([catRes, ccRes, cmvRes]) => {
      setCategorias(buildCategoryOptions(catRes.data || []));
      setCentrosCusto(ccRes.data || []);
      setCmvConfig(cmvRes);
    });
  }, [contaSel, supabase, contasTentativa]);

  useEffect(() => {
    setLinhasAntigasAusentes([]);
  }, [contaSel]);

  // Restaura linhas do sessionStorage quando a conta é selecionada
  useEffect(() => {
    setImportFilter('todos');
    setConferenciaSaldo(null);
    setConferenciaErro(false);
    if (!contaSel) {
      setLinhasState([]);
      setSaldoExtrato(null);
      return;
    }
    setSaldoExtrato(draftKey ? loadSaldoExtrato(draftKey) : null);
    const saved = draftKey ? loadLinhas(draftKey) : null;
    if (saved && saved.length > 0) {
      setLinhasState(saved);
      if (view !== 'importar') setView('importar');
      // O cache pode estar desatualizado se o lançamento foi desconciliado/excluído
      // em outra aba/sessão — revalida as linhas travadas contra o banco.
      refreshLockedLinhas(saved);
    } else {
      setLinhasState([]);
    }
  }, [contaSel, draftKey]);

  // Recalcula a conferência de saldo sempre que as linhas mudam (processar,
  // ignorar, desconciliar). Debounce curto para agrupar mutações em sequência.
  useEffect(() => {
    if (!contaSel || !saldoExtrato) {
      setConferenciaSaldo(null);
      setDiaDivergencia(null);
      setConferenciaErro(false);
      setConferenciaAtualizando(false);
      return;
    }
    let active = true;
    const t = setTimeout(async () => {
      // Só depois do debounce: marcar no corpo do efeito renderizava a lista inteira de novo a cada
      // clique numa linha (medido: o dobro do tempo de resposta com 250 linhas).
      setConferenciaAtualizando(true);
      const { data, error } = await supabase.rpc('get_fin_saldo_conta_em', {
        p_conta_id: contaSel,
        p_data: saldoExtrato.data,
      });
      if (!active) return;
      // Antes da checagem de escopo: senão o "Atualizando…" ficava preso se o escopo saísse no meio.
      setConferenciaAtualizando(false);
      if (!isScopeActive()) return;
      if (error) {
        console.error('[ConciliacaoBancariaSection.conferenciaSaldo]', error);
        setConferenciaErro(true);
        return;
      }
      setConferenciaErro(false);
      const sistema = Number(data) || 0;
      // Linhas ainda não resolvidas entram como projeção: quando tudo for
      // processado, projetado === sistema e a comparação vira definitiva.
      const pendentesDelta = getPendingDeltaAtReference(linhas, saldoExtrato.data);
      const projetado = sistema + pendentesDelta;
      const diferenca = saldoExtrato.valor - projetado;
      setConferenciaSaldo({ sistema, projetado, pendentesDelta, diferenca });
      setConferenciaBase({ saldo: saldoExtrato, linhas });

      if (Math.abs(diferenca) < 0.01) {
        setDiaDivergencia(null);
        return;
      }
      try {
        const divergence = await localizarDiaDivergencia(supabase, contaSel, saldoExtrato, linhas);
        if (active && isScopeActive()) setDiaDivergencia(divergence);
      } catch (err) {
        console.error('[ConciliacaoBancariaSection.diaDivergencia]', err);
        if (active && isScopeActive()) setDiaDivergencia(null);
      }
    }, 600);
    return () => { active = false; clearTimeout(t); };
  }, [contaSel, saldoExtrato, linhas, supabase, isScopeActive, conferenciaTentativa]);

  useEffect(() => {
    if (contaSel && view === 'conciliar') loadLancamentos();
    // Selection refers to rows from the previous account/filter/view — drop it so the
    // "Excluir Selecionados (N)" button doesn't show a stale count after switching.
    setSelectedLancamentoIds(new Set());
  }, [contaSel, filtro, filtroDataDe, filtroDataAte, view]);
  useEffect(() => { if (contaSel && view === 'conciliar') loadLancamentosCounts(); }, [contaSel, view]);
  // Apresentação: ao trocar de conta, a contagem da conta anterior não fica na tela como se fosse a nova.
  useEffect(() => { setContagemStatus('loading'); }, [contaSel]);

  /** Totais reais da conta (pendente/conciliado), independentes do filtro e da paginação da lista. */
  const loadLancamentosCounts = async () => {
    const [pendRes, concRes] = await Promise.all([
      supabase.from('fin_lancamentos').select('id', { count: 'exact', head: true })
        .eq('conta_id', contaSel).eq('status', 'REALIZADO').or('conciliado.is.null,conciliado.eq.false'),
      supabase.from('fin_lancamentos').select('id', { count: 'exact', head: true })
        .eq('conta_id', contaSel).eq('status', 'REALIZADO').eq('conciliado', true),
    ]);
    if (pendRes.error || concRes.error) console.error('[ConciliacaoBancariaSection.loadLancamentosCounts]', pendRes.error || concRes.error);
    setContagemStatus(pendRes.error || concRes.error ? 'error' : 'ready');
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
      setLancamentosErro(false);
    } catch (error) {
      console.error('Error loading lancamentos:', error);
      setLancamentosErro(true);
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
    internalMovementIds: Map<string, string>;
    ignoradasIds: Map<string, string[]>;
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
    staleImportedRows: ConciliadoRow[];
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
        .select('id, data_competencia, data_pagamento, valor, tipo, descricao, origem')
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

  /**
   * Busca lançamentos/CP/CR candidatos + sets de já-conciliadas/ignoradas para a conta selecionada.
   * `fitidsNoArquivo` (chaves `tipo|fitId` das linhas do arquivo sendo importado) decide quais
   * lançamentos vinculados saem do reconhecimento por conteúdo — ver buildConciliadosCounts.
   */
  const fetchMatchContext = async (
    fitidsNoArquivo: ReadonlySet<string>,
    linhasArquivo: ReadonlyArray<LinhaExtrato>,
  ): Promise<MatchContext> => {
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
      contaSel ? supabase.from('fin_conciliacao_ignoradas').select('id, data, valor, tipo, descricao, tratamento, occurrence_index')
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

    const vinculos = (vinculosRes.data || []) as VinculoRow[];
    const externalIdsProcessados = new Map(vinculos.map(v => [fitidKey(v.tipo, v.external_id), v.lancamento_id]));
    const lancamentosVinculados = new Set(vinculos.map(v => v.lancamento_id).filter(Boolean));

    // Já conciliadas — mostrar com badge em vez de filtrar silenciosamente.
    // Regras de exclusão (vínculo de FITID presente no arquivo) e de data
    // (data_pagamento antes de data_competencia) documentadas em buildConciliadosCounts.
    const conciliados = (conciliadosRes.data || []) as ConciliadoRow[];
    const conciliadosCounts = buildConciliadosCounts(
      conciliados,
      vinculos,
      fitidsNoArquivo,
    );
    const staleImportedRows = findStaleImportedRows(
      conciliados,
      vinculos,
      fitidsNoArquivo,
      linhasArquivo,
    );

    // Resoluções sem lançamento: ignoradas manuais continuam sensíveis à
    // contagem; ContaMax usa occurrence_index persistido e chave única parcial.
    const ignoradasIds = new Map<string, string[]>();
    const internalMovementIds = new Map<string, string>();
    for (const l of (ignoradasRes.data || []) as {
      id: string;
      data: string;
      valor: number;
      tipo: string;
      descricao: string | null;
      tratamento?: string | null;
      occurrence_index?: number | null;
    }[]) {
      const key = bankLineKey(l);
      if (l.tratamento === 'MOVIMENTACAO_INTERNA_CONTAMAX' && l.occurrence_index != null) {
        internalMovementIds.set(`${key}|${l.occurrence_index}`, l.id);
        continue;
      }
      const ids = ignoradasIds.get(key) || [];
      ids.push(l.id);
      ignoradasIds.set(key, ids);
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

    return { allLancamentos, contasPagar, contasReceber, conciliadosCounts, internalMovementIds, ignoradasIds, externalIdsProcessados, lancamentosVinculados, transferCandidates, staleImportedRows };
  };

  /** Recalcula o estado de match de UMA linha (já conciliada/ignorada/sugestão) contra o contexto atual do banco. */
  const matchLinha = (
    linha: LinhaExtrato,
    ctx: MatchContext,
    usedIds: Set<string>,
    occurrenceIndex: number,
  ): LinhaExtrato => {
    const key = bankLineKey(linha);
    const base = {
      ...linha,
      matchId: undefined, matchOrigin: undefined, matchDescricao: undefined, matchRaw: undefined,
      matchJaNoRazao: undefined, suggestions: undefined,
      transferReconhecida: undefined, transferAlertas: undefined,
      ignoradaId: undefined,
      movimentacaoInterna: undefined,
    };

    // ContaMax sempre tem precedência sobre FITID, lançamento e transferência:
    // a linha é evidência interna e nunca pode ser "roubada" pelo fluxo financeiro.
    const internalMovementId = ctx.internalMovementIds.get(`${key}|${occurrenceIndex}`);
    if (internalMovementId) {
      return {
        ...base,
        selecionada: false,
        jaConciliada: false,
        ignorada: true,
        movimentacaoInterna: true,
        ignoradaId: internalMovementId,
      };
    }
    if (isAutomaticInvestmentLine(linha)) {
      return {
        ...base,
        selecionada: false,
        jaConciliada: false,
        ignorada: false,
        movimentacaoInterna: false,
      };
    }

    // FITID é a identidade bancária estável e tem precedência sobre campos
    // editáveis do lançamento (descrição/categoria/data de competência).
    // Consumo 1:1 dentro do arquivo: se o lançamento deste vínculo já foi
    // reivindicado por OUTRA linha deste mesmo arquivo, esta linha NÃO está
    // coberta no razão — deixa cair no fluxo normal (pendente/nova) em vez de
    // marcá-la "já conciliada". Sem isso, duas vendas idênticas do mesmo dia
    // vinculadas por engano ao mesmo lançamento ficavam ambas verdes e a venda
    // que faltava sumia do saldo (15 vendas, R$ 3.060,15 em produção).
    if (linha.fitId) {
      const vincLancId = ctx.externalIdsProcessados.get(fitidKey(linha.tipo, linha.fitId));
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
    const ignoredIds = ctx.ignoradasIds.get(key);
    const ignoradaId = ignoredIds?.shift();
    if (ignoredIds?.length === 0) ctx.ignoradasIds.delete(key);
    if (ignoradaId) {
      return { ...base, selecionada: false, ignorada: true, ignoradaId, jaConciliada: false };
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
      .filter(linha => !!linha.fitId && !isAutomaticInvestmentLine(linha))
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

  const neutralizeAutomaticInvestmentLines = async (parsed: LinhaExtrato[]) => {
    if (!contaSel) throw new Error('Selecione uma conta bancária');
    const targets = parsed.filter(isAutomaticInvestmentLine);
    if (targets.length === 0) return { processed: 0, inserted: 0, existing: 0 };

    const { data, error } = await supabase.rpc('reconcile_neutralize_contamax', {
      p_conta_id: contaSel,
      // A RPC precisa receber TODAS as ocorrências do arquivo, inclusive as já
      // vistas, para calcular índices 0..N estáveis entre linhas idênticas.
      p_linhas: targets.map(line => ({
        data: line.data,
        valor: line.valor,
        tipo: line.tipo,
        descricao: line.descricao,
        external_id: line.fitId || null,
      })),
    });
    if (error) throw error;
    return (data || {}) as { processed?: number; inserted?: number; existing?: number };
  };

  /** Busca matches e popula sugestões de conciliação para linhas já parseadas (usado ao importar um arquivo novo). */
  const processarLinhas = async (parsed: LinhaExtrato[]) => {
    try {
      let neutralizationError: unknown = null;
      try {
        await neutralizeAutomaticInvestmentLines(parsed);
      } catch (error) {
        // A linha continuará desmarcada e sem ações financeiras em matchLinha.
        // Assim uma indisponibilidade nunca a transforma em receita/despesa.
        neutralizationError = error;
      }

      await autoBindTransferCounterparts(parsed);
      const ctx = await fetchMatchContext(fitidsDasLinhas(parsed), parsed);
      const usedIds = new Set<string>();
      const occurrenceCounts = new Map<string, number>();
      const final = parsed.map(linha => {
        const key = bankLineKey(linha);
        const occurrenceIndex = occurrenceCounts.get(key) || 0;
        occurrenceCounts.set(key, occurrenceIndex + 1);
        return matchLinha(linha, ctx, usedIds, occurrenceIndex);
      });
      setLinhasAntigasAusentes(ctx.staleImportedRows);

      const visibleLines = final;

      const matchedLanc = visibleLines.filter(l => l.matchOrigin === 'lancamento').length;
      const matchedCP = visibleLines.filter(l => l.matchOrigin === 'conta_pagar').length;
      const matchedCR = visibleLines.filter(l => l.matchOrigin === 'conta_receber').length;
      const jaConciliadas = visibleLines.filter(l => l.jaConciliada).length;
      const internas = visibleLines.filter(l => l.movimentacaoInterna).length;
      const ignoradas = visibleLines.filter(l => l.ignorada && !l.movimentacaoInterna).length;
      const resolvidasSemLancamento = visibleLines.filter(l => l.ignorada).length;
      const withSuggestions = visibleLines.filter(l => !l.matchId && !l.jaConciliada && !l.ignorada && l.suggestions && l.suggestions.length > 0).length;
      const internasPendentes = visibleLines.filter(
        l => isAutomaticInvestmentLine(l) && !l.movimentacaoInterna,
      ).length;
      const unmatched = visibleLines.length
        - matchedLanc
        - matchedCP
        - matchedCR
        - jaConciliadas
        - resolvidasSemLancamento
        - internasPendentes;

      const msg = `${final.length} transações: `;
      const msgParts: string[] = [];
      if (internas > 0) msgParts.push(`${internas} ContaMax interna(s)`);
      if (matchedLanc > 0) msgParts.push(`${matchedLanc} match lançamento`);
      if (matchedCP > 0) msgParts.push(`${matchedCP} match contas a pagar`);
      if (matchedCR > 0) msgParts.push(`${matchedCR} match contas a receber`);
      if (jaConciliadas > 0) msgParts.push(`${jaConciliadas} já conciliada(s)`);
      if (ignoradas > 0) msgParts.push(`${ignoradas} ignorada(s)`);
      if (internasPendentes > 0) msgParts.push(`${internasPendentes} ContaMax bloqueada(s) para nova tentativa`);
      if (withSuggestions > 0) msgParts.push(`${withSuggestions} com sugestões`);
      const novas = unmatched - withSuggestions;
      if (novas > 0) msgParts.push(`${novas} nova(s)`);
      toast.success(msg + msgParts.join(', '));

      if (neutralizationError) {
        console.error('[ConciliacaoBancariaSection.processarLinhas.contaMax]', neutralizationError);
        toast.warning(extractSupabaseErrorMessage(
          neutralizationError,
          'Não foi possível registrar a ContaMax como movimentação interna. As linhas ficaram bloqueadas para tentar novamente.',
        ));
      }

      setLinhas(visibleLines);
      setImportFilter('todos');
      if (internas > 0) emitDataEvent('financeiro:conciliacao');
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
      // O set de FITIDs vem do arquivo INTEIRO (base), não só das linhas travadas:
      // a exclusão em buildConciliadosCounts depende de qualquer linha do arquivo
      // poder reivindicar o vínculo, mesmo que ela não esteja sendo re-matchada aqui.
      const ctx = await fetchMatchContext(fitidsDasLinhas(base), base);
      setLinhasAntigasAusentes(ctx.staleImportedRows);
      const usedIds = new Set<string>();
      for (const l of base) {
        if (!l.jaConciliada && !l.ignorada && l.matchId && l.matchOrigin) {
          usedIds.add(`${l.matchOrigin === 'lancamento' ? 'lanc' : l.matchOrigin === 'conta_pagar' ? 'cp' : 'cr'}-${l.matchId}`);
        }
      }
      const occurrenceCounts = new Map<string, number>();
      setLinhas(prev => prev.map(l => {
        const key = bankLineKey(l);
        const occurrenceIndex = occurrenceCounts.get(key) || 0;
        occurrenceCounts.set(key, occurrenceIndex + 1);
        return (l.jaConciliada || l.ignorada)
          ? matchLinha(l, ctx, usedIds, occurrenceIndex)
          : l;
      }));
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
    const saldoClassificado = classifySaldoArquivo(saldoFinalArquivo, parsed);
    setConfirmSaldoDialog({
      open: true,
      parsed,
      nomeArquivo: fileName,
      periodoInicio: datas[0],
      periodoFim: datas[datas.length - 1],
      ...saldoClassificado,
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
      // `file.text()` decodifica sempre como UTF-8; extrato brasileiro costuma
      // vir em Windows-1252 e os acentos viravam caractere de substituição,
      // desestabilizando a descrição que serve de chave contra duplicata.
      const text = decodeExtratoBuffer(await file.arrayBuffer());
      const result = parseExtrato(file.name, text);
      const parsed: LinhaExtrato[] = result.linhas.map(l => ({ ...l, selecionada: true }));

      if (parsed.length === 0) {
        toast.error('Nenhuma transação encontrada no arquivo.');
        return;
      }

      // Anomalias do arquivo (mais de uma conta, encoding corrompido, sinal
      // deduzido do TRNTYPE) precisam de conferência humana antes de conciliar.
      for (const aviso of result.avisos) {
        toast.warning(aviso, { duration: 12000 });
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
    setLinhasAntigasAusentes([]);
    if (draftKey) clearSaldoExtrato(draftKey);
    if (draftKey) clearLinhas(draftKey);
    if (draftKey) clearOcorrenciasLivres(draftKey);
  };

  // ========== Ignorar linha ==========
  const ignorarLinha = async (i: number) => {
    const linha = linhas[i];
    if (!linha || !contaSel) return;
    if (isAutomaticInvestmentLine(linha)) {
      toast.info('Aplicação/resgate ContaMax é movimentação interna e será tratada automaticamente, sem lançamento financeiro.');
      return;
    }
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

  // ========== Reconsiderar linha ignorada ==========
  const reconsiderarLinha = async (i: number) => {
    const linha = linhas[i];
    if (!linha?.ignoradaId || reconsiderandoId) return;

    setReconsiderandoId(linha.ignoradaId);
    try {
      const { error } = await supabase.rpc('reconcile_reconsiderar_ignorada', {
        p_ignorada_id: linha.ignoradaId,
      });
      if (error) throw error;

      setLinhas(prev => prev.map((item, j) => j === i ? {
        ...item,
        ignorada: false,
        ignoradaId: undefined,
        selecionada: true,
      } : item));
      toast.success('Entrada reconsiderada e devolvida para análise.');
    } catch (err) {
      console.error('[ConciliacaoBancariaSection.reconsiderarLinha]', err);
      toast.error(extractSupabaseErrorMessage(err, 'Erro ao reconsiderar entrada'));
    } finally {
      setReconsiderandoId(null);
    }
  };

  // ========== Rateio Functions ==========
  const openRateio = (linhaIndex: number) => {
    const linha = linhas[linhaIndex];
    const existing = linha.rateioLinhas;
    if (existing && existing.length > 0) {
      setRateioLinhas([...existing]);
    } else {
      // A 1ª linha começa com a categoria, o centro de custo padrão dela e a resposta que a linha já tinha:
      // abrir o rateio só para responder Sim/Não não pode mandar o item sem o centro de custo da categoria.
      const centroPadrao = categorias.find(c => c.id === linha.categoriaId)?.centro_custo_padrao_id || '';
      setRateioLinhas([{ categoria_id: linha.categoriaId || '', centro_custo_id: centroPadrao, valor: linha.valor, percentual: 100, observacao: '', cmv_incluir: decisaoDaLinhaExtrato(linha) }]);
    }
    setRateioDialog({ open: true, linhaIndex });
  };

  const addRateioLinha = () => {
    setRateioLinhas(prev => [...prev, { categoria_id: '', centro_custo_id: '', valor: 0, percentual: 0, observacao: '', cmv_incluir: null }]);
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
        if (cmvPadroes && linhas[rateioDialog.linhaIndex]?.tipo === 'DESPESA') {
          Object.assign(linha, decisaoAoTrocarCategoria(linha.cmv_incluir, String(value), cmvPadroes));
        }
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

  const setRateioCmv = (idx: number, incluir: boolean) =>
    setRateioLinhas(prev => prev.map((l, i) => (i === idx ? { ...l, cmv_incluir: incluir, cmv_aviso: undefined } : l)));

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

  const createTransferForExtratoLine = async (linha: LinhaExtrato, otherAccountId: string) => {
    if (!contaSel) throw new Error('Selecione uma conta bancária');
    if (otherAccountId === contaSel) throw new Error('Contas devem ser diferentes');

    const isOutgoing = linha.tipo === 'DESPESA';
    const contaOrigemId = isOutgoing ? contaSel : otherAccountId;
    const contaDestinoId = isOutgoing ? otherAccountId : contaSel;
    const { data, error } = await supabase.rpc('reconcile_create_transfer_from_extrato', {
      p_data: linha.data,
      p_valor: linha.valor,
      p_descricao: linha.descricao,
      p_conta_origem_id: contaOrigemId,
      p_conta_destino_id: contaDestinoId,
      p_external_id: linha.fitId || '',
      p_external_tipo: linha.tipo,
    });
    if (error) throw error;
    const result = data as { status?: string; lancamento_id?: string } | null;
    return result;
  };

  const processAutomaticInvestmentLines = async () => {
    const targets = linhas.filter(isAutomaticInvestmentLine);
    if (targets.length === 0) {
      return;
    }

    setProcessando(true);
    try {
      const result = await neutralizeAutomaticInvestmentLines(targets);
      toast.success(
        `${result.processed || targets.length} movimentação(ões) ContaMax tratada(s) sem efeito financeiro.`,
      );
      await processarLinhas(linhas);
    } catch (error) {
      console.error('[ConciliacaoBancariaSection.processAutomaticInvestmentLines]', error);
      toast.error(extractSupabaseErrorMessage(
        error,
        'Erro ao registrar a ContaMax como movimentação interna. Nenhum lançamento financeiro foi criado.',
      ));
    } finally {
      setProcessando(false);
    }
  };

  /** Rateio (ou categoria única) da linha, no formato que a RPC de importação espera. */
  const buildRateioPayload = (l: LinhaExtrato) =>
    rateioDaLinhaExtrato(l, categoriaId => categorias.find(c => c.id === categoriaId)?.centro_custo_padrao_id || null, cmvRecurso);

  /** Índice da linha aberta em "Criar lançamento", pela mesma regra do Processar. */
  const ocorrenciaDaLinhaCriar = (): number | undefined => {
    const linha = criarDialog.open && criarDialog.linhaIndex >= 0 ? linhas[criarDialog.linhaIndex] : undefined;
    if (!linha) return undefined;
    const livres = draftKey ? loadOcorrenciasLivres(draftKey) : {};
    return reservarOcorrencias(linhas, [linha], livres).indices.get(linha);
  };

  /** Linha sinalizada como possível duplicata: usuário confirmou que é uma
   *  transação legítima repetida (ex.: duas vendas iguais no mesmo dia) e
   *  quer importar mesmo assim. */
  const forcarImportarDuplicata = async (item: { linha: LinhaExtrato; lancamentoId: string; criadoEm?: string }) => {
    if (forcandoRef.current) return;
    forcandoRef.current = true;
    const l = item.linha;
    try {
      // O mesmo índice com que a linha foi recusada: sem FITID ele é a chave, e
      // sem ele a venda repetida caía na chave da 1ª e voltava 'duplicate'.
      const { data, error } = await supabase.rpc('reconcile_import_lancamento', {
        p_data: l.data, p_descricao: l.descricao, p_valor: l.valor, p_tipo: l.tipo,
        p_conta_id: contaSel, p_user_id: user?.id,
        p_rateio_linhas: buildRateioPayload(l),
        p_external_id: l.fitId || null,
        p_force_duplicate: true,
        p_occurrence_index: l.ocorrencia ?? 0,
        ...competenciaDaLinhaExtrato(l, cmvRecurso),
      } as any);
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
    } finally {
      forcandoRef.current = false;
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
      .filter(({ l }) => !isAutomaticInvestmentLine(l) && l.matchId && l.matchJaNoRazao && !l.jaConciliada && !l.ignorada)
      .map(({ i }) => i);

    if (indicesJaNoRazao.length > 0 && !jaConfirmouVinculos) {
      setJaNoRazaoDialog({ open: true, indices: indicesJaNoRazao });
      return;
    }

    // Dar baixa em boleto é irreversível pela tela (exige estorno para desfazer):
    // passa sempre por revisão, com o valor do extrato ao lado do valor do boleto.
    const indicesBaixa = linhas
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => !isAutomaticInvestmentLine(l) && l.matchId && (l.matchOrigin === 'conta_pagar' || l.matchOrigin === 'conta_receber') && !l.jaConciliada)
      .map(({ i }) => i);

    if (indicesBaixa.length > 0 && !jaConfirmouBaixas) {
      abrirRevisaoBaixa(indicesBaixa);
      return;
    }

    // Guarda final: ContaMax nunca entra em nenhum caminho que cria, vincula ou
    // baixa lançamento, mesmo se uma resposta de neutralização falhar.
    const isFinancialLine = (line: LinhaExtrato) => !isAutomaticInvestmentLine(line);
    const toImport = linhas.filter(l => isFinancialLine(l) && l.selecionada && !l.matchId && !l.jaConciliada && !l.ignorada);
    const toLinkExisting = linhas.filter(l => isFinancialLine(l) && l.matchId && l.matchOrigin === 'lancamento' && l.matchJaNoRazao && !l.jaConciliada);
    const toReconcileLanc = linhas.filter(l => isFinancialLine(l) && l.matchId && l.matchOrigin === 'lancamento' && !l.matchJaNoRazao && !l.jaConciliada);
    const pendingCP = linhas.filter(l => isFinancialLine(l) && l.matchId && l.matchOrigin === 'conta_pagar');
    const pendingCR = linhas.filter(l => isFinancialLine(l) && l.matchId && l.matchOrigin === 'conta_receber');
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

    const duplicatasDetectadas: { linha: LinhaExtrato; lancamentoId: string; criadoEm?: string; ocorrencia: number }[] = [];

    if (importandoRef.current) return;
    importandoRef.current = true;

    // Índice de cada linha entre as linhas iguais, na ordem de criação: conta as
    // já reconhecidas, as que esta sessão já gravou e a posição no envio (ver
    // `@/lib/conciliacaoOcorrencia`). Sem FITID ele é a chave de idempotência.
    // O registro da sessão só avança junto com a remoção das linhas gravadas:
    // se o envio falhar no meio, repetir devolve os mesmos índices.
    const reserva = reservarOcorrencias(linhas, toImport, draftKey ? loadOcorrenciasLivres(draftKey) : {});
    setImportando(true);
    try {
      if (toImport.length > 0) {
        for (const l of toImport) {
          const ocorrencia = reserva.indices.get(l) ?? 0;
          const { data, error } = await supabase.rpc('reconcile_import_lancamento', {
            p_data: l.data, p_descricao: l.descricao, p_valor: l.valor, p_tipo: l.tipo,
            p_conta_id: contaSel, p_user_id: user?.id,
            p_rateio_linhas: buildRateioPayload(l),
            p_external_id: l.fitId || null,
            p_occurrence_index: ocorrencia,
            ...competenciaDaLinhaExtrato(l, cmvRecurso),
          } as any);
          if (error) throw error;
          const result = data as { status?: string; lancamento_id?: string; criado_em?: string } | null;

          // Mesmo valor/data/descrição/conta já conciliados com um FITID
          // diferente — provável reimportação do mesmo extrato. Não insere:
          // fica pendente para a pessoa decidir (ver duplicataDialog).
          if (result?.status === 'possible_duplicate' && result.lancamento_id) {
            duplicatasDetectadas.push({ linha: l, lancamentoId: result.lancamento_id, criadoEm: result.criado_em, ocorrencia });
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
      // A linha recusada guarda o índice com que foi enviada: "Importar mesmo
      // assim" e um novo "Processar" reenviam com ele.
      const recusadas = new Map(duplicatasDetectadas.map(d => [d.linha, { ...d.linha, ocorrencia: d.ocorrencia }]));
      if (duplicatasDetectadas.length > 0) {
        toast.warning(`${duplicatasDetectadas.length} linha(s) não foram importadas por parecerem duplicatas de um lançamento já existente — revise antes de confirmar.`);
        setDuplicataDialog({
          open: true,
          itens: duplicatasDetectadas.map(d => ({
            linha: recusadas.get(d.linha) ?? d.linha, lancamentoId: d.lancamentoId, criadoEm: d.criadoEm,
          })),
        });
      }
      if (draftKey && isScopeActive() && currentAccount.current === contaSel) {
        saveOcorrenciasLivres(draftKey, reserva.livres);
      }
      // Remove apenas as linhas processadas; as demais (não selecionadas, sem match, ignoradas, já conciliadas,
      // ou sinalizadas como possível duplicata) permanecem na lista. setLinhas já persiste no sessionStorage.
      setLinhas(prev => prev.filter(l => !processadas.has(l)).map(l => recusadas.get(l) ?? l));
      loadLancamentos();
      emitDataEvent('financeiro:lancamentos');
      emitDataEvent('financeiro:conciliacao');
      emitDataEvent('financeiro:contas_pagar');
      emitDataEvent('financeiro:contas_receber');
    } catch (err: unknown) {
      console.error('[ConciliacaoBancariaSection.importarEConciliar]', err);
      toast.error(mapPagamentoError(err));
    } finally {
      importandoRef.current = false;
      setImportando(false);
    }
  };

  const toggleAll = (checked: boolean) => {
    setLinhas(prev => prev.map(l => (
      l.matchId || l.jaConciliada || l.ignorada || isAutomaticInvestmentLine(l)
    ) ? l : { ...l, selecionada: checked }));
  };

  const fmt = fmtBRL;
  const pendentes = lancamentos.filter(l => !l.conciliado).length;
  const lancamentosFiltrados = lancamentos.filter(l => {
    if (filtro === 'pendentes') return !l.conciliado;
    if (filtro === 'conciliados') return !!l.conciliado;
    return true;
  });
  const conciliados = lancamentos.filter(l => l.conciliado).length;
  const selecionadas = linhas.filter(l => !isAutomaticInvestmentLine(l) && l.selecionada && !l.matchId && !l.jaConciliada && !l.ignorada);
  const matchedTotal = linhas.filter(l => !isAutomaticInvestmentLine(l) && l.matchId && !l.jaConciliada).length;
  const withSuggestions = linhas.filter(l => !isAutomaticInvestmentLine(l) && !l.matchId && !l.jaConciliada && !l.ignorada && l.suggestions && l.suggestions.length > 0).length;
  const jaConciliadas = linhas.filter(l => l.jaConciliada).length;
  const movimentacoesInternas = linhas.filter(l => l.movimentacaoInterna).length;
  const ignoradas = linhas.filter(l => l.ignorada && !l.movimentacaoInterna).length;
  const linhasFiltradas = linhas
    .map((linha, index) => ({ linha, index }))
    .filter(({ linha }) => matchesImportFilter(linha, importFilter));

  const importFilterChip = (filter: ImportFilter, count: number, label: string, tom: ChipTom = 'default') => {
    const ativo = importFilter === filter;
    return (
      <button
        type="button"
        onClick={() => setImportFilter(filter)}
        aria-pressed={ativo}
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          CHIP_TOM[tom],
          // Ativo: anel azul + marca de seleção + peso maior — não depende só da cor.
          ativo && 'font-semibold ring-2 ring-primary ring-offset-1 ring-offset-background',
        )}
      >
        {ativo && <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
        <span className="font-semibold tabular-nums">{count}</span> {label}
      </button>
    );
  };

  const rateioValorTotal = linhas[rateioDialog.linhaIndex]?.valor || 0;
  const rateioLinhaTipo = linhas[rateioDialog.linhaIndex]?.tipo;
  // Pergunta do CMV no rateio: despesa, banco com o recurso e classificação ativa (ou já respondida).
  const rateioMostraCmv = cmvRecurso && rateioLinhaTipo === 'DESPESA'
    && (cmvConfig?.classificacaoAtiva === true || rateioLinhas.some(r => (r.cmv_incluir ?? null) !== null));
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
    setLinhas(prev => prev.map((l, j) => (j === i ? trocarCategoriaDaLinha(l, categoriaId, cmvPadroes) : l)));

  const getOriginBadge = (origin?: MatchSuggestion['origin']) => {
    if (!origin) return null;
    const o = MATCH_ORIGEM[origin];
    return (
      <span className={cn('inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-tight', o.className)}>
        {o.label}
      </span>
    );
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
      const nOrigem = isOutgoing ? nomeOrigem : nomeDestino;
      const nDestino = isOutgoing ? nomeDestino : nomeOrigem;

      const result = await createTransferForExtratoLine(linha, transferContaDestino);

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


  // ─── Apresentação (Redesign V2, Fase 04B) ───
  // Tabela ⇄ lista com uma só marcação (ver `useConteinerEstreito`). Os limites são a largura em que
  // as colunas cabem sem rolagem: extrato com 7 colunas e até 7 ações; lançamentos com 9 colunas.
  const [setExtratoConteiner, extratoEstreito] = useConteinerEstreito(1040);
  const [setLancamentosConteiner, lancamentosEstreito] = useConteinerEstreito(832);
  // Foco de volta ao botão que abriu cada diálogo (ver `useRetornoFoco`).
  const focoSugestoes = useRetornoFoco();
  const focoBaixa = useRetornoFoco();
  const focoBoleto = useRetornoFoco();
  const focoJaNoRazao = useRetornoFoco();
  const focoDuplicata = useRetornoFoco();
  const focoRateio = useRetornoFoco();
  const focoTransferencia = useRetornoFoco();
  const focoContaDiverge = useRetornoFoco(() => fileRef.current);
  const focoSubstituir = useRetornoFoco(() => fileRef.current);

  if (!canViewRbac) return null;

  const contaAtual = contas.find(c => c.id === contaSel);
  const dataBR = (iso: string) => formatDateBR(parseLocalDate(iso));

  /** Mesmos sinais que o render derivava linha a linha (precedência inalterada). */
  const estadoLinha = (linha: LinhaExtrato) => {
    const isDone = !!linha.matchId?.endsWith('-done');
    const isAutomatic = isAutomaticInvestmentLine(linha);
    const isInternal = !!linha.movimentacaoInterna;
    const estado: ExtratoLinhaEstado = {
      isDone,
      isInternal,
      isAutomaticPending: isAutomatic && !isInternal,
      isJaConciliada: !!linha.jaConciliada,
      isIgnorada: !!linha.ignorada,
      hasMatch: !!linha.matchId && !isDone,
      hasSuggestions: !linha.matchId && !!linha.suggestions && linha.suggestions.length > 0,
    };
    return { ...estado, isAutomatic, isInactive: estado.isJaConciliada || estado.isIgnorada || isAutomatic };
  };
  type EstadoLinha = ReturnType<typeof estadoLinha>;

  /** Linha sem tom próprio e desmarcada (não entra no Processar): texto secundário, sem opacidade. */
  const descricaoSecundaria = (linha: LinhaExtrato, e: EstadoLinha) =>
    extratoLinhaResolvida(e) || (!extratoLinhaFundo(e) && !linha.selecionada);

  const leadLinha = (linha: LinhaExtrato, i: number, e: EstadoLinha) => {
    if (e.isDone || e.isJaConciliada) return <CheckCircle aria-hidden="true" className="h-4 w-4 text-success" />;
    if (e.isInternal) return <ArrowRightLeft aria-hidden="true" className="h-4 w-4 text-info" />;
    if (e.isAutomaticPending) return <AlertTriangle aria-hidden="true" className="h-4 w-4 text-warning" />;
    if (e.isIgnorada) return <EyeOff aria-hidden="true" className="h-4 w-4 text-muted-foreground" />;
    if (e.hasMatch) return <CheckCircle aria-hidden="true" className="h-4 w-4 text-success" />;
    return (
      <Checkbox
        checked={linha.selecionada}
        onCheckedChange={(v) => setLinhas(prev => prev.map((l, j) => j === i ? { ...l, selecionada: !!v } : l))}
        aria-label={`Incluir no processamento: ${linha.descricao}`}
      />
    );
  };

  const notasLinha = (linha: LinhaExtrato, e: EstadoLinha) => (
    <>
      {e.hasMatch && (
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-success">
          <ArrowRight aria-hidden="true" className="h-3 w-3 shrink-0" />
          <span className="min-w-0 break-words">{linha.matchDescricao}</span>
          {linha.matchOrigin && getOriginBadge(linha.matchOrigin)}
        </span>
      )}
      {e.hasMatch && linha.matchJaNoRazao && (
        <span className="mt-1 flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Já está no Livro Razão — veio da baixa em Contas a Pagar/Receber.
            Ao processar, esta linha será <strong>vinculada</strong> a esse lançamento,
            sem criar outro.
          </span>
        </span>
      )}
      {e.isJaConciliada && (
        linha.transferReconhecida ? (
          <span className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
            <ArrowRightLeft aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              Transferência já lançada pelo extrato da outra conta em{' '}
              {dataBR(linha.transferReconhecida.data)} ({getContaNome(linha.transferReconhecida.conta_id)} → {getContaNome(linha.transferReconhecida.conta_destino_id)}).
              Não precisa lançar de novo.
            </span>
          </span>
        ) : (
          <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> Já conciliada anteriormente
          </span>
        )
      )}
      {!e.isInactive && linha.transferAlertas && linha.transferAlertas.length > 0 && (
        <span className="mt-1 flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Confira antes de conciliar: já existe transferência de mesmo valor
            {linha.transferAlertas.map(t => (
              <span key={t.id} className="block">
                • {dataBR(t.data)} — {getContaNome(t.conta_id)} → {getContaNome(t.conta_destino_id)}
                {t.direcaoInvertida ? ' (direção invertida)' : ''}
              </span>
            ))}
          </span>
        </span>
      )}
      {e.isIgnorada && (
        e.isInternal ? (
          <span className="mt-1 flex items-start gap-1.5 text-xs text-info">
            <ArrowRightLeft aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>Movimento interno ContaMax — registrado sem efeito financeiro</span>
          </span>
        ) : (
          <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <EyeOff aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> Marcada como ignorada
          </span>
        )
      )}
      {e.isAutomaticPending && (
        <span className="mt-1 flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>Bloqueada para tratamento interno — nenhum lançamento financeiro será criado</span>
        </span>
      )}
      {e.hasSuggestions && !e.isInactive && (
        <span className="mt-1 flex items-center gap-1.5 text-xs text-warning">
          <Search aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> {linha.suggestions!.length} sugestão(ões) disponível(is)
        </span>
      )}
    </>
  );

  const categoriaLinha = (linha: LinhaExtrato, i: number, e: EstadoLinha) => (
    !e.isAutomatic && !e.hasMatch && !e.isDone && !e.isInactive && !(linha.rateioLinhas && linha.rateioLinhas.length > 1) ? (
      <div className="mt-2 w-full max-w-[16rem]">
        <CategoryCombobox
          value={linha.categoriaId || ''}
          onValueChange={(v) => setLinhaCategoria(i, v)}
          options={categoriasForTipo(linha.tipo)}
          placeholder="Categoria obrigatória..."
          className="h-8 text-xs"
          modal={false}
        />
      </div>
    ) : null
  );

  /** Pergunta do CMV e competência da linha que vira despesa nova (com o recurso no banco). */
  const cmvLinha = (linha: LinhaExtrato, i: number, e: EstadoLinha) => {
    if (!cmvRecurso || e.isAutomatic || e.hasMatch || e.isDone || e.isInactive || linha.tipo !== 'DESPESA') return null;
    const multi = linha.rateioLinhas && linha.rateioLinhas.length > 1 ? linha.rateioLinhas : null;
    const respondida = decisaoDaLinhaExtrato(linha) !== null || (linha.rateioLinhas ?? []).some(r => (r.cmv_incluir ?? null) !== null);
    return (
      <ConciliacaoLinhaCmv
        mostrarCmv={cmvConfig?.classificacaoAtiva === true || respondida}
        decisao={decisaoDaLinhaExtrato(linha)}
        aviso={linha.cmvAviso}
        onDecisao={incluir => setLinhas(prev => prev.map((l, j) => (j === i ? definirDecisaoDaLinha(l, incluir) : l)))}
        rateio={multi ? resumoCmvRateio(multi) : null}
        onAbrirRateio={() => openRateio(i)}
        permiteCompetencia
        dataBanco={linha.data}
        competencia={linha.competencia}
        onCompetencia={competencia => setLinhas(prev => prev.map((l, j) => (j === i ? { ...l, competencia } : l)))}
        rotulo={linha.descricao}
      />
    );
  };

  const valorLinha = (linha: LinhaExtrato, e: EstadoLinha) => (
    <>
      <span className={cn(
        'whitespace-nowrap font-semibold tabular-nums',
        e.isAutomatic ? 'text-muted-foreground' : linha.tipo === 'RECEITA' ? 'text-success' : 'text-destructive',
      )}>
        {linha.tipo === 'RECEITA' ? '+' : '-'} {fmt(linha.valor)}
      </span>
      {e.isAutomatic && <span className="block text-[11px] font-normal text-muted-foreground">efeito no saldo: R$ 0,00</span>}
    </>
  );

  const acoesLinha = (linha: LinhaExtrato, i: number, e: EstadoLinha) => {
    if (e.isInternal) return null;
    if (e.isAutomaticPending) {
      return (
        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={processando} onClick={processAutomaticInvestmentLines}>
          {processando
            ? <Loader2 aria-hidden="true" className="mr-1 h-3.5 w-3.5 animate-spin" />
            : <RefreshCw aria-hidden="true" className="mr-1 h-3.5 w-3.5" />}
          {processando ? 'Tratando...' : 'Tentar novamente'}
        </Button>
      );
    }
    if (e.isIgnorada) {
      return (
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          title="Voltar esta entrada para análise"
          disabled={!linha.ignoradaId || reconsiderandoId !== null}
          onClick={() => reconsiderarLinha(i)}
        >
          <RotateCcw aria-hidden="true" className="mr-1 h-3.5 w-3.5" />
          {reconsiderandoId === linha.ignoradaId ? 'Reconsiderando...' : 'Reconsiderar'}
        </Button>
      );
    }
    if (e.isJaConciliada) return null;
    return (
      <div className="flex flex-wrap gap-1.5">
        {!e.isDone && linha.suggestions && linha.suggestions.length > 0 && (
          <Button size="sm" variant={e.hasMatch ? 'default' : 'outline'} className="h-8 text-xs"
            onClick={() => setSuggestionsDialog({ open: true, linhaIndex: i })}>
            <Search aria-hidden="true" className="mr-1 h-3.5 w-3.5" />
            {e.hasMatch ? 'Alterar' : sugestoesLabel(linha.suggestions.length)}
          </Button>
        )}
        {e.hasMatch && (
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => clearMatch(i)}
            title="Remover vínculo" aria-label={`Remover vínculo com ${linha.matchDescricao || linha.descricao}`}>
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        )}
        {e.hasMatch && (linha.matchOrigin === 'conta_pagar' || linha.matchOrigin === 'conta_receber') && (
          <Button size="sm" variant="outline" className="h-8 text-xs"
            onClick={() => abrirRevisaoBaixa([i], 'individual')}>
            <CreditCard aria-hidden="true" className="mr-1 h-3.5 w-3.5" /> Baixar
          </Button>
        )}
        {!e.hasMatch && !e.isDone && linha.tipo === 'DESPESA' && (
          <Button size="sm" variant="outline" className="h-8 text-xs"
            title="Vincular esta saída a um boleto em aberto e dar baixa nele"
            onClick={() => abrirBoletoDialog(i)}>
            <Receipt aria-hidden="true" className="mr-1 h-3.5 w-3.5" /> Boleto
          </Button>
        )}
        {!e.hasMatch && !e.isDone && (
          <>
            <Button size="sm" variant={linha.rateioLinhas && linha.rateioLinhas.length > 1 ? 'default' : 'outline'} className="h-8 text-xs" onClick={() => openRateio(i)}>
              <PieChart aria-hidden="true" className="mr-1 h-3.5 w-3.5" />
              {linha.rateioLinhas && linha.rateioLinhas.length > 1 ? `${linha.rateioLinhas.length} cat.` : 'Ratear'}
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" title="Marcar como transferência entre contas"
              onClick={() => { setTransferDialog({ open: true, linhaIndex: i }); setTransferContaDestino(''); }}>
              <ArrowRightLeft aria-hidden="true" className="mr-1 h-3.5 w-3.5" /> Transf.
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setCriarDialog({ open: true, linhaIndex: i })}>
              <FileText aria-hidden="true" className="mr-1 h-3.5 w-3.5" /> Criar
            </Button>
          </>
        )}
        {!e.isDone && (
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            title="Ignorar esta entrada — não criará lançamento" aria-label={`Ignorar esta entrada: ${linha.descricao}`}
            onClick={() => ignorarLinha(i)}>
            <EyeOff aria-hidden="true" className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  };

  const categoriaLancamento = (item: LancamentoConciliacao) => {
    const categoriaNome = categorias.find(c => c.id === item.categoria_id)?.nome;
    const rateioCategoryIds = lancamentoRateioCategoryIds[item.id] || [];
    const rateioCategoryNames = rateioCategoryIds
      .map(categoryId => categorias.find(c => c.id === categoryId)?.nome)
      .filter((name): name is string => Boolean(name));
    const categoryLabel = categoriaNome
      || (rateioCategoryIds.length > 1
        ? `${rateioCategoryIds.length} categorias`
        : rateioCategoryNames[0]);
    if (categoryLabel) {
      return (
        <span className="text-xs text-foreground" title={rateioCategoryNames.join(' • ') || categoriaNome}>
          {categoryLabel}
        </span>
      );
    }
    // Transferência não exige categoria (mesma isenção de findLancamentosSemCategoria)
    if (item.tipo === 'TRANSFERENCIA') return <span className="text-xs text-muted-foreground">—</span>;
    return (
      <span className="inline-flex items-center gap-1 text-xs text-warning">
        <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" /> Sem categoria
      </span>
    );
  };

  const valorLancamento = (item: LancamentoConciliacao) => (
    <span className={cn('whitespace-nowrap font-semibold tabular-nums', item.tipo === 'RECEITA' ? 'text-success' : 'text-destructive')}>
      {item.tipo === 'RECEITA' ? '+' : '-'} {fmt(item.valor)}
    </span>
  );

  const selecionarLancamento = (item: LancamentoConciliacao) => (
    <Checkbox
      checked={selectedLancamentoIds.has(item.id)}
      onCheckedChange={(v) => setSelectedLancamentoIds(prev => {
        const next = new Set(prev);
        if (v) next.add(item.id); else next.delete(item.id);
        return next;
      })}
      aria-label={`Selecionar ${item.descricao}`}
    />
  );

  const conciliadoLancamento = (item: LancamentoConciliacao) => (
    <Checkbox
      checked={!!item.conciliado}
      onCheckedChange={(v) => conciliar(item.id, !!v)}
      aria-label={item.conciliado ? `Desconciliar ${item.descricao}` : `Conciliar ${item.descricao}`}
    />
  );

  const acoesLancamento = (item: LancamentoConciliacao) => (
    <div className="flex items-center justify-end gap-1">
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditLancamento(item)} disabled={editSaving}
        title="Editar" aria-label={`Editar lançamento ${item.descricao}`}>
        <Edit aria-hidden="true" className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => deleteLancamentoConciliacao(item)} disabled={editSaving}
        title="Excluir" aria-label={`Excluir lançamento ${item.descricao}`}>
        <Trash2 aria-hidden="true" className="h-4 w-4" />
      </Button>
    </div>
  );

  const contagemValores = contagemStatus === 'ready'
    ? [totalPendentesConta.toLocaleString('pt-BR'), totalConciliadosConta.toLocaleString('pt-BR')]
    : [];

  return (
    <div className="space-y-6">
      <FinScreenHeader
        title="Conciliação Bancária"
        description="Importe extratos e concilie com lançamentos, contas a pagar e a receber."
        actions={(
          <div className="flex w-full flex-wrap items-end gap-3 sm:w-auto">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-none">
              <Label htmlFor="conciliacao-conta" className="text-xs text-muted-foreground">Conta bancária</Label>
              <Select value={contaSel} onValueChange={setContaSel}>
                <SelectTrigger id="conciliacao-conta" className="h-9 w-full sm:w-64"><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                <SelectContent>{contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <SegmentedControl
              ariaLabel="Visão da conciliação"
              manualActivation
              options={CONCILIACAO_VISOES}
              value={view}
              onChange={v => setView(v as 'importar' | 'conciliar')}
              className="w-full sm:w-auto"
            />
          </div>
        )}
      />

      {contas.length === 0 && contasStatus === 'loading' ? (
        <div role="status" className="space-y-3 rounded-summary border bg-card p-5 shadow-card">
          <span className="sr-only">Carregando contas bancárias…</span>
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </div>
      ) : contas.length === 0 && contasStatus === 'error' ? (
        <ErrorState
          title="Não foi possível carregar as contas bancárias"
          onRetry={() => { setContasStatus('loading'); setContasTentativa(n => n + 1); }}
        />
      ) : contas.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="Nenhuma conta bancária ativa"
          description="Cadastre ou reative uma conta em Contas Bancárias para importar extratos e conciliar."
        />
      ) : (
        <>
          {/* ========== IMPORT VIEW ========== */}
          {view === 'importar' && (
            <div className="space-y-6">
              <section aria-labelledby="conciliacao-arquivo-titulo" aria-busy={loading} className="rounded-summary border bg-card p-4 shadow-card sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-ink">
                      <FileUp className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 id="conciliacao-arquivo-titulo" className="text-sm font-semibold text-foreground">Arquivo do extrato</h3>
                      <p className="text-xs text-muted-foreground">
                        CSV, OFX, QFX ou OFC{contaAtual ? <> — as linhas entram em <span className="font-medium text-foreground">{contaAtual.nome}</span></> : null}
                      </p>
                    </div>
                  </div>
                  {linhas.length > 0 && (
                    <Button variant="ghost" size="sm" className="h-9 text-destructive" onClick={limparExtrato}>
                      <X aria-hidden="true" className="mr-1 h-4 w-4" /> Limpar Extrato
                    </Button>
                  )}
                </div>
                <label className={cn('mt-4 flex flex-wrap items-center gap-x-3 gap-y-2', loading && 'pointer-events-none')}>
                  {/* sr-only (e não `hidden`): o campo continua alcançável pelo teclado. */}
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.ofx,.qfx,.ofc,.txt"
                    onChange={handleFile}
                    disabled={loading}
                    className="peer sr-only"
                  />
                  <span className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium text-primary-ink transition-colors hover:bg-accent hover:text-accent-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
                    {loading
                      ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                      : <Upload aria-hidden="true" className="h-4 w-4" />}
                    Escolher arquivo
                  </span>
                  <span className="min-w-0 break-all text-sm text-muted-foreground">
                    {nomeArquivo || 'Nenhum arquivo selecionado'}
                  </span>
                </label>
                <FinNote className="mt-3">
                  O sistema cruza automaticamente com lançamentos, <strong>contas a pagar</strong> e <strong>contas a receber</strong> pendentes.
                  Use <EyeOff aria-hidden="true" className="inline h-3 w-3" /><span className="sr-only">o botão Ignorar</span> para ignorar entradas que não devem gerar lançamento.
                </FinNote>
              </section>

              {/* Conferência de saldo contra o banco: rede final contra linha engolida/
                  ignorada indevidamente. Fica fora do bloco `linhas.length > 0` de
                  propósito — o veredito importa justamente DEPOIS de tudo processado. */}
              {saldoExtrato && (
                conferenciaErro ? (
                  <ConferenciaSaldoErro
                    data={saldoExtrato.data}
                    onRetry={() => setConferenciaTentativa(n => n + 1)}
                    retrying={conferenciaAtualizando}
                  />
                ) : conferenciaSaldo && conferenciaBase?.saldo === saldoExtrato ? (
                  // Veredito de outro saldo de extrato (arquivo novo na mesma conta) nunca aparece ao
                  // lado do banco novo: até o recálculo, fica o "Conferindo…".
                  <ConferenciaSaldoPainel
                    saldoExtrato={saldoExtrato}
                    conferencia={conferenciaSaldo}
                    confere={Math.abs(conferenciaSaldo.diferenca) < 0.01}
                    diaDivergencia={diaDivergencia}
                    atualizando={conferenciaAtualizando || conferenciaBase.linhas !== linhas}
                  />
                ) : (
                  <ConferenciaSaldoCarregando data={saldoExtrato.data} />
                )
              )}

              {linhasAntigasAusentes.length > 0 && (
                <AvisoConciliacao
                  tom="warning"
                  icon={AlertTriangle}
                  titulo={`${linhasAntigasAusentes.length} lançamento(ões) de um extrato anterior não existem no arquivo atual`}
                  acao={(
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const dates = linhasAntigasAusentes.map(row => row.data_pagamento || row.data_competencia).sort();
                        setFiltroDataDe(dates[0]);
                        setFiltroDataAte(dates[dates.length - 1]);
                        setFiltro('conciliados');
                        setView('conciliar');
                      }}
                    >
                      Revisar lançamentos antigos
                    </Button>
                  )}
                >
                  <p>
                    O banco alterou o conteúdo do extrato entre downloads. Esses lançamentos continuam afetando o saldo
                    e precisam ser revisados — o FITID sozinho não detecta esta mudança.
                  </p>
                  <ul className="space-y-1 text-xs">
                    {linhasAntigasAusentes.slice(0, 3).map(row => (
                      <li key={row.id} className="flex flex-wrap gap-x-1.5">
                        <span className="tabular-nums">{dataBR(row.data_pagamento || row.data_competencia)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="min-w-0 break-words">{row.descricao || 'Sem descrição'}</span>
                        <span aria-hidden="true">·</span>
                        <span className="whitespace-nowrap font-medium tabular-nums text-foreground">{fmtBRL(Number(row.valor))}</span>
                      </li>
                    ))}
                    {linhasAntigasAusentes.length > 3 && <li>+ {linhasAntigasAusentes.length - 3} outro(s)</li>}
                  </ul>
                </AvisoConciliacao>
              )}

              {automaticInvestmentLines.length > 0 && (
                <AvisoConciliacao
                  tom="info"
                  icon={ArrowRightLeft}
                  titulo={`${automaticInvestmentLines.length} movimentação(ões) ContaMax aguardando tratamento`}
                  acao={(
                    <Button size="sm" variant="outline" onClick={processAutomaticInvestmentLines} disabled={processando}>
                      {processando
                        ? <Loader2 aria-hidden="true" className="mr-1 h-3.5 w-3.5 animate-spin" />
                        : <RefreshCw aria-hidden="true" className="mr-1 h-3.5 w-3.5" />}
                      {processando ? 'Tratando...' : 'Tentar novamente'}
                    </Button>
                  )}
                >
                  <p className="text-xs">
                    Aplicações e resgates são movimentos internos do saldo Santander consolidado. O sistema os registra sem efeito financeiro e sem criar uma conta técnica.
                  </p>
                </AvisoConciliacao>
              )}

              {linhas.length > 0 && (
                <FinSectionGroup id="conciliacao-linhas" title="Linhas do extrato" caption={extratoLinhasCaption(linhasFiltradas.length, linhas.length)}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div role="group" aria-label="Filtrar linhas do extrato" className="flex flex-wrap gap-1.5">
                      {importFilterChip('conciliar', matchedTotal, 'p/ conciliar', 'success')}
                      {withSuggestions > 0 && importFilterChip('sugestoes', withSuggestions, 'com sugestões', 'warning')}
                      {importFilterChip('criar', selecionadas.length, 'p/ criar')}
                      {jaConciliadas > 0 && importFilterChip('conciliados', jaConciliadas, 'já conciliada(s)', 'neutral')}
                      {movimentacoesInternas > 0 && importFilterChip('internos', movimentacoesInternas, 'mov. interna(s)', 'info')}
                      {ignoradas > 0 && importFilterChip('ignorados', ignoradas, 'ignorada(s)', 'neutral')}
                      {importFilterChip('todos', linhas.length, 'total')}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => toggleAll(true)}>Selecionar Novas</Button>
                      <Button variant="outline" size="sm" onClick={() => toggleAll(false)}>Desmarcar</Button>
                      {/* Arrow function obrigatória: onClick={importarEConciliar} passaria o
                          evento como `jaConfirmouVinculos` e pularia a confirmação. */}
                      <Button size="sm" onClick={() => importarEConciliar()} disabled={importando} aria-busy={importando}>
                        {importando
                          ? <Loader2 aria-hidden="true" className="mr-1 h-4 w-4 animate-spin" />
                          : <Save aria-hidden="true" className="mr-1 h-4 w-4" />}
                        Processar
                      </Button>
                    </div>
                  </div>

                  <div ref={setExtratoConteiner}>
                    {linhasFiltradas.length === 0 ? (
                      <EmptyState
                        compact
                        icon={Search}
                        title="Nenhuma linha neste filtro."
                        actionLabel="Ver todas as linhas"
                        onAction={() => setImportFilter('todos')}
                      />
                    ) : extratoEstreito ? (
                      <ul className="space-y-2" aria-label="Linhas do extrato">
                        {linhasFiltradas.map(({ linha, index: i }) => {
                          const e = estadoLinha(linha);
                          const tipo = extratoTipoBadge(linha.tipo, e.isAutomatic);
                          const status = extratoLinhaStatus(e, linha.selecionada);
                          const acoes = acoesLinha(linha, i, e);
                          return (
                            <li key={i} className={cn('rounded-lg border p-3', extratoLinhaFundo(e) || 'bg-card')}>
                              <div className="flex items-start gap-3">
                                <div className="flex h-5 shrink-0 items-center">{leadLinha(linha, i, e)}</div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-3">
                                    <p className={cn('min-w-0 break-words text-sm font-medium', descricaoSecundaria(linha, e) ? 'text-muted-foreground' : 'text-foreground')}>
                                      {linha.descricao}
                                    </p>
                                    <div className="shrink-0 text-right text-sm">{valorLinha(linha, e)}</div>
                                  </div>
                                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                    <span className="tabular-nums">{dataBR(linha.data)}</span>
                                    <StatusBadge status={tipo.status} label={tipo.label} />
                                    <StatusBadge status={status.status} label={status.label} />
                                  </div>
                                  {notasLinha(linha, e)}
                                  {categoriaLinha(linha, i, e)}
                                  {cmvLinha(linha, i, e)}
                                  {acoes && <div className="mt-2">{acoes}</div>}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10"><span aria-hidden="true">✓</span><span className="sr-only">Seleção</span></TableHead>
                            <TableHead className="w-28">Data</TableHead>
                            <TableHead>Descrição (extrato)</TableHead>
                            <TableHead className="w-24">Tipo</TableHead>
                            <TableHead className="w-40 text-right">Valor</TableHead>
                            <TableHead className="w-40">Status</TableHead>
                            <TableHead className="min-w-[17rem] text-right">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {linhasFiltradas.map(({ linha, index: i }) => {
                            const e = estadoLinha(linha);
                            const tipo = extratoTipoBadge(linha.tipo, e.isAutomatic);
                            const status = extratoLinhaStatus(e, linha.selecionada);
                            return (
                              <TableRow key={i} className={extratoLinhaFundo(e)}>
                                <TableCell>{leadLinha(linha, i, e)}</TableCell>
                                <TableCell className="whitespace-nowrap text-sm tabular-nums">{dataBR(linha.data)}</TableCell>
                                <TableCell className="min-w-[16rem] max-w-md">
                                  <p className={cn('whitespace-normal break-words font-medium', descricaoSecundaria(linha, e) ? 'text-muted-foreground' : 'text-foreground')}>
                                    {linha.descricao}
                                  </p>
                                  {notasLinha(linha, e)}
                                  {categoriaLinha(linha, i, e)}
                                  {cmvLinha(linha, i, e)}
                                </TableCell>
                                <TableCell><StatusBadge status={tipo.status} label={tipo.label} /></TableCell>
                                <TableCell className="text-right">{valorLinha(linha, e)}</TableCell>
                                <TableCell><StatusBadge status={status.status} label={status.label} /></TableCell>
                                <TableCell className="min-w-[17rem]"><div className="flex justify-end [&>div]:justify-end">{acoesLinha(linha, i, e)}</div></TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </FinSectionGroup>
              )}

              {linhas.length === 0 && (
                <EmptyState
                  icon={Upload}
                  title="Selecione um arquivo CSV, OFX, QFX ou OFC para importar"
                  description="CSV: data;descrição;valor (separado por ; ou ,). OFX/QFX/OFC: formatos bancários suportados."
                />
              )}
            </div>
          )}

          {/* ========== CONCILIATION VIEW ========== */}
          {view === 'conciliar' && (
            <div className="space-y-6">
              {contaSel && (
                <FinSectionGroup
                  id="conciliacao-situacao"
                  title="Situação da conta"
                  caption={`${contaAtual?.nome ?? 'Conta selecionada'} · lançamentos realizados de todo o período`}
                >
                  {contagemStatus === 'error' ? (
                    <ErrorState compact title="Não foi possível carregar a contagem da conta" onRetry={loadLancamentosCounts} />
                  ) : contagemStatus === 'loading' ? (
                    <div role="status">
                      <span className="sr-only">Carregando a contagem da conta…</span>
                      <FinKpiGrid className={kpiGridClassFor(12, 2)}>
                        {[0, 1].map(k => (
                          <div key={k} aria-hidden="true" className="space-y-3 rounded-summary border bg-card p-5">
                            <Skeleton className="h-3 w-32" />
                            <Skeleton className="h-7 w-16" />
                            <Skeleton className="h-3 w-48" />
                          </div>
                        ))}
                      </FinKpiGrid>
                    </div>
                  ) : (
                    <FinKpiGrid className={kpiGridClassFor(longestValueLength(contagemValores), 2)}>
                      <KpiCard
                        appearance="summary"
                        icon={Clock}
                        label="Pendentes de conciliação"
                        value={contagemValores[0]}
                        sub="Realizados na conta e ainda não conciliados"
                        variant={totalPendentesConta > 0 ? 'warning' : 'default'}
                      />
                      <KpiCard
                        appearance="summary"
                        icon={CheckCircle2}
                        label="Conciliados"
                        value={contagemValores[1]}
                        sub="Realizados na conta e já conciliados"
                        variant="success"
                      />
                    </FinKpiGrid>
                  )}
                </FinSectionGroup>
              )}

              <div className="space-y-3 rounded-summary border bg-card p-4 shadow-card">
                <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="conciliacao-data-de" className="text-xs text-muted-foreground">De</Label>
                    <DateInput
                      id="conciliacao-data-de"
                      value={filtroDataDe}
                      max={filtroDataAte || undefined}
                      onValueChange={setFiltroDataDe}
                      className="h-9 w-full text-xs sm:w-36"
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="conciliacao-data-ate" className="text-xs text-muted-foreground">Até</Label>
                    <DateInput
                      id="conciliacao-data-ate"
                      value={filtroDataAte}
                      min={filtroDataDe || undefined}
                      onValueChange={setFiltroDataAte}
                      className="h-9 w-full text-xs sm:w-36"
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="conciliacao-situacao-filtro" className="text-xs text-muted-foreground">Situação</Label>
                    <Select value={filtro} onValueChange={v => setFiltro(v as 'pendentes' | 'conciliados' | 'todos')}>
                      <SelectTrigger id="conciliacao-situacao-filtro" className="h-9 w-full sm:w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendentes">Pendentes</SelectItem>
                        <SelectItem value="conciliados">Conciliados</SelectItem>
                        <SelectItem value="todos">Todos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" size="sm" className="h-9 self-end" onClick={loadLancamentos} aria-busy={loading}>
                    <RefreshCw aria-hidden="true" className={cn('mr-1 h-4 w-4', loading && 'animate-spin')} /> Atualizar
                  </Button>
                </div>
                <div className="border-t pt-3">
                  <DateRangePresets
                    from={filtroDataDe}
                    to={filtroDataAte}
                    onChange={(de, ate) => { setFiltroDataDe(de); setFiltroDataAte(ate); }}
                  />
                </div>
              </div>

              <FinSectionGroup
                id="conciliacao-lancamentos"
                title="Lançamentos da conta"
                caption={!loading && !lancamentosErro && lancamentos.length > 0
                  ? `${lancamentosFiltrados.length} ${lancamentosFiltrados.length === 1 ? 'lançamento' : 'lançamentos'} no período`
                  : undefined}
              >
                {(filtro === 'pendentes' && pendentes > 0) || lancamentosFiltrados.length > 0 || selectedLancamentoIds.size > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {filtro === 'pendentes' && pendentes > 0 && (
                      <Button size="sm" onClick={conciliarTodos}>
                        <CheckCircle aria-hidden="true" className="mr-1 h-4 w-4" /> Conciliar Todos ({pendentes})
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
                        <Trash2 aria-hidden="true" className="mr-1 h-4 w-4" /> Excluir Selecionados ({selectedLancamentoIds.size})
                      </Button>
                    )}
                  </div>
                ) : null}

                <div ref={setLancamentosConteiner}>
                  {!contaSel ? (
                    <EmptyState icon={Landmark} title="Selecione uma conta bancária" description="Escolha a conta no seletor acima." />
                  ) : loading ? (
                    <div role="status" className="space-y-2">
                      <span className="sr-only">Carregando lançamentos…</span>
                      {Array.from({ length: 5 }).map((_, k) => (
                        <div key={k} className="flex items-center gap-4 rounded-lg border bg-card p-3">
                          <Skeleton className="h-4 w-4" />
                          <Skeleton className="h-4 w-20" />
                          <Skeleton className="h-4 flex-1" />
                          <Skeleton className="h-4 w-24" />
                        </div>
                      ))}
                    </div>
                  ) : lancamentosErro ? (
                    <ErrorState title="Não foi possível carregar os lançamentos" onRetry={loadLancamentos} />
                  ) : lancamentosFiltrados.length === 0 ? (
                    // Também quando a última pendente é conciliada pelo checkbox com "Pendentes" ativo:
                    // antes ficava só o cabeçalho da tabela, sem mensagem.
                    <EmptyState icon={Receipt} title="Nenhum lançamento encontrado" description="Ajuste o período ou a situação." />
                  ) : lancamentosEstreito ? (
                    <ul className="space-y-2" aria-label="Lançamentos da conta">
                      {lancamentosFiltrados.map(item => {
                        const tipo = ledgerTipoBadge(item.tipo);
                        const situacao = lancamentoConciliacaoBadge(item.conciliado);
                        return (
                          <li key={item.id} className="rounded-lg border bg-card p-3">
                            <div className="flex items-start gap-3">
                              <div className="flex h-5 shrink-0 items-center">{selecionarLancamento(item)}</div>
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <div className="flex items-start justify-between gap-3">
                                  <p className="min-w-0 break-words text-sm font-medium text-foreground">{item.descricao}</p>
                                  <div className="shrink-0 text-right text-sm">{valorLancamento(item)}</div>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                  <span className="tabular-nums">{dataBR(item.data_competencia)}</span>
                                  <StatusBadge status={tipo.status} label={tipo.label} />
                                  <StatusBadge status={situacao.status} label={situacao.label} />
                                </div>
                                <div>{categoriaLancamento(item)}</div>
                                <div className="flex items-center justify-between gap-2 border-t pt-2">
                                  <div className="flex items-center gap-2 text-sm text-foreground">
                                    {conciliadoLancamento(item)}
                                    <span aria-hidden="true">Conciliado</span>
                                  </div>
                                  {acoesLancamento(item)}
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"><span className="sr-only">Selecionar</span></TableHead>
                          <TableHead className="w-24">Conciliado</TableHead>
                          <TableHead className="w-28">Data</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Categoria</TableHead>
                          <TableHead className="w-32">Tipo</TableHead>
                          <TableHead className="w-40 text-right">Valor</TableHead>
                          <TableHead className="w-28">Status</TableHead>
                          <TableHead className="w-24 text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lancamentosFiltrados.map(item => {
                          const tipo = ledgerTipoBadge(item.tipo);
                          const situacao = lancamentoConciliacaoBadge(item.conciliado);
                          return (
                            <TableRow key={item.id}>
                              <TableCell>{selecionarLancamento(item)}</TableCell>
                              <TableCell>{conciliadoLancamento(item)}</TableCell>
                              <TableCell className="whitespace-nowrap text-sm tabular-nums">{dataBR(item.data_competencia)}</TableCell>
                              <TableCell className="max-w-xs whitespace-normal break-words font-medium">{item.descricao}</TableCell>
                              <TableCell>{categoriaLancamento(item)}</TableCell>
                              <TableCell><StatusBadge status={tipo.status} label={tipo.label} /></TableCell>
                              <TableCell className="text-right">{valorLancamento(item)}</TableCell>
                              <TableCell><StatusBadge status={situacao.status} label={situacao.label} /></TableCell>
                              <TableCell>{acoesLancamento(item)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </FinSectionGroup>
            </div>
          )}
        </>
      )}

      {/* ========== SUGGESTIONS DIALOG ========== */}
      <Dialog open={suggestionsDialog.open} onOpenChange={(open) => !open && setSuggestionsDialog({ open: false, linhaIndex: -1 })}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" {...focoSugestoes}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search aria-hidden="true" className="h-5 w-5 text-primary" /> Sugestões de Conciliação
            </DialogTitle>
          </DialogHeader>

          {suggestionsDialog.linhaIndex >= 0 && linhas[suggestionsDialog.linhaIndex] && (() => {
            const linha = linhas[suggestionsDialog.linhaIndex];
            const suggestions = linha.suggestions || [];
            return (
              <div className="space-y-4">
                <ExtratoLinhaResumo descricao={linha.descricao} data={linha.data} valor={linha.valor} tipo={linha.tipo} />

                <ul className="space-y-2" aria-label="Sugestões">
                  {suggestions.length === 0 ? (
                    <li className="py-4 text-center text-sm text-muted-foreground">Nenhuma sugestão encontrada</li>
                  ) : suggestions.map((s, idx) => {
                    const escolhida = linha.matchId === s.id;
                    return (
                      <li key={`${s.origin}-${s.id}`}>
                        {/* Botão (e não card clicável): a escolha também funciona pelo teclado. */}
                        <button
                          type="button"
                          aria-pressed={escolhida}
                          onClick={() => selectSuggestion(suggestionsDialog.linhaIndex, s)}
                          className={cn(
                            'w-full rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary-border hover:bg-card-hover',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                            escolhida && 'border-primary bg-primary-soft hover:bg-primary-soft',
                          )}
                        >
                          <span className="flex items-start justify-between gap-3">
                            <span className="min-w-0 flex-1">
                              <span className="mb-1 flex flex-wrap items-center gap-1.5">
                                {getOriginBadge(s.origin)}
                                <StatusBadge status="neutral" label={`Score: ${s.score}`} />
                                {idx === 0 && (
                                  <span className="inline-flex items-center rounded-full border border-primary-border bg-primary-soft px-2 py-0.5 text-[11px] font-semibold leading-tight text-primary-ink">
                                    Melhor match
                                  </span>
                                )}
                              </span>
                              <span className="block break-words text-sm font-medium text-foreground">{s.descricao}</span>
                              <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                                <span className="tabular-nums">Data: {formatDateBR(parseLocalDate(s.data))}</span>
                                {s.extra && <span>• {s.extra}</span>}
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className={cn('block whitespace-nowrap text-sm font-semibold tabular-nums', linha.tipo === 'RECEITA' ? 'text-success' : 'text-destructive')}>{fmt(s.valor)}</span>
                              {escolhida && (
                                <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-success">
                                  <CheckCircle2 aria-hidden="true" className="h-4 w-4" /> Escolhida
                                </span>
                              )}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>

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
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" {...focoBaixa}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard aria-hidden="true" className="h-5 w-5 text-primary" />
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
                  <div key={i} className={cn('space-y-3 rounded-lg border bg-card p-3', diverge && 'border-warning-border')}>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-md bg-muted p-2.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Linha do extrato</p>
                          <p className="break-words text-sm font-medium text-foreground">{linha.descricao}</p>
                          <p className="text-xs tabular-nums text-muted-foreground">{formatDateBR(parseLocalDate(linha.data))}</p>
                          <p className="mt-1 whitespace-nowrap text-base font-bold tabular-nums text-foreground">{fmt(linha.valor)}</p>
                        </div>
                        <div className="rounded-md bg-muted p-2.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {linha.matchOrigin === 'conta_pagar' ? 'Boleto' : 'Título a receber'}
                          </p>
                          <p className="break-words text-sm font-medium text-foreground">{linha.matchDescricao}</p>
                          <p className="mt-1 whitespace-nowrap text-base font-bold tabular-nums text-foreground">{fmt(valorTitulo)}</p>
                        </div>
                      </div>

                      {diverge ? (
                        <div className="space-y-2 rounded-md border border-warning-border bg-warning-soft p-2.5">
                          <p className="flex items-center gap-1.5 text-xs text-warning">
                            <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                            <span>
                              O banco {isRecebimento ? 'creditou' : 'debitou'} <strong className="tabular-nums">{fmt(Math.abs(diff))}</strong>
                              {diff > 0 ? ' a mais' : ' a menos'} que o título.
                            </span>
                          </p>

                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label htmlFor={`baixa-ajuste-tipo-${i}`} className="text-xs text-muted-foreground">Lançar a diferença como</Label>
                              <Select
                                value={ajuste.tipo}
                                onValueChange={v => setAjustesBaixa(prev => ({
                                  ...prev, [i]: { tipo: v as AjusteTipo, categoriaId: prev[i]?.categoriaId || '' },
                                }))}
                              >
                                <SelectTrigger id={`baixa-ajuste-tipo-${i}`} className="h-8 bg-card text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
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
                            <div className="space-y-1">
                              <span className="text-xs font-medium text-muted-foreground">Categoria da diferença</span>
                              <CategoryCombobox
                                value={ajuste.categoriaId}
                                onValueChange={v => setAjustesBaixa(prev => ({
                                  ...prev, [i]: { tipo: prev[i]?.tipo || '', categoriaId: v },
                                }))}
                                options={categoriasAjuste}
                                placeholder="Selecione"
                                className="h-8 bg-card text-xs"
                                modal={false}
                              />
                            </div>
                          </div>

                          <p className="text-xs text-muted-foreground">
                            O título entra no razão por {fmt(valorTitulo)} na categoria dele, e a diferença
                            vira um lançamento separado. A soma bate com o extrato.
                            {diff < 0 && ` O desconto ${isRecebimento ? 'concedido' : 'obtido'} fica em categoria não operacional: entra no saldo da conta, mas fora do resultado no DRE, do DFC e dos relatórios.`}
                          </p>
                        </div>
                      ) : (
                        <p className="flex items-center gap-1.5 text-xs text-success">
                          <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> Valores conferem.
                        </p>
                      )}

                      <div className="flex justify-end">
                        <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive"
                          onClick={() => {
                            clearMatch(i);
                            setBaixaDialog(prev => ({ ...prev, indices: prev.indices.filter(idx => idx !== i) }));
                          }}>
                          Não dar baixa nesta
                        </Button>
                      </div>
                  </div>
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
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" {...focoBoleto}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt aria-hidden="true" className="h-5 w-5 text-primary" /> Vincular a um boleto em aberto
            </DialogTitle>
          </DialogHeader>

          {boletoDialog.linhaIndex >= 0 && linhas[boletoDialog.linhaIndex] && (
            <div className="space-y-4">
              <ExtratoLinhaResumo
                descricao={linhas[boletoDialog.linhaIndex].descricao}
                data={linhas[boletoDialog.linhaIndex].data}
                valor={linhas[boletoDialog.linhaIndex].valor}
                tipo={linhas[boletoDialog.linhaIndex].tipo}
                valorClassName="text-destructive"
              />

              <div className="flex gap-2">
                <Input
                  value={boletoBusca}
                  onChange={e => setBoletoBusca(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') buscarBoletos(boletoBusca); }}
                  placeholder="Buscar por descrição ou fornecedor..."
                  aria-label="Buscar boleto por descrição ou fornecedor"
                  className="h-9"
                />
                <Button size="sm" variant="outline" className="h-9" onClick={() => buscarBoletos(boletoBusca)} disabled={boletoLoading} aria-label="Buscar boletos">
                  {boletoLoading
                    ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                    : <Search aria-hidden="true" className="h-4 w-4" />}
                </Button>
              </div>

              <ul className="space-y-2" aria-label="Boletos em aberto" aria-busy={boletoLoading}>
                {boletoLoading ? (
                  <li className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                    <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Buscando...
                  </li>
                ) : boletoOpcoes.length === 0 ? (
                  <li className="py-4 text-center text-sm text-muted-foreground">Nenhum boleto em aberto encontrado</li>
                ) : boletoOpcoes.map(b => {
                  const mesmoValor = Math.abs(Number(b.valor) - linhas[boletoDialog.linhaIndex].valor) < 0.01;
                  return (
                    <li key={b.id}>
                      {/* Botão (e não card clicável): a escolha também funciona pelo teclado. */}
                      <button
                        type="button"
                        onClick={() => selecionarBoleto(b)}
                        className={cn(
                          'flex w-full items-start justify-between gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary-border hover:bg-card-hover',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                          mesmoValor && 'border-success-border',
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="mb-1 flex flex-wrap items-center gap-1.5">
                            <StatusBadge status="neutral" label={b.status === 'AGUARDANDO_APROVACAO' ? 'Aguard. Aprovação' : b.status} />
                            {mesmoValor && <StatusBadge status="success" label="Mesmo valor" />}
                            {!b.tem_categoria && <StatusBadge status="warning" label="Sem categoria" />}
                          </span>
                          <span className="block break-words text-sm font-medium text-foreground">{b.descricao}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                            <span className="tabular-nums">Vence: {formatDateBR(parseLocalDate(b.data_vencimento))}</span>
                            {b.fornecedor && <span>• {b.fornecedor}</span>}
                          </span>
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-destructive">{fmt(Number(b.valor))}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <DialogFooter>
                <Button variant="outline" onClick={() => setBoletoDialog({ open: false, linhaIndex: -1 })}>Fechar</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ========== CONFIRMAÇÃO: BAIXA JÁ NO LIVRO RAZÃO ========== */}
      <AlertDialog open={jaNoRazaoDialog.open} onOpenChange={(open) => !open && setJaNoRazaoDialog({ open: false, indices: [] })}>
        <AlertDialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" {...focoJaNoRazao}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0 text-warning" />
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

            <div className="max-h-[40vh] space-y-2 overflow-y-auto">
              {jaNoRazaoDialog.indices.map(i => {
                const linha = linhas[i];
                if (!linha) return null;
                return (
                  <div key={i} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning-border bg-card p-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium text-foreground">{linha.descricao}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="tabular-nums">{formatDateBR(parseLocalDate(linha.data))}</span> • no razão como “{linha.matchDescricao}”
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={cn('whitespace-nowrap text-sm font-semibold tabular-nums', linha.tipo === 'RECEITA' ? 'text-success' : 'text-destructive')}>{fmt(linha.valor)}</span>
                        <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive"
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
                  </div>
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
        <AlertDialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" {...focoDuplicata}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0 text-warning" />
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

            <div className="max-h-[40vh] space-y-2 overflow-y-auto">
              {duplicataDialog.itens.map((item) => (
                <div key={`${item.linha.data}-${item.linha.valor}-${item.linha.descricao}-${item.linha.fitId ?? ''}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning-border bg-card p-3">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium text-foreground">{item.linha.descricao}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="tabular-nums">{formatDateBR(parseLocalDate(item.linha.data))}</span>
                        {item.criadoEm && ` • já conciliado em ${formatInBR(new Date(item.criadoEm), "dd/MM/yyyy 'às' HH:mm")}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <span className={cn('whitespace-nowrap text-sm font-semibold tabular-nums', item.linha.tipo === 'RECEITA' ? 'text-success' : 'text-destructive')}>{fmt(item.linha.valor)}</span>
                      <Button size="sm" variant="ghost" className="h-8 text-xs"
                        onClick={() => ignorarDuplicata(item)}>
                        Ignorar
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs"
                        onClick={() => forcarImportarDuplicata(item)}>
                        Importar mesmo assim
                      </Button>
                    </div>
                </div>
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
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" {...focoRateio}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PieChart aria-hidden="true" className="h-5 w-5 text-primary" /> Rateio por Categoria
            </DialogTitle>
          </DialogHeader>

          {rateioDialog.linhaIndex >= 0 && linhas[rateioDialog.linhaIndex] && (
            <div className="space-y-4">
              <ExtratoLinhaResumo
                descricao={linhas[rateioDialog.linhaIndex].descricao}
                data={linhas[rateioDialog.linhaIndex].data}
                valor={rateioValorTotal}
                tipo={linhas[rateioDialog.linhaIndex].tipo}
              />

              <ol className="space-y-2" aria-label="Linhas do rateio">
                {rateioLinhas.map((rl, idx) => (
                  <li key={idx} className="grid grid-cols-2 items-end gap-2 rounded-lg border bg-card p-2.5 sm:grid-cols-12">
                    <div className="col-span-2 space-y-1 sm:col-span-4">
                      <span className="text-xs font-medium text-muted-foreground">Categoria</span>
                      <CategoryCombobox
                        value={rl.categoria_id}
                        onValueChange={v => updateRateioLinha(idx, 'categoria_id', v)}
                        options={rateioLinhaTipo ? categoriasForTipo(rateioLinhaTipo) : categorias}
                        placeholder="Selecione"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="col-span-2 space-y-1 sm:col-span-2">
                      <Label htmlFor={`rateio-centro-${idx}`} className="text-xs text-muted-foreground">Centro de Custo</Label>
                      <Select value={rl.centro_custo_id} onValueChange={v => updateRateioLinha(idx, 'centro_custo_id', v)}>
                        <SelectTrigger id={`rateio-centro-${idx}`} className="h-8 text-xs"><SelectValue placeholder="Auto" /></SelectTrigger>
                        <SelectContent>{centrosCusto.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 sm:col-span-3">
                      <Label htmlFor={`rateio-valor-${idx}`} className="text-xs text-muted-foreground">Valor (R$)</Label>
                      <BRLInput id={`rateio-valor-${idx}`} className="h-8 text-xs" numericValue={rl.valor} onNumericChange={value => updateRateioLinha(idx, 'valor', value)} showPrefix />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor={`rateio-percentual-${idx}`} className="text-xs text-muted-foreground">%</Label>
                      <DecimalInput id={`rateio-percentual-${idx}`} className="h-8 text-xs" value={String(rl.percentual || '')} onValueChange={(_, parsed) => updateRateioLinha(idx, 'percentual', parsed ?? 0)} maxDecimals={2} suffix="%" />
                    </div>
                    <div className="col-span-2 flex justify-end sm:col-span-1 sm:justify-center">
                      {rateioLinhas.length > 1 && (
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeRateioLinha(idx)} aria-label={`Remover a linha ${idx + 1} do rateio`}>
                          <Trash2 aria-hidden="true" className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                    {rateioMostraCmv && (
                      <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-12">
                        <span className="text-xs text-muted-foreground">Aparecer no CMV financeiro?</span>
                        <CmvDecisaoToggle
                          size="sm" value={rl.cmv_incluir ?? null} onChange={v => setRateioCmv(idx, v)}
                          label={`Aparecer no CMV financeiro? — linha ${idx + 1} do rateio`}
                        />
                        {rl.cmv_aviso === 'redefinido' && <span className="text-xs text-warning">Categoria trocada: confira.</span>}
                      </div>
                    )}
                  </li>
                ))}
              </ol>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={addRateioLinha}><Plus aria-hidden="true" className="mr-1 h-3.5 w-3.5" /> Linha</Button>
                  <Button size="sm" variant="outline" onClick={ratearIgual}><Calculator aria-hidden="true" className="mr-1 h-3.5 w-3.5" /> Ratear Igual</Button>
                </div>
                <div className="text-right text-sm" role="status">
                  <span className="text-muted-foreground">Rateado: </span>
                  <span className={cn('font-bold tabular-nums', rateioValido ? 'text-success' : 'text-destructive')}>{fmt(rateioTotalAtual)}</span>
                  {!rateioValido && <span className="ml-2 text-xs tabular-nums text-destructive">(Diferença: {fmt(rateioDiff)})</span>}
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setRateioDialog({ open: false, linhaIndex: -1 })}>Cancelar</Button>
                <Button onClick={salvarRateio} disabled={!rateioValido}><CheckCircle aria-hidden="true" className="mr-1 h-4 w-4" /> Salvar Rateio</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>


      {/* ========== TRANSFER DIALOG ========== */}
      <Dialog open={transferDialog.open} onOpenChange={(open) => { if (!open) { setTransferDialog({ open: false, linhaIndex: -1 }); setTransferContaDestino(''); } }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" {...focoTransferencia}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft aria-hidden="true" className="h-5 w-5 text-primary" /> Marcar como Transferência
            </DialogTitle>
          </DialogHeader>
          {transferDialog.linhaIndex >= 0 && linhas[transferDialog.linhaIndex] && (() => {
            const linha = linhas[transferDialog.linhaIndex];
            const isOutgoing = linha.tipo === 'DESPESA';
            const nomeOutraConta = transferContaDestino ? getContaNome(transferContaDestino) : 'conta a selecionar';
            return (
              <div className="space-y-4">
                <ExtratoLinhaResumo
                  descricao={linha.descricao}
                  data={linha.data}
                  valor={linha.valor}
                  tipo={linha.tipo}
                  badge={isOutgoing ? { label: 'Saída', status: 'danger' } : { label: 'Entrada', status: 'success' }}
                />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="transferencia-esta-conta" className="text-xs text-muted-foreground">{isOutgoing ? 'Conta Origem (esta)' : 'Conta Destino (esta)'}</Label>
                    <Input id="transferencia-esta-conta" value={getContaNome(contaSel)} disabled className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="transferencia-outra-conta" className="text-xs">{isOutgoing ? 'Conta Destino' : 'Conta Origem'}</Label>
                    <Select value={transferContaDestino} onValueChange={setTransferContaDestino}>
                      <SelectTrigger id="transferencia-outra-conta" className="h-9"><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                      <SelectContent>
                        {contas.filter(c => c.id !== contaSel).map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {linha.transferAlertas && linha.transferAlertas.length > 0 && (
                  <div role="alert" className="rounded-lg border border-warning-border bg-warning-soft p-3 text-xs">
                    <p className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
                      <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 text-warning" /> Já existe transferência de mesmo valor
                    </p>
                    <ul className="space-y-0.5 text-muted-foreground">
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

                <div className="rounded-lg bg-muted p-3 text-sm">
                  <p className="mb-1 font-medium text-foreground">Ao confirmar:</p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {[
                      <>Um lançamento de transferência: saída em <strong className="text-foreground">{isOutgoing ? getContaNome(contaSel) : nomeOutraConta}</strong> e entrada em <strong className="text-foreground">{isOutgoing ? nomeOutraConta : getContaNome(contaSel)}</strong></>,
                      <>Tipo = TRANSFERÊNCIA (não afeta receitas/despesas)</>,
                      <>Linha do extrato será conciliada automaticamente</>,
                      <>Ao importar o extrato da outra conta, a linha correspondente é reconhecida sozinha — sem duplicar</>,
                    ].map((texto, k) => (
                      <li key={k} className="flex items-start gap-1.5">
                        <CheckCircle2 aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0 text-success" />
                        <span>{texto}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => { setTransferDialog({ open: false, linhaIndex: -1 }); setTransferContaDestino(''); }}>Cancelar</Button>
                  <Button onClick={criarTransferenciaFromOFX} disabled={processando || !transferContaDestino}>
                    {processando ? <Loader2 aria-hidden="true" className="mr-1 h-4 w-4 animate-spin" /> : <ArrowRightLeft aria-hidden="true" className="mr-1 h-4 w-4" />}
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
        ocorrencia={ocorrenciaDaLinhaCriar()}
        contaBancariaId={contaSel}
        onCreated={(result) => {
          const idx = criarDialog.linhaIndex;
          const linha = linhas[idx];
          if (linha && result.ocorrencia != null && draftKey && isScopeActive() && currentAccount.current === contaSel) {
            saveOcorrenciasLivres(draftKey, registrarOcorrenciaUsada(loadOcorrenciasLivres(draftKey), linha, result.ocorrencia));
          }
          setLinhas(prev => prev.filter((_, i) => i !== idx));
          setCriarDialog({ open: false, linhaIndex: -1 });
          loadLancamentos();
        }}
      />

      {/* ========== CONTA MISMATCH ALERT ========== */}
      {contaMismatch && (
        <AlertDialog open={contaMismatch.open}>
          <AlertDialogContent className="max-h-[90vh] overflow-y-auto" {...focoContaDiverge}>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0" />
                Conta do extrato diverge da selecionada
              </AlertDialogTitle>
            </AlertDialogHeader>

            <div className="space-y-3 text-sm">
              <div className="space-y-1 rounded-lg border border-destructive-border bg-destructive-soft p-3">
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
                  <div className="space-y-1 rounded-lg border bg-muted p-3">
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
          <AlertDialogContent className="max-h-[90vh] overflow-y-auto" {...focoSubstituir}>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-warning">
                <AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0" />
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
          linhasExtrato={confirmSaldoDialog.parsed}
          saldoSugerido={confirmSaldoDialog.saldoSugerido}
          saldoContaCorrenteArquivo={confirmSaldoDialog.saldoContaCorrenteArquivo}
          internalMovementCount={confirmSaldoDialog.parsed.filter(isAutomaticInvestmentLine).length}
          contaId={contaSel}
          focoAoFechar={() => fileRef.current}
          onCancel={() => setConfirmSaldoDialog(null)}
          onConfirmed={async (saldoConfirmado) => {
            const pending = confirmSaldoDialog.parsed;
            setConfirmSaldoDialog(null);
            // Guarda o saldo oficial do extrato: é a referência da conferência
            // pós-processamento (banner verde/vermelho acima da lista).
            setSaldoExtrato(saldoConfirmado);
            if (contaSel) {
              if (draftKey && isScopeActive()) saveSaldoExtrato(draftKey, saldoConfirmado);
              emitDataEvent('financeiro:conciliacao');
            }
            // Arquivo novo: as linhas iguais já gravadas voltam como reconhecidas,
            // então as ocorrências recomeçam por elas (ver `@/lib/conciliacaoOcorrencia`).
            if (draftKey && isScopeActive()) clearOcorrenciasLivres(draftKey);
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
