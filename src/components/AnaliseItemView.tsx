import { useState, useEffect, useCallback } from 'react';
import { PeriodRange } from './PeriodFilter';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from 'recharts';
import { ArrowUpDown, Package, Loader2, AlertTriangle, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

import { fmtBRL, formatPercentBR } from '@/lib/formatters';
function fmtR$(n: number) { return fmtBRL(n); }
function fmtPct(n: number) { return formatPercentBR(n); }

const chartTooltipStyle = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '11px', color: 'hsl(var(--foreground))' };

interface ReportItem {
  produto_id: string;
  nome_produto: string;
  categoria: string;
  unidade_medida: string;
  saldo_atual: number;
  valor_estoque: number;
  custo_medio_periodo: number;
  ultimo_preco: number;
  variacao_percent: number;
  consumo_periodo: number;
  custo_consumido: number;
  desperdicio_percent: number;
  giro: number;
  cobertura_semanas: number;
  percent_cmv: number;
  perdas_qtd: number;
  last_movement_at: string;
}

interface ItemDetail {
  produto_id: string;
  nome: string;
  categoria: string;
  unidade: string;
  custo_base: number;
  saldo_atual: number;
  breakdown: { tipo: string; qtd: number; custo: number }[];
  preco_historico: { data: string; preco: number; qtd: number }[];
  consumo_semanal: { semana: string; consumo: number }[];
  perdas_semanal: { semana: string; perda: number }[];
  fornecedores: string[];
}

interface SummaryData {
  total_itens_ativos: number;
  total_custo_consumido: number;
  total_perdas_valor: number;
  maior_cmv: { nome: string; valor: number } | null;
  maior_aumento: { nome: string; valor: number } | null;
  menor_giro: { nome: string; valor: number } | null;
  maior_desperdicio: { nome: string; valor: number } | null;
  top_custo: { nome: string; valor: number }[];
  top_variacao: { nome: string; valor: number }[];
  top_cmv: { nome: string; valor: number }[];
  top_menor_giro: { nome: string; valor: number }[];
}

type SortKey = 'nome' | 'consumo' | 'custoMedio' | 'variacao' | 'giro' | 'percentCMV' | 'desperdicio' | 'cobertura';

interface Props {
  period: PeriodRange;
}

const PAGE_SIZE = 20;

export default function AnaliseItemView({ period }: Props) {
  const [items, setItems] = useState<ReportItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [sortKey, setSortKey] = useState<SortKey>('percentCMV');
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const pStart = format(period.start, 'yyyy-MM-dd');
  const pEnd = format(period.end, 'yyyy-MM-dd');

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch list
  const fetchItems = useCallback(async (append = false, cursorAt?: string, cursorId?: string) => {
    if (append) setLoadingMore(true); else setLoading(true);
    setError(null);

    const { data, error: err } = await supabase.rpc('list_report_items_cursor', {
      p_start: pStart,
      p_end: pEnd,
      p_limit: PAGE_SIZE,
      p_cursor_created_at: cursorAt || null,
      p_cursor_id: cursorId || null,
      p_search: searchDebounced || null,
      p_categoria: null,
      p_sort_key: sortKey,
      p_sort_asc: sortAsc,
    });

    if (err) {
      console.error('list_report_items_cursor error:', err);
      setError(err.message);
    } else if (data) {
      const d = data as { items?: Record<string, unknown>[]; has_more?: boolean; total_count?: number };
      const rawItems = d.items || [];
      // Map RPC field names to component interface, providing safe defaults
      const newItems: ReportItem[] = rawItems.map((r: Record<string, unknown>) => ({
        produto_id: String(r.produto_id ?? ''),
        nome_produto: String(r.nome ?? r.nome_produto ?? ''),
        categoria: String(r.categoria ?? ''),
        unidade_medida: String(r.unidade ?? r.unidade_medida ?? ''),
        saldo_atual: Number(r.saldo ?? r.saldo_atual ?? 0),
        valor_estoque: Number(r.valor_estoque ?? 0),
        custo_medio_periodo: Number(r.custo_medio_periodo ?? 0),
        ultimo_preco: Number(r.ultimo_preco ?? 0),
        variacao_percent: Number(r.variacao_percent ?? 0),
        consumo_periodo: Number(r.consumo_periodo ?? 0),
        custo_consumido: Number(r.custo_consumido ?? 0),
        desperdicio_percent: Number(r.desperdicio_percent ?? 0),
        giro: Number(r.giro ?? 0),
        perdas_qtd: Number(r.perdas_qtd ?? 0),
        // Derived fields not in RPC — compute safely
        cobertura_semanas: Number(r.giro ?? 0) > 0
          ? Math.round((Number(r.saldo ?? r.saldo_atual ?? 0) / (Number(r.consumo_periodo ?? 0) / 4 || 1)) * 10) / 10
          : 0,
        percent_cmv: 0, // will be computed below
        last_movement_at: String(r.cursor_created_at ?? r.last_movement_at ?? ''),
      }));
      // Compute percent_cmv relative to total
      const totalCusto = newItems.reduce((s, i) => s + i.custo_consumido, 0);
      if (totalCusto > 0) {
        newItems.forEach(i => { i.percent_cmv = (i.custo_consumido / totalCusto) * 100; });
      }
      setItems(prev => append ? [...prev, ...newItems] : newItems);
      setHasMore(d.has_more ?? false);
      setTotalCount(d.total_count ?? newItems.length);
    }

    setLoading(false);
    setLoadingMore(false);
  }, [pStart, pEnd, searchDebounced, sortKey, sortAsc]);

  // Fetch summary
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    const { data, error: err } = await supabase.rpc('get_report_items_summary', {
      p_start: pStart,
      p_end: pEnd,
    });
    if (!err && data) setSummary(data as unknown as SummaryData);
    setSummaryLoading(false);
  }, [pStart, pEnd]);

  // Reset & fetch on period/search/sort change
  useEffect(() => {
    fetchItems(false);
  }, [fetchItems]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Load more
  const loadMore = () => {
    if (items.length === 0 || !hasMore) return;
    const last = items[items.length - 1];
    fetchItems(true, last.last_movement_at, last.produto_id);
  };

  // Fetch detail
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setDetailLoading(true);
    supabase.rpc('get_report_item_detail', {
      p_produto_id: selectedId,
      p_start: pStart,
      p_end: pEnd,
    }).then(({ data, error: err }) => {
      if (!err && data) setDetail(data as unknown as ItemDetail);
      setDetailLoading(false);
    });
  }, [selectedId, pStart, pEnd]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <TableHead className="cursor-pointer select-none text-[10px] px-2" onClick={() => handleSort(k)}>
      <span className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${sortKey === k ? 'text-primary' : 'text-muted-foreground'}`} />
      </span>
    </TableHead>
  );

  // Loading state
  if (loading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando análise de itens…</p>
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-6 text-center space-y-3">
        <AlertTriangle className="w-8 h-8 text-destructive mx-auto" />
        <p className="text-sm text-destructive font-semibold">Erro ao carregar itens</p>
        <p className="text-xs text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => fetchItems(false)}>Tentar novamente</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      {!summaryLoading && summary && (
        <div className="grid grid-cols-2 gap-2">
          {summary.maior_cmv && (
            <div className="bg-card border border-destructive/20 rounded-xl p-3 animate-fade-up">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Maior Impacto CMV</p>
              <p className="text-sm font-bold text-destructive truncate">{summary.maior_cmv.nome}</p>
              <p className="text-xs text-muted-foreground">{fmtPct(summary.maior_cmv.valor)} do CMV</p>
            </div>
          )}
          {summary.maior_aumento && (
            <div className="bg-card border border-destructive/20 rounded-xl p-3 animate-fade-up">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Maior Aumento Preço</p>
              <p className="text-sm font-bold text-destructive truncate">{summary.maior_aumento.nome}</p>
              <p className="text-xs text-muted-foreground">↑ {fmtPct(summary.maior_aumento.valor)}</p>
            </div>
          )}
          {summary.menor_giro && (
            <div className="bg-card border border-warning/20 rounded-xl p-3 animate-fade-up">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Menor Giro</p>
              <p className="text-sm font-bold text-warning truncate">{summary.menor_giro.nome}</p>
              <p className="text-xs text-muted-foreground">Giro: {(summary.menor_giro.valor ?? 0).toFixed(2)}</p>
            </div>
          )}
          {summary.maior_desperdicio && summary.maior_desperdicio.valor > 0 && (
            <div className="bg-card border border-destructive/20 rounded-xl p-3 animate-fade-up">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Maior Desperdício</p>
              <p className="text-sm font-bold text-destructive truncate">{summary.maior_desperdicio.nome}</p>
              <p className="text-xs text-muted-foreground">{fmtPct(summary.maior_desperdicio.valor)}</p>
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar item..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 h-8 text-xs bg-secondary border-border"
        />
      </div>

      {/* Main Table */}
      {items.length > 0 ? (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/30">
                  <SortHeader label="Item" k="nome" />
                  <TableHead className="text-[10px] px-2">Cat.</TableHead>
                  <SortHeader label="Custo Méd." k="custoMedio" />
                  <TableHead className="text-[10px] px-2">Últ. Preço</TableHead>
                  <SortHeader label="Var. %" k="variacao" />
                  <SortHeader label="Consumo" k="consumo" />
                  <SortHeader label="Giro" k="giro" />
                  <SortHeader label="Cob. Sem." k="cobertura" />
                  <SortHeader label="% CMV" k="percentCMV" />
                  <SortHeader label="Desp. %" k="desperdicio" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => (
                  <TableRow
                    key={item.produto_id}
                    className="cursor-pointer hover:bg-primary/5 transition-colors text-[11px]"
                    onClick={() => setSelectedId(item.produto_id)}
                  >
                    <TableCell className="font-medium text-foreground px-2 py-2 max-w-[120px] truncate">{item.nome_produto}</TableCell>
                    <TableCell className="text-muted-foreground px-2 py-2 text-[10px]">{item.categoria}</TableCell>
                    <TableCell className="px-2 py-2">{fmtR$(item.custo_medio_periodo)}</TableCell>
                    <TableCell className="px-2 py-2">{fmtR$(item.ultimo_preco)}</TableCell>
                    <TableCell className={`px-2 py-2 font-bold ${item.variacao_percent > 5 ? 'text-destructive' : item.variacao_percent < -5 ? 'text-success' : 'text-foreground'}`}>
                      {item.variacao_percent > 0 ? '↑' : item.variacao_percent < 0 ? '↓' : '→'} {fmtPct(Math.abs(item.variacao_percent))}
                    </TableCell>
                    <TableCell className="px-2 py-2">{item.consumo_periodo.toFixed(1)}</TableCell>
                    <TableCell className="px-2 py-2">{item.giro.toFixed(2)}</TableCell>
                    <TableCell className="px-2 py-2">{item.cobertura_semanas.toFixed(1)}</TableCell>
                    <TableCell className={`px-2 py-2 font-bold ${item.percent_cmv > 10 ? 'text-destructive' : 'text-foreground'}`}>{fmtPct(item.percent_cmv)}</TableCell>
                    <TableCell className={`px-2 py-2 ${item.desperdicio_percent > 5 ? 'text-destructive font-bold' : 'text-foreground'}`}>{fmtPct(item.desperdicio_percent)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Load more */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-secondary/20">
            <p className="text-[10px] text-muted-foreground">{items.length} de {totalCount} itens</p>
            {hasMore && (
              <Button variant="outline" size="sm" className="h-6 text-[10px]" disabled={loadingMore} onClick={loadMore}>
                {loadingMore ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Carregar mais
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <Package className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {searchDebounced ? 'Nenhum item encontrado para a busca' : 'Nenhum item cadastrado no estoque geral'}
          </p>
        </div>
      )}

      {/* Rankings */}
      {!summaryLoading && summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <RankingCard title="🏆 Maior Custo Total" items={(summary.top_custo || []).map(i => ({ nome: i.nome, valor: fmtR$(i.valor) }))} />
          <RankingCard title="📈 Maior Aumento de Preço" items={(summary.top_variacao || []).map(i => ({ nome: i.nome, valor: `↑ ${fmtPct(i.valor)}` }))} />
          <RankingCard title="🔥 Maior Impacto no CMV" items={(summary.top_cmv || []).map(i => ({ nome: i.nome, valor: fmtPct(i.valor) }))} />
          <RankingCard title="📉 Menor Giro" items={(summary.top_menor_giro || []).map(i => ({ nome: i.nome, valor: (i.valor ?? 0).toFixed(2) }))} />
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={!!selectedId} onOpenChange={() => setSelectedId(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-card border-border">
          {detailLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}
          {!detailLoading && detail && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base font-display text-foreground flex items-center gap-2">
                  <Package className="w-4 h-4 text-primary" /> {detail.nome}
                </DialogTitle>
                <p className="text-xs text-muted-foreground">{detail.categoria} • {detail.unidade}</p>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                {/* KPIs */}
                <div className="grid grid-cols-3 gap-2">
                  <MiniKPI label="Custo Base" value={fmtR$(detail.custo_base)} />
                  <MiniKPI label="Saldo Atual" value={detail.saldo_atual.toFixed(1)} />
                  <MiniKPI label="Val. Estoque" value={fmtR$(detail.saldo_atual * detail.custo_base)} />
                </div>

                {/* Breakdown */}
                {detail.breakdown.length > 0 && (
                  <div className="bg-secondary/30 rounded-lg p-3 space-y-1.5">
                    <p className="text-[10px] font-semibold text-foreground uppercase tracking-wider">📋 Movimentações no Período</p>
                    {detail.breakdown.map((b, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px] py-1 border-b border-border/20 last:border-0">
                        <span className="text-foreground">{b.tipo}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground">{b.qtd.toFixed(1)}</span>
                          <span className="font-bold text-primary">{fmtR$(b.custo)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Price history */}
                {detail.preco_historico.length > 1 && (
                  <div className="bg-secondary/30 rounded-lg p-3 space-y-2">
                    <p className="text-[10px] font-semibold text-foreground uppercase tracking-wider">📊 Histórico de Preço</p>
                    <ResponsiveContainer width="100%" height={120}>
                      <LineChart data={[...detail.preco_historico].reverse()}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="data" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [fmtR$(v), 'Preço']} />
                        <Line type="monotone" dataKey="preco" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: 'hsl(var(--primary))', r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Weekly consumption */}
                {detail.consumo_semanal.length > 0 && detail.consumo_semanal.some(w => w.consumo > 0) && (
                  <div className="bg-secondary/30 rounded-lg p-3 space-y-2">
                    <p className="text-[10px] font-semibold text-foreground uppercase tracking-wider">📦 Consumo Semanal</p>
                    <ResponsiveContainer width="100%" height={120}>
                      <BarChart data={detail.consumo_semanal}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="semana" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [v.toFixed(1), 'Consumo']} />
                        <Bar dataKey="consumo" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Suppliers */}
                {detail.fornecedores.length > 0 && (
                  <div className="bg-secondary/30 rounded-lg p-3 space-y-1">
                    <p className="text-[10px] font-semibold text-foreground uppercase tracking-wider">🏢 Fornecedores Utilizados</p>
                    <div className="flex flex-wrap gap-1.5">
                      {detail.fornecedores.map((f, i) => (
                        <span key={i} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{f}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MiniKPI({ label, value, variant = 'default' }: { label: string; value: string; variant?: 'default' | 'destructive' }) {
  return (
    <div className="text-center">
      <p className="text-[9px] text-muted-foreground uppercase">{label}</p>
      <p className={`text-xs font-bold ${variant === 'destructive' ? 'text-destructive' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}

function RankingCard({ title, items }: { title: string; items: { nome: string; valor: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="bg-card border border-border rounded-xl p-3 space-y-1.5">
      <p className="text-[10px] font-semibold text-foreground uppercase tracking-wider">{title}</p>
      {items.slice(0, 10).map((item, i) => (
        <div key={i} className="flex items-center justify-between text-[11px] py-1 border-b border-border/20 last:border-0">
          <span className="text-foreground truncate max-w-[60%]">
            <span className="text-muted-foreground mr-1">#{i + 1}</span>
            {item.nome}
          </span>
          <span className="font-bold text-primary">{item.valor}</span>
        </div>
      ))}
    </div>
  );
}
