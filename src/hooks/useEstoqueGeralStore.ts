import { useState, useEffect, useCallback, useMemo } from 'react';
import { emitDataEvent } from '@/lib/dataEvents';
import { supabase } from '@/integrations/supabase/client';
import type { Produto, MovimentacaoEstoque } from '@/types/salmon';
import type { ProdutoExtended, MovimentacaoExtended, ProdutoFormData } from '@/types/estoque';
import { todayBR } from '@/lib/datetime';
import { resolveCompanyIdOrThrow } from '@/lib/tenant';
import { narrowRows } from '@/lib/guards';

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
  'inactivityDaysThreshold' | 'contaNoCmv' | 'packageQuantity' | 'packageMeasureUnit' | 'conversionMode'
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
  const [movTotalCount, setMovTotalCount] = useState<number | null>(null);
  const [movServerTotals, setMovServerTotals] = useState<{ totalValor: number; totalQtd: number } | null>(null);

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
  }, []);

  const fetchProdutoGlobalCounts = useCallback(async () => {
    try {
      const { data, error } = await (supabase.rpc as any)('get_catalog_counts');

      if (error) {
        console.warn('[useEstoqueGeralStore] Falha ao obter contagem global de produtos via RPC', error.message);
        return;
      }

      if (data) {
        const counts = data as any;
        setProdGlobalCounts({
          total: Number(counts.total) || 0,
          active: Number(counts.active) || 0,
          inactive: Number(counts.inactive) || 0,
        });
      }
    } catch (err) {
      console.error('[useEstoqueGeralStore] Erro ao obter contagem global de produtos:', err);
    }
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
        .order('created_at', { ascending: false })
        .range(from, from + MAX_FETCH - 1);
      if (error) {
        console.error('[useEstoqueGeralStore] fetchAllProdutos error:', error.message, error);
        hadError = true;
        break;
      }
      if (!data) break;
      allData = allData.concat(data as unknown as ProdutoRow[]);
      hasMore = data.length === MAX_FETCH;
      from += MAX_FETCH;
    }
    // Only update produtos state if we got data — never overwrite catalog with empty on error
    if (!hadError) {
      const mapped = allData.map(dbToProduto);
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
  }, [fetchProdutoGlobalCounts]);

  // === Fetch from DB with server-side filters (paginated, for catalog view) ===
  const fetchProdutos = useCallback(async (pageNum = 0, append = false, filters?: ProdFilters) => {
    setProdCatalogLoading(true);
    setProdCatalogError(null);
    const f = filters ?? prodFilters;
    let query = supabase
      .from('produtos')
      .select(PRODUTO_SELECT_COLUMNS); // Removido count: 'exact' para evitar timeout RLS

    // Server-side ordering
    const sort = f.sortBy || 'recent';
    switch (sort) {
      case 'oldest': query = query.order('created_at', { ascending: true }); break;
      case 'name_asc': query = query.order('nome_produto', { ascending: true }); break;
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
      const term = f.search.trim().replace(/[%_\\]/g, '\\$&');
      query = query.or(`nome_produto.ilike.%${term}%,sku.ilike.%${term}%`);
    }
    if (f.categoria) {
      query = query.eq('categoria', f.categoria);
    }

    query = query.range(pageNum * ESTOQUE_PAGE, (pageNum + 1) * ESTOQUE_PAGE - 1);

    try {
      const { data, error, count } = await query;
      console.log('[fetchProdutos] resultado:', { dataLen: data?.length, count, error: error?.message, filters: f });
      if (error) {
        console.error('[useEstoqueGeralStore] fetchProdutos error:', error.message, error);
        setProdCatalogError(error.message);
        return;
      }
      if (data) {
        const mapped = (data as unknown as ProdutoRow[]).map(dbToProduto);
        setProdHasMore(mapped.length === ESTOQUE_PAGE);
        // Usar contagem do estado global em vez do count:exact da query que gera timeout
        setProdTotalCount(f.ativo === false ? prodGlobalCounts.inactive : (f.ativo === true ? prodGlobalCounts.active : prodGlobalCounts.total));
        if (append) setProdutos(prev => [...prev, ...mapped]);
        else setProdutos(mapped);
        setProdPage(pageNum);
        const ids = mapped.filter(p => p.ativo).map(p => p.id);
        
        // Populate saldos state with existing saldo_atual for immediate UI update
        const initialSaldos: Record<string, { saldo: number }> = {};
        mapped.forEach(p => {
          initialSaldos[p.id] = { saldo: p.saldoAtual ?? 0 };
        });
        setSaldos(prev => ({ ...prev, ...initialSaldos }));

        // Removido fetchSaldos redundante — o saldo_atual já vem no fetchProdutos
        if (!append) fetchProdutoGlobalCounts();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[useEstoqueGeralStore] fetchProdutos exception:', msg, err);
      setProdCatalogError(msg);
    } finally {
      setProdCatalogLoading(false);
    }
  }, [fetchSaldos, fetchProdutoGlobalCounts, prodFilters]);

  // === Fetch movimentacoes via cursor-based RPC ===
  const fetchMovimentacoes = useCallback(async (filters?: MovFilters, cursor?: { created_at: string; id: string } | null, append = false) => {
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

    // Fetch total count + aggregates on first load (not on append/load-more)
    if (!append) {
      let countQuery = supabase
        .from('movimentacoes_estoque')
        .select('id', { count: 'exact', head: true });
      if (f.direction) countQuery = countQuery.eq('direction', f.direction);
      if (f.produtoId) countQuery = countQuery.eq('produto_id', f.produtoId);
      if (f.setor) countQuery = countQuery.eq('setor', f.setor);
      if (f.dateFrom) countQuery = countQuery.gte('data', f.dateFrom);
      if (f.dateTo) countQuery = countQuery.lte('data', f.dateTo);
      if (!f.showCancelled) countQuery = countQuery.eq('status', 'ATIVO');

      // Also fetch server-side totals for KPIs
      let totalsQuery = supabase
        .from('movimentacoes_estoque')
        .select('custo_total, custo_unitario, quantidade');
      if (f.direction) totalsQuery = totalsQuery.eq('direction', f.direction);
      if (f.produtoId) totalsQuery = totalsQuery.eq('produto_id', f.produtoId);
      if (f.setor) totalsQuery = totalsQuery.eq('setor', f.setor);
      if (f.dateFrom) totalsQuery = totalsQuery.gte('data', f.dateFrom);
      if (f.dateTo) totalsQuery = totalsQuery.lte('data', f.dateTo);
      if (!f.showCancelled) totalsQuery = totalsQuery.eq('status', 'ATIVO');
      // Exclude estornos from totals
      totalsQuery = totalsQuery.not('tipo', 'in', '("ENTRADA_ESTORNO","SAIDA_ESTORNO")');

      const [{ count }, { data: totalsRows }] = await Promise.all([countQuery, totalsQuery]);
      setMovTotalCount(count ?? null);

      if (totalsRows) {
        const totalValor = totalsRows.reduce((sum: number, r: any) => {
          const quantidade = Number(r.quantidade) || 0;
          const custoUnitario = Number(r.custo_unitario) || 0;
          const custoTotal = Number(r.custo_total) || 0;
          return sum + (quantidade > 0 && custoUnitario >= 0 ? quantidade * custoUnitario : custoTotal);
        }, 0);
        const totalQtd = totalsRows.reduce((sum: number, r: any) => sum + (Number(r.quantidade) || 0), 0);
        setMovServerTotals({ totalValor, totalQtd });
      }
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
    setMovFilters(newFilters);
    setMovCursor(null);
    fetchMovimentacoes(newFilters, null, false);
  }, [fetchMovimentacoes]);

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
    await resolveCompanyIdOrThrow();
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
    if (error) throw error;
    const newProd = dbToProduto(data as unknown as ProdutoRow);
    setProdutos(prev => [newProd, ...prev]);
    setSaldos(prev => ({ ...prev, [newProd.id]: { saldo: 0 } }));
    fetchProdutoGlobalCounts();
    emitDataEvent('estoque:produtos');
    return newProd;
  }, [fetchProdutoGlobalCounts]);

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

    const { error } = await supabase.from('produtos').update(dbUpdates).eq('id', id);
    if (error) throw error;
    setProdutos(prev => prev.map(p => p.id === id ? { ...p, ...updates } as ProdutoExtended : p));
    fetchProdutoGlobalCounts();
    emitDataEvent('estoque:produtos');
  }, [fetchProdutoGlobalCounts]);

  const deleteProduto = useCallback(async (id: string) => {
    const { error } = await supabase.from('produtos').update({ ativo: false }).eq('id', id);
    if (error) throw error;
    setProdutos(prev => prev.map(p => p.id === id ? { ...p, ativo: false } : p));
    fetchProdutoGlobalCounts();
    emitDataEvent('estoque:produtos');
  }, [fetchProdutoGlobalCounts]);

  // === Movimentação (DB) ===
  const addMovimentacao = useCallback(async (m: Omit<MovimentacaoEstoque, 'id' | 'createdAt'> & { setor?: string }) => {
    await resolveCompanyIdOrThrow();
    const insertPayload: {
      produto_id: string; data: string; tipo: string; quantidade: number;
      custo_unitario: number; custo_total: number; origem: string;
      referencia_id: string | null; observacao: string | null;
      created_by: string | null; setor?: string;
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
    };
    if (m.setor) insertPayload.setor = m.setor;
    const { data, error } = await supabase
      .from('movimentacoes_estoque')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw error;
    const newMov = dbToMov(data as unknown as MovimentacaoRow);
    setMovCursor(null);
    await Promise.all([
      fetchMovimentacoes(movFilters, null, false),
      fetchSaldos([m.produtoId]),
    ]);
    emitDataEvent('estoque:movimentacoes');
    return newMov;
  }, [fetchSaldos, fetchMovimentacoes, movFilters]);

  // Categorias derived from produtos
  const categorias = useMemo(() => [...new Set(produtos.map(p => p.categoria).filter(Boolean))], [produtos]);

  return {
    produtos, movimentacoes, saldos, saldosLoading, categorias, loading,
    prodHasMore, prodTotalCount, prodPage, movHasMore, movTotalCount, movServerTotals, movFilters, prodFilters, prodGlobalCounts, prodCatalogLoading, prodCatalogError,
    addProduto, updateProduto, deleteProduto,
    addMovimentacao,
    refetch, refreshSaldos, fetchAllProdutos, loadMoreProdutos, goToProdPage, loadMoreMovimentacoes, updateMovFilters, updateProdFilters,
  };
}
