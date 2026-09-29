import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useEmitDataEvent } from '@/lib/dataEvents';
import type { Produto, MovimentacaoEstoque } from '@/types/salmon';
import type { ProdutoExtended, MovimentacaoExtended } from '@/types/estoque';
import { resolveCompanyIdOrThrow } from '@/lib/tenant';
import { narrowRows } from '@/lib/guards';
import { normalizeSearchText } from '@/lib/utils';
import { sortByName, sortNames } from '@/lib/sortByName';
import { useCompanyId } from '@/hooks/useCompanyId';
import type { CodigoBarrasProduto, DiffCodigos } from '@/domain/estoque/barcode';

// ── DB → Frontend mappers ──

const PRODUTO_SELECT_COLUMNS = [
  'id',
  'nome_produto',
  'sku',
  'categoria',
  'unidade_medida',
  'conversoes',
  'custo_padrao',
  'fornecedores_preferenciais',
  'lead_time_dias',
  'estoque_minimo',
  'estoque_ideal',
  'local_estoque',
  'ativo',
  'observacoes',
  'created_at',
  'unidade_compra',
  'fator_conversao_padrao',
  'package_quantity',
  'package_measure_unit',
  'conversion_mode',
  'custo_ultima_compra',
  'custo_medio_30d',
  'default_cost_purchase_unit',
  'default_cost_base_unit',
  'needs_cost_review',
  'last_cost_purchase_unit',
  'last_cost_base_unit',
  'last_purchase_date',
  'last_supplier',
  'avg30_cost_base_unit',
  'avg30_cost_purchase_unit',
  'avg30_variation_percent',
  'inactivity_days_threshold',
  'last_movement_at',
  'is_salmon_raw_linked',
  'conta_no_cmv',
  'saldo_atual',
  // `barcode` saiu daqui: os códigos moram em `produto_codigos_barras` (N por
  // produto) e são carregados sob demanda, só quando o formulário abre.
].join(', ');

/** Raw DB row shape for produtos table */
interface ProdutoRow {
  id: string;
  nome_produto: string;
  sku: string | null;
  categoria: string;
  unidade_medida: string;
  conversoes: string | null;
  custo_padrao: number | null;
  fornecedores_preferenciais: string[] | null;
  lead_time_dias: number | null;
  estoque_minimo: number | null;
  estoque_ideal: number | null;
  local_estoque: string | null;
  ativo: boolean;
  observacoes: string | null;
  created_at: string;
  unidade_compra: string | null;
  fator_conversao_padrao: number | null;
  package_quantity: number | null;
  package_measure_unit: string | null;
  conversion_mode: string | null;
  custo_ultima_compra: number | null;
  custo_medio_30d: number | null;
  default_cost_purchase_unit: number | null;
  default_cost_base_unit: number | null;
  needs_cost_review: boolean | null;
  last_cost_purchase_unit: number | null;
  last_cost_base_unit: number | null;
  last_purchase_date: string | null;
  last_supplier: string | null;
  avg30_cost_base_unit: number | null;
  avg30_cost_purchase_unit: number | null;
  avg30_variation_percent: number | null;
  inactivity_days_threshold: number | null;
  last_movement_at: string | null;
  is_salmon_raw_linked: boolean | null;
  conta_no_cmv: boolean | null;
  saldo_atual: number | null;
}

function dbToProduto(row: ProdutoRow): ProdutoExtended {
  return {
    id: row.id,
    nomeProduto: row.nome_produto,
    sku: row.sku || '',
    categoria: row.categoria,
    unidadeMedida: row.unidade_medida as Produto['unidadeMedida'],
    conversoes: row.conversoes || '',
    custoPadrao: Number(row.custo_padrao) || 0,
    fornecedoresPreferenciais: row.fornecedores_preferenciais || [],
    leadTimeDias: row.lead_time_dias || 1,
    estoqueMinimo: Number(row.estoque_minimo) || 0,
    estoqueIdeal: Number(row.estoque_ideal) || 0,
    localEstoque: row.local_estoque || '',
    ativo: row.ativo,
    observacoes: row.observacoes || '',
    createdAt: row.created_at,
    unidadeCompra: row.unidade_compra?.trim() ?? '',
    fatorConversaoPadrao: Number(row.fator_conversao_padrao) || 1,
    packageQuantity: row.package_quantity != null ? Number(row.package_quantity) : null,
    packageMeasureUnit: row.package_measure_unit || null,
    conversionMode: (row.conversion_mode as 'auto' | 'manual') || 'manual',
    custoUltimaCompra: Number(row.custo_ultima_compra) || 0,
    custoMedio30d: Number(row.custo_medio_30d) || 0,
    defaultCostPurchaseUnit: Number(row.default_cost_purchase_unit) || 0,
    defaultCostBaseUnit: Number(row.default_cost_base_unit) || 0,
    needsCostReview: !!row.needs_cost_review,
    lastCostPurchaseUnit: Number(row.last_cost_purchase_unit) || 0,
    lastCostBaseUnit: Number(row.last_cost_base_unit) || 0,
    lastPurchaseDate: row.last_purchase_date || null,
    lastSupplier: row.last_supplier || null,
    avg30CostBaseUnit: Number(row.avg30_cost_base_unit) || 0,
    avg30CostPurchaseUnit: Number(row.avg30_cost_purchase_unit) || 0,
    avg30VariationPercent: Number(row.avg30_variation_percent) || 0,
    inactivityDaysThreshold: row.inactivity_days_threshold ?? null,
    lastMovementAt: row.last_movement_at || null,
    isSalmonRawLinked: !!row.is_salmon_raw_linked,
    contaNoCmv: row.conta_no_cmv ?? true,
    saldoAtual: Number(row.saldo_atual) || 0,
  };
}

/** Raw DB row shape for movimentacoes_estoque table */
interface MovimentacaoRow {
  id: string;
  produto_id: string;
  data: string;
  tipo: string;
  quantidade: number;
  custo_unitario: number;
  custo_total: number;
  origem: string | null;
  referencia_id: string | null;
  observacao: string | null;
  created_by: string | null;
  created_at: string;
  status: string | null;
  estorno_de_id: string | null;
  justificativa_cancelamento: string | null;
  justificativa_edicao: string | null;
  setor: string | null;
  reference_type: string | null;
  reference_id: string | null;
  internal_transfer: boolean | null;
  source_module: string | null;
  salmon_lot_id: string | null;
  direction: string | null;
}

function dbToMov(row: MovimentacaoRow): MovimentacaoExtended {
  return {
    id: row.id,
    produtoId: row.produto_id,
    data: row.data,
    tipo: row.tipo as MovimentacaoEstoque['tipo'],
    quantidade: Number(row.quantidade),
    custoUnitario: Number(row.custo_unitario),
    custoTotal: Number(row.custo_total),
    origem: row.origem || '',
    referenciaId: row.referencia_id || '',
    observacao: row.observacao || '',
    createdBy: row.created_by || '',
    createdAt: row.created_at,
    status: row.status || 'ATIVO',
    estorno_de_id: row.estorno_de_id || null,
    justificativa_cancelamento: row.justificativa_cancelamento || '',
    justificativa_edicao: row.justificativa_edicao || '',
    setor: row.setor || null,
    reference_type: row.reference_type || null,
    reference_id: row.reference_id || null,
    internal_transfer: !!row.internal_transfer,
    source_module: row.source_module || null,
    salmon_lot_id: row.salmon_lot_id || null,
    direction: row.direction || 'OUT',
  };
}

export type NovaMovimentacao = Omit<MovimentacaoEstoque, 'id' | 'createdAt'> & { setor?: string };

function toMovInsertPayload(m: NovaMovimentacao, companyId: string) {
  const payload: {
    produto_id: string; data: string; tipo: string; quantidade: number;
    custo_unitario: number; custo_total: number; origem: string;
    referencia_id: string | null; observacao: string | null;
    created_by: string | null; company_id: string; setor?: string;
  } = {
    produto_id: m.produtoId,
    data: m.data,
    tipo: m.tipo,
    quantidade: m.quantidade,
    custo_unitario: m.custoUnitario,
    custo_total: Number((m.quantidade * m.custoUnitario).toFixed(2)),
    origem: m.origem || 'Manual',
    referencia_id: m.referenciaId || null,
    observacao: m.observacao || null,
    created_by: m.createdBy || null,
    company_id: companyId,
  };
  if (m.setor) payload.setor = m.setor;
  return payload;
}

interface MovFilters {
  direction?: 'IN' | 'OUT' | null;
  produtoId?: string | null;
  categoria?: string | null;
  setor?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  showCancelled?: boolean;
}

export type ProdSortBy = 'recent' | 'oldest' | 'name_asc' | 'name_desc' | 'sku_asc' | 'sku_desc' | 'cat_asc';

export interface ProdFilters {
  search?: string;
  categoria?: string;
  ativo?: boolean; // undefined = all
  sortBy?: ProdSortBy;
}

export interface ProductGlobalCounts {
  total: number;
  active: number;
  inactive: number;
}

/** Input type for addProduto — base Produto fields + extended fields */
export type ProdutoCreateInput = Omit<Produto, 'id' | 'createdAt'> & Partial<Pick<ProdutoExtended,
  'unidadeCompra' | 'fatorConversaoPadrao' | 'defaultCostPurchaseUnit' |
  'inactivityDaysThreshold' | 'contaNoCmv' | 'packageQuantity' | 'packageMeasureUnit' |
  'conversionMode'
>>;

/** Input type for updateProduto — partial of base + extended fields */
export type ProdutoUpdateInput = Partial<Produto> & Partial<Pick<ProdutoExtended,
  'unidadeCompra' | 'fatorConversaoPadrao' | 'defaultCostPurchaseUnit' | 'defaultCostBaseUnit' |
  'needsCostReview' | 'inactivityDaysThreshold' | 'contaNoCmv' |
  'packageQuantity' | 'packageMeasureUnit' | 'conversionMode'
>>;

/** RPC saldo row */
interface SaldoRow { produto_id: string; saldo: number }

export function useEstoqueGeralStore() {
  const emitDataEvent = useEmitDataEvent();
  const supabase = useSupabase();
  const { companyId } = useCompanyId();
  const [produtos, setProdutos] = useState<ProdutoExtended[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoExtended[]>([]);
  const [loading, setLoading] = useState(true);

  // Server-side saldos: Record<produtoId, saldo>
  const [saldos, setSaldos] = useState<Record<string, { saldo: number }>>({});
  const [saldosLoading, setSaldosLoading] = useState(false);

  // Cursor-based pagination state for movimentacoes
  const [movCursor, setMovCursor] = useState<{ created_at: string; id: string } | null>(null);
  const [movHasMore, setMovHasMore] = useState(true);
  const [movFilters, setMovFilters] = useState<MovFilters>({});
  const [movKpis, setMovKpis] = useState<{
    entradas: { total_valor: number; total_qtd: number; registros: number };
    saidas: { total_valor: number; total_qtd: number; registros: number };
  } | null>(null);
  const [movKpisLoading, setMovKpisLoading] = useState(false);

  const ESTOQUE_PAGE = 50;
  const MAX_FETCH = 1000; // Supabase default limit
  const [prodPage, setProdPage] = useState(0);
  const [prodHasMore, setProdHasMore] = useState(true);
  const [prodTotalCount, setProdTotalCount] = useState<number | null>(null);
  const [prodFilters, setProdFilters] = useState<ProdFilters>({});
  const [prodGlobalCounts, setProdGlobalCounts] = useState<ProductGlobalCounts>({ total: 0, active: 0, inactive: 0 });
  const [prodCatalogLoading, setProdCatalogLoading] = useState(false);
  const [prodCatalogError, setProdCatalogError] = useState<string | null>(null);

  // === Fetch saldos from RPC (server-side) ===
  const fetchSaldos = useCallback(async (produtoIds: string[]) => {
    if (produtoIds.length === 0) return;
    setSaldosLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_saldo_produtos', {
        p_produto_ids: produtoIds,
      });
      if (!error && data) {
        const rows = narrowRows<SaldoRow>(data, (r: Record<string, unknown>) => ({
          produto_id: String(r.produto_id ?? ''),
          saldo: Number(r.saldo) || 0,
        }));
        const newSaldos: Record<string, { saldo: number }> = {};
        rows.forEach(row => {
          newSaldos[row.produto_id] = { saldo: row.saldo };
        });
        setSaldos(prev => ({ ...prev, ...newSaldos }));
      }
    } catch (err) {
      console.error('Error fetching saldos:', err);
    }
    setSaldosLoading(false);
  }, [supabase]);

  const fetchProdutoGlobalCounts = useCallback(async (): Promise<ProductGlobalCounts> => {
    const fallback: ProductGlobalCounts = { total: 0, active: 0, inactive: 0 };
    try {
      const { data, error } = await (supabase.rpc as any)('get_catalog_counts');

      if (error) {
        console.warn('[useEstoqueGeralStore] Falha ao obter contagem global de produtos via RPC', error.message);
        return fallback;
      }

      if (data) {
        const counts = data as any;
        const result: ProductGlobalCounts = {
          total: Number(counts.total) || 0,
          active: Number(counts.active) || 0,
          inactive: Number(counts.inactive) || 0,
        };
        setProdGlobalCounts(result);
        return result;
      }
    } catch (err) {
      console.error('[useEstoqueGeralStore] Erro ao obter contagem global de produtos:', err);
    }
    return fallback;
  }, []);

  // === Fetch ALL active products (for dashboard/saldo/overview views) ===
  const fetchAllProdutos = useCallback(async () => {
    let allData: ProdutoRow[] = [];
    let from = 0;
    let hasMore = true;
    let hadError = false;
    while (hasMore) {
      const { data, error } = await supabase
        .from('produtos')
        .select(PRODUTO_SELECT_COLUMNS)
        .eq('ativo', true)
        .order('nome_produto', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + MAX_FETCH - 1);

      if (error) {
        console.error('[useEstoqueGeralStore] fetchAllProdutos error:', error.message, error);
        // Se for erro de permissão, tentamos silenciar para não travar o loop dependendo do contexto
        if (error.code === '42501' || error.message.includes('permission denied')) {
           hadError = true;
           break;
        }
        hadError = true;
        break;
      }
      if (!data || data.length === 0) break;
      allData = allData.concat(data as unknown as ProdutoRow[]);
      hasMore = data.length === MAX_FETCH;
      from += MAX_FETCH;
    }
    // Only update produtos state if we got data — never overwrite catalog with empty on error
    if (!hadError) {
      const mapped = sortByName(allData.map(dbToProduto), p => p.nomeProduto);
      setProdutos(mapped);
      setProdTotalCount(mapped.length);
      setProdHasMore(false);
      setProdPage(0);

      // Populate saldos state directly from cached column
      const initialSaldos: Record<string, { saldo: number }> = {};
      mapped.forEach(p => {
        initialSaldos[p.id] = { saldo: p.saldoAtual ?? 0 };
      });
      setSaldos(initialSaldos);

      // We still fetch global counts, but no longer need a separate heavy fetchSaldos for everything
      await fetchProdutoGlobalCounts();
    } else {
      fetchProdutoGlobalCounts();
    }
  }, [fetchProdutoGlobalCounts, supabase]);

  // === Fetch from DB with server-side filters (paginated, for catalog view) ===
  const fetchProdutos = useCallback(async (pageNum = 0, append = false, filters?: ProdFilters) => {
    setProdCatalogLoading(true);
    setProdCatalogError(null);
    const f = filters ?? prodFilters;
    let query = supabase
      .from('produtos')
      .select(PRODUTO_SELECT_COLUMNS); // Removido count: 'exact' para evitar timeout RLS

    // Server-side ordering
    const sort = f.sortBy || 'name_asc';
    switch (sort) {
      case 'oldest': query = query.order('created_at', { ascending: true }); break;
      case 'name_asc': query = query.order('nome_produto', { ascending: true }).order('id', { ascending: true }); break;
      case 'name_desc': query = query.order('nome_produto', { ascending: false }); break;
      case 'sku_asc': query = query.order('sku', { ascending: true }); break;
      case 'sku_desc': query = query.order('sku', { ascending: false }); break;
      case 'cat_asc': query = query.order('categoria', { ascending: true }).order('nome_produto', { ascending: true }); break;
      default: query = query.order('created_at', { ascending: false }); break;
    }

    // Server-side filters
    if (f.ativo !== undefined) {
      query = query.eq('ativo', f.ativo);
    }
    if (f.search?.trim()) {
      // Busca accent-insensitive: usa colunas geradas *_unaccent + termo normalizado
      // (ILIKE no Postgres é case-insensitive mas NÃO remove acentos).
      const term = normalizeSearchText(f.search.trim()).replace(/[%_\\]/g, '\\$&');
      // eslint-disable-next-line no-restricted-syntax -- coluna *_unaccent já normalizada
      query = query.or(`nome_produto_unaccent.ilike.%${term}%,sku_unaccent.ilike.%${term}%`);
    }
    if (f.categoria) {
      query = query.eq('categoria', f.categoria);
    }

    query = query.range(pageNum * ESTOQUE_PAGE, (pageNum + 1) * ESTOQUE_PAGE - 1);

    try {
      const { data, error, count } = await query;
      if (error) {
        console.error('[useEstoqueGeralStore] fetchProdutos error:', error.message, error);
        setProdCatalogError(error.message);
        return;
      }
      if (data) {
        const mapped = (data as unknown as ProdutoRow[]).map(dbToProduto);
        setProdHasMore(mapped.length === ESTOQUE_PAGE);
        if (append) setProdutos(prev => [...prev, ...mapped]);
        else setProdutos(mapped);
        setProdPage(pageNum);

        // Populate saldos state with existing saldo_atual for immediate UI update
        const initialSaldos: Record<string, { saldo: number }> = {};
        mapped.forEach(p => {
          initialSaldos[p.id] = { saldo: p.saldoAtual ?? 0 };
        });
        setSaldos(prev => ({ ...prev, ...initialSaldos }));

        // Buscar contagens frescas e usar o valor retornado diretamente (evita stale closure)
        if (!append) {
          const freshCounts = await fetchProdutoGlobalCounts();
          setProdTotalCount(f.ativo === false ? freshCounts.inactive : (f.ativo === true ? freshCounts.active : freshCounts.total));
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[useEstoqueGeralStore] fetchProdutos exception:', msg, err);
      setProdCatalogError(msg);
    } finally {
      setProdCatalogLoading(false);
    }
  }, [fetchProdutoGlobalCounts, prodFilters, supabase]);

  // === Fetch movimentacoes via cursor-based RPC ===
  const fetchMovimentacoes = useCallback(async (filters?: MovFilters, cursor?: { created_at: string; id: string } | null, append = false, opts: { skipKpis?: boolean } = {}) => {
    const f = filters ?? movFilters;
    const rpcParams: Record<string, unknown> = {
      p_limit: ESTOQUE_PAGE,
      p_direction: f.direction || null,
      p_produto_id: f.produtoId || null,
      p_categoria: f.categoria || null,
      p_setor: f.setor || null,
      p_date_from: f.dateFrom || null,
      p_date_to: f.dateTo || null,
      p_show_cancelled: f.showCancelled || false,
    };

    // Fetch KPIs (entradas + saidas) em uma unica round-trip no primeiro load.
    // Quando só direction mudou, opts.skipKpis=true e o toggle vira filtro client-side instantâneo.
    if (!append && !opts.skipKpis) {
      setMovKpisLoading(true);
      const { data: kpisData } = await supabase.rpc('get_movimentacoes_kpis', {
        p_produto_id:     f.produtoId || null,
        p_setor:          f.setor || null,
        p_date_from:      f.dateFrom || null,
        p_date_to:        f.dateTo || null,
        p_show_cancelled: f.showCancelled || false,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (kpisData) setMovKpis(kpisData as any);
      setMovKpisLoading(false);
    }

    const c = cursor !== undefined ? cursor : movCursor;
    if (c) {
      rpcParams.p_cursor_created_at = c.created_at;
      rpcParams.p_cursor_id = c.id;
    }

    const { data, error } = await supabase.rpc('list_movimentacoes_cursor', rpcParams as Record<string, string>);

    if (error) {
      console.warn('[useEstoqueGeralStore] list_movimentacoes_cursor falhou, usando fallback direto:', error.message);

      if (append) {
        setMovHasMore(false);
        return;
      }

      let fallbackQuery = supabase
        .from('movimentacoes_estoque')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(ESTOQUE_PAGE);

      if (f.direction) fallbackQuery = fallbackQuery.eq('direction', f.direction);
      if (f.produtoId) fallbackQuery = fallbackQuery.eq('produto_id', f.produtoId);
      if (f.categoria) {
        const ids = produtos.filter(p => p.categoria === f.categoria).map(p => p.id);
        if (ids.length === 0) {
          setMovimentacoes([]);
          setMovHasMore(false);
          setMovCursor(null);
          return;
        }
        fallbackQuery = fallbackQuery.in('produto_id', ids);
      }
      if (f.setor) fallbackQuery = fallbackQuery.eq('setor', f.setor);
      if (f.dateFrom) fallbackQuery = fallbackQuery.gte('data', f.dateFrom);
      if (f.dateTo) fallbackQuery = fallbackQuery.lte('data', f.dateTo);
      if (!f.showCancelled) fallbackQuery = fallbackQuery.eq('status', 'ATIVO');

      const { data: fallbackRows, error: fallbackError } = await fallbackQuery;
      if (fallbackError) {
        console.error('Error fetching movimentacoes fallback:', fallbackError);
        return;
      }

      const rows = (fallbackRows ?? []) as unknown as MovimentacaoRow[];
      const mapped = rows.map(dbToMov);
      setMovHasMore(rows.length === ESTOQUE_PAGE);
      setMovimentacoes(mapped);

      if (rows.length > 0) {
        const last = rows[rows.length - 1];
        setMovCursor({ created_at: last.created_at, id: last.id });
      } else {
        setMovCursor(null);
      }
      return;
    }

    if (data) {
      const rows = (data as unknown as MovimentacaoRow[]);
      const mapped = rows.map(dbToMov);

      setMovHasMore(rows.length === ESTOQUE_PAGE);
      if (append) {
        setMovimentacoes(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const newItems = mapped.filter(m => !existingIds.has(m.id));
          return [...prev, ...newItems];
        });
      } else {
        setMovimentacoes(mapped);
      }

      if (rows.length > 0) {
        const last = rows[rows.length - 1];
        setMovCursor({ created_at: last.created_at, id: last.id });
      } else if (!append) {
        setMovCursor(null);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movFilters, produtos]);

  const loadMoreProdutos = useCallback(() => {
    if (prodHasMore) fetchProdutos(prodPage + 1, true, prodFilters);
  }, [prodHasMore, prodPage, fetchProdutos, prodFilters]);

  const goToProdPage = useCallback((page: number) => {
    fetchProdutos(page, false, prodFilters);
  }, [fetchProdutos, prodFilters]);

  const updateProdFilters = useCallback((newFilters: ProdFilters) => {
    setProdFilters(newFilters);
    setProdPage(0);
    fetchProdutos(0, false, newFilters);
  }, [fetchProdutos]);

  const loadMoreMovimentacoes = useCallback(() => {
    if (movHasMore) fetchMovimentacoes(undefined, undefined, true);
  }, [movHasMore, fetchMovimentacoes]);

  const updateMovFilters = useCallback((newFilters: MovFilters) => {
    // Quando só direction muda, os KPIs já foram buscados para ambos os lados —
    // basta trocar o lado exibido (skipKpis=true). O refetch da lista (50 linhas) é necessário.
    const onlyDirectionChanged =
      movFilters.produtoId === newFilters.produtoId &&
      movFilters.categoria === newFilters.categoria &&
      movFilters.setor === newFilters.setor &&
      movFilters.dateFrom === newFilters.dateFrom &&
      movFilters.dateTo === newFilters.dateTo &&
      movFilters.showCancelled === newFilters.showCancelled &&
      movFilters.direction !== newFilters.direction;

    setMovFilters(newFilters);
    setMovCursor(null);
    fetchMovimentacoes(newFilters, null, false, { skipKpis: onlyDirectionChanged });
  }, [fetchMovimentacoes, movFilters]);

  const refetch = useCallback(async () => {
    setLoading(true);
    setSaldos({});
    setMovCursor(null);
    await Promise.all([fetchAllProdutos(), fetchMovimentacoes(movFilters, null, false)]);
    setLoading(false);
  }, [fetchAllProdutos, fetchMovimentacoes, movFilters]);

  useEffect(() => { refetch(); }, []);

  const refreshSaldos = useCallback(async () => {
    const ids = produtos.filter(p => p.ativo).map(p => p.id);
    if (ids.length > 0) await fetchSaldos(ids);
  }, [produtos, fetchSaldos]);

  // === Produto CRUD (DB) ===
  const addProduto = useCallback(async (p: ProdutoCreateInput) => {
    if (!companyId) throw new Error('Selecione uma unidade para cadastrar o produto.');
    let sku: string | null = p.sku || null;
    if (!sku) {
      const { data: skuData, error: skuError } = await supabase.rpc('generate_next_sku', { p_prefix: 'MP' });
      if (skuError) throw skuError;
      sku = skuData as string;
    }

    const fator = p.fatorConversaoPadrao || 1;
    const costPurchase = p.defaultCostPurchaseUnit || p.custoPadrao || 0;
    const costBase = fator > 0 ? costPurchase / fator : costPurchase;

    const { data, error } = await supabase
      .from('produtos')
      .insert({
        company_id: companyId,
        nome_produto: p.nomeProduto,
        sku,
        categoria: p.categoria || 'Outros',
        unidade_medida: p.unidadeMedida || 'UN',
        unidade_compra: p.unidadeCompra || 'UN',
        fator_conversao_padrao: fator,
        custo_padrao: costPurchase,
        default_cost_purchase_unit: costPurchase,
        default_cost_base_unit: Math.round(costBase * 10000) / 10000,
        estoque_minimo: p.estoqueMinimo || 0,
        estoque_ideal: p.estoqueIdeal || 0,
        local_estoque: p.localEstoque || null,
        observacoes: p.observacoes || null,
        lead_time_dias: p.leadTimeDias || 1,
        fornecedores_preferenciais: p.fornecedoresPreferenciais || [],
        inactivity_days_threshold: p.inactivityDaysThreshold ?? null,
        conta_no_cmv: p.contaNoCmv ?? true,
        package_quantity: p.packageQuantity ?? null,
        package_measure_unit: p.packageMeasureUnit || null,
        conversion_mode: p.conversionMode || 'manual',
      })
      .select()
      .single();
    if (error) {
      console.error('[useEstoqueGeralStore.addProduto] insert error', error);
      throw error;
    }
    const newProd = dbToProduto(data as unknown as ProdutoRow);
    setProdutos(prev => sortByName([newProd, ...prev], p => p.nomeProduto));
    setSaldos(prev => ({ ...prev, [newProd.id]: { saldo: 0 } }));
    fetchProdutoGlobalCounts();
    emitDataEvent('estoque:produtos');
    return newProd;
  }, [companyId, fetchProdutoGlobalCounts, supabase, emitDataEvent]);

  const updateProduto = useCallback(async (id: string, updates: ProdutoUpdateInput) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.nomeProduto !== undefined) dbUpdates.nome_produto = updates.nomeProduto;
    if (updates.sku !== undefined) dbUpdates.sku = updates.sku || null;
    if (updates.categoria !== undefined) dbUpdates.categoria = updates.categoria;
    if (updates.unidadeMedida !== undefined) dbUpdates.unidade_medida = updates.unidadeMedida;
    if (updates.custoPadrao !== undefined) dbUpdates.custo_padrao = updates.custoPadrao;
    if (updates.estoqueMinimo !== undefined) dbUpdates.estoque_minimo = updates.estoqueMinimo;
    if (updates.estoqueIdeal !== undefined) dbUpdates.estoque_ideal = updates.estoqueIdeal;
    if (updates.localEstoque !== undefined) dbUpdates.local_estoque = updates.localEstoque || null;
    if (updates.observacoes !== undefined) dbUpdates.observacoes = updates.observacoes || null;
    if (updates.leadTimeDias !== undefined) dbUpdates.lead_time_dias = updates.leadTimeDias;
    if (updates.fornecedoresPreferenciais !== undefined) dbUpdates.fornecedores_preferenciais = updates.fornecedoresPreferenciais;
    if (updates.ativo !== undefined) dbUpdates.ativo = updates.ativo;
    if (updates.unidadeCompra !== undefined) dbUpdates.unidade_compra = updates.unidadeCompra;
    if (updates.fatorConversaoPadrao !== undefined) dbUpdates.fator_conversao_padrao = updates.fatorConversaoPadrao;
    if (updates.defaultCostPurchaseUnit !== undefined) {
      dbUpdates.default_cost_purchase_unit = updates.defaultCostPurchaseUnit;
      dbUpdates.custo_padrao = updates.defaultCostPurchaseUnit;
      const fator = updates.fatorConversaoPadrao || 1;
      dbUpdates.default_cost_base_unit = fator > 0 ? Math.round(updates.defaultCostPurchaseUnit / fator * 10000) / 10000 : updates.defaultCostPurchaseUnit;
    }
    if (updates.needsCostReview !== undefined) dbUpdates.needs_cost_review = updates.needsCostReview;
    if (updates.inactivityDaysThreshold !== undefined) dbUpdates.inactivity_days_threshold = updates.inactivityDaysThreshold;
    if (updates.contaNoCmv !== undefined) dbUpdates.conta_no_cmv = updates.contaNoCmv;
    if (updates.packageQuantity !== undefined) dbUpdates.package_quantity = updates.packageQuantity;
    if (updates.packageMeasureUnit !== undefined) dbUpdates.package_measure_unit = updates.packageMeasureUnit;
    if (updates.conversionMode !== undefined) dbUpdates.conversion_mode = updates.conversionMode;

    const { data: updatedRows, error } = await supabase.from('produtos')
      .update(dbUpdates as import('@/integrations/supabase/types').Database['public']['Tables']['produtos']['Update'])
      .eq('id', id)
      .select('id');
    if (error) {
      console.error('[useEstoqueGeralStore.updateProduto] update error', error);
      throw error;
    }
    if (!updatedRows || updatedRows.length === 0) {
      const notFoundError = new Error('Produto não encontrado ou você não tem permissão para editá-lo.');
      console.error('[useEstoqueGeralStore.updateProduto] no rows affected', { id });
      throw notFoundError;
    }
    setProdutos(prev => prev.map(p => p.id === id ? { ...p, ...updates } as ProdutoExtended : p));
    fetchProdutoGlobalCounts();
    emitDataEvent('estoque:produtos');
  }, [fetchProdutoGlobalCounts, supabase, emitDataEvent]);

  // === Códigos de barras do produto ===
  //
  // Carregados sob demanda, quando o formulário abre — não junto do catálogo.
  // Nenhuma listagem mostra código, então trazer N linhas por produto para
  // centenas de produtos seria banda gasta à toa.
  const fetchCodigosBarras = useCallback(async (produtoId: string): Promise<CodigoBarrasProduto[]> => {
    const { data, error } = await supabase
      .from('produto_codigos_barras')
      .select('id, codigo, rotulo')
      .eq('produto_id', produtoId)
      .order('created_at');
    if (error) {
      console.error('[useEstoqueGeralStore.fetchCodigosBarras]', error);
      throw error;
    }
    return (data ?? []).map(r => ({ id: r.id, codigo: r.codigo, rotulo: r.rotulo || '' }));
  }, [supabase]);

  /**
   * Procura um dos códigos já vinculado a OUTRO produto.
   *
   * Devolve a mensagem pronta, ou null quando estão todos livres. Chamada antes
   * de gravar o produto: sem isso, cadastrar um produto novo com um código já
   * usado criaria o produto e só então falharia nos códigos, deixando um
   * cadastro pela metade que ninguém pediu.
   *
   * Falha de rede aqui devolve null de propósito — esta checagem é conveniência,
   * quem realmente garante a unicidade é o índice no banco.
   */
  const verificarCodigosLivres = useCallback(async (
    codigos: string[],
    produtoId?: string,
  ): Promise<string | null> => {
    if (codigos.length === 0) return null;
    try {
      let query = supabase
        .from('produto_codigos_barras')
        .select('codigo, produto_id')
        .in('codigo', codigos);
      if (produtoId) query = query.neq('produto_id', produtoId);

      const { data, error } = await query.limit(1);
      if (error) {
        console.error('[useEstoqueGeralStore.verificarCodigosLivres]', error);
        return null;
      }
      const conflito = data?.[0];
      if (!conflito) return null;

      const { data: dono } = await supabase
        .from('produtos')
        .select('nome_produto')
        .eq('id', conflito.produto_id)
        .maybeSingle();
      return dono?.nome_produto
        ? `O código ${conflito.codigo} já está vinculado a "${dono.nome_produto}".`
        : 'Este código de barras já está cadastrado em outro produto.';
    } catch (err) {
      console.error('[useEstoqueGeralStore.verificarCodigosLivres]', err);
      return null;
    }
  }, [supabase]);

  /**
   * Aplica o diff da lista de códigos e devolve a lista gravada.
   *
   * Passa por RPC, não por dois PostgREST: o DELETE e o INSERT precisam da MESMA
   * transação. Separados, o DELETE podia ser commitado e o INSERT falhar logo
   * depois — o produto ficava sem nenhum código, o leitor parava de reconhecer a
   * embalagem e nada na tela dizia que o código havia sumido.
   *
   * O retorno traz os ids recém-gravados: sem eles o formulário guardaria os
   * códigos novos sem id e o diff seguinte tentaria inseri-los outra vez,
   * batendo no índice único contra a linha que ele mesmo acabou de criar.
   */
  const salvarCodigosBarras = useCallback(async (
    produtoId: string,
    diff: DiffCodigos,
  ): Promise<CodigoBarrasProduto[]> => {
    const { data, error } = await supabase.rpc('catalogo_salvar_codigos_barras', {
      p_produto_id: produtoId,
      p_remover: diff.remover,
      p_adicionar: diff.adicionar.map(c => ({ codigo: c.codigo, rotulo: c.rotulo })),
    });

    if (error) {
      console.error('[useEstoqueGeralStore.salvarCodigosBarras]', error);
      // 23505 = o código já existe na empresa, necessariamente em OUTRO
      // produto: duplicata dentro do próprio formulário é barrada antes.
      // Só chega aqui quem passou pela checagem prévia e perdeu a corrida.
      if (error.code === '23505') {
        const msg = await verificarCodigosLivres(diff.adicionar.map(c => c.codigo), produtoId);
        throw new Error(msg ?? 'Este código de barras já está cadastrado em outro produto.');
      }
      throw error;
    }

    return (data ?? []).map(r => ({ id: r.id, codigo: r.codigo, rotulo: r.rotulo || '' }));
  }, [supabase, verificarCodigosLivres]);

  const deleteProduto = useCallback(async (id: string) => {
    const { data: deactivatedId, error } = await supabase.rpc('deactivate_produto', { p_produto_id: id });
    if (error) {
      console.error('[useEstoqueGeralStore.deleteProduto] deactivate_produto error', error);
      throw error;
    }
    if (deactivatedId !== id) {
      const notFoundError = new Error('Produto não encontrado ou você não tem permissão para excluí-lo.');
      console.error('[useEstoqueGeralStore.deleteProduto] no rows affected', { id });
      throw notFoundError;
    }
    setProdutos(prev => prev.map(p => p.id === id ? { ...p, ativo: false } : p));
    fetchProdutoGlobalCounts();
    emitDataEvent('estoque:produtos');
  }, [fetchProdutoGlobalCounts, supabase, emitDataEvent]);

  // === Movimentação (DB) ===
  const addMovimentacao = useCallback(async (m: NovaMovimentacao) => {
    const companyId = await resolveCompanyIdOrThrow(supabase);
    const { data, error } = await supabase
      .from('movimentacoes_estoque')
      .insert(toMovInsertPayload(m, companyId))
      .select()
      .single();
    if (error) {
      console.error('[useEstoqueGeralStore.addMovimentacao] insert error', error);
      throw error;
    }
    const newMov = dbToMov(data as unknown as MovimentacaoRow);
    setMovCursor(null);
    await Promise.all([
      fetchMovimentacoes(movFilters, null, false),
      fetchSaldos([m.produtoId]),
    ]);
    emitDataEvent('estoque:movimentacoes');
    return newMov;
  }, [supabase, fetchMovimentacoes, movFilters, fetchSaldos, emitDataEvent]);

  /**
   * Vários itens numa transação só, via `estoque_registrar_movimentacoes_lote`
   * (SECURITY INVOKER: a mesma RLS e os mesmos triggers do INSERT direto) —
   * ou todas as linhas entram ou nenhuma. `clientRequestId` é a chave derivada
   * do lote: reenviar o mesmo lote devolve as linhas já gravadas em vez de
   * duplicar a entrada/saída.
   */
  const addMovimentacoesLote = useCallback(async (
    itens: NovaMovimentacao[],
    opts: { clientRequestId?: string } = {},
  ) => {
    if (itens.length === 0) return [];
    // Mantém o TenantError com a mensagem amigável quando a unidade não valida.
    const companyId = await resolveCompanyIdOrThrow(supabase);
    const { data, error } = await supabase.rpc('estoque_registrar_movimentacoes_lote', {
      p_itens: itens.map(m => {
        const { company_id: _companyId, created_by: _createdBy, ...linha } = toMovInsertPayload(m, companyId);
        return linha;
      }),
      p_client_request_id: opts.clientRequestId,
    });
    if (error) {
      console.error('[useEstoqueGeralStore.addMovimentacoesLote] rpc error', error);
      throw error;
    }
    const resultado = data as unknown as { movimentacoes?: MovimentacaoRow[] } | null;
    const novas = (resultado?.movimentacoes ?? []).map(dbToMov);

    // O lote já está gravado: falha no refresh não pode virar erro, senão a
    // tela convida a registrar de novo.
    setMovCursor(null);
    try {
      await Promise.all([
        fetchMovimentacoes(movFilters, null, false),
        fetchSaldos([...new Set(itens.map(m => m.produtoId))]),
      ]);
    } catch (refreshError) {
      console.error('[useEstoqueGeralStore.addMovimentacoesLote] refresh após gravar', refreshError);
    }
    emitDataEvent('estoque:movimentacoes');
    return novas;
  }, [supabase, fetchMovimentacoes, movFilters, fetchSaldos, emitDataEvent]);

  // Categorias derived from produtos
  const categorias = useMemo(() => sortNames([...new Set(produtos.map(p => p.categoria).filter(Boolean))]), [produtos]);

  return {
    produtos, movimentacoes, saldos, saldosLoading, categorias, loading,
    prodHasMore, prodTotalCount, prodPage, movHasMore, movKpis, movKpisLoading, movFilters, prodFilters, prodGlobalCounts, prodCatalogLoading, prodCatalogError,
    addProduto, updateProduto, deleteProduto,
    fetchCodigosBarras, salvarCodigosBarras, verificarCodigosLivres,
    addMovimentacao, addMovimentacoesLote,
    refetch, refreshSaldos, fetchAllProdutos, loadMoreProdutos, goToProdPage, loadMoreMovimentacoes, updateMovFilters, updateProdFilters,
  };
}
