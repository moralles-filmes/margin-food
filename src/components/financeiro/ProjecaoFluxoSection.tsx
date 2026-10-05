import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/brl-input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import KpiCard from '@/components/ui/KpiCard';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { ChartCard } from '@/components/ui/ChartCard';
import { kpiGridClassFor, longestValueLength } from '@/components/ui/kpiGrid';
import { useScopedToast } from '@/hooks/useScopedToast';
import { RefreshCw, TrendingUp, TrendingDown, Wallet, FileDown, Ban, AlertTriangle, CheckCircle2, Sparkles, Flag } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { fmtBRL, formatDateBR, parseLocalDate } from '@/lib/formatters';
import { axisProps, gridProps, tooltipProps, chartMargin, chartValueFormatters, makeActiveDot, SEMANTIC_CHART_COLORS } from '@/lib/chartTheme';
import { ChartTooltip } from '@/components/ui/ChartTooltip';
import { useCan } from '@/permissions/hooks';
import { useDataEvent } from '@/lib/dataEvents';
import * as XLSX from '@/lib/safeXlsx';
import { FinKpiGrid, FinNote, FinScreenHeader } from './finV2Layout';

/* ─── Types ─── */
interface ProjecaoDia {
  data: string;
  saldo: number;
  entradas: number;
  saidas: number;
  receita_estimada?: number;
  despesa_estimada?: number;
  saldo_com_estimativa?: number;
}

/** Receita/despesa que não passam por títulos: média do mesmo dia da semana nas 4 semanas fechadas do Livro Razão. */
interface ProjecaoEstimativa {
  disponivel: boolean;
  janela_inicio: string | null;
  janela_fim: string | null;
  receita_estimada: number;
  despesa_estimada: number;
  saldo_final: number;
  dias_negativo: number;
  saldo_minimo: number;
}

interface ProjecaoResult {
  saldo_inicial: number;
  entradas: number;
  saidas: number;
  saldo_final: number;
  dias_negativo: number;
  saldo_minimo: number;
  estimativa?: ProjecaoEstimativa;
  timeline: ProjecaoDia[];
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} aria-hidden="true" className="rounded-summary border bg-card p-5 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-40" />
        </div>
      ))}
    </div>
  );
}

const HORIZONTE_OPTIONS = [15, 30, 60, 90];

export default function ProjecaoFluxoSection() {
  const toast = useScopedToast();
  const supabase = useSupabase();
  const canView = useCan('financeiro:projecao:view');
  const canExport = useCan('financeiro:projecao:export');

  const [loading, setLoading] = useState(false);
  const [errorState, setErrorState] = useState(false);
  const [result, setResult] = useState<ProjecaoResult | null>(null);
  // Parâmetros com que o resultado exibido foi calculado (o campo pode mudar antes de "Projetar").
  const [resultParams, setResultParams] = useState<{ dias: number; saldoManual: number | null } | null>(null);
  const [dias, setDias] = useState(30);
  const [saldoManual, setSaldoManual] = useState<number | null>(null);
  const [incluirEstimativa, setIncluirEstimativa] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const projetar = useCallback(async () => {
    if (!canView) return;
    if (loading) return;
    setLoading(true);
    setErrorState(false);
    try {
      const { data, error } = await supabase.rpc('get_fin_fluxo_projecao', {
        p_dias: dias,
        p_saldo_manual: saldoManual,
      });

      if (error) {
        console.error(error);
        if (error.message?.includes('PERMISSION_DENIED')) {
          toast.error('Seu perfil não possui permissão para visualizar projeções.');
        } else {
          toast.error('Erro ao gerar projeção de fluxo de caixa');
        }
        setErrorState(true);
        setLoading(false);
        return;
      }

      const parsed = data as unknown as ProjecaoResult;
      setResult(parsed);
      setResultParams({ dias, saldoManual });
    } catch (err) {
      console.error(err);
      toast.error('Erro ao gerar projeção');
      setErrorState(true);
    }
    setLoading(false);
  }, [canView, dias, loading, saldoManual, supabase, toast]);

  // Auto-load on mount and when dias changes
  useEffect(() => {
    projetar();
  }, [dias]);

  // Auto-refresh on data events (debounced)
  const debouncedProjetar = useCallback(() => {
    const timer = setTimeout(projetar, 500);
    return () => clearTimeout(timer);
  }, [projetar]);

  useDataEvent('financeiro:lancamentos', projetar);
  useDataEvent('financeiro:pagar', projetar);
  useDataEvent('financeiro:receber', projetar);

  if (!canView) return <NoAccess />;

  const fmt = fmtBRL;

  const estimativa = result?.estimativa?.disponivel ? result.estimativa : null;
  const comEstimativa = incluirEstimativa && estimativa !== null;
  const timeline = (result?.timeline ?? []).map(d => ({
    ...d,
    receitaEstimada: comEstimativa ? d.receita_estimada ?? 0 : 0,
    despesaEstimada: comEstimativa ? d.despesa_estimada ?? 0 : 0,
    saldo: comEstimativa ? d.saldo_com_estimativa ?? d.saldo : d.saldo,
  }));
  const saldoInicial = result?.saldo_inicial ?? 0;
  const totalEntradas = result?.entradas ?? 0;
  const totalSaidas = result?.saidas ?? 0;
  const receitaEstimada = comEstimativa ? estimativa.receita_estimada : 0;
  const despesaEstimada = comEstimativa ? estimativa.despesa_estimada : 0;
  const saldoFinal = (comEstimativa ? estimativa.saldo_final : result?.saldo_final) ?? 0;
  const diasNegativo = (comEstimativa ? estimativa.dias_negativo : result?.dias_negativo) ?? 0;
  const saldoMin = (comEstimativa ? estimativa.saldo_minimo : result?.saldo_minimo) ?? 0;
  const janelaEstimativa = estimativa?.janela_inicio && estimativa.janela_fim
    ? `${formatDateBR(parseLocalDate(estimativa.janela_inicio))} a ${formatDateBR(parseLocalDate(estimativa.janela_fim))}`
    : null;

  const exportExcel = async () => {
    if (exportingExcel || timeline.length === 0) return;
    setExportingExcel(true);
    try {
      const rows = timeline.map(d => ({
        Data: formatDateBR(parseLocalDate(d.data)),
        Entradas: d.entradas,
        Saídas: d.saidas,
        ...(comEstimativa ? { 'Receita estimada': d.receitaEstimada, 'Despesa estimada': d.despesaEstimada } : {}),
        Saldo: d.saldo,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Projeção Fluxo');
      XLSX.writeFile(wb, 'projecao_fluxo_caixa.xlsx');
    } finally {
      setExportingExcel(false);
    }
  };

  const exportPdf = async () => {
    if (exportingPdf || timeline.length === 0) return;
    setExportingPdf(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF();
      doc.setFontSize(14);
      doc.text('Projeção de Fluxo de Caixa', 14, 15);
      doc.setFontSize(9);
      doc.text(`Horizonte: ${dias} dias | Saldo Inicial: ${fmt(saldoInicial)}`, 14, 23);
      if (comEstimativa && janelaEstimativa) {
        doc.text(`Inclui estimativa (média por dia da semana de ${janelaEstimativa}, fora de contas a pagar/receber)`, 14, 28);
      }

      autoTable(doc, {
        startY: comEstimativa ? 33 : 30,
        head: [comEstimativa
          ? ['Data', 'Entradas', 'Saídas', 'Receita estimada', 'Despesa estimada', 'Saldo']
          : ['Data', 'Entradas', 'Saídas', 'Saldo']],
        body: timeline.map(d => [
          formatDateBR(parseLocalDate(d.data)),
          fmt(d.entradas),
          fmt(d.saidas),
          ...(comEstimativa ? [fmt(d.receitaEstimada), fmt(d.despesaEstimada)] : []),
          fmt(d.saldo),
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 41, 59] },
      });

      doc.save('projecao_fluxo_caixa.pdf');
    } finally {
      setExportingPdf(false);
    }
  };

  // ─── Presentation ───
  const primeiroDia = timeline[0]?.data;
  const ultimoDia = timeline[timeline.length - 1]?.data;
  const horizonteLabel = primeiroDia && ultimoDia
    ? `${formatDateBR(parseLocalDate(primeiroDia))} a ${formatDateBR(parseLocalDate(ultimoDia))}`
    : null;
  const baseLabel = comEstimativa ? 'com estimativa' : 'só títulos e previstos';
  // Primeiro dia exibido em que o saldo atinge o mínimo informado pela RPC (tolerância de meio centavo).
  const diaDoMinimo = timeline.find(d => Math.abs(d.saldo - saldoMin) < 0.005)?.data;
  const saldoFinalPositivo = saldoFinal >= 0;

  type ProjecaoCard = {
    key: string;
    label: string;
    value: string;
    sub?: string;
    icon?: typeof Wallet;
    tone?: 'default' | 'positive' | 'negative';
    variant?: 'default' | 'success' | 'danger';
    highlight?: boolean;
  };
  const cards: ProjecaoCard[] = [
    {
      key: 'inicial', label: 'Saldo Inicial', value: fmt(saldoInicial), icon: Wallet,
      sub: resultParams?.saldoManual != null ? 'Informado manualmente' : 'Saldo atual das contas ativas',
      tone: saldoInicial < 0 ? 'negative' : 'default',
    },
    { key: 'entradas', label: 'Entradas', value: fmt(totalEntradas), icon: TrendingUp, tone: 'positive', sub: 'Títulos a receber e lançamentos previstos' },
    { key: 'saidas', label: 'Saídas', value: fmt(totalSaidas), icon: TrendingDown, tone: 'negative', sub: 'Títulos a pagar e lançamentos previstos' },
    ...(comEstimativa
      ? [
          { key: 'receita_est', label: 'Receita estimada', value: fmt(receitaEstimada), icon: Sparkles, tone: 'positive' as const, sub: 'Média por dia da semana, sem título' },
          { key: 'despesa_est', label: 'Despesa estimada', value: fmt(despesaEstimada), icon: Sparkles, tone: 'negative' as const, sub: 'Média por dia da semana, sem título' },
        ]
      : []),
    {
      key: 'final', label: 'Saldo Final', value: fmt(saldoFinal), icon: Flag,
      sub: `${ultimoDia ? `Em ${formatDateBR(parseLocalDate(ultimoDia))} · ` : ''}${baseLabel}`,
      // Azul é destaque, não "bom": saldo final negativo sai do azul para o vermelho aparecer.
      highlight: saldoFinalPositivo,
      tone: saldoFinalPositivo ? 'default' : 'negative',
      variant: saldoFinalPositivo ? 'default' : 'danger',
    },
    {
      key: 'dias_negativo', label: 'Dias com saldo negativo', value: String(diasNegativo),
      icon: diasNegativo > 0 ? AlertTriangle : CheckCircle2,
      // A série vai de hoje até hoje + horizonte: 30 dias de horizonte são 31 dias na série.
      sub: timeline.length === 1 ? 'de 1 dia, só hoje' : `de ${timeline.length} dias, contando hoje`,
      tone: diasNegativo > 0 ? 'negative' : 'default',
      variant: diasNegativo > 0 ? 'danger' : 'success',
    },
  ];
  const cardsGrid = kpiGridClassFor(longestValueLength(cards.map(c => c.value)), 4);

  return (
    <div className="space-y-6">
      <FinScreenHeader
        title="Projeção de Fluxo de Caixa"
        description="Contas pendentes (as vencidas entram no dia de hoje), lançamentos previstos e, opcionalmente, a estimativa do que entra e sai sem título"
      />

      <div className="rounded-summary border bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="projecao-saldo-manual" className="text-xs text-muted-foreground">Saldo inicial manual</Label>
            <CurrencyInput
              id="projecao-saldo-manual"
              showZero
              className="w-40 h-9"
              value={saldoManual == null ? '' : String(saldoManual)}
              onValueChange={(raw, parsed) => setSaldoManual(raw === '' ? null : parsed)}
              placeholder="Automático"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="projecao-horizonte" className="text-xs text-muted-foreground">Horizonte</Label>
            <Select value={String(dias)} onValueChange={v => setDias(Number(v))}>
              <SelectTrigger id="projecao-horizonte" className="w-28 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {HORIZONTE_OPTIONS.map(n => <SelectItem key={n} value={String(n)}>{n} dias</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex h-9 items-center gap-2">
            <Switch id="projecao-estimativa" checked={incluirEstimativa} onCheckedChange={setIncluirEstimativa} />
            <Label htmlFor="projecao-estimativa" className="text-sm whitespace-nowrap">Incluir estimativa</Label>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            {canExport && (
              <>
                {/* Com a projeção em erro a tela não mostra o resultado antigo; o arquivo também não. */}
                <Button variant="outline" size="sm" onClick={exportPdf} disabled={exportingPdf || timeline.length === 0 || errorState} aria-busy={exportingPdf || undefined}>
                  <FileDown className="w-4 h-4 mr-1" /> PDF
                </Button>
                <Button variant="outline" size="sm" onClick={exportExcel} disabled={exportingExcel || timeline.length === 0 || errorState} aria-busy={exportingExcel || undefined}>
                  <FileDown className="w-4 h-4 mr-1" /> Excel
                </Button>
              </>
            )}
            <Button size="sm" onClick={projetar} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Projetar
            </Button>
          </div>
        </div>
      </div>

      {errorState && !loading ? (
        <ErrorState
          title="Não foi possível gerar a projeção"
          description="Verifique a conexão e tente novamente."
          onRetry={projetar}
        />
      ) : loading && !result ? (
        <SkeletonKpis />
      ) : !result || timeline.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Nenhum dado para projeção"
          description="Verifique se há lançamentos previstos ou contas pendentes no horizonte selecionado."
        />
      ) : (
        <>
          <FinKpiGrid className={cardsGrid}>
            {cards.map(card => (
              <KpiCard
                key={card.key}
                appearance={card.highlight ? 'highlight' : 'summary'}
                icon={card.icon}
                label={card.label}
                value={card.value}
                sub={card.sub}
                valueTone={card.tone}
                variant={card.variant}
              />
            ))}
          </FinKpiGrid>

          {incluirEstimativa && (
            <FinNote>
              {comEstimativa && janelaEstimativa
                ? `Estimativa: média do mesmo dia da semana de ${janelaEstimativa} no Livro Razão (último dia com receita lançada), só com o que não passa por contas a pagar/receber — esses já entram pelo vencimento. Lucro de sócios e outros não operacionais ficam fora.`
                : 'Sem receita lançada no Livro Razão para estimar; a projeção usa só lançamentos previstos e contas pendentes.'}
            </FinNote>
          )}

          <ChartCard
            title="Saldo projetado por dia"
            subtitle={horizonteLabel ? `${horizonteLabel} · ${baseLabel}` : baseLabel}
            height="h-[300px]"
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeline.map(d => ({ ...d, dataLabel: formatDateBR(parseLocalDate(d.data)) }))} margin={chartMargin}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="dataLabel" {...axisProps} tickFormatter={v => v.slice(0, 5)} />
                <YAxis {...axisProps} tickFormatter={chartValueFormatters.moneyCompact} />
                <Tooltip {...tooltipProps} content={<ChartTooltip valueFormatter={v => fmt(Number(v))} />} />
                <ReferenceLine y={0} stroke={SEMANTIC_CHART_COLORS.negative} strokeDasharray="3 3" />
                <Area type="monotone" dataKey="saldo" name="Saldo" stroke="hsl(var(--primary))" fill="hsl(var(--primary-soft))" fillOpacity={1} strokeWidth={2} activeDot={makeActiveDot('hsl(var(--primary))')} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {saldoMin < 0 && (
            <div role="alert" className="flex items-start gap-3 rounded-summary border border-destructive-border bg-destructive-soft p-4">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <p className="text-sm font-medium text-destructive">
                Atenção: saldo mínimo projetado de {fmt(saldoMin)}
                {diaDoMinimo ? ` em ${formatDateBR(parseLocalDate(diaDoMinimo))}` : ''}. Considere antecipar recebimentos ou renegociar prazos.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
