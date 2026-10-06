import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useEmitDataEvent, useDataEvent } from '@/lib/dataEvents';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import StatusBadge, { type StatusType } from '@/components/ui/StatusBadge';
import ErrorState from '@/components/ui/ErrorState';
import AccessDenied from '@/components/ui/AccessDenied';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useCan } from '@/permissions/hooks';
import { useScopedToast } from '@/hooks/useScopedToast';
import { RefreshCw, Repeat, Play, ExternalLink, Download } from 'lucide-react';
import { fmtBRL, todayBR } from '@/lib/formatters';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import * as XLSX from '@/lib/safeXlsx';
import { traduzirErroIdempotencia } from '@/domain/financeiro/idempotencia';
import { FinScreenHeader, FinSectionGroup } from './finV2Layout';

// ─── Types ───
type OrigemType = 'lancamento' | 'conta_pagar' | 'conta_receber';

interface RecorrenciaConsolidada {
  id: string;
  origem: OrigemType;
  chave_unica: string;
  descricao: string;
  tipo: string;
  status: string;
  valor: number;
  dia_vencimento: number | null;
  frequencia: string;
  ativo: boolean;
  proxima_data: string | null;
  filhos_mes: number;
  gerado_mes: boolean;
  updated_at: string;
  parcelas_geradas: number;
  parcelas_max: number;
}

// ─── Constants ───
const PAGE_SIZE = 50;

const ORIGEM_LABELS: Record<OrigemType, string> = {
  lancamento: 'Livro Razão',
  conta_pagar: 'Contas a Pagar',
  conta_receber: 'Contas a Receber',
};

/** Tipo com cor semântica (como no Livro Razão); valor desconhecido aparece cru, em neutro. */
const TIPO_BADGE: Record<string, { label: string; status: StatusType }> = {
  RECEITA: { label: 'Receita', status: 'success' },
  DESPESA: { label: 'Despesa', status: 'danger' },
};

const ORIGEM_TAB: Record<OrigemType, string> = {
  lancamento: 'lancamentos',
  conta_pagar: 'pagar',
  conta_receber: 'receber',
};

const FREQ_LABELS: Record<string, string> = {
  mensal: 'Mensal',
  semanal: 'Semanal',
  quinzenal: 'Quinzenal',
  anual: 'Anual',
  trimestral: 'Trimestral',
};

interface Props {
  onNavigate?: (tab: string) => void;
}

export default function RecorrenciasSection({ onNavigate }: Props) {
  const emitDataEvent = useEmitDataEvent();
  const toast = useScopedToast();
  const supabase = useSupabase();
  const canView = useCan('financeiro:recorrencias:view');
  const canCreate = useCan('financeiro:recorrencias:create');
  const canExport = useCan('financeiro:recorrencias:export');

  const [items, setItems] = useState<RecorrenciaConsolidada[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursorData, setCursorData] = useState<string | null>(null);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [errorState, setErrorState] = useState(false);
  const [gerandoById, setGerandoById] = useState<Record<string, boolean>>({});
  // Trava síncrona por linha: `gerandoById` só desabilita o botão no próximo render.
  const gerandoRef = useRef<Set<string>>(new Set());

  const now = new Date();
  const [mesAno, setMesAno] = useState(() => {
    return todayBR().substring(0, 7);
  });

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = format(d, 'MMMM, yyyy', { locale: ptBR });
    return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });

  // ─── Debounce ───
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedReload = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadPage(null, null, true), 500);
  }, []);

  // ─── Load page ───
  const loadPage = useCallback(async (
    cData: string | null,
    cId: string | null,
    reset: boolean
  ) => {
    if (reset) {
      setLoading(true);
      setErrorState(false);
    } else {
      setLoadingMore(true);
    }

    try {
      const { data, error } = await supabase.rpc('_guarded_list_recorrencias', {
        p_cursor_data: cData,
        p_cursor_id: cId,
        p_limit: PAGE_SIZE,
        p_mes: mesAno,
      });

      if (error) {
        toast.error('Erro ao carregar recorrências');
        console.error(error);
        setErrorState(true);
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      const result = data as unknown as {
        items: RecorrenciaConsolidada[];
        has_more: boolean;
        next_cursor_data: string | null;
        next_cursor_id: string | null;
      };

      const newItems = result.items || [];

      if (reset) {
        setItems(newItems);
      } else {
        setItems(prev => {
          const existing = new Set(prev.map(p => p.chave_unica));
          const unique = newItems.filter(n => !existing.has(n.chave_unica));
          return [...prev, ...unique];
        });
      }

      setHasMore(result.has_more);
      setCursorData(result.next_cursor_data);
      setCursorId(result.next_cursor_id);
    } catch (err) {
      console.error(err);
      toast.error('Erro inesperado ao carregar recorrências');
      setErrorState(true);
    }

    setLoading(false);
    setLoadingMore(false);
  }, [mesAno, supabase, toast]);

  useEffect(() => {
    if (canView) loadPage(null, null, true);
  }, [mesAno, canView, loadPage]);

  // ─── Reactivity (debounced) ───
  useDataEvent('financeiro:recorrencias', debouncedReload);
  useDataEvent('financeiro:lancamentos', debouncedReload);
  useDataEvent('financeiro:pagar', debouncedReload);
  useDataEvent('financeiro:receber', debouncedReload);

  // ─── Generate parcela ───
  const gerarParcela = async (item: RecorrenciaConsolidada) => {
    if (item.origem !== 'lancamento') {
      toast.info('Geração de parcela disponível apenas para recorrências do Livro Razão');
      return;
    }

    const rowKey = item.chave_unica;
    if (gerandoRef.current.has(rowKey)) return;
    gerandoRef.current.add(rowKey);
    setGerandoById(prev => ({ ...prev, [rowKey]: true }));
    try {
      // O número da parcela vem do que a tela mostra, não do contador do servidor:
      // repetir depois de uma resposta perdida devolve a mesma parcela em vez de
      // gerar a seguinte.
      const { data, error } = await supabase.rpc('gerar_parcela_recorrente', {
        p_lancamento_pai_id: item.id,
        p_parcela_esperada: (item.parcelas_geradas ?? 0) + 1,
      });

      if (error) {
        console.error('[RecorrenciasSection.gerarParcela]', error);
        if (error.message?.includes('PERMISSION_DENIED')) {
          toast.error('Seu perfil não possui permissão para gerar parcelas recorrentes.');
        } else {
          toast.error(traduzirErroIdempotencia(error.message) ?? error.message);
        }
        if (error.message?.includes('PARCELA_FORA_DE_ORDEM')) loadPage(null, null, true);
        return;
      }

      const result = data as Record<string, unknown>;
      if (result?.status === 'noop') {
        toast.info((result.message as string) || 'Parcela já existia');
      } else {
        toast.success(`Parcela ${result?.parcela_num || ''} gerada!`);
      }

      // Emit events
      emitDataEvent('financeiro:recorrencias');
      emitDataEvent('financeiro:lancamentos');

      // Reload
      loadPage(null, null, true);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao gerar parcela');
    } finally {
      gerandoRef.current.delete(rowKey);
      setGerandoById(prev => ({ ...prev, [rowKey]: false }));
    }
  };

  // ─── Navigate to origin ───
  const handleOpenOrigem = (item: RecorrenciaConsolidada) => {
    if (!onNavigate) return;
    onNavigate(ORIGEM_TAB[item.origem] || 'lancamentos');
  };

  // ─── Export Excel ───
  const handleExportExcel = () => {
    const rows = items.map(r => ({
      Origem: ORIGEM_LABELS[r.origem] || r.origem,
      Descrição: r.descricao,
      Tipo: r.tipo,
      Valor: r.valor,
      Frequência: FREQ_LABELS[r.frequencia] || r.frequencia,
      'Próxima Data': r.proxima_data || '—',
      'Filhos no Mês': r.filhos_mes,
      'Gerado no Mês': r.gerado_mes ? 'Sim' : 'Não',
      Ativo: r.ativo ? 'Sim' : 'Não',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Recorrências');
    XLSX.writeFile(wb, `recorrencias-${mesAno}.xlsx`);
    toast.success('Exportação concluída');
  };

  // ─── RBAC gate ───
  if (!canView) return <AccessDenied description="Você não tem permissão para visualizar as recorrências financeiras." />;

  // Contagens só das recorrências carregadas (a lista é paginada): a legenda diz isso.
  const pendentesCarregadas = items.filter(item => !item.gerado_mes).length;
  const legenda = items.length > 0
    ? `${items.length} ${items.length === 1 ? 'carregada' : 'carregadas'}${hasMore ? ' (há mais)' : ''} · ${pendentesCarregadas} ${pendentesCarregadas === 1 ? 'pendente' : 'pendentes'} no mês entre as carregadas`
    : undefined;

  const tipoBadge = (tipo: string) => TIPO_BADGE[tipo] ?? { label: tipo, status: 'neutral' as StatusType };

  const origemChip = (item: RecorrenciaConsolidada) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex cursor-help items-center whitespace-nowrap rounded-full border border-neutral-border bg-neutral-soft px-2 py-0.5 text-[10px] font-semibold leading-tight text-neutral focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {ORIGEM_LABELS[item.origem]}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        Recorrência criada em {ORIGEM_LABELS[item.origem]}
      </TooltipContent>
    </Tooltip>
  );

  const statusMes = (item: RecorrenciaConsolidada) => (item.gerado_mes
    ? <StatusBadge status="success" label={`${item.filhos_mes} lançada(s)`} />
    : <StatusBadge status="warning" label="Pendente" />);

  const acoes = (item: RecorrenciaConsolidada) => {
    const isGerando = gerandoById[item.chave_unica] ?? false;
    const maxReached = item.parcelas_max > 0 && item.parcelas_geradas >= item.parcelas_max;
    return (
      <div className="flex items-center justify-end gap-1">
        {item.origem === 'lancamento' && canCreate && (
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => gerarParcela(item)}
            disabled={isGerando || maxReached}
            aria-label={`Gerar parcela de ${item.descricao}`}
          >
            {isGerando ? (
              <RefreshCw aria-hidden="true" className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Play aria-hidden="true" className="w-3 h-3 mr-1" />
            )}
            Gerar
          </Button>
        )}
        {onNavigate && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleOpenOrigem(item)} aria-label={`Abrir ${ORIGEM_LABELS[item.origem]}`}>
                <ExternalLink aria-hidden="true" className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Abrir {ORIGEM_LABELS[item.origem]}</TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  };

  const parcelas = (item: RecorrenciaConsolidada) => `${item.parcelas_geradas}/${item.parcelas_max > 0 ? item.parcelas_max : '∞'}`;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <FinScreenHeader
          title="Recorrências do Mês"
          description="Visão consolidada de todas as recorrências financeiras"
          actions={(
            <>
              {canExport && items.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleExportExcel}>
                  <Download aria-hidden="true" className="w-4 h-4 mr-1" /> Excel
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => loadPage(null, null, true)} disabled={loading}>
                <RefreshCw aria-hidden="true" className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
              </Button>
            </>
          )}
        />

        <div className="flex flex-wrap items-end gap-3 rounded-summary border bg-card p-4 shadow-card">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="recorrencias-mes" className="text-xs text-muted-foreground">Mês</Label>
            <Select value={mesAno} onValueChange={setMesAno}>
              <SelectTrigger id="recorrencias-mes" className="h-9 w-[200px] max-w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {monthOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="pb-2 text-xs text-muted-foreground">“Pendente” = nenhuma parcela lançada neste mês.</p>
        </div>

        <FinSectionGroup id="recorrencias-lista" title="Recorrências" caption={!errorState ? legenda : undefined}>
          {errorState && !loading ? (
            <ErrorState
              title="Erro ao carregar recorrências"
              description="Tente novamente ou contate o administrador."
              onRetry={() => loadPage(null, null, true)}
            />
          ) : loading ? (
            <div role="status" className="space-y-2">
              <span className="sr-only">Carregando recorrências…</span>
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} aria-hidden="true" className="h-11 w-full rounded-md" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="space-y-3 rounded-xl border border-dashed border-border bg-card p-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Repeat aria-hidden="true" className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="font-medium text-foreground">Nenhuma recorrência cadastrada</p>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">Para criar, vá em <strong className="text-foreground">Lançamentos</strong>, <strong className="text-foreground">Contas a Pagar</strong> ou <strong className="text-foreground">Contas a Receber</strong> e ative a opção "Recorrente".</p>
            </div>
          ) : (
            <div className="[container-type:inline-size]">
              {/* Contêiner largo: tabela. */}
              <div className="hidden [@container(min-width:48rem)]:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Frequência</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Parcelas</TableHead>
                      <TableHead>Status no Mês</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map(item => {
                      const tipo = tipoBadge(item.tipo);
                      return (
                        <TableRow key={item.chave_unica}>
                          <TableCell className="max-w-xs whitespace-normal break-words font-medium">{item.descricao}</TableCell>
                          <TableCell><StatusBadge status={tipo.status} label={tipo.label} /></TableCell>
                          <TableCell>{origemChip(item)}</TableCell>
                          <TableCell className="text-sm">{FREQ_LABELS[item.frequencia] || item.frequencia || '—'}</TableCell>
                          <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">{fmtBRL(item.valor)}</TableCell>
                          <TableCell className="text-sm tabular-nums text-muted-foreground">{parcelas(item)}</TableCell>
                          <TableCell>{statusMes(item)}</TableCell>
                          <TableCell>{acoes(item)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {/* Contêiner estreito: lista empilhada, sem rolagem horizontal. */}
              <ul className="space-y-2 [@container(min-width:48rem)]:hidden">
                {items.map(item => {
                  const tipo = tipoBadge(item.tipo);
                  return (
                    <li key={item.chave_unica} className="space-y-2 rounded-lg border bg-card p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 break-words text-sm font-medium text-foreground">{item.descricao}</p>
                        <p className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">{fmtBRL(item.valor)}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <StatusBadge status={tipo.status} label={tipo.label} />
                        {origemChip(item)}
                        <span>{FREQ_LABELS[item.frequencia] || item.frequencia || '—'}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">Parcelas {parcelas(item)}</span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {statusMes(item)}
                        {acoes(item)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Load more */}
          {hasMore && !loading && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadPage(cursorData, cursorId, false)}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <RefreshCw aria-hidden="true" className="w-4 h-4 mr-1 animate-spin" />
                ) : null}
                Carregar mais
              </Button>
            </div>
          )}
        </FinSectionGroup>
      </div>
    </TooltipProvider>
  );
}
