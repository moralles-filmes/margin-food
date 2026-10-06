import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback, useId } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useScopedToast } from '@/hooks/useScopedToast';
import { RefreshCw, TrendingUp, TrendingDown, Clock, AlertTriangle, DollarSign, BarChart3, Users, Calendar, FileDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fmtBRL, formatPercentBR, formatIntegerBR, formatInBR } from '@/lib/formatters';
import { axisProps, gridProps, tooltipProps, cursorProps, barProps, chartMargin, SEMANTIC_CHART_COLORS, chartValueFormatters } from '@/lib/chartTheme';
import { ChartTooltip } from '@/components/ui/ChartTooltip';
import { ChartLegend } from '@/components/ui/ChartLegend';
import { ChartCard } from '@/components/ui/ChartCard';
import KpiCard from '@/components/ui/KpiCard';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import AccessDenied from '@/components/ui/AccessDenied';
import { kpiGridClassFor, longestValueLength } from '@/components/ui/kpiGrid';
import { useCan } from '@/permissions/hooks';
import { useDataEvent } from '@/lib/dataEvents';
import * as XLSX from '@/lib/safeXlsx';
import { FinKpiGrid, FinNote, FinScreenHeader, FinSectionGroup } from './finV2Layout';
import { ResumoCarregando } from './ContasParts';
import { dataBR, periodoDosKpis } from './analisesView';

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

function formatMesLabel(mes: string): string {
  if (!mes) return '';
  const [y, m] = mes.split('-');
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${meses[Number(m) - 1]}/${y.slice(2)}`;
}

/** Limite da RPC (`LIMIT 8`): com 8 linhas a lista é um Top 8, não todos os fornecedores. */
const TOP_FORNECEDORES = 8;

export default function KPIsSection() {
  const toast = useScopedToast();
  const supabase = useSupabase();
  const canView = useCan('financeiro:kpis:view');
  const canExport = useCan('financeiro:kpis:export');
  const janelaId = useId();

  const [loading, setLoading] = useState(false);
  const [errorState, setErrorState] = useState(false);
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [meses, setMeses] = useState(6);
  // Estado só de apresentação: janela (em meses) e data dos valores exibidos.
  const [carregado, setCarregado] = useState<{ meses: number; hoje: string } | null>(null);
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
      setCarregado({ meses, hoje: formatInBR(new Date(), 'yyyy-MM-dd') });
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

  if (!canView) return <AccessDenied description="Você não tem permissão para visualizar os KPIs." />;

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

  // ── Apresentação (Redesign V2, Fase 06A): mesmos números da RPC; rótulos dizem base e período ──
  const periodo = carregado ? periodoDosKpis(carregado.meses, carregado.hoje) : null;
  const semReceita = kpis !== null && kpis.receitaTotal <= 0;
  const valoresGrupo1 = kpis ? [
    fmt(kpis.receitaTotal),
    fmt(kpis.despesaTotal),
    semReceita ? '—' : formatPercentBR(kpis.margem),
    semReceita ? '—' : fmt(kpis.ticketMedio),
  ] : [];
  const valoresGrupo2 = kpis ? [
    formatPercentBR(kpis.inadimplencia),
    fmt(kpis.totalVencido),
    `${formatIntegerBR(kpis.prazoMedioPagamento)} dias`,
    `${formatIntegerBR(kpis.prazoMedioRecebimento)} dias`,
  ] : [];
  const gridGrupo1 = kpiGridClassFor(longestValueLength(valoresGrupo1));
  const gridGrupo2 = kpiGridClassFor(longestValueLength(valoresGrupo2));
  const desdeVencimento = periodo ? dataBR(periodo.inicio) : '';
  const prazoSub = (tipo: 'pagas' | 'recebidas') =>
    `Média de dias entre vencimento e ${tipo === 'pagas' ? 'pagamento' : 'recebimento'} (negativo = antes do vencimento) · contas ${tipo} com vencimento desde ${desdeVencimento}`;
  const topCompleto = kpis !== null && kpis.topFornecedores.length >= TOP_FORNECEDORES;
  // O arquivo diz "Período: N meses" com a janela do seletor: só exporta quando os números exibidos
  // são dessa janela e a última leitura não falhou (D43/D59).
  const exportIndisponivel = loading || errorState || carregado?.meses !== meses;

  return (
    <div className="space-y-6">
      <FinScreenHeader
        title="KPIs Inteligentes & Analytics"
        description="Indicadores automáticos de performance financeira · regime de caixa (Livro Razão) · sem categorias não operacionais"
        actions={canExport && kpis ? (
          <>
            <Button variant="outline" size="sm" onClick={exportPdf} disabled={exportingPdf || exportIndisponivel}>
              <FileDown aria-hidden="true" className="w-4 h-4 mr-1" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={exportExcel} disabled={exportingExcel || exportIndisponivel}>
              <FileDown aria-hidden="true" className="w-4 h-4 mr-1" /> Excel
            </Button>
          </>
        ) : undefined}
      />

      <div className="flex flex-wrap items-end gap-3 rounded-summary border bg-card p-4 shadow-card">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={janelaId} className="text-xs text-muted-foreground">Janela</Label>
          <Select value={String(meses)} onValueChange={v => setMeses(Number(v))}>
            <SelectTrigger id={janelaId} className="h-9 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3 meses</SelectItem>
              <SelectItem value="6">6 meses</SelectItem>
              <SelectItem value="12">12 meses</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" className="h-9" onClick={load} disabled={loading}>
          <RefreshCw aria-hidden="true" className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Calcular
        </Button>
        <p className="pb-2 text-xs text-muted-foreground">Do 1º dia do mês inicial até hoje; o mês atual entra parcial.</p>
        {/* A janela trocada durante um cálculo não dispara outro (PF-007): diz isso em vez de só travar a exportação. */}
        {!loading && carregado && carregado.meses !== meses && (
          <p role="status" className="basis-full text-xs font-medium text-warning">
            Os valores abaixo ainda são da janela de {carregado.meses} meses. Clique em “Calcular” para atualizar (e exportar).
          </p>
        )}
      </div>

      {errorState && !loading ? (
        <ErrorState
          title="Erro ao carregar KPIs"
          description="Nenhum indicador foi exibido. Tente novamente."
          onRetry={load}
        />
      ) : loading && !kpis ? (
        <div role="status" className="space-y-6">
          <span className="sr-only">Calculando os KPIs…</span>
          <ResumoCarregando cards={4} className={kpiGridClassFor(12)} />
          <ResumoCarregando cards={4} className={kpiGridClassFor(12)} />
        </div>
      ) : !kpis ? (
        <EmptyState icon={BarChart3} title="Nenhum dado disponível para o período selecionado" />
      ) : (
        <>
          <FinSectionGroup
            id="kpis-resultado"
            title="Receitas e despesas"
            caption={`${periodo?.label ?? ''} · realizados pelo regime de caixa${loading ? ' · atualizando…' : ''}`}
          >
            <FinKpiGrid className={gridGrupo1}>
              <KpiCard appearance="summary" label="Receita total" value={valoresGrupo1[0]} icon={TrendingUp} variant="success" sub="Recebimentos realizados no período" />
              <KpiCard appearance="summary" label="Despesa total" value={valoresGrupo1[1]} icon={TrendingDown} variant="danger" sub="Pagamentos realizados no período" />
              <KpiCard
                appearance="summary"
                label="Margem"
                value={valoresGrupo1[2]}
                icon={DollarSign}
                variant={semReceita ? 'default' : kpis.margem >= 0 ? 'success' : 'danger'}
                valueTone={!semReceita && kpis.margem < 0 ? 'negative' : 'default'}
                sub={semReceita ? 'Sem receita no período: a margem não se aplica' : '(Receita − despesa) ÷ receita'}
              />
              <KpiCard
                appearance="summary"
                label="Ticket médio"
                value={valoresGrupo1[3]}
                icon={DollarSign}
                variant="primary"
                sub={semReceita ? 'Sem receita no período' : 'Receita ÷ nº de lançamentos de receita'}
              />
            </FinKpiGrid>
          </FinSectionGroup>

          <FinSectionGroup id="kpis-prazos" title="Recebíveis e prazos" caption="Contas a receber e a pagar">
            <FinKpiGrid className={gridGrupo2}>
              <KpiCard
                appearance="summary"
                label="Inadimplência"
                value={valoresGrupo2[0]}
                icon={AlertTriangle}
                variant={kpis.inadimplencia > 10 ? 'danger' : 'warning'}
                sub="Vencido ÷ total a receber em aberto × 100 · toda a unidade"
              />
              {/* Zero vencido não pode parecer alerta (D32). */}
              <KpiCard appearance="summary" label="Total vencido" value={valoresGrupo2[1]} icon={Clock} variant={kpis.totalVencido > 0 ? 'danger' : 'default'} sub="A receber com vencimento antes de hoje · toda a unidade" />
              <KpiCard appearance="summary" label="Prazo médio de pagamento" value={valoresGrupo2[2]} icon={Calendar} variant={kpis.prazoMedioPagamento > 5 ? 'warning' : 'success'} sub={prazoSub('pagas')} />
              <KpiCard appearance="summary" label="Prazo médio de recebimento" value={valoresGrupo2[3]} icon={Calendar} variant={kpis.prazoMedioRecebimento > 5 ? 'warning' : 'success'} sub={prazoSub('recebidas')} />
            </FinKpiGrid>
          </FinSectionGroup>

          <ChartCard
            title="Receita vs despesa por mês"
            subtitle={`${periodo?.label ?? ''} · R$ · regime de caixa`}
            height="h-[260px]"
            isEmpty={kpis.receitaPorMes.length === 0}
            emptyIcon={BarChart3}
            emptyTitle="Nenhum lançamento realizado no período"
            legend={(
              <ChartLegend
                justify="start"
                payload={[
                  { value: 'Receita', color: SEMANTIC_CHART_COLORS.positive, type: 'square' },
                  { value: 'Despesa', color: SEMANTIC_CHART_COLORS.negative, type: 'square' },
                ]}
              />
            )}
            footer={(
              <div className="space-y-2">
                <p>Meses sem lançamento realizado não aparecem no gráfico. O mês atual vai só até hoje.</p>
                <details>
                  <summary className="cursor-pointer font-medium text-foreground">Valores por mês</summary>
                  <table className="mt-2 w-full max-w-md text-xs">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th scope="col" className="py-1 text-left font-medium">Mês</th>
                        <th scope="col" className="py-1 text-right font-medium">Receita</th>
                        <th scope="col" className="py-1 text-right font-medium">Despesa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kpis.receitaPorMes.map(m => (
                        <tr key={m.mes} className="border-t">
                          <th scope="row" className="py-1 text-left font-normal text-foreground">{formatMesLabel(m.mes)}</th>
                          <td className="whitespace-nowrap py-1 text-right tabular-nums text-foreground">{fmt(m.receita)}</td>
                          <td className="whitespace-nowrap py-1 text-right tabular-nums text-foreground">{fmt(m.despesa)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </div>
            )}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={kpis.receitaPorMes.map(m => ({ ...m, mesLabel: formatMesLabel(m.mes) }))} margin={chartMargin}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="mesLabel" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={chartValueFormatters.moneyCompact} />
                <Tooltip {...tooltipProps} cursor={cursorProps} content={<ChartTooltip valueFormatter={v => fmt(Number(v))} />} />
                <Bar dataKey="receita" fill={SEMANTIC_CHART_COLORS.positive} name="Receita" {...barProps} />
                <Bar dataKey="despesa" fill={SEMANTIC_CHART_COLORS.negative} name="Despesa" {...barProps} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <FinSectionGroup
            id="kpis-fornecedores"
            title={topCompleto ? `Top ${TOP_FORNECEDORES} fornecedores por volume` : 'Fornecedores por volume'}
            caption={kpis.topFornecedores.length > 0
              ? `Baixas de contas a pagar no período${topCompleto ? ` · os ${TOP_FORNECEDORES} maiores; a lista para em ${TOP_FORNECEDORES}` : ` · ${kpis.topFornecedores.length} com pagamento`}`
              : undefined}
          >
            {kpis.topFornecedores.length === 0 ? (
              <EmptyState icon={Users} compact title="Nenhuma conta a pagar baixada no período" />
            ) : (
              <ol aria-label="Fornecedores por volume pago" className="divide-y rounded-summary border bg-card shadow-card">
                {kpis.topFornecedores.map((f, i) => (
                  <li key={f.nome} className="flex items-start justify-between gap-3 px-4 py-2.5">
                    <span className="flex min-w-0 items-start gap-2">
                      <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
                      <span className="min-w-0 break-words text-sm text-foreground">{f.nome}</span>
                    </span>
                    <span className="whitespace-nowrap text-sm font-medium tabular-nums text-foreground">{fmt(f.total)}</span>
                  </li>
                ))}
              </ol>
            )}
            <FinNote>Juros, tarifas e descontos lançados na baixa não entram no total do fornecedor.</FinNote>
          </FinSectionGroup>
        </>
      )}
    </div>
  );
}
