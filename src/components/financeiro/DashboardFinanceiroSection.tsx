import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useDataEvent } from '@/lib/dataEvents';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput } from '@/components/ui/DateInput';
import { DatePicker } from '@/components/ui/DatePicker';
import { Skeleton } from '@/components/ui/skeleton';
import KpiCard, { type KpiAppearance, type KpiCardDelta, type KpiVariant } from '@/components/ui/KpiCard';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useCan } from '@/permissions/hooks';
import { useScopedToast } from '@/hooks/useScopedToast';
import { todayBR, fmtBRL, formatPercentBR } from '@/lib/formatters';
import { formatDateISO } from '@/lib/datetime';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { APP_NAME } from '@/lib/brand';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from '@/lib/safeXlsx';
import DashboardCharts from '@/components/financeiro/DashboardCharts';
import {
  buildProvisionedComposition,
  formatDashboardDatesLabel,
  formatDashboardRangeLabel,
  isDashboardRangeInProgress,
  kpiGridClassFor,
  previousDashboardRange,
} from '@/components/financeiro/dashboardFinanceiroView';
import {
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Wallet, ReceiptText, BarChart3,
  RefreshCw, AlertTriangle, FileDown, FileSpreadsheet, CalendarDays, Info, Loader2,
  type LucideIcon,
} from 'lucide-react';

// ── Types ──

type FinSubTab = 'dashboard' | 'cadastros' | 'contas' | 'lancamentos' | 'pagar' | 'receber' | 'fluxo' | 'dre' | 'orcamento' | 'conciliacao' | 'alertas' | 'recorrencias' | 'categorizacao' | 'bordero' | 'projecao' | 'kpis' | 'auditoria' | 'comparativo' | 'fechamento';

/** Parâmetros de navegação de um card do dashboard para o sub-módulo de destino, com filtro aplicado */
export interface DashboardNavigateParams {
  tab: FinSubTab;
  status?: string;
  tipo?: 'RECEITA' | 'DESPESA';
  dateFrom?: string;
  dateTo?: string;
}

interface DashboardSummary {
  saldoCaixa: number;
  aReceber: number;
  aPagar: number;
  aPagarVencido: number;
  aPagarVencidoQtd: number;
  receita: number;
  despesa: number;
  resultado: number;
  receitaPrev: number;
  despesaPrev: number;
  resultadoPrev: number;
}

function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
      <AlertTriangle className="w-8 h-8" />
      <p className="text-sm">Você não tem permissão para acessar esta seção.</p>
    </div>
  );
}

import { calcVariacaoPct } from '@/domain/financeiro';

/** Builds the "vs. período anterior" comparison line for KpiCard's delta slot */
function buildDelta(current: number, previous: number, invert = false): KpiCardDelta | undefined {
  const pct = calcVariacaoPct(current, previous);
  if (pct == null) return undefined;
  const isPositive = invert ? pct < 0 : pct > 0;
  const isNegative = invert ? pct > 0 : pct < 0;
  return {
    label: 'vs. período anterior',
    formatted: formatPercentBR(Math.abs(pct), 1),
    direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat',
    tone: isPositive ? 'positive' : isNegative ? 'negative' : 'neutral',
  };
}

/** Período anterior zerado: sem variação calculável — só o rótulo, nenhum número novo. */
const NO_BASE_DELTA: KpiCardDelta = { label: 'vs. período anterior', formatted: 'Base zero', direction: 'none', tone: 'neutral' };

function KpiGroup({ id, title, caption, gridClassName, children }: { id: string; title: string; caption?: string; gridClassName: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 id={id} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        <div aria-hidden="true" className="hidden h-px min-w-6 flex-1 bg-border sm:block" />
        {caption && <p className="ml-auto text-xs text-muted-foreground sm:ml-0">{caption}</p>}
      </div>
      <div className="[container-type:inline-size]">
        <div className={gridClassName}>{children}</div>
      </div>
    </section>
  );
}

function DashboardNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-xs text-muted-foreground">
      <Info aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function KpiSkeletons() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-summary border bg-card p-5 shadow-card">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-40" />
        </div>
      ))}
    </>
  );
}

/** Composição de Despesas Provisionadas com os números já carregados do resumo — mesma fórmula do card. */
function ProvisionedExplanation({ total, despesa, aPagar, loading }: { total: number; despesa: number; aPagar: number; loading: boolean }) {
  const composition = buildProvisionedComposition(despesa, aPagar);
  return (
    <Card className="min-w-0 rounded-summary">
      <CardHeader className="space-y-1 p-5">
        <CardTitle className="leading-tight">Entenda as despesas provisionadas</CardTitle>
        <CardDescription>Despesa realizada + contas a pagar do período, sem somar duas vezes</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-5 pt-0">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Despesas provisionadas</p>
              <p className="mt-1 text-2xl font-bold leading-tight tracking-tight tabular-nums text-foreground">{fmtBRL(total)}</p>
            </div>
            {composition.realizadaPercent != null && composition.aPagarPercent != null && (
              <div aria-hidden="true" className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
                {composition.realizadaPercent > 0 && <div className="h-full bg-chart-1" style={{ width: `${composition.realizadaPercent}%` }} />}
                {composition.aPagarPercent > 0 && <div className="h-full bg-chart-7" style={{ width: `${composition.aPagarPercent}%` }} />}
              </div>
            )}
            <dl className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
              <div className="min-w-0">
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[2px] bg-chart-1" />
                  Despesa realizada
                </dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-foreground">{fmtBRL(despesa)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[2px] bg-chart-7" />
                  Contas a pagar
                </dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-foreground">{fmtBRL(aPagar)}</dd>
              </div>
            </dl>
            <p className="flex items-start gap-2 rounded-lg bg-primary-soft px-3 py-2.5 text-xs text-primary-soft-foreground">
              <Info aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />
              Este total já inclui a despesa realizada — não some com o card Despesa Realizada.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Component ──

export default function DashboardFinanceiroSection({ onNavigate }: { onNavigate?: (params: DashboardNavigateParams) => void }) {
  const toast = useScopedToast();
  const supabase = useSupabase();
  const canView = useCan('financeiro:dashboard:view');
  const canExport = useCan('financeiro:dashboard:export');

  const [resumo, setResumo] = useState<DashboardSummary>({
    saldoCaixa: 0, aReceber: 0, aPagar: 0, aPagarVencido: 0, aPagarVencidoQtd: 0, receita: 0, despesa: 0, resultado: 0,
    receitaPrev: 0, despesaPrev: 0, resultadoPrev: 0,
  });
  const despesasProvisionadas = resumo.despesa + resumo.aPagar;
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [filterType, setFilterType] = useState<'mes' | 'dia' | 'periodo'>('mes');
  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');

  const now = new Date();
  const [mesAno, setMesAno] = useState(() => {
    return todayBR().substring(0, 7);
  });
  const [selectedDate, setSelectedDate] = useState<Date>(now);
  const [appliedRange, setAppliedRange] = useState<{ start: string; endExclusive: string } | null>(null);
  // Período a que os valores de `resumo` pertencem — só muda quando a RPC responde. Os rótulos dos
  // cards seguem este, não o `appliedRange`, para nunca descrever um período que os números não são.
  const [resumoRange, setResumoRange] = useState<{ start: string; endExclusive: string } | null>(null);

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = format(d, 'MMMM, yyyy', { locale: ptBR });
    return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });

  // Stable ref for loadResumo to fix stale closure
  const loadResumoRef = useRef<() => void>(() => {});

  const loadResumo = useCallback(async () => {
    if (loading && resumo.receita !== 0) return;
    setLoading(true);
    try {
      let startDate: string;
      let endDateFinal: string;

      if (filterType === 'periodo') {
        if (!periodoInicio || !periodoFim) { setLoading(false); return; }
        if (periodoFim < periodoInicio) { toast.error('Data final deve ser maior ou igual à data inicial'); setLoading(false); return; }
        startDate = periodoInicio;
        const endD = new Date(periodoFim + 'T12:00:00');
        endD.setDate(endD.getDate() + 1);
        endDateFinal = formatDateISO(endD);
      } else if (filterType === 'dia') {
        startDate = format(selectedDate, 'yyyy-MM-dd');
        const nextDay = new Date(selectedDate);
        nextDay.setDate(nextDay.getDate() + 1);
        endDateFinal = format(nextDay, 'yyyy-MM-dd');
      } else {
        const [year, month] = mesAno.split('-').map(Number);
        startDate = `${mesAno}-01`;
        endDateFinal = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
      }

      setAppliedRange({ start: startDate, endExclusive: endDateFinal });

      const { data, error } = await supabase.rpc('get_fin_dashboard_summary', {
        p_start: startDate,
        p_end: endDateFinal,
      });

      if (error) throw error;
      if (data) {
        const d = data as Record<string, unknown>;
        setResumo({
          saldoCaixa: Number(d.saldo_caixa) || 0,
          aReceber: Number(d.a_receber) || 0,
          aPagar: Number(d.a_pagar) || 0,
          aPagarVencido: Number(d.a_pagar_vencido) || 0,
          aPagarVencidoQtd: Number(d.a_pagar_vencido_qtd) || 0,
          receita: Number(d.receita) || 0,
          despesa: Number(d.despesa) || 0,
          resultado: Number(d.resultado) || 0,
          receitaPrev: Number(d.receita_prev) || 0,
          despesaPrev: Number(d.despesa_prev) || 0,
          resultadoPrev: Number(d.resultado_prev) || 0,
        });
        setResumoRange({ start: startDate, endExclusive: endDateFinal });
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar resumo do dashboard');
    }
    setLoading(false);
  }, [loading, resumo.receita, filterType, supabase, periodoInicio, periodoFim, selectedDate, mesAno, toast]);

  // Keep ref in sync
  loadResumoRef.current = loadResumo;

  // Auto-refresh via data events - uses ref to avoid stale closure
  useDataEvent('financeiro:*', useCallback(() => loadResumoRef.current(), []));

  useEffect(() => {
    if (filterType === 'periodo') return;
    loadResumo();
  }, [mesAno, selectedDate, filterType]);

  // ── Export PDF ──
  const exportPdf = async () => {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(APP_NAME, 14, 15);
      doc.setFontSize(10);
      doc.text('Dashboard Financeiro', 14, 22);

      autoTable(doc, {
        startY: 30,
        head: [['Indicador', 'Valor']],
        body: [
          ['Saldo em Caixa', fmtBRL(resumo.saldoCaixa)],
          ['Contas a Receber', fmtBRL(resumo.aReceber)],
          ['Contas a Pagar', fmtBRL(resumo.aPagar)],
          ['Contas Vencidas', fmtBRL(resumo.aPagarVencido)],
          ['Receita', fmtBRL(resumo.receita)],
          ['Despesa Realizada', fmtBRL(resumo.despesa)],
          ['Despesas Provisionadas', fmtBRL(despesasProvisionadas)],
          ['Resultado', fmtBRL(resumo.resultado)],
        ],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [220, 80, 50], textColor: 255 },
      });

      doc.setFontSize(7);
      doc.text(`Gerado por ${APP_NAME}`, 14, doc.internal.pageSize.height - 10);
      doc.save('dashboard-financeiro.pdf');
      toast.success('PDF exportado');
    } catch {
      toast.error('Erro ao exportar PDF');
    }
    setExportingPdf(false);
  };

  // ── Export Excel ──
  const exportExcel = async () => {
    if (exportingExcel) return;
    setExportingExcel(true);
    try {
      const rows = [
        { Indicador: 'Saldo em Caixa', Valor: resumo.saldoCaixa },
        { Indicador: 'Contas a Receber', Valor: resumo.aReceber },
        { Indicador: 'Contas a Pagar', Valor: resumo.aPagar },
        { Indicador: 'Contas Vencidas', Valor: resumo.aPagarVencido },
        { Indicador: 'Receita', Valor: resumo.receita },
        { Indicador: 'Despesa Realizada', Valor: resumo.despesa },
        { Indicador: 'Despesas Provisionadas', Valor: despesasProvisionadas },
        { Indicador: 'Resultado', Valor: resumo.resultado },
      ];
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Dashboard');
      XLSX.writeFile(wb, 'dashboard-financeiro.xlsx');
      toast.success('Excel exportado');
    } catch {
      toast.error('Erro ao exportar Excel');
    }
    setExportingExcel(false);
  };

  if (!canView) return <NoAccess />;

  // Período aplicado no dashboard, para levar junto ao navegar para Lançamentos (data inclusiva)
  const rangeDateFrom = appliedRange?.start;
  const rangeDateTo = appliedRange
    ? (() => {
        const d = new Date(appliedRange.endExclusive + 'T12:00:00');
        d.setDate(d.getDate() - 1);
        return formatDateISO(d);
      })()
    : undefined;

  const vencidasAtivas = resumo.aPagarVencido !== 0 || resumo.aPagarVencidoQtd > 0;

  type DashboardCard = { label: string; value: number; icon: LucideIcon; variant: KpiVariant; appearance: KpiAppearance; valueTone?: 'default' | 'negative'; target?: FinSubTab; delta?: KpiCardDelta; sub?: string; status?: string; tipo?: 'RECEITA' | 'DESPESA'; dateFrom?: string; dateTo?: string };

  // Posição: saldo até o fim do período; receber/pagar com vencimento no período; vencidas até hoje (fora do período).
  const posicaoCards: DashboardCard[] = [
    { label: 'Saldo em Caixa', value: resumo.saldoCaixa, icon: Wallet, variant: 'success', appearance: 'highlight', target: 'fluxo', sub: 'Saldo realizado até o fim do período' },
    { label: 'Contas a Receber', value: resumo.aReceber, icon: ArrowUpRight, variant: 'primary', appearance: 'summary', target: 'receber', status: 'A_RECEBER', sub: 'Em aberto, com vencimento no período' },
    { label: 'Contas a Pagar', value: resumo.aPagar, icon: ArrowDownRight, variant: 'warning', appearance: 'summary', target: 'pagar', sub: 'Em aberto, com vencimento no período' },
    // Zero vencido é neutro: a cor de perigo só aparece quando existe conta vencida.
    { label: 'Contas Vencidas', value: resumo.aPagarVencido, icon: AlertTriangle, variant: vencidasAtivas ? 'danger' : 'default', appearance: 'summary', target: 'pagar', status: 'VENCIDO', sub: resumo.aPagarVencidoQtd > 0 ? `${resumo.aPagarVencidoQtd} boleto${resumo.aPagarVencidoQtd > 1 ? 's' : ''} · até hoje` : 'Nenhum boleto vencido até hoje' },
  ];
  const desempenhoCards: DashboardCard[] = [
    { label: 'Receita do Período', value: resumo.receita, icon: TrendingUp, variant: 'success', appearance: 'summary', target: 'lancamentos', tipo: 'RECEITA', dateFrom: rangeDateFrom, dateTo: rangeDateTo, delta: buildDelta(resumo.receita, resumo.receitaPrev) ?? NO_BASE_DELTA },
    { label: 'Despesa Realizada', value: resumo.despesa, icon: TrendingDown, variant: 'danger', appearance: 'summary', target: 'lancamentos', tipo: 'DESPESA', dateFrom: rangeDateFrom, dateTo: rangeDateTo, delta: buildDelta(resumo.despesa, resumo.despesaPrev, true) ?? NO_BASE_DELTA },
    { label: 'Despesas Provisionadas', value: despesasProvisionadas, icon: ReceiptText, variant: 'warning', appearance: 'summary', target: 'pagar', sub: 'Realizada + a pagar do período' },
    { label: 'Resultado', value: resumo.resultado, icon: BarChart3, variant: resumo.resultado >= 0 ? 'success' : 'danger', appearance: 'summary', valueTone: resumo.resultado < 0 ? 'negative' : 'default', target: 'dre', delta: buildDelta(resumo.resultado, resumo.resultadoPrev) ?? NO_BASE_DELTA },
  ];

  const renderCard = (c: DashboardCard) => (
    <KpiCard
      key={c.label}
      label={c.label}
      value={fmtBRL(c.value)}
      icon={c.icon}
      variant={c.variant}
      appearance={c.appearance}
      valueTone={c.valueTone}
      sub={c.sub}
      delta={c.delta}
      onClick={c.target && onNavigate ? () => onNavigate({ tab: c.target!, status: c.status, tipo: c.tipo, dateFrom: c.dateFrom, dateTo: c.dateTo }) : undefined}
    />
  );

  // Os dois grupos usam a mesma grade, decidida pelo valor mais longo dos oito cards.
  const kpiGrid = kpiGridClassFor(Math.max(...[...posicaoCards, ...desempenhoCards].map(c => fmtBRL(c.value).length)));
  // Rótulos dos cards: período dos valores exibidos. Gráficos e categorias: período aplicado (é o que eles carregam).
  const rangeLabel = resumoRange ? formatDashboardRangeLabel(resumoRange) : undefined;
  const rangeInProgress = resumoRange ? isDashboardRangeInProgress(resumoRange, todayBR()) : false;
  const comparativoLabel = resumoRange ? formatDashboardDatesLabel(previousDashboardRange(resumoRange)) : undefined;
  const chartsPeriodLabel = appliedRange ? formatDashboardRangeLabel(appliedRange) : undefined;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div>
          <h2 className="text-[22px] font-bold leading-tight tracking-tight text-foreground sm:text-2xl">Dashboard Financeiro</h2>
          <p className="mt-1 text-sm text-muted-foreground">Seu caixa, compromissos e resultados em um só lugar.</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              options={[
                { value: 'dia', label: 'Dia' },
                { value: 'mes', label: 'Mês' },
                { value: 'periodo', label: 'Período' },
              ]}
              value={filterType}
              onChange={(v) => setFilterType(v as 'mes' | 'dia' | 'periodo')}
            />

            {filterType === 'mes' && (
              <Select value={mesAno} onValueChange={setMesAno}>
                <SelectTrigger className="h-9 w-[200px] text-sm" aria-label="Mês do resumo">
                  {/* div (não span): o SelectTrigger aplica line-clamp ao span filho e empilharia o ícone. */}
                  <div className="flex min-w-0 items-center gap-2 [&>span]:truncate">
                    <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            {filterType === 'dia' && (
              <DatePicker
                date={selectedDate}
                onDateChange={d => d && setSelectedDate(d)}
                formatValue={d => format(d, "dd 'de' MMMM, yyyy", { locale: ptBR })}
                className="h-9 w-[200px]"
                aria-label="Dia do resumo"
              />
            )}

            {filterType === 'periodo' && (
              <div className="flex flex-wrap items-center gap-2">
                <DateInput value={periodoInicio} onValueChange={setPeriodoInicio} className="h-9 text-xs w-[140px]" aria-label="Data inicial" />
                <span className="text-xs text-muted-foreground">a</span>
                <DateInput value={periodoFim} onValueChange={setPeriodoFim} className="h-9 text-xs w-[140px]" aria-label="Data final" />
                <Button size="sm" className="h-9" onClick={loadResumo} disabled={loading || !periodoInicio || !periodoFim}>Aplicar</Button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadResumo} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
            </Button>

            {canExport && (
              <>
                <Button variant="outline" size="sm" onClick={exportPdf} disabled={exportingPdf} aria-busy={exportingPdf || undefined}>
                  {exportingPdf ? <Loader2 aria-hidden="true" className="w-4 h-4 mr-1 animate-spin" /> : <FileDown className="w-4 h-4 mr-1" />} PDF
                </Button>
                <Button variant="outline" size="sm" onClick={exportExcel} disabled={exportingExcel} aria-busy={exportingExcel || undefined}>
                  {exportingExcel ? <Loader2 aria-hidden="true" className="w-4 h-4 mr-1 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-1" />} Excel
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards — dois grupos de quatro */}
      <div className="space-y-6">
        <div className="space-y-3">
          <KpiGroup id="dash-fin-posicao" title="Posição Financeira" caption={rangeLabel ? `Caixa e compromissos · ${rangeLabel}` : 'Caixa e compromissos'} gridClassName={kpiGrid}>
            {loading ? <KpiSkeletons /> : posicaoCards.map(renderCard)}
          </KpiGroup>
          {/* O card de vencidas não segue o período e conta só estes status (get_fin_dashboard_summary). */}
          <DashboardNote>Contas Vencidas: boletos aprovados ou aguardando aprovação com vencimento antes de hoje, em qualquer período.</DashboardNote>
        </div>

        <div className="space-y-3">
          <KpiGroup id="dash-fin-desempenho" title="Desempenho do Período" caption={rangeLabel} gridClassName={kpiGrid}>
            {loading ? <KpiSkeletons /> : desempenhoCards.map(renderCard)}
          </KpiGroup>
          {comparativoLabel && (
            <DashboardNote>Comparativo “vs. período anterior”: {comparativoLabel}, a mesma duração do período do resumo.</DashboardNote>
          )}
          {rangeInProgress && (
            <DashboardNote>Período em andamento: receita, despesa e resultado vão até hoje; contas a pagar e a receber incluem vencimentos até o fim do período.</DashboardNote>
          )}
        </div>
      </div>

      {appliedRange && (
        <DashboardCharts
          periodStart={appliedRange.start}
          periodEndExclusive={appliedRange.endExclusive}
          periodLabel={chartsPeriodLabel}
          expenseAside={(
            <ProvisionedExplanation
              total={despesasProvisionadas}
              despesa={resumo.despesa}
              aPagar={resumo.aPagar}
              loading={loading}
            />
          )}
        />
      )}
    </div>
  );
}
