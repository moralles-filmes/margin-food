import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useDataEvent } from '@/lib/dataEvents';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput } from '@/components/ui/DateInput';
import { DatePicker } from '@/components/ui/DatePicker';
import { Skeleton } from '@/components/ui/skeleton';
import KpiCard, { type KpiCardDelta, type KpiVariant } from '@/components/ui/KpiCard';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useCan } from '@/permissions/hooks';
import { toast } from 'sonner';
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
  DollarSign, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  RefreshCw, AlertTriangle, FileDown, FileSpreadsheet,
} from 'lucide-react';

// ── Types ──

type FinSubTab = 'dashboard' | 'cadastros' | 'contas' | 'lancamentos' | 'pagar' | 'receber' | 'fluxo' | 'dre' | 'orcamento' | 'conciliacao' | 'alertas' | 'recorrencias' | 'categorizacao' | 'relatorio_socios' | 'projecao' | 'kpis' | 'auditoria' | 'comparativo' | 'fechamento';

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

// ── Component ──

export default function DashboardFinanceiroSection({ onNavigate }: { onNavigate?: (tab: FinSubTab) => void }) {
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
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar resumo do dashboard');
    }
    setLoading(false);
  }, [loading, resumo.receita, filterType, supabase, periodoInicio, periodoFim, selectedDate, mesAno]);

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

  const cards: { label: string; value: number; icon: typeof DollarSign; variant: KpiVariant; target?: FinSubTab; delta?: KpiCardDelta; sub?: string }[] = [
    { label: 'Saldo em Caixa', value: resumo.saldoCaixa, icon: DollarSign, variant: 'success', target: 'fluxo' },
    { label: 'Contas a Receber', value: resumo.aReceber, icon: ArrowUpRight, variant: 'primary', target: 'receber' },
    { label: 'Contas a Pagar', value: resumo.aPagar, icon: ArrowDownRight, variant: 'warning', target: 'pagar' },
    { label: 'Contas Vencidas', value: resumo.aPagarVencido, icon: AlertTriangle, variant: 'danger', target: 'pagar', sub: resumo.aPagarVencidoQtd > 0 ? `${resumo.aPagarVencidoQtd} boleto${resumo.aPagarVencidoQtd > 1 ? 's' : ''}` : undefined },
    { label: 'Receita do Período', value: resumo.receita, icon: TrendingUp, variant: 'success', target: 'lancamentos', delta: buildDelta(resumo.receita, resumo.receitaPrev) },
    { label: 'Despesa Realizada', value: resumo.despesa, icon: TrendingDown, variant: 'danger', target: 'lancamentos', delta: buildDelta(resumo.despesa, resumo.despesaPrev, true) },
    { label: 'Despesas Provisionadas', value: despesasProvisionadas, icon: DollarSign, variant: 'warning', target: 'pagar' },
    { label: 'Resultado', value: resumo.resultado, icon: DollarSign, variant: resumo.resultado >= 0 ? 'success' : 'danger', target: 'dre', delta: buildDelta(resumo.resultado, resumo.resultadoPrev) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Dashboard Financeiro</h2>
          <p className="text-sm text-muted-foreground">Visão executiva consolidada</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
              <SelectTrigger className="w-[200px] h-9 text-sm"><SelectValue /></SelectTrigger>
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
            />
          )}

          {filterType === 'periodo' && (
            <div className="flex items-center gap-2">
              <DateInput value={periodoInicio} onValueChange={setPeriodoInicio} className="h-9 text-xs w-[140px]" />
              <span className="text-xs text-muted-foreground">a</span>
              <DateInput value={periodoFim} onValueChange={setPeriodoFim} className="h-9 text-xs w-[140px]" />
              <Button size="sm" className="h-9" onClick={loadResumo} disabled={loading || !periodoInicio || !periodoFim}>Aplicar</Button>
            </div>
          )}

          <Button variant="outline" size="sm" onClick={loadResumo} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>

          {canExport && (
            <>
              <Button variant="outline" size="sm" onClick={exportPdf} disabled={exportingPdf}>
                <FileDown className="w-4 h-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={exportExcel} disabled={exportingExcel}>
                <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
              </Button>
            </>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-8 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-28" />
            </CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-8 gap-3">
          {cards.map(c => (
            <KpiCard
              key={c.label}
              label={c.label}
              value={fmtBRL(c.value)}
              icon={c.icon}
              variant={c.variant}
              sub={c.sub}
              delta={c.delta}
              onClick={c.target && onNavigate ? () => onNavigate(c.target!) : undefined}
            />
          ))}
        </div>
      )}

      {appliedRange && (
        <DashboardCharts periodStart={appliedRange.start} periodEndExclusive={appliedRange.endExclusive} />
      )}
    </div>
  );
}
