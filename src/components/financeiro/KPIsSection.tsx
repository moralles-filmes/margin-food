import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useScopedToast } from '@/hooks/useScopedToast';
import { RefreshCw, TrendingUp, TrendingDown, Clock, AlertTriangle, DollarSign, BarChart3, Users, Calendar, FileDown, Ban } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fmtBRL, formatPercentBR, formatIntegerBR } from '@/lib/formatters';
import { axisProps, gridProps, tooltipProps, SEMANTIC_CHART_COLORS, chartValueFormatters } from '@/lib/chartTheme';
import { ChartTooltip } from '@/components/ui/ChartTooltip';
import KpiCard from '@/components/ui/KpiCard';
import { useCan } from '@/permissions/hooks';
import { useDataEvent } from '@/lib/dataEvents';
import * as XLSX from '@/lib/safeXlsx';

/* ─── Types ─── */
type KPIFornecedor = { nome: string; total: number };
type KPIMensal = { mes: string; receita: number; despesa: number };

interface FinKPIsResponse {
  receita_total: number;
  despesa_total: number;
  margem: number;
  ticket_medio: number;
  inadimplencia: number;
  total_vencido: number;
  prazo_medio_pagamento: number;
  prazo_medio_recebimento: number;
  receita_por_mes: KPIMensal[];
  top_fornecedores: KPIFornecedor[];
}

interface KPIs {
  receitaTotal: number;
  despesaTotal: number;
  margem: number;
  ticketMedio: number;
  inadimplencia: number;
  totalVencido: number;
  prazoMedioPagamento: number;
  prazoMedioRecebimento: number;
  receitaPorMes: KPIMensal[];
  topFornecedores: KPIFornecedor[];
}

function NoAccess() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Ban className="w-5 h-5 mr-2" /> Acesso negado
    </div>
  );
}

function SkeletonKpis() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <Card key={i}><CardContent className="p-4"><Skeleton className="h-4 w-20 mb-2" /><Skeleton className="h-6 w-28" /></CardContent></Card>
      ))}
    </div>
  );
}

function formatMesLabel(mes: string): string {
  if (!mes) return '';
  const [y, m] = mes.split('-');
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${meses[Number(m) - 1]}/${y.slice(2)}`;
}

export default function KPIsSection() {
  const toast = useScopedToast();
  const supabase = useSupabase();
  const canView = useCan('financeiro:kpis:view');
  const canExport = useCan('financeiro:kpis:export');

  const [loading, setLoading] = useState(false);
  const [errorState, setErrorState] = useState(false);
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [meses, setMeses] = useState(6);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const load = useCallback(async () => {
    if (!canView || loading) return;
    setLoading(true);
    setErrorState(false);
    try {
      const { data, error } = await supabase.rpc('get_fin_kpis', { p_meses: meses });

      if (error) {
        console.error(error);
        if (error.message?.includes('PERMISSION_DENIED')) {
          toast.error('Seu perfil não possui permissão para visualizar KPIs.');
        } else {
          toast.error('Erro ao calcular KPIs');
        }
        setErrorState(true);
        setLoading(false);
        return;
      }

      const d = data as unknown as FinKPIsResponse;

      setKpis({
        receitaTotal: Number(d.receita_total) || 0,
        despesaTotal: Number(d.despesa_total) || 0,
        margem: Number(d.margem) || 0,
        ticketMedio: Number(d.ticket_medio) || 0,
        inadimplencia: Number(d.inadimplencia) || 0,
        totalVencido: Number(d.total_vencido) || 0,
        prazoMedioPagamento: Number(d.prazo_medio_pagamento) || 0,
        prazoMedioRecebimento: Number(d.prazo_medio_recebimento) || 0,
        receitaPorMes: (d.receita_por_mes || []).map((m) => ({
          mes: m.mes,
          receita: Number(m.receita),
          despesa: Number(m.despesa),
        })),
        topFornecedores: (d.top_fornecedores || []).map((f) => ({
          nome: f.nome,
          total: Number(f.total),
        })),
      });
    } catch (err) {
      console.error(err);
      toast.error('Erro ao calcular KPIs');
      setErrorState(true);
    }
    setLoading(false);
  }, [canView, loading, meses, supabase, toast]);

  // Auto-load
  useEffect(() => { load(); }, [meses]);

  // Auto-refresh
  useDataEvent('financeiro:lancamentos', load);
  useDataEvent('financeiro:pagar', load);
  useDataEvent('financeiro:receber', load);
  useDataEvent('financeiro:contas', load);

  if (!canView) return <NoAccess />;

  const fmt = fmtBRL;

  const exportExcel = async () => {
    if (exportingExcel || !kpis) return;
    setExportingExcel(true);
    try {
      const wb = XLSX.utils.book_new();

      // KPIs sheet
      const kpiRows = [
        { Indicador: 'Receita Total', Valor: kpis.receitaTotal },
        { Indicador: 'Despesa Total', Valor: kpis.despesaTotal },
        { Indicador: 'Margem (%)', Valor: kpis.margem },
        { Indicador: 'Ticket Médio', Valor: kpis.ticketMedio },
        { Indicador: 'Inadimplência (%)', Valor: kpis.inadimplencia },
        { Indicador: 'Total Vencido', Valor: kpis.totalVencido },
        { Indicador: 'Prazo Médio Pgto (dias)', Valor: kpis.prazoMedioPagamento },
        { Indicador: 'Prazo Médio Receb. (dias)', Valor: kpis.prazoMedioRecebimento },
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kpiRows), 'KPIs');

      // Mensal sheet
      if (kpis.receitaPorMes.length > 0) {
        const mensalRows = kpis.receitaPorMes.map(m => ({
          Mês: formatMesLabel(m.mes),
          Receita: m.receita,
          Despesa: m.despesa,
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mensalRows), 'Mensal');
      }

      // Fornecedores sheet
      if (kpis.topFornecedores.length > 0) {
        const fornRows = kpis.topFornecedores.map(f => ({
          Fornecedor: f.nome,
          Total: f.total,
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fornRows), 'Top Fornecedores');
      }

      XLSX.writeFile(wb, 'kpis_financeiros.xlsx');
    } finally {
      setExportingExcel(false);
    }
  };

  const exportPdf = async () => {
    if (exportingPdf || !kpis) return;
    setExportingPdf(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF();
      doc.setFontSize(14);
      doc.text('KPIs Inteligentes & Analytics', 14, 15);
      doc.setFontSize(9);
      doc.text(`Período: ${meses} meses`, 14, 23);

      autoTable(doc, {
        startY: 30,
        head: [['Indicador', 'Valor']],
        body: [
          ['Receita Total', fmt(kpis.receitaTotal)],
          ['Despesa Total', fmt(kpis.despesaTotal)],
          ['Margem', formatPercentBR(kpis.margem)],
          ['Ticket Médio', fmt(kpis.ticketMedio)],
          ['Inadimplência', formatPercentBR(kpis.inadimplencia)],
          ['Total Vencido', fmt(kpis.totalVencido)],
          ['Prazo Médio Pgto', `${formatIntegerBR(kpis.prazoMedioPagamento)} dias`],
          ['Prazo Médio Receb.', `${formatIntegerBR(kpis.prazoMedioRecebimento)} dias`],
        ],
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 41, 59] },
      });

      if (kpis.topFornecedores.length > 0) {
        const lastY = (doc as unknown as Record<string, Record<string, number>>).lastAutoTable?.finalY || 100;
        autoTable(doc, {
          startY: lastY + 10,
          head: [['Fornecedor', 'Total']],
          body: kpis.topFornecedores.map(f => [f.nome, fmt(f.total)]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [30, 41, 59] },
        });
      }

      doc.save('kpis_financeiros.pdf');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">KPIs Inteligentes & Analytics</h2>
          <p className="text-sm text-muted-foreground">Indicadores automáticos de performance financeira • regime de caixa (Livro Razão)</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canExport && kpis && (
            <>
              <Button variant="outline" size="sm" onClick={exportPdf} disabled={exportingPdf}>
                <FileDown className="w-4 h-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={exportExcel} disabled={exportingExcel}>
                <FileDown className="w-4 h-4 mr-1" /> Excel
              </Button>
            </>
          )}
          <Select value={String(meses)} onValueChange={v => setMeses(Number(v))}>
            <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3 meses</SelectItem>
              <SelectItem value="6">6 meses</SelectItem>
              <SelectItem value="12">12 meses</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Calcular
          </Button>
        </div>
      </div>

      {errorState && !loading ? (
        <Card className="border-destructive/50">
          <CardContent className="p-8 text-center text-destructive">
            <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="font-medium">Erro ao carregar KPIs</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={load}>Tentar novamente</Button>
          </CardContent>
        </Card>
      ) : loading && !kpis ? (
        <SkeletonKpis />
      ) : !kpis ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum dado disponível para o período selecionado</p>
        </CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Receita Total" value={fmt(kpis.receitaTotal)} icon={TrendingUp} variant="success" />
            <KpiCard label="Despesa Total" value={fmt(kpis.despesaTotal)} icon={TrendingDown} variant="danger" />
            <KpiCard label="Margem" value={formatPercentBR(kpis.margem)} icon={DollarSign} variant={kpis.margem >= 0 ? 'success' : 'danger'} />
            <KpiCard label="Ticket Médio" value={fmt(kpis.ticketMedio)} icon={DollarSign} variant="primary" />
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger asChild>
                  <div>
                    <KpiCard
                      label="Inadimplência"
                      value={formatPercentBR(kpis.inadimplencia)}
                      icon={AlertTriangle}
                      variant={kpis.inadimplencia > 10 ? 'danger' : 'warning'}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[240px]">
                  <p className="text-xs">Inadimplência = valores vencidos / contas pendentes a receber × 100</p>
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>
            <KpiCard label="Total Vencido" value={fmt(kpis.totalVencido)} icon={Clock} variant="danger" />
            <KpiCard label="Prazo Médio Pgto" value={`${formatIntegerBR(kpis.prazoMedioPagamento)} dias`} icon={Calendar} variant={kpis.prazoMedioPagamento > 5 ? 'warning' : 'success'} />
            <KpiCard label="Prazo Médio Receb." value={`${formatIntegerBR(kpis.prazoMedioRecebimento)} dias`} icon={Calendar} variant={kpis.prazoMedioRecebimento > 5 ? 'warning' : 'success'} />
          </div>

          {kpis.receitaPorMes.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3">Receita vs Despesa por Mês</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={kpis.receitaPorMes.map(m => ({ ...m, mesLabel: formatMesLabel(m.mes) }))}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="mesLabel" {...axisProps} />
                    <YAxis {...axisProps} tickFormatter={chartValueFormatters.moneyCompact} />
                    <Tooltip {...tooltipProps} content={<ChartTooltip valueFormatter={v => fmt(Number(v))} />} />
                    <Bar dataKey="receita" fill={SEMANTIC_CHART_COLORS.positive} name="Receita" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="despesa" fill={SEMANTIC_CHART_COLORS.negative} name="Despesa" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {kpis.topFornecedores.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><Users className="w-4 h-4" /> Top Fornecedores por Volume</h3>
                <div className="space-y-2">
                  {kpis.topFornecedores.map((f) => (
                    <div key={f.nome} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-4">{kpis.topFornecedores.indexOf(f) + 1}.</span>
                        <span className="text-sm truncate max-w-[200px]">{f.nome}</span>
                      </div>
                      <span className="font-mono text-sm font-medium">{fmt(f.total)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
