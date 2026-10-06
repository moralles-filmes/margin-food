import { useSupabase } from '@/contexts/CompanyScopeContext';
import { Fragment, useState, useEffect, useMemo, useCallback, type KeyboardEvent } from 'react';
import { useDataEvent } from '@/lib/dataEvents';
import { useCan } from '@/permissions/hooks';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, FileDown, Ban, ExternalLink, Wallet, Scale, Activity, ChevronRight, ChevronDown, CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import KpiCard from '@/components/ui/KpiCard';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { kpiGridClassFor, longestValueLength } from '@/components/ui/kpiGrid';
import { gerarPDFFluxoCaixa } from '@/lib/pdfFinanceiro';
import { fmtBRL, formatDateBR, parseLocalDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { useScopedToast } from '@/hooks/useScopedToast';
import * as XLSX from '@/lib/safeXlsx';
import { FinKpiGrid, FinNote, FinScreenHeader, FinSectionGroup } from './finV2Layout';
import { fluxoCaixaPeriodo, fluxoOrigem, isoToBR } from './fluxoCaixaView';

/* ─── Types ─── */
type EntidadeTipo = 'lancamento' | 'conta_pagar' | 'conta_receber';

export interface FluxoNavigateParams {
  tab: 'lancamentos' | 'pagar' | 'receber';
  dateFrom: string; // yyyy-MM-dd
  dateTo: string;   // yyyy-MM-dd
}

interface Detalhe {
  id?: string;
  entidade_tipo?: EntidadeTipo;
  tipo: 'realizado' | 'previsto';
  descricao: string;
  valor: number;
  natureza: 'entrada' | 'saida';
  origem: string;
}

interface DiaCashflow {
  data: string;
  entradas: number;
  saidas: number;
  prev_entradas: number;
  prev_saidas: number;
  detalhes: Detalhe[];
}

interface Totais {
  entradas: number;
  saidas: number;
  prev_entradas: number;
  prev_saidas: number;
  saldo_acumulado: number;
}

interface FluxoCaixaProps {
  onNavigate?: (params: FluxoNavigateParams) => void;
}

type Modo = 'realizado' | 'previsto' | 'ambos';

const MODO_OPTIONS = [
  { value: 'ambos', label: 'Real + Previsto' },
  { value: 'realizado', label: 'Só Realizado' },
  { value: 'previsto', label: 'Só Previsto' },
];

function SkeletonRows() {
  return (<>{Array.from({ length: 6 }).map((_, i) => (
    <TableRow key={i}>
      {Array.from({ length: 6 }).map((_, j) => (
        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
      ))}
    </TableRow>
  ))}</>);
}

function NoAccess() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Ban className="w-5 h-5 mr-2" /> Acesso negado
    </div>
  );
}

/** Valor da tabela: traço quando zero; previsto com o mesmo tom semântico e peso menor (sem opacidade). */
function ValorCell({ valor, tone, previsto }: { valor: number; tone: 'positive' | 'negative'; previsto?: boolean }) {
  return (
    <span className={cn(
      'tabular-nums whitespace-nowrap',
      tone === 'positive' ? 'text-success' : 'text-destructive',
      previsto ? 'font-normal' : 'font-medium',
    )}>
      {valor > 0 ? fmtBRL(valor) : '—'}
    </span>
  );
}

export default function FluxoCaixaSection({ onNavigate }: FluxoCaixaProps) {
  const toast = useScopedToast();
  const supabase = useSupabase();
  const canView = useCan('financeiro:fluxo:view');
  const canExport = useCan('financeiro:fluxo:export');

  const [dias, setDias] = useState<DiaCashflow[]>([]);
  const [totais, setTotais] = useState<Totais>({ entradas: 0, saidas: 0, prev_entradas: 0, prev_saidas: 0, saldo_acumulado: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  // Período dos dados exibidos (o do pedido que os trouxe), para o rótulo nunca descrever outro.
  const [periodoCarregado, setPeriodoCarregado] = useState<{ inicio: string; fim: string } | null>(null);
  const [modo, setModo] = useState<Modo>('ambos');
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  const navigateToDate = (date: string) => {
    if (!onNavigate) return;
    onNavigate({ tab: 'lancamentos', dateFrom: date, dateTo: date });
  };

  const navigateToDetail = (det: Detalhe, date: string) => {
    if (!onNavigate || !det.entidade_tipo) return;
    const tab = det.entidade_tipo === 'conta_pagar' ? 'pagar'
      : det.entidade_tipo === 'conta_receber' ? 'receber'
      : 'lancamentos';
    onNavigate({ tab, dateFrom: date, dateTo: date });
  };

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    const { inicio, fim: fimProj } = fluxoCaixaPeriodo(new Date());

    const { data, error } = await supabase.rpc('get_fin_cashflow', { p_inicio: inicio, p_fim: fimProj });
    if (error) { toast.error('Erro ao carregar fluxo de caixa'); console.error(error); setLoadError(true); setLoading(false); return; }
    // RULE FIN-FLUXO: RPC is the source of truth for daily cash flow
    const result = data as unknown as { dias?: DiaCashflow[]; totais?: Totais } | null;
    setDias(result?.dias || []);
    setTotais(result?.totais || { entradas: 0, saidas: 0, prev_entradas: 0, prev_saidas: 0, saldo_acumulado: 0 });
    setPeriodoCarregado({ inicio, fim: fimProj });
    setLoadError(false);
    setHasLoaded(true);
    setLoading(false);
  }, [canView, supabase, toast]);

  useEffect(() => { load(); }, [load]);
  useDataEvent('financeiro:lancamentos', load);
  useDataEvent('financeiro:pagar', load);
  useDataEvent('financeiro:receber', load);
  useDataEvent('financeiro:conciliacao', load);

  const filteredFluxo = useMemo(() => {
    if (modo === 'ambos') return dias;
    return dias.map(d => {
      if (modo === 'realizado') return { ...d, prev_entradas: 0, prev_saidas: 0 };
      return { ...d, entradas: 0, saidas: 0 };
    }).filter(d => {
      if (modo === 'realizado') return d.entradas > 0 || d.saidas > 0;
      return d.prev_entradas > 0 || d.prev_saidas > 0;
    });
  }, [dias, modo]);

  const saldoAcumulado = totais.entradas - totais.saidas;
  const saldoProjetado = (totais.entradas + totais.prev_entradas) - (totais.saidas + totais.prev_saidas);

  if (!canView) return <NoAccess />;

  const toggleExpand = (date: string) => {
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  };

  const fmt = fmtBRL;

  const exportExcel = () => {
    const rows = filteredFluxo.map(d => ({
      Data: formatDateBR(parseLocalDate(d.data)),
      Entradas: d.entradas,
      Saídas: d.saidas,
      'Prev. Entradas': d.prev_entradas,
      'Prev. Saídas': d.prev_saidas,
      'Saldo Dia': (d.entradas + d.prev_entradas) - (d.saidas + d.prev_saidas),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fluxo de Caixa');
    XLSX.writeFile(wb, 'fluxo_de_caixa.xlsx');
  };

  // ─── Presentation ───
  const periodo = periodoCarregado ?? fluxoCaixaPeriodo(new Date());
  const periodoLabel = `${isoToBR(periodo.inicio)} a ${isoToBR(periodo.fim)}`;

  const saldoDiaDe = (d: DiaCashflow) => (modo === 'realizado'
    ? d.entradas - d.saidas
    : modo === 'previsto'
      ? d.prev_entradas - d.prev_saidas
      : (d.entradas + d.prev_entradas) - (d.saidas + d.prev_saidas));

  const detalhesDe = (d: DiaCashflow) => (d.detalhes || []).filter(det => {
    if (modo === 'realizado') return det.tipo === 'realizado';
    if (modo === 'previsto') return det.tipo === 'previsto';
    return true;
  });

  type FluxoCard = { key: string; label: string; value: number; icon: typeof Wallet; tone: 'default' | 'positive' | 'negative'; sub?: string };
  const toneBySign = (v: number): FluxoCard['tone'] => (v < 0 ? 'negative' : 'positive');
  const flowCards: FluxoCard[] = [
    ...(modo !== 'previsto'
      ? [
          { key: 'entradas', label: 'Entradas realizadas', value: totais.entradas, icon: TrendingUp, tone: 'positive' as const, sub: 'No período' },
          { key: 'saidas', label: 'Saídas realizadas', value: totais.saidas, icon: TrendingDown, tone: 'negative' as const, sub: 'No período' },
          { key: 'resultado', label: 'Resultado realizado', value: saldoAcumulado, icon: Scale, tone: toneBySign(saldoAcumulado), sub: 'Entradas − saídas realizadas no período' },
        ]
      : [
          // get_fin_cashflow põe no previsto os títulos vencidos em aberto de qualquer data.
          { key: 'prev_entradas', label: 'Entradas previstas', value: totais.prev_entradas, icon: TrendingUp, tone: 'positive' as const, sub: 'Inclui vencidos em aberto antes do período' },
          { key: 'prev_saidas', label: 'Saídas previstas', value: totais.prev_saidas, icon: TrendingDown, tone: 'negative' as const, sub: 'Inclui vencidos em aberto antes do período' },
        ]),
    { key: 'projetado', label: 'Resultado projetado', value: saldoProjetado, icon: Activity, tone: toneBySign(saldoProjetado), sub: 'Realizado + previsto, com vencidos em aberto' },
  ];
  const resultadoDiaLabel = modo === 'realizado'
    ? 'Resultado realizado do dia'
    : modo === 'previsto' ? 'Resultado previsto do dia' : 'Resultado do dia';
  const vazioLabel = modo === 'realizado'
    ? 'Sem movimentações realizadas no período'
    : modo === 'previsto' ? 'Sem movimentações previstas no período' : 'Sem movimentações no período';
  const cardCount = flowCards.length + 1;
  const cardsGrid = kpiGridClassFor(
    longestValueLength([fmt(totais.saldo_acumulado), ...flowCards.map(c => fmt(c.value))]),
    cardCount === 4 ? 4 : 3,
  );

  const showRealizado = modo !== 'previsto';
  const showPrevisto = modo !== 'realizado';
  const colCount = 2 + (showRealizado ? 2 : 0) + (showPrevisto ? 2 : 0);

  const onDetailKeyDown = (e: KeyboardEvent, det: Detalhe, date: string) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigateToDetail(det, date); }
  };

  const expandButton = (date: string, isExpanded: boolean) => (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-md font-medium tabular-nums text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-expanded={isExpanded}
      aria-label={`${isExpanded ? 'Ocultar' : 'Mostrar'} detalhes de ${isoToBR(date)}`}
      onClick={e => { e.stopPropagation(); toggleExpand(date); }}
    >
      {isExpanded
        ? <ChevronDown aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
        : <ChevronRight aria-hidden="true" className="h-4 w-4 text-muted-foreground" />}
      {formatDateBR(parseLocalDate(date))}
    </button>
  );

  const goToDayButton = (date: string) => onNavigate && (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      title="Ver lançamentos do dia"
      aria-label={`Ver lançamentos de ${isoToBR(date)}`}
      onClick={e => { e.stopPropagation(); navigateToDate(date); }}
    >
      <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
    </Button>
  );

  const detalheRow = (det: Detalhe, date: string) => {
    const ob = fluxoOrigem(det.origem);
    const navegavel = !!(onNavigate && det.entidade_tipo);
    return {
      navegavel,
      ob,
      props: navegavel ? {
        tabIndex: 0,
        onClick: () => navigateToDetail(det, date),
        onKeyDown: (e: KeyboardEvent) => onDetailKeyDown(e, det, date),
      } : {},
    };
  };

  return (
    <div className="space-y-6">
      <FinScreenHeader
        title="Fluxo de Caixa"
        description={`Realizado e previsto de ${periodoLabel}`}
        actions={(
          <>
            {canExport && (
              <>
                <Button variant="outline" size="sm" onClick={() => gerarPDFFluxoCaixa({ periodo: 'Real + Projetado (2 meses)', totais: { entradas: totais.entradas, saidas: totais.saidas, previstoEntradas: totais.prev_entradas, previstoSaidas: totais.prev_saidas }, linhas: filteredFluxo.map(l => ({ data: l.data, entradas: l.entradas, saidas: l.saidas, previstoEntradas: l.prev_entradas, previstoSaidas: l.prev_saidas, saldoPrevisto: (l.entradas + l.prev_entradas) - (l.saidas + l.prev_saidas) })) })} disabled={filteredFluxo.length === 0}>
                  <FileDown className="w-4 h-4 mr-1" /> PDF
                </Button>
                <Button variant="outline" size="sm" onClick={exportExcel} disabled={filteredFluxo.length === 0}>
                  <FileDown className="w-4 h-4 mr-1" /> Excel
                </Button>
              </>
            )}
          </>
        )}
      />

      {/* Em 320 px as três opções não cabem: o controle rola sozinho, nunca a página. */}
      <div className="max-w-full overflow-x-auto">
        <SegmentedControl
          ariaLabel="Exibição"
          options={MODO_OPTIONS}
          value={modo}
          onChange={v => setModo(v as Modo)}
        />
      </div>

      {loadError && !loading && hasLoaded && (
        // Recarga falhou: os números continuam os da última carga, e o aviso diz isso.
        <ErrorState
          compact
          title="Não foi possível atualizar o fluxo de caixa"
          description="Os valores abaixo são da última carga."
          onRetry={load}
        />
      )}

      {loadError && !loading && !hasLoaded ? (
        <ErrorState title="Não foi possível carregar o fluxo de caixa" onRetry={load} />
      ) : !hasLoaded ? (
        <div className="space-y-6" aria-busy="true">
          <FinKpiGrid className={kpiGridClassFor(13, 3)}>
            {Array.from({ length: cardCount }).map((_, i) => (
              <div key={i} aria-hidden="true" className="rounded-summary border bg-card p-5 space-y-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-32" />
                <Skeleton className="h-3 w-40" />
              </div>
            ))}
          </FinKpiGrid>
          <Table><TableBody><SkeletonRows /></TableBody></Table>
        </div>
      ) : (
        <>
          <FinKpiGrid className={cardsGrid}>
            <KpiCard
              appearance="highlight"
              icon={Wallet}
              label="Saldo acumulado"
              value={fmt(totais.saldo_acumulado)}
              sub={`Saldo inicial das contas ativas + realizado até ${isoToBR(periodo.fim)}`}
            />
            {flowCards.map(card => (
              <KpiCard
                key={card.key}
                appearance="summary"
                icon={card.icon}
                label={card.label}
                value={fmt(card.value)}
                valueTone={card.tone}
                sub={card.sub}
              />
            ))}
          </FinKpiGrid>

          <FinSectionGroup id="fluxo-movimento-diario" title="Movimento diário" caption={periodoLabel}>
            {filteredFluxo.length === 0 ? (
              <EmptyState icon={CalendarRange} title={vazioLabel} />
            ) : (
              <div className="[container-type:inline-size]">
                {/* Larguras médias e grandes: tabela. */}
                <div className="hidden [@container(min-width:44rem)]:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        {showRealizado && <TableHead className="text-right">Entradas</TableHead>}
                        {showRealizado && <TableHead className="text-right">Saídas</TableHead>}
                        {showPrevisto && <TableHead className="text-right">Prev. Entradas</TableHead>}
                        {showPrevisto && <TableHead className="text-right">Prev. Saídas</TableHead>}
                        <TableHead className="text-right">{resultadoDiaLabel}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredFluxo.map(d => {
                        const isExpanded = expandedDates.has(d.data);
                        const saldoDia = saldoDiaDe(d);
                        const detalhes = detalhesDe(d);
                        return (
                          <Fragment key={`group-${d.data}`}>
                            <TableRow className="cursor-pointer hover:bg-card-hover" onClick={() => toggleExpand(d.data)}>
                              <TableCell className="text-sm">
                                <span className="inline-flex items-center gap-1">
                                  {expandButton(d.data, isExpanded)}
                                  {goToDayButton(d.data)}
                                </span>
                              </TableCell>
                              {showRealizado && <TableCell className="text-right"><ValorCell valor={d.entradas} tone="positive" /></TableCell>}
                              {showRealizado && <TableCell className="text-right"><ValorCell valor={d.saidas} tone="negative" /></TableCell>}
                              {showPrevisto && <TableCell className="text-right"><ValorCell valor={d.prev_entradas} tone="positive" previsto /></TableCell>}
                              {showPrevisto && <TableCell className="text-right"><ValorCell valor={d.prev_saidas} tone="negative" previsto /></TableCell>}
                              <TableCell className={cn('text-right font-bold tabular-nums whitespace-nowrap', saldoDia >= 0 ? 'text-success' : 'text-destructive')}>{fmt(saldoDia)}</TableCell>
                            </TableRow>
                            {isExpanded && detalhes.map((det, i) => {
                              const { navegavel, ob, props } = detalheRow(det, d.data);
                              return (
                                <TableRow
                                  key={`${d.data}-det-${i}`}
                                  className={cn('bg-muted', navegavel && 'cursor-pointer hover:bg-card-hover focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring')}
                                  {...props}
                                >
                                  <TableCell className="pl-10 text-xs text-muted-foreground whitespace-normal break-words max-w-xs">
                                    {navegavel && <ExternalLink aria-hidden="true" className="w-3 h-3 inline mr-1 text-muted-foreground" />}
                                    {det.descricao || '(sem descrição)'}
                                  </TableCell>
                                  <TableCell colSpan={colCount - 2} className="text-right">
                                    <span className={cn('text-xs font-medium tabular-nums whitespace-nowrap', det.natureza === 'entrada' ? 'text-success' : 'text-destructive')}>
                                      {det.natureza === 'entrada' ? '+' : '-'} {fmt(det.valor)}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <span className={cn('inline-flex whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-medium', ob.className)}>{ob.text}</span>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Larguras estreitas: um bloco por dia, sem rolagem horizontal. */}
                <ul className="space-y-2 [@container(min-width:44rem)]:hidden">
                  {filteredFluxo.map(d => {
                    const isExpanded = expandedDates.has(d.data);
                    const saldoDia = saldoDiaDe(d);
                    const detalhes = detalhesDe(d);
                    const linhas = [
                      ...(showRealizado ? [
                        { label: 'Entradas', valor: d.entradas, tone: 'positive' as const, previsto: false },
                        { label: 'Saídas', valor: d.saidas, tone: 'negative' as const, previsto: false },
                      ] : []),
                      ...(showPrevisto ? [
                        { label: 'Prev. entradas', valor: d.prev_entradas, tone: 'positive' as const, previsto: true },
                        { label: 'Prev. saídas', valor: d.prev_saidas, tone: 'negative' as const, previsto: true },
                      ] : []),
                    ];
                    return (
                      <li key={`m-${d.data}`} className="rounded-lg border bg-card p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1 text-sm">
                            {expandButton(d.data, isExpanded)}
                            {goToDayButton(d.data)}
                          </span>
                          <span className="text-right">
                            <span className="block text-[11px] text-muted-foreground">{resultadoDiaLabel}</span>
                            <span className={cn('text-sm font-bold tabular-nums whitespace-nowrap', saldoDia >= 0 ? 'text-success' : 'text-destructive')}>{fmt(saldoDia)}</span>
                          </span>
                        </div>
                        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                          {linhas.map(l => (
                            <div key={l.label} className="flex items-center justify-between gap-2">
                              <dt className="text-muted-foreground">{l.label}</dt>
                              <dd><ValorCell valor={l.valor} tone={l.tone} previsto={l.previsto} /></dd>
                            </div>
                          ))}
                        </dl>
                        {isExpanded && detalhes.length > 0 && (
                          <ul className="mt-3 space-y-1 border-t pt-2">
                            {detalhes.map((det, i) => {
                              const { navegavel, ob, props } = detalheRow(det, d.data);
                              return (
                                <li
                                  key={`${d.data}-mdet-${i}`}
                                  className={cn('flex items-start justify-between gap-2 rounded-md px-1 py-1 text-xs', navegavel && 'cursor-pointer hover:bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
                                  {...props}
                                >
                                  <span className="min-w-0 break-words text-muted-foreground">{det.descricao || '(sem descrição)'}</span>
                                  <span className="flex shrink-0 flex-col items-end gap-1">
                                    <span className={cn('font-medium tabular-nums whitespace-nowrap', det.natureza === 'entrada' ? 'text-success' : 'text-destructive')}>
                                      {det.natureza === 'entrada' ? '+' : '-'} {fmt(det.valor)}
                                    </span>
                                    <span className={cn('inline-flex whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-medium', ob.className)}>{ob.text}</span>
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <FinNote>Títulos vencidos em aberto entram como previstos na data de vencimento, mesmo antes do início do período.</FinNote>
          </FinSectionGroup>
        </>
      )}
    </div>
  );
}
