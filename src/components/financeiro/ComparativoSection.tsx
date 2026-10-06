import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback, useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useScopedToast } from '@/hooks/useScopedToast';
import { formatInBR, fmtBRL, formatPercentBR, formatDecimalBR, formatIntegerBR } from '@/lib/formatters';
import { subMonths } from 'date-fns';
import { RefreshCw, ArrowRight, Equal, FileDown, TrendingUp, TrendingDown, Scale, Percent, ListOrdered } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { axisProps, gridProps, tooltipProps, cursorProps, barProps, chartMargin, SERIES_COLORS, chartValueFormatters } from '@/lib/chartTheme';
import { ChartTooltip } from '@/components/ui/ChartTooltip';
import { ChartLegend } from '@/components/ui/ChartLegend';
import { ChartCard } from '@/components/ui/ChartCard';
import KpiCard, { type KpiCardDelta } from '@/components/ui/KpiCard';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import AccessDenied from '@/components/ui/AccessDenied';
import { kpiGridClassFor, longestValueLength } from '@/components/ui/kpiGrid';
import { useCan } from '@/permissions/hooks';
import { useDataEvent } from '@/lib/dataEvents';
import * as XLSX from '@/lib/safeXlsx';
import { cn } from '@/lib/utils';
import { FinKpiGrid, FinNote, FinScreenHeader, FinSectionGroup } from './finV2Layout';
import { ResumoCarregando } from './ContasParts';
import { useConteinerEstreito } from './useConteinerEstreito';
import { deltaPercentual, deltaPontos, variacaoCategoria, type TomVariacao } from './analisesView';

/* ─── Types ─── */
type ComparativoPeriodo = {
  mes: string;
  receita: number;
  despesa: number;
  resultado: number;
  margem: number;
  total_lancamentos: number;
};

type ComparativoGraficoItem = {
  indicador: string;
  periodo_a: number;
  periodo_b: number;
};

type ComparativoCategoriaItem = {
  categoria: string;
  valor_a: number;
  valor_b: number;
  variacao_pct: number;
};

type ComparativoResponse = {
  periodo_a: ComparativoPeriodo;
  periodo_b: ComparativoPeriodo;
  variacoes: {
    receita_pct: number;
    despesa_pct: number;
    resultado_pct: number;
    margem_pp: number;
    lancamentos_pct: number;
  };
  grafico: ComparativoGraficoItem[];
  breakdown_categorias: ComparativoCategoriaItem[];
};

function formatMesLabel(mes: string): string {
  if (!mes) return '';
  const [y, m] = mes.split('-');
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${meses[Number(m) - 1]}/${y}`;
}

const TOM_CLASS: Record<TomVariacao, string> = {
  positive: 'text-success',
  negative: 'text-destructive',
  neutral: 'text-muted-foreground',
};

export default function ComparativoSection() {
  const toast = useScopedToast();
  const supabase = useSupabase();
  const canView = useCan('financeiro:comparativo:view');
  const canExport = useCan('financeiro:comparativo:export');
  const mesAId = useId();
  const mesBId = useId();
  const [categoriasRef, categoriasEstreitas] = useConteinerEstreito(560);

  const [loading, setLoading] = useState(false);
  const [errorState, setErrorState] = useState(false);
  const [mesA, setMesA] = useState(formatInBR(new Date(), 'yyyy-MM'));
  const [mesB, setMesB] = useState(formatInBR(subMonths(new Date(), 1), 'yyyy-MM'));
  const [data, setData] = useState<ComparativoResponse | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const comparar = useCallback(async () => {
    if (!canView) return;
    if (!mesA || !mesB) { toast.error('Selecione os dois períodos'); return; }
    if (mesA === mesB) { toast.error('Selecione períodos diferentes para comparar.'); return; }
    if (loading) return;

    setLoading(true);
    setErrorState(false);
    try {
      const { data: result, error } = await supabase.rpc('comparativo_periodos', {
        p_mes_a: mesA,
        p_mes_b: mesB,
      });

      if (error) {
        console.error(error);
        if (error.message?.includes('PERMISSION_DENIED')) {
          toast.error('Seu perfil não possui permissão para visualizar comparativos.');
        } else {
          toast.error('Erro ao carregar comparativo');
        }
        setErrorState(true);
        setLoading(false);
        return;
      }

      setData(result as unknown as ComparativoResponse);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar comparativo');
      setErrorState(true);
    }
    setLoading(false);
  }, [canView, loading, mesA, mesB, supabase, toast]);

  // Auto-load on mount
  useEffect(() => {
    if (mesA && mesB && mesA !== mesB) comparar();
  }, []);

  // Auto-refresh
  useDataEvent('financeiro:lancamentos', comparar);
  useDataEvent('financeiro:cadastros', comparar);
  useDataEvent('financeiro:conciliacao', comparar);

  if (!canView) return <AccessDenied description="Você não tem permissão para visualizar o comparativo." />;

  const fmt = fmtBRL;

  // RULE FIN-COMPARATIVO: uses official calcVariacaoPct for consistency
  const variacao = (pct: number) => {
    if (pct === 0) return '—';
    return `${pct >= 0 ? '+' : ''}${formatPercentBR(pct)}`;
  };

  const pa = data?.periodo_a;
  const pb = data?.periodo_b;
  const v = data?.variacoes;

  const linhas = pa && pb && v ? [
    { label: 'Receita', a: pa.receita, b: pb.receita, pct: v.receita_pct },
    { label: 'Despesa', a: pa.despesa, b: pb.despesa, pct: v.despesa_pct, inverso: true },
    { label: 'Resultado', a: pa.resultado, b: pb.resultado, pct: v.resultado_pct },
    { label: 'Margem', a: pa.margem, b: pb.margem, pp: v.margem_pp, isPct: true },
    { label: 'Lançamentos', a: pa.total_lancamentos, b: pb.total_lancamentos, pct: v.lancamentos_pct, isNum: true },
  ] : [];

  const mesALabel = formatMesLabel(mesA);
  const mesBLabel = formatMesLabel(mesB);

  const exportExcel = async () => {
    if (exportingExcel || !data) return;
    setExportingExcel(true);
    try {
      const wb = XLSX.utils.book_new();

      // Comparativo
      const compRows = linhas.map(l => ({
        Indicador: l.label,
        [mesALabel]: l.isNum ? l.a : l.isPct ? `${formatDecimalBR(l.a, 1)}%` : l.a,
        [mesBLabel]: l.isNum ? l.b : l.isPct ? `${formatDecimalBR(l.b, 1)}%` : l.b,
        'Variação': l.isPct ? `${formatDecimalBR(l.pp ?? 0, 1)}pp` : variacao(l.pct ?? 0),
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(compRows), 'Comparativo');

      // Categorias
      if (data.breakdown_categorias?.length > 0) {
        const catRows = data.breakdown_categorias.map(c => ({
          Categoria: c.categoria,
          [mesALabel]: c.valor_a,
          [mesBLabel]: c.valor_b,
          'Variação %': formatDecimalBR(c.variacao_pct, 1),
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catRows), 'Categorias');
      }

      XLSX.writeFile(wb, 'comparativo_periodos.xlsx');
    } finally {
      setExportingExcel(false);
    }
  };

  const exportPdf = async () => {
    if (exportingPdf || !data) return;
    setExportingPdf(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF();
      doc.setFontSize(14);
      doc.text('Comparativo Período vs Período', 14, 15);
      doc.setFontSize(9);
      doc.text(`${mesALabel} vs ${mesBLabel}`, 14, 23);

      autoTable(doc, {
        startY: 30,
        head: [['Indicador', mesALabel, mesBLabel, 'Variação']],
        body: linhas.map(l => [
          l.label,
          l.isNum ? String(l.a) : l.isPct ? `${formatDecimalBR(l.a, 1)}%` : fmt(l.a),
          l.isNum ? String(l.b) : l.isPct ? `${formatDecimalBR(l.b, 1)}%` : fmt(l.b),
          l.isPct ? `${formatDecimalBR(l.pp ?? 0, 1)}pp` : variacao(l.pct ?? 0),
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 41, 59] },
      });

      if (data.breakdown_categorias?.length > 0) {
        const lastY = (doc as unknown as Record<string, Record<string, number>>).lastAutoTable?.finalY || 80;
        doc.setFontSize(11);
        doc.text('Categorias com maior variação', 14, lastY + 10);
        autoTable(doc, {
          startY: lastY + 15,
          head: [['Categoria', mesALabel, mesBLabel, 'Variação %']],
          body: data.breakdown_categorias.map(c => [
            c.categoria,
            fmt(c.valor_a),
            fmt(c.valor_b),
            `${formatDecimalBR(c.variacao_pct, 1)}%`,
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [30, 41, 59] },
        });
      }

      doc.save('comparativo_periodos.pdf');
    } finally {
      setExportingPdf(false);
    }
  };

  const isMesABeforeB = mesA && mesB && mesB < mesA;

  // ── Apresentação (Redesign V2, Fase 06A): mesmos números; rótulos dos meses da resposta exibida ──
  // Os campos podem ter mudado sem "Comparar": o arquivo sairia com os meses dos campos sobre os
  // números da resposta anterior (D43/D59), então a exportação espera uma nova comparação.
  const foraDeSincronia = Boolean(pa?.mes && pb?.mes && (pa.mes !== mesA || pb.mes !== mesB));
  const rotuloA = pa?.mes ? formatMesLabel(pa.mes) : mesALabel;
  const rotuloB = pb?.mes ? formatMesLabel(pb.mes) : mesBLabel;
  const sobreB = `Variação sobre ${rotuloB}`;
  const semBase: KpiCardDelta = { label: sobreB, formatted: 'Sem base', direction: 'none', tone: 'neutral' };
  const margem = (p: ComparativoPeriodo) => (p.receita > 0 ? `${formatDecimalBR(p.margem, 1)}%` : '—');
  const cards = pa && pb && v ? [
    { label: 'Receita', icon: TrendingUp, value: fmt(pa.receita), sub: `${rotuloB}: ${fmt(pb.receita)}`, delta: deltaPercentual(v.receita_pct, pb.receita > 0, sobreB) },
    { label: 'Despesa', icon: TrendingDown, value: fmt(pa.despesa), sub: `${rotuloB}: ${fmt(pb.despesa)}`, delta: deltaPercentual(v.despesa_pct, pb.despesa > 0, sobreB, true) },
    { label: 'Resultado', icon: Scale, value: fmt(pa.resultado), sub: `${rotuloB}: ${fmt(pb.resultado)}`, delta: deltaPercentual(v.resultado_pct, Math.abs(pb.resultado) > 0, sobreB), negativo: pa.resultado < 0 },
    { label: 'Margem', icon: Percent, value: margem(pa), sub: `${rotuloB}: ${margem(pb)}`, delta: pa.receita > 0 && pb.receita > 0 ? deltaPontos(v.margem_pp, sobreB) : semBase },
    { label: 'Lançamentos', icon: ListOrdered, value: formatIntegerBR(pa.total_lancamentos), sub: `${rotuloB}: ${formatIntegerBR(pb.total_lancamentos)}`, delta: deltaPercentual(v.lancamentos_pct, pb.total_lancamentos > 0, sobreB) },
  ] : [];
  const cardsGrid = kpiGridClassFor(longestValueLength(cards.map(c => c.value)), 3);

  return (
    <div className="space-y-6">
      <FinScreenHeader
        title="Comparativo Período vs Período"
        description="Compare indicadores entre dois meses · regime de caixa (Livro Razão) · sem categorias não operacionais"
        actions={canExport && data ? (
          <>
            <Button variant="outline" size="sm" onClick={exportPdf} disabled={exportingPdf || foraDeSincronia || errorState || loading}>
              <FileDown aria-hidden="true" className="w-4 h-4 mr-1" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={exportExcel} disabled={exportingExcel || foraDeSincronia || errorState || loading}>
              <FileDown aria-hidden="true" className="w-4 h-4 mr-1" /> Excel
            </Button>
          </>
        ) : undefined}
      />

      <div className="space-y-3 rounded-summary border bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={mesAId} className="text-xs text-muted-foreground">Período A · mês analisado</Label>
            <Input id={mesAId} type="month" value={mesA} onChange={e => setMesA(e.target.value)} className="h-9 w-44 max-w-full" />
          </div>
          <ArrowRight aria-hidden="true" className="mb-2.5 hidden w-5 h-5 text-muted-foreground sm:block" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={mesBId} className="text-xs text-muted-foreground">Período B · base da comparação</Label>
            <Input id={mesBId} type="month" value={mesB} onChange={e => setMesB(e.target.value)} className="h-9 w-44 max-w-full" />
          </div>
          <Button size="sm" className="h-9" onClick={comparar} disabled={loading}>
            <RefreshCw aria-hidden="true" className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Comparar
          </Button>
        </div>
        {isMesABeforeB && (
          <p className="text-xs text-muted-foreground">
            Nota: Período B é mais antigo que Período A.
          </p>
        )}
        {foraDeSincronia && (
          <p role="status" className="text-xs font-medium text-warning">
            Os meses escolhidos mudaram: os valores abaixo ainda são de {rotuloA} × {rotuloB}. Clique em “Comparar” para atualizar (e exportar).
          </p>
        )}
      </div>

      {errorState && !loading ? (
        <ErrorState
          title="Erro ao carregar comparativo"
          description="Nenhum valor foi exibido. Tente novamente."
          onRetry={comparar}
        />
      ) : loading && !data ? (
        <div role="status">
          <span className="sr-only">Comparando os períodos…</span>
          <ResumoCarregando cards={5} className={kpiGridClassFor(12, 3)} />
        </div>
      ) : data && pa && pb && v ? (
        <>
          <FinSectionGroup
            id="comp-indicadores"
            title="Indicadores"
            caption={`${rotuloA} comparado com ${rotuloB} · regime de caixa${loading ? ' · atualizando…' : ''}`}
          >
            <FinKpiGrid className={cardsGrid}>
              {cards.map(card => (
                <KpiCard
                  key={card.label}
                  appearance="summary"
                  icon={card.icon}
                  label={`${card.label} · ${rotuloA}`}
                  value={card.value}
                  valueTone={card.negativo ? 'negative' : 'default'}
                  sub={card.sub}
                  delta={card.delta}
                />
              ))}
            </FinKpiGrid>
            <FinNote>
              Variação = (A − B) ÷ B; a margem varia em pontos percentuais (p.p.). “Sem base” quando o valor de {rotuloB} é zero — na margem, quando um dos dois meses não tem receita.
            </FinNote>
          </FinSectionGroup>

          {data.grafico?.length > 0 && (
            <ChartCard
              title="Receita, despesa e resultado"
              subtitle={`${rotuloA} × ${rotuloB} · R$`}
              height="h-[260px]"
              legend={(
                <ChartLegend
                  justify="start"
                  payload={[
                    { value: `${rotuloA} (A)`, color: SERIES_COLORS[0], type: 'square' },
                    { value: `${rotuloB} (B)`, color: SERIES_COLORS[1], type: 'square' },
                  ]}
                />
              )}
              footer="Os valores de cada barra estão nos indicadores acima."
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.grafico} margin={chartMargin}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="indicador" {...axisProps} />
                  <YAxis {...axisProps} tickFormatter={chartValueFormatters.moneyCompact} />
                  <ReferenceLine y={0} stroke="hsl(var(--border-strong))" />
                  <Tooltip {...tooltipProps} cursor={cursorProps} content={<ChartTooltip valueFormatter={val => fmt(Number(val))} />} />
                  <Bar dataKey="periodo_a" name={rotuloA} fill={SERIES_COLORS[0]} {...barProps} />
                  <Bar dataKey="periodo_b" name={rotuloB} fill={SERIES_COLORS[1]} {...barProps} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {data.breakdown_categorias?.length > 0 && (
            <FinSectionGroup
              id="comp-categorias"
              title="Despesas por categoria"
              caption={`${data.breakdown_categorias.length} categoria(s) · com rateio · maior diferença em R$ primeiro`}
            >
              <div ref={categoriasRef} className="overflow-hidden rounded-summary border bg-card shadow-card">
                {categoriasEstreitas ? (
                  <ul aria-label="Despesas por categoria" className="divide-y">
                    {data.breakdown_categorias.map(c => {
                      const variacaoCat = variacaoCategoria(c.variacao_pct, c.valor_b);
                      return (
                        <li key={c.categoria} className="px-4 py-3">
                          <p className="break-words text-sm font-medium text-foreground">{c.categoria}</p>
                          <dl className="mt-1.5 grid grid-cols-3 gap-2 text-xs">
                            <div>
                              <dt className="text-muted-foreground">{rotuloA}</dt>
                              <dd className="whitespace-nowrap tabular-nums text-foreground">{fmt(c.valor_a)}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">{rotuloB}</dt>
                              <dd className="whitespace-nowrap tabular-nums text-foreground">{fmt(c.valor_b)}</dd>
                            </div>
                            <div className="text-right">
                              <dt className="text-muted-foreground">Variação</dt>
                              <dd className={cn('whitespace-nowrap font-medium tabular-nums', TOM_CLASS[variacaoCat.tom])}>{variacaoCat.texto}</dd>
                            </div>
                          </dl>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-right">{rotuloA}</TableHead>
                        <TableHead className="text-right">{rotuloB}</TableHead>
                        <TableHead className="text-right">Variação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.breakdown_categorias.map(c => {
                        const variacaoCat = variacaoCategoria(c.variacao_pct, c.valor_b);
                        return (
                          <TableRow key={c.categoria}>
                            <TableCell className="text-sm">{c.categoria}</TableCell>
                            <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">{fmt(c.valor_a)}</TableCell>
                            <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">{fmt(c.valor_b)}</TableCell>
                            <TableCell className={cn('whitespace-nowrap text-right text-sm font-medium tabular-nums', TOM_CLASS[variacaoCat.tom])}>
                              {variacaoCat.texto}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
              <FinNote>Despesa subindo aparece em vermelho e caindo em verde. “Sem base” quando a categoria não teve despesa em {rotuloB}.</FinNote>
            </FinSectionGroup>
          )}
        </>
      ) : (
        <EmptyState icon={Equal} title={'Selecione dois períodos e clique em "Comparar"'} />
      )}
    </div>
  );
}
