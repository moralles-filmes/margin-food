import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, RefreshCw, ExternalLink, ClipboardList } from 'lucide-react';
import { useSupabase, useCompanyScope } from '@/contexts/CompanyScopeContext';
import { useCan } from '@/permissions/hooks';
import { useDataEvent } from '@/lib/dataEvents';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { requestNavigation } from '@/hooks/useNavigationRequest';
import { normalizeSearchText } from '@/lib/utils';
import { fmtBRL, formatDateBR, parseLocalDate } from '@/lib/formatters';
import { todayBR } from '@/lib/datetime';
import { buildCategoryOptions } from '@/lib/categoriaOptions';
import { TIPOS_CODIGO_PAGAMENTO, type TipoCodigoPagamento } from '@/domain/financeiro/codigoPagamento';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateInput } from '@/components/ui/DateInput';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import AccessDenied from '@/components/ui/AccessDenied';
import StatusBadge from '@/components/ui/StatusBadge';
import SearchableSelect from '@/components/ui/SearchableSelect';
import MonthNavigator, { monthBounds } from './MonthNavigator';
import DateRangePresets from './DateRangePresets';
import { buildCategoriaFilterOptions, categoriaFiltroToParams } from './categoriaFiltro';
import CodigoPagamento from './CodigoPagamento';
import { FinScreenHeader, FinSectionGroup } from './finV2Layout';

interface PaymentCodeRow {
  id: string;
  descricao: string;
  fornecedor: string | null;
  categorias: string;
  data_vencimento: string;
  valor: number;
  status: string;
  status_exibicao: string;
  tipo_codigo_pagamento: TipoCodigoPagamento;
  codigo_pagamento: string;
}
interface Categoria { id: string; nome: string; codigo: string | null; parent_id: string | null }
interface Page { items: PaymentCodeRow[]; has_more: boolean; categorias: Categoria[] | null }
type DateMode = 'todos' | 'dia' | 'periodo' | 'mes';
const STATUS = {
  RASCUNHO: ['Rascunho', 'rascunho'],
  AGUARDANDO_APROVACAO: ['Aguardando aprovação', 'warning'],
  // A pagar em `info`, como em Contas a Pagar (D51) — "aprovado" no mapa genérico é verde, igual a pago.
  APROVADO: ['Aprovado', 'info'],
  PAGO: ['Pago', 'pago'],
  VENCIDO: ['Vencido', 'vencido'],
} as const;

function PaymentStatus({ value }: { value: string }) {
  const [label, status] = STATUS[value as keyof typeof STATUS] ?? [value, 'neutral'];
  return <StatusBadge label={label} status={status} />;
}

export default function CodigosPagamentoSection() {
  const canView = useCan('financeiro:pagar:view');
  const scope = useCompanyScope();
  // A troca de unidade descarta filtros, respostas pendentes e códigos da anterior.
  if (!canView) return <AccessDenied title="Acesso negado" description="Você não tem permissão para ver os códigos de pagamento." />;
  return <PaymentCodesList key={scope?.companyId ?? 'sem-empresa'} />;
}

function PaymentCodesList() {
  const supabase = useSupabase();
  const [items, setItems] = useState<PaymentCodeRow[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const query = useDebouncedValue(normalizeSearchText(search.trim()), 300);
  const [status, setStatus] = useState('todos');
  const [tipo, setTipo] = useState('todos');
  const [categoria, setCategoria] = useState('todos');
  const [dateMode, setDateMode] = useState<DateMode>('todos');
  const [day, setDay] = useState(todayBR);
  const [month, setMonth] = useState(() => todayBR().slice(0, 7));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const requestVersion = useRef(0);
  const bounds = dateMode === 'mes' ? monthBounds(month) : dateMode === 'dia' ? { start: day, end: day }
    : dateMode === 'periodo' ? { start: from, end: to } : { start: '', end: '' };
  const invalidPeriod = Boolean(bounds.start && bounds.end && bounds.start > bounds.end);
  const categoryOptions = useMemo(() => buildCategoriaFilterOptions(buildCategoryOptions(categorias)), [categorias]);

  const load = useCallback(async (cursor?: PaymentCodeRow) => {
    const version = ++requestVersion.current;
    if (invalidPeriod) { setItems([]); setLoading(false); return; }
    setLoading(true);
    setError(false);
    if (!cursor) { setItems([]); setHasMore(false); }
    try {
      const categoryParams = categoriaFiltroToParams(categoria);
      const { data, error: requestError } = await supabase.rpc('list_fin_codigos_pagamento', {
        p_status: status === 'todos' ? undefined : status,
        p_tipo: tipo === 'todos' ? undefined : tipo,
        p_search: query || undefined,
        p_data_de: bounds.start || undefined, p_data_ate: bounds.end || undefined,
        p_categoria_id: categoryParams.p_categoria_id ?? undefined,
        p_sem_categoria: categoryParams.p_sem_categoria,
        p_limit: 50, p_cursor_date: cursor?.data_vencimento, p_cursor_id: cursor?.id,
      });
      if (version !== requestVersion.current) return;
      if (requestError) throw requestError;
      const page = data as unknown as Page;
      setItems(previous => cursor ? [...previous, ...page.items] : page.items);
      setHasMore(page.has_more);
      if (page.categorias) setCategorias(page.categorias);
    } catch {
      if (version !== requestVersion.current) return;
      console.error('[CodigosPagamentoSection] Falha na consulta de códigos');
      setError(true);
      // Evita copiar dados antigos depois de uma falha de atualização.
      setItems([]);
      setHasMore(false);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [supabase, status, tipo, query, categoria, bounds.start, bounds.end, invalidPeriod]);

  useEffect(() => {
    void load();
    return () => { requestVersion.current += 1; };
  }, [load]);
  useDataEvent('financeiro:*', () => { void load(); });
  // Também atualiza alterações de outras sessões/computadores enquanto a tela está aberta.
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const clear = () => {
    setSearch(''); setStatus('todos'); setTipo('todos'); setCategoria('todos');
    setDateMode('todos'); setFrom(''); setTo(''); setDay(todayBR()); setMonth(todayBR().slice(0, 7));
  };
  const open = (id: string) => requestNavigation({ tab: 'financeiro', subtab: 'pagar', record: { type: 'conta_pagar', id } });

  // Amostra paginada (50 por vez): a legenda diz quantos códigos estão carregados, nunca um total.
  const legenda = items.length > 0
    ? `${items.length} ${items.length === 1 ? 'código carregado' : 'códigos carregados'}${hasMore ? ' — há mais para carregar' : ''}`
    : undefined;

  return (
    <div className="min-w-0 space-y-6">
      <FinScreenHeader
        title="Códigos de Pagamento"
        description="Consulte e copie os códigos cadastrados em Contas a Pagar."
        actions={<Button variant="outline" size="sm" onClick={() => { void load(); }} disabled={loading}><RefreshCw aria-hidden="true" className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Atualizar</Button>}
      />
      <div className="space-y-4 rounded-summary border bg-card p-4 shadow-card">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="sm:col-span-2">
            <Label htmlFor="busca-codigos">Buscar</Label>
            <div className="relative mt-1">
              <Search aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input id="busca-codigos" className="pl-9" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Fornecedor, categoria, descrição ou código" autoComplete="off" />
            </div>
          </div>
          <div><Label htmlFor="status-codigos">Status</Label>
            <Select value={status} onValueChange={setStatus}><SelectTrigger id="status-codigos" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="todos">Todos os status</SelectItem>
                {Object.entries(STATUS).map(([value, [label]]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent></Select>
          </div>
          <div><Label htmlFor="tipo-codigos">Tipo do código</Label>
            <Select value={tipo} onValueChange={setTipo}><SelectTrigger id="tipo-codigos" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="todos">Todos os tipos</SelectItem>
                {Object.entries(TIPOS_CODIGO_PAGAMENTO).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent></Select>
          </div>
          <div className="min-w-0"><span className="text-sm font-medium leading-none">Categoria</span><div className="mt-1"><SearchableSelect value={categoria} onValueChange={setCategoria} options={categoryOptions} placeholder="Todas as categorias" ariaLabel="Categoria" /></div></div>
          <div><Label htmlFor="vencimento-codigos">Vencimento</Label>
            <Select value={dateMode} onValueChange={v => setDateMode(v as DateMode)}><SelectTrigger id="vencimento-codigos" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="todos">Todo o período</SelectItem><SelectItem value="dia">Dia</SelectItem><SelectItem value="periodo">Período</SelectItem><SelectItem value="mes">Mês</SelectItem></SelectContent>
            </Select>
          </div>
          {dateMode === 'dia' && <div><Label htmlFor="dia-codigos">Data</Label><DateInput id="dia-codigos" value={day} onValueChange={setDay} className="mt-1" /></div>}
          {dateMode === 'mes' && <div className="self-end"><MonthNavigator value={month} onChange={setMonth} ariaLabel="Mês do vencimento" /></div>}
          {dateMode === 'periodo' && <>
            <div><Label htmlFor="inicio-codigos">De</Label><DateInput id="inicio-codigos" value={from} onValueChange={setFrom} className="mt-1" /></div>
            <div><Label htmlFor="fim-codigos">Até</Label><DateInput id="fim-codigos" value={to} onValueChange={setTo} className="mt-1" /></div>
          </>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <DateRangePresets from={bounds.start} to={bounds.end} onChange={(start, end) => { setDateMode('periodo'); setFrom(start); setTo(end); }} />
          <Button size="sm" variant="ghost" onClick={clear}>Limpar filtros</Button>
        </div>
      </div>
      <FinSectionGroup id="codigos-lista" title="Códigos" caption={legenda}>
        {invalidPeriod ? <p role="alert" className="text-sm text-destructive">A data final deve ser igual ou posterior à inicial.</p>
          : error ? <ErrorState title="Não foi possível carregar os códigos de pagamento." onRetry={() => { void load(); }} retrying={loading} />
          : <>
            {loading && items.length === 0 ? (
              <div role="status" className="space-y-3">
                <span className="sr-only">Carregando códigos</span>
                {[1, 2, 3].map(n => <Skeleton key={n} aria-hidden="true" className="h-24 w-full" />)}
              </div>
            ) : items.length === 0 ? (
              <EmptyState icon={ClipboardList} title="Nenhum código de pagamento encontrado para os filtros selecionados." />
            ) : (
              <div className="[container-type:inline-size]">
                {/* Contêiner largo: tabela. */}
                <div className="hidden rounded-xl border border-border bg-card [@container(min-width:60rem)]:block">
                  <Table className="table-fixed"><TableHeader><TableRow>
                    <TableHead className="w-[18%]">Fornecedor / conta</TableHead><TableHead className="w-[15%]">Categoria</TableHead>
                    <TableHead className="w-[11%]">Vencimento</TableHead><TableHead className="w-[12%] text-right">Valor</TableHead>
                    <TableHead className="w-[15%]">Status / tipo</TableHead><TableHead className="w-[29%]">Código</TableHead>
                  </TableRow></TableHeader><TableBody>{items.map(item => <TableRow key={item.id}>
                    <TableCell className="break-words align-top"><button className="rounded-sm text-left font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => open(item.id)}>{item.fornecedor || 'Sem fornecedor'}<ExternalLink aria-hidden="true" className="ml-1 inline h-3 w-3" /><span className="sr-only"> (abrir em Contas a Pagar)</span></button><p className="mt-1 text-xs text-muted-foreground">{item.descricao}</p></TableCell>
                    <TableCell className="break-words align-top text-xs">{item.categorias}</TableCell>
                    <TableCell className="align-top tabular-nums">{formatDateBR(parseLocalDate(item.data_vencimento))}</TableCell>
                    <TableCell className="align-top text-right font-medium tabular-nums">{fmtBRL(item.valor)}</TableCell>
                    <TableCell className="align-top"><PaymentStatus value={item.status_exibicao} /><p className="mt-2 text-xs">{TIPOS_CODIGO_PAGAMENTO[item.tipo_codigo_pagamento]}</p></TableCell>
                    <TableCell className="align-top"><CodigoPagamento codigo={item.codigo_pagamento} rotulo={item.fornecedor || item.descricao} /></TableCell>
                  </TableRow>)}</TableBody></Table>
                </div>
                {/* Contêiner estreito: cartões, sem rolagem horizontal. */}
                <div className="grid gap-3 [@container(min-width:40rem)]:grid-cols-2 [@container(min-width:60rem)]:hidden">{items.map(item => <article key={item.id} className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2"><button className="min-w-0 break-words rounded-sm text-left font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => open(item.id)}>{item.fornecedor || 'Sem fornecedor'}<ExternalLink aria-hidden="true" className="ml-1 inline h-3 w-3" /><span className="sr-only"> (abrir em Contas a Pagar)</span></button><PaymentStatus value={item.status_exibicao} /></div>
                  <p className="break-words text-xs text-muted-foreground">{item.descricao} · {item.categorias}</p>
                  <div className="flex flex-wrap justify-between gap-2 text-sm"><span className="tabular-nums">Vence {formatDateBR(parseLocalDate(item.data_vencimento))}</span><strong className="tabular-nums">{fmtBRL(item.valor)}</strong></div>
                  <p className="text-xs font-medium">{TIPOS_CODIGO_PAGAMENTO[item.tipo_codigo_pagamento]}</p>
                  <CodigoPagamento codigo={item.codigo_pagamento} rotulo={item.fornecedor || item.descricao} />
                </article>)}</div>
              </div>
            )}
            {hasMore && <div className="text-center"><Button variant="outline" disabled={loading} onClick={() => { void load(items[items.length - 1]); }}>{loading ? 'Carregando…' : 'Carregar mais'}</Button></div>}
          </>}
      </FinSectionGroup>
    </div>
  );
}
