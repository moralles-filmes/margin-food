import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useDataEvent } from '@/lib/dataEvents';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useCan } from '@/permissions/hooks';
import { toast } from 'sonner';
import { formatDateBR, todayBR, fmtBRL, formatPercentBR } from '@/lib/formatters';
import { formatDateBR as formatDateISO } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { APP_NAME } from '@/lib/brand';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from '@/lib/safeXlsx';
import DashboardCharts from '@/components/financeiro/DashboardCharts';
import {
  DollarSign, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  ChevronRight, RefreshCw, CalendarDays, AlertTriangle, FileDown, FileSpreadsheet,
  ArrowUp, ArrowDown, Minus,
} from 'lucide-react';

// ── Types ──

type FinSubTab = 'dashboard' | 'cadastros' | 'contas' | 'lancamentos' | 'pagar' | 'receber' | 'fluxo' | 'dre' | 'orcamento' | 'conciliacao' | 'alertas' | 'recorrencias' | 'categorizacao' | 'relatorio_socios' | 'projecao' | 'kpis' | 'auditoria' | 'comparativo' | 'fechamento';

interface DashboardSummary {
  saldoCaixa: number;
  aReceber: number;
  aPagar: number;
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

/** Calculate percentage change — delegates to official domain selector */
function pctChange(current: number, previous: number): number | null {
  return calcVariacaoPct(current, previous);
}

function DeltaBadge({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) {
  const pct = pctChange(current, previous);
  if (pct == null) return null;
  const isPositive = invert ? pct < 0 : pct > 0;
  const isNegative = invert ? pct > 0 : pct < 0;
  const Icon = pct > 0 ? ArrowUp : pct < 0 ? ArrowDown : Minus;
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[10px] font-medium rounded px-1 py-0.5',
      isPositive && 'text-success bg-success/10',
      isNegative && 'text-destructive bg-destructive/10',
      !isPositive && !isNegative && 'text-muted-foreground bg-muted'
    )}>
      <Icon className="w-2.5 h-2.5" />
      {formatPercentBR(Math.abs(pct), 1)}
    </span>
  );
}

// ── Component ──

export default function DashboardFinanceiroSection({ onNavigate }: { onNavigate?: (tab: FinSubTab) => void }) {
  const canView = useCan('financeiro:dashboard:view');
  const canExport = useCan('financeiro:dashboard:export');

  const [resumo, setResumo] = useState<DashboardSummary>({
    saldoCaixa: 0, aReceber: 0, aPagar: 0, receita: 0, despesa: 0, resultado: 0,
    receitaPrev: 0, despesaPrev: 0, resultadoPrev: 0,
  });
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
  }, [filterType, mesAno, selectedDate, periodoInicio, periodoFim]);

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
          ['Receita', fmtBRL(resumo.receita)],
          ['Despesa', fmtBRL(resumo.despesa)],
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
        { Indicador: 'Receita', Valor: resumo.receita },
        { Indicador: 'Despesa', Valor: resumo.despesa },
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

  const cards: { label: string; value: number; icon: typeof DollarSign; color: string; target?: FinSubTab; prevValue?: number; invertDelta?: boolean }[] = [
    { label: 'Saldo em Caixa', value: resumo.saldoCaixa, icon: DollarSign, color: 'text-success', target: 'fluxo' },
    { label: 'Contas a Receber', value: resumo.aReceber, icon: ArrowUpRight, color: 'text-primary', target: 'receber' },
    { label: 'Contas a Pagar', value: resumo.aPagar, icon: ArrowDownRight, color: 'text-warning', target: 'pagar' },
    { label: 'Receita do Período', value: resumo.receita, icon: TrendingUp, color: 'text-success', target: 'lancamentos', prevValue: resumo.receitaPrev },
    { label: 'Despesa do Período', value: resumo.despesa, icon: TrendingDown, color: 'text-destructive', target: 'lancamentos', prevValue: resumo.despesaPrev, invertDelta: true },
    { label: 'Resultado', value: resumo.resultado, icon: DollarSign, color: resumo.resultado >= 0 ? 'text-success' : 'text-destructive', target: 'dre', prevValue: resumo.resultadoPrev },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Dashboard Financeiro</h2>
          <p className="text-sm text-muted-foreground">Visão executiva consolidada</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-lg border border-border overflow-hidden h-9">
            <button
              onClick={() => setFilterType('dia')}
              className={cn('px-3 h-full text-xs font-medium transition-colors', filterType === 'dia' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:text-foreground')}
            >Dia</button>
            <button
              onClick={() => setFilterType('mes')}
              className={cn('px-3 h-full text-xs font-medium transition-colors', filterType === 'mes' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:text-foreground')}
            >Mês</button>
            <button
              onClick={() => setFilterType('periodo')}
              className={cn('px-3 h-full text-xs font-medium transition-colors', filterType === 'periodo' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:text-foreground')}
            >Período</button>
          </div>

          {filterType === 'mes' && (
            <Select value={mesAno} onValueChange={setMesAno}>
              <SelectTrigger className="w-[200px] h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {monthOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {filterType === 'dia' && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 w-[200px] justify-start text-left font-normal">
                  <CalendarDays className="w-4 h-4 mr-2" />
                  {format(selectedDate, "dd 'de' MMMM, yyyy", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={selectedDate} onSelect={(d) => d && setSelectedDate(d)} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          )}

          {filterType === 'periodo' && (
            <div className="flex items-center gap-2">
              <Input type="date" value={periodoInicio} onChange={e => setPeriodoInicio(e.target.value)} className="h-9 text-xs w-[140px]" />
              <span className="text-xs text-muted-foreground">a</span>
              <Input type="date" value={periodoFim} onChange={e => setPeriodoFim(e.target.value)} className="h-9 text-xs w-[140px]" />
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-28" />
            </CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {cards.map(c => {
            const Icon = c.icon;
            const isClickable = !!c.target && !!onNavigate;
            return (
              <Card
                key={c.label}
                className={cn(
                  'border-border/50 transition-all',
                  isClickable && 'cursor-pointer hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                )}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onClick={() => isClickable && onNavigate(c.target!)}
                onKeyDown={(e) => { if (isClickable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onNavigate(c.target!); } }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`w-4 h-4 ${c.color}`} />
                    <span className="text-[11px] text-muted-foreground font-medium truncate">{c.label}</span>
                    {isClickable && <ChevronRight className="w-3 h-3 text-muted-foreground/50 ml-auto" />}
                  </div>
                  <p className={`text-lg font-bold ${c.color}`}>{fmtBRL(c.value)}</p>
                  {c.prevValue !== undefined && (
                    <div className="mt-1">
                      <DeltaBadge current={c.value} previous={c.prevValue} invert={c.invertDelta} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <DashboardCharts />
    </div>
  );
}
