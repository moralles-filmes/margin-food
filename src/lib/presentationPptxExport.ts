import PptxGenJS from 'pptxgenjs';
import type {
  CategoryCompositionSection,
  OpenItemsIndicators,
  PresentationPlanData,
  PresentationRankingItem,
  PresentationScenarioResult,
  PresentationDecisionDetail,
  PresentationDecisionComparison,
  PresentationRevenueData,
  PresentationRevenueBrandPoint,
  PresentationRevenueGrossToNetPeriod,
  PresentationExpensesData,
  PresentationExpenseNode,
  PresentationResultsData,
  PresentationInsight,
  PresentationRevenueExpenseMonthPoint,
  PresentationSlide,
  PresentationTimeSeries,
} from '@/domain/financeiro/presentation';
import { buildPresentationPlanIndicators } from '@/domain/financeiro/presentation';
import type { PresentationSociosData } from '@/lib/financeiroPresentationAdapter';
import {
  PRESENTATION_REGIME_LABEL,
  PRESENTATION_SOURCE_LABEL,
  availabilityMessage,
  buildExecutiveMetricDisplays,
  formatMetricDelta,
  flattenPresentationCategories,
  formatPresentationSeriesLabel,
  presentationGeneratedLabel,
  presentationActionStatusLabel,
  presentationDecisionStatusLabel,
  revenueExpensesYearMissingMessage,
} from '@/lib/presentationFormatting';
import { isPresentationSlideExportable } from '@/lib/presentationSlides';
import { fmtBRL, fmtBRLCompact, formatDateValueBR, formatIntegerBR, formatPercentBR } from '@/lib/formatters';
import type { PresentationExportOptions } from '@/lib/presentationPdfExport';
import {
  presentationInsightEvidenceLabel,
  presentationInsightRegimeLabel,
} from '@/lib/presentationInsightsFormatting';

const MIME_PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const COLOR = {
  background: '090909',
  white: 'FFFFFF',
  muted: 'A8B0BD',
  subtle: '475569',
  gold: 'D6B85F',
  revenue: '6EE7B7',
  expense: 'FDA4AF',
  warning: 'FDE68A',
  // Série por ano dos gráficos de linha mensais — os tokens --chart-* são
  // calibrados para fundo claro; sobre o fundo escuro do PPTX precisam de
  // hexes claros dedicados (mesma paleta do PDF e do canvas).
  series1: '7AA2F7',
  series2: 'C4B5FD',
  series3: 'FCD34D',
} as const;

const REVENUE_SOURCE_FOOTER = 'Faturamento bruto — Fechamento de Caixa · Data local do fechamento';
const EXPENSES_SOURCE_FOOTER = 'Despesas financeiras — DFC · Regime de caixa';
const RESULTS_SOURCE_FOOTER = 'Resultado operacional — mesmo regime de caixa do Dashboard · Fonte: get_fin_presentation_socios';
const INSIGHTS_SOURCE_FOOTER = 'Insights determinísticos · fonte canônica identificada em cada insight';
const REVENUE_EXPENSES_MONTHLY_SOURCE_FOOTER = 'Receita líquida — livro razão · Despesas — DFC · ambos em regime de caixa';

function abortIfRequested(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Exportação cancelada.', 'AbortError');
}

async function yieldForCancellation(signal?: AbortSignal): Promise<void> {
  abortIfRequested(signal);
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  abortIfRequested(signal);
}

function addHeader(slide: PptxGenJS.Slide, pptx: PptxGenJS, source: PresentationSlide): void {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.7, y: 0.35, w: 0.65, h: 0.06,
    line: { color: COLOR.gold, transparency: 100 },
    fill: { color: COLOR.gold },
  });
  slide.addText(source.title, {
    x: 0.7, y: 0.62, w: 11.9, h: 0.56,
    fontFace: 'Aptos Display', fontSize: 35, bold: true,
    color: COLOR.white, margin: 0, breakLine: false, fit: 'shrink', valign: 'top',
  });
  if (source.subtitle) {
    slide.addText(source.subtitle, {
      x: 0.7, y: 1.16, w: 11.8, h: 0.26,
      fontFace: 'Aptos', fontSize: 16, color: COLOR.muted, margin: 0,
      breakLine: false, fit: 'shrink',
    });
  }
}

function addFooter(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  data: PresentationSociosData,
  source: PresentationSlide,
  slideNumber: number,
  totalSlides: number,
): void {
  slide.addShape(pptx.ShapeType.line, {
    x: 0.7, y: 6.82, w: 11.93, h: 0,
    line: { color: COLOR.subtle, width: 1 },
  });
  slide.addText(
    source.kind === 'chapter-foundation'
      ? `Estrutura da apresentação · Dados não solicitados nesta fase · Slide ${slideNumber} de ${totalSlides}`
      : source.kind === 'revenue-expenses-monthly'
        ? `${REVENUE_EXPENSES_MONTHLY_SOURCE_FOOTER} · ${presentationGeneratedLabel(data.generatedAt)} · Slide ${slideNumber} de ${totalSlides}`
        : source.chapter === 'revenue'
        ? `${REVENUE_SOURCE_FOOTER} · ${presentationGeneratedLabel(data.generatedAt)} · Slide ${slideNumber} de ${totalSlides}`
        : source.chapter === 'expenses'
          ? `${EXPENSES_SOURCE_FOOTER} · ${presentationGeneratedLabel(data.generatedAt)} · Slide ${slideNumber} de ${totalSlides}`
          : source.chapter === 'results'
            ? `${RESULTS_SOURCE_FOOTER} · ${presentationGeneratedLabel(data.generatedAt)} · Slide ${slideNumber} de ${totalSlides}`
            : source.chapter === 'insights'
              ? `${INSIGHTS_SOURCE_FOOTER} · ${presentationGeneratedLabel(data.generatedAt)} · Slide ${slideNumber} de ${totalSlides}`
          : `${PRESENTATION_SOURCE_LABEL} · ${PRESENTATION_REGIME_LABEL} · ${presentationGeneratedLabel(data.generatedAt)} · Slide ${slideNumber} de ${totalSlides}`,
    {
      x: 0.7, y: 6.9, w: 11.9, h: 0.24,
      fontFace: 'Aptos', fontSize: 10, color: COLOR.muted, margin: 0,
      breakLine: false,
    },
  );
}

function addEmpty(slide: PptxGenJS.Slide, pptx: PptxGenJS, message: string): void {
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 1.8, y: 3, w: 9.75, h: 1.55,
    line: { color: COLOR.subtle, width: 1, dashType: 'dash' },
    fill: { color: COLOR.background, transparency: 100 },
  });
  slide.addText(message, {
    x: 2.1, y: 3.5, w: 9.15, h: 0.42,
    fontFace: 'Aptos', fontSize: 20, color: COLOR.muted,
    align: 'center', valign: 'middle', margin: 0, fit: 'shrink',
  });
}

function addCover(slide: PptxGenJS.Slide, pptx: PptxGenJS, periodLabel: string): void {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.9, y: 1.85, w: 1, h: 0.08,
    line: { color: COLOR.gold, transparency: 100 }, fill: { color: COLOR.gold },
  });
  slide.addText('VISÃO EXECUTIVA FINANCEIRA', {
    x: 0.9, y: 2.1, w: 5.8, h: 0.28,
    fontFace: 'Aptos', fontSize: 18, bold: true, color: COLOR.muted,
    charSpacing: 2.5, margin: 0,
  });
  slide.addText('Apresentação', {
    x: 0.9, y: 2.55, w: 8.5, h: 0.72,
    fontFace: 'Aptos Display', fontSize: 50, bold: true, color: COLOR.white, margin: 0,
  });
  slide.addText('Sócios', {
    x: 0.9, y: 3.35, w: 5.5, h: 0.72,
    fontFace: 'Aptos Display', fontSize: 50, bold: true, color: COLOR.gold, margin: 0,
  });
  slide.addText(periodLabel, {
    x: 0.9, y: 4.55, w: 8.5, h: 0.42,
    fontFace: 'Aptos', fontSize: 26, color: COLOR.white, margin: 0, fit: 'shrink',
  });
  slide.addText('Resultado operacional no regime de caixa do Dashboard. Transferências excluídas.', {
    x: 0.9, y: 5.08, w: 8.5, h: 0.3,
    fontFace: 'Aptos', fontSize: 16, color: COLOR.muted, margin: 0,
  });
}

function addExecutiveSummary(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  metrics: Parameters<typeof buildExecutiveMetricDisplays>[0],
  deltas: Parameters<typeof buildExecutiveMetricDisplays>[1],
): void {
  const displays = buildExecutiveMetricDisplays(metrics, deltas);
  displays.forEach((metric, index) => {
    const x = 0.75 + index * 3.12;
    slide.addShape(pptx.ShapeType.rect, {
      x, y: 2.05, w: 0.04, h: 3.1,
      line: { color: COLOR.gold, transparency: 100 }, fill: { color: COLOR.gold },
    });
    slide.addText(metric.label, {
      x: x + 0.18, y: 2.12, w: 2.7, h: 0.55,
      fontFace: 'Aptos', fontSize: 18, color: COLOR.muted, margin: 0, fit: 'shrink',
    });
    const valueColor = metric.tone === 'positive'
      ? COLOR.revenue
      : metric.tone === 'negative' || (metric.tone === 'result' && metric.value < 0)
        ? COLOR.expense
        : COLOR.white;
    slide.addText(metric.formattedValue, {
      x: x + 0.18, y: 2.86, w: 2.74, h: 0.62,
      fontFace: 'Aptos Display', fontSize: 27, bold: true,
      color: valueColor, margin: 0, fit: 'shrink',
    });
    slide.addText('vs. período anterior', {
      x: x + 0.18, y: 3.95, w: 2.7, h: 0.25,
      fontFace: 'Aptos', fontSize: 16, color: COLOR.muted, margin: 0,
    });
    slide.addText(metric.comparison, {
      x: x + 0.18, y: 4.35, w: 2.72, h: 0.42,
      fontFace: 'Aptos', fontSize: 18, bold: true,
      color: COLOR.white, margin: 0, fit: 'shrink',
    });
  });
}

function revenuePeriodText(period: PresentationRevenueData['current']): string {
  if (period.state === 'available') return fmtBRL(period.total);
  return period.state === 'empty' ? 'Sem fechamentos' : 'Sem cobertura';
}

function revenueDeltaText(
  delta: PresentationRevenueData['delta']['absolute'],
  percentage = false,
): string {
  if (delta.state === 'available') return percentage ? formatPercentBR(delta.value, 1) : fmtBRL(delta.value);
  if (delta.reason === 'zero-baseline') return 'Base anterior zero';
  return delta.reason === 'previous-period-absent' ? 'Mês anterior ausente' : 'Mês selecionado ausente';
}

function addRevenueSummary(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  revenue: PresentationRevenueData,
): void {
  [revenue.current, revenue.previous].forEach((period, index) => {
    const x = 0.9 + index * 6.15;
    slide.addShape(pptx.ShapeType.rect, {
      x, y: 2.05, w: 0.05, h: 2.45,
      line: { color: COLOR.gold, transparency: 100 }, fill: { color: COLOR.gold },
    });
    slide.addText(index === 0 ? 'MÊS SELECIONADO' : 'MÊS ANTERIOR', {
      x: x + 0.22, y: 2.05, w: 5.35, h: 0.25,
      fontFace: 'Aptos', fontSize: 14, bold: true, color: COLOR.muted, margin: 0,
    });
    slide.addText(period.month, {
      x: x + 0.22, y: 2.45, w: 5.35, h: 0.32,
      fontFace: 'Aptos', fontSize: 19, color: COLOR.white, margin: 0,
    });
    slide.addText(revenuePeriodText(period), {
      x: x + 0.22, y: 3.05, w: 5.4, h: 0.62,
      fontFace: 'Aptos Display', fontSize: 31, bold: true, color: COLOR.white, margin: 0, fit: 'shrink',
    });
    slide.addText(period.closingCount === 0 ? '0 ocorrências · ausência explícita' : `${period.closingCount} fechamento(s)`, {
      x: x + 0.22, y: 3.92, w: 5.3, h: 0.27,
      fontFace: 'Aptos', fontSize: 15, color: COLOR.muted, margin: 0,
    });
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 0.9, y: 5.05, w: 11.55, h: 0,
    line: { color: COLOR.subtle, width: 1 },
  });
  [
    ['Variação absoluta', revenueDeltaText(revenue.delta.absolute)],
    ['Variação percentual', revenueDeltaText(revenue.delta.percentage, true)],
  ].forEach(([label, value], index) => {
    const x = 0.9 + index * 6.15;
    slide.addText(label, {
      x, y: 5.3, w: 5.4, h: 0.24,
      fontFace: 'Aptos', fontSize: 14, color: COLOR.muted, margin: 0,
    });
    slide.addText(value, {
      x, y: 5.67, w: 5.4, h: 0.38,
      fontFace: 'Aptos', fontSize: 22, bold: true, color: COLOR.white, margin: 0, fit: 'shrink',
    });
  });
}

function grossToNetDifferenceText(period: PresentationRevenueGrossToNetPeriod, percentage = false): string {
  if (percentage) {
    return period.differencePercent.state === 'available'
      ? formatPercentBR(period.differencePercent.value, 1)
      : 'Bruto zero ou negativo';
  }
  return fmtBRL(period.difference);
}

function addRevenueGrossNet(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  revenue: PresentationRevenueData,
): void {
  const rows = [
    { label: 'MÊS SELECIONADO', gross: revenue.current, net: revenue.netRevenue.current },
    { label: 'MÊS ANTERIOR', gross: revenue.previous, net: revenue.netRevenue.previous },
  ];
  rows.forEach((row, index) => {
    const x = 0.9 + index * 6.15;
    slide.addShape(pptx.ShapeType.rect, { x, y: 2.05, w: 0.05, h: 2.45, line: { color: COLOR.gold, transparency: 100 }, fill: { color: COLOR.gold } });
    slide.addText(row.label, { x: x + 0.22, y: 2.05, w: 5.35, h: 0.25, fontFace: 'Aptos', fontSize: 14, bold: true, color: COLOR.muted, margin: 0 });
    slide.addText(row.gross.month, { x: x + 0.22, y: 2.45, w: 5.35, h: 0.32, fontFace: 'Aptos', fontSize: 19, color: COLOR.white, margin: 0 });
    slide.addText('BRUTO (FECHAMENTO DE CAIXA)', { x: x + 0.22, y: 2.9, w: 5.35, h: 0.2, fontFace: 'Aptos', fontSize: 11, color: COLOR.muted, margin: 0 });
    slide.addText(fmtBRL(row.gross.total), { x: x + 0.22, y: 3.12, w: 5.4, h: 0.4, fontFace: 'Aptos Display', fontSize: 22, bold: true, color: COLOR.white, margin: 0, fit: 'shrink' });
    slide.addText('LÍQUIDO (LIVRO RAZÃO)', { x: x + 0.22, y: 3.58, w: 5.35, h: 0.2, fontFace: 'Aptos', fontSize: 11, color: COLOR.muted, margin: 0 });
    slide.addText(fmtBRL(row.net.total), { x: x + 0.22, y: 3.8, w: 5.4, h: 0.4, fontFace: 'Aptos Display', fontSize: 22, bold: true, color: COLOR.white, margin: 0, fit: 'shrink' });
  });
  slide.addShape(pptx.ShapeType.line, { x: 0.9, y: 5.05, w: 11.55, h: 0, line: { color: COLOR.subtle, width: 1 } });
  [
    ['Diferença (mês selecionado)', grossToNetDifferenceText(revenue.grossToNet.current)],
    ['% da diferença sobre o bruto', grossToNetDifferenceText(revenue.grossToNet.current, true)],
  ].forEach(([label, value], index) => {
    const x = 0.9 + index * 6.15;
    slide.addText(label, { x, y: 5.3, w: 5.4, h: 0.24, fontFace: 'Aptos', fontSize: 14, color: COLOR.muted, margin: 0 });
    slide.addText(value, { x, y: 5.67, w: 5.4, h: 0.38, fontFace: 'Aptos', fontSize: 22, bold: true, color: COLOR.white, margin: 0, fit: 'shrink' });
  });
  slide.addText('Líquido = receita operacional do livro razão (regime de caixa) — mesma base do KPI "Receita operacional" de Resultados.', { x: 0.9, y: 6.2, w: 11.55, h: 0.3, fontFace: 'Aptos', fontSize: 11, color: COLOR.muted, margin: 0 });
}

function addRevenueByBrand(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  revenue: PresentationRevenueData,
  items: readonly PresentationRevenueBrandPoint[],
): void {
  const total = revenue.current.total;
  if (items.length === 0) { addEmpty(slide, pptx, 'Sem faturamento no mês selecionado.'); return; }
  const hasSemCategoria = revenue.byBrand.some(item => item.marcaId !== null && item.categoriaId === null);
  let y = 1.85;
  if (hasSemCategoria) {
    slide.addText('Marcas sem categoria vinculada não têm líquido calculado.', {
      x: 0.9, y, w: 10.55, h: 0.3, fontFace: 'Aptos', fontSize: 11, color: COLOR.warning, margin: 0,
    });
    y += 0.4;
  }
  items.forEach((item: PresentationRevenueBrandPoint) => {
    slide.addText(item.nome, { x: 0.9, y, w: 4.0, h: 0.25, fontFace: 'Aptos', fontSize: 15, bold: true, color: COLOR.white, margin: 0, fit: 'shrink', breakLine: false });
    slide.addText(`${total > 0 ? formatPercentBR((item.total / total) * 100, 1) : '—'} do bruto do mês · ${item.closingCount} fechamento(s)`, { x: 0.9, y: y + 0.27, w: 4.0, h: 0.2, fontFace: 'Aptos', fontSize: 11, color: COLOR.muted, margin: 0, fit: 'shrink' });
    slide.addText('BRUTO', { x: 5.0, y, w: 1.65, h: 0.18, fontFace: 'Aptos', fontSize: 9, color: COLOR.muted, align: 'right', margin: 0 });
    slide.addText(fmtBRL(item.total), { x: 5.0, y: y + 0.18, w: 1.65, h: 0.3, fontFace: 'Aptos Mono', fontSize: 12, bold: true, color: COLOR.revenue, align: 'right', margin: 0, fit: 'shrink' });
    slide.addText('LÍQUIDO', { x: 6.8, y, w: 1.65, h: 0.18, fontFace: 'Aptos', fontSize: 9, color: COLOR.muted, align: 'right', margin: 0 });
    slide.addText(item.net === null ? '—' : fmtBRL(item.net), { x: 6.8, y: y + 0.18, w: 1.65, h: 0.3, fontFace: 'Aptos Mono', fontSize: 12, bold: true, color: COLOR.white, align: 'right', margin: 0, fit: 'shrink' });
    slide.addText('DIFERENÇA', { x: 8.6, y, w: 1.65, h: 0.18, fontFace: 'Aptos', fontSize: 9, color: COLOR.muted, align: 'right', margin: 0 });
    slide.addText(brandDifferenceText(item), { x: 8.6, y: y + 0.18, w: 1.65, h: 0.3, fontFace: 'Aptos Mono', fontSize: 12, bold: true, color: COLOR.warning, align: 'right', margin: 0, fit: 'shrink' });
    slide.addText('% DESCONTO', { x: 10.4, y, w: 1.65, h: 0.18, fontFace: 'Aptos', fontSize: 9, color: COLOR.muted, align: 'right', margin: 0 });
    slide.addText(brandDifferenceText(item, true), { x: 10.4, y: y + 0.18, w: 1.65, h: 0.3, fontFace: 'Aptos Mono', fontSize: 12, bold: true, color: COLOR.warning, align: 'right', margin: 0, fit: 'shrink' });
    slide.addShape(pptx.ShapeType.line, { x: 0.9, y: y + 0.52, w: 11.15, h: 0, line: { color: COLOR.subtle, width: 0.5, transparency: 35 } });
    y += 0.62;
  });
}

/** Diferença bruto − líquido por loja/marca, e sua % sobre o bruto; líquido nulo (marca sem categoria vinculada) → sem base para calcular. */
function brandDifferenceText(item: PresentationRevenueBrandPoint, percentage = false): string {
  if (item.net === null) return '—';
  const difference = item.total - item.net;
  if (percentage) return item.total > 0 ? formatPercentBR((difference / item.total) * 100, 1) : '—';
  return fmtBRL(difference);
}

function addRevenueWeekdays(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  revenue: PresentationRevenueData,
): void {
  revenue.weekdays.forEach((day, index) => {
    const x = 0.72 + index * 1.79;
    slide.addShape(pptx.ShapeType.rect, {
      x, y: 1.72, w: 1.57, h: 0.04,
      line: { color: COLOR.gold, transparency: 100 }, fill: { color: COLOR.gold },
    });
    slide.addText(day.label, {
      x, y: 1.9, w: 1.57, h: 0.4,
      fontFace: 'Aptos', fontSize: 14, bold: true, color: COLOR.white, margin: 0, fit: 'shrink',
    });
    const values = [
      ['TOTAL', day.state === 'available' ? fmtBRL(day.total) : 'Sem fechamento'],
      ['OCORRÊNCIAS', String(day.occurrences)],
      ['MÉDIA', day.average.state === 'available' ? fmtBRL(day.average.value) : 'Não aplicável'],
    ];
    values.forEach(([label, value], valueIndex) => {
      const y = 2.65 + valueIndex * 1.05;
      slide.addText(label, {
        x, y, w: 1.57, h: 0.2,
        fontFace: 'Aptos', fontSize: 10, color: COLOR.muted, margin: 0,
      });
      slide.addText(value, {
        x, y: y + 0.28, w: 1.57, h: 0.36,
        fontFace: 'Aptos', fontSize: 14, bold: true, color: COLOR.white, margin: 0, fit: 'shrink',
      });
    });
  });
}

const MONTHLY_LINE_CHART_MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
/** Cores por ano (não semânticas de receita/despesa) — mesma paleta do canvas e do PDF. */
const MONTHLY_LINE_CHART_YEAR_COLORS = [COLOR.series1, COLOR.series2, COLOR.series3];

interface PptxMonthlyLinePoint {
  month: number;
  state: 'available' | 'empty' | 'unavailable';
  value: number;
}

interface PptxMonthlyLineSeries {
  label: string;
  color: string;
  points: readonly PptxMonthlyLinePoint[];
}

/** Espelha `MonthlyLineChart` do canvas (mesma escala, mesmos buracos e cápsulas) em shapes PptxGenJS. */
function addMonthlyLineChart(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  series: readonly PptxMonthlyLineSeries[],
  emptyMessage: string,
): void {
  const left = 1.25;
  const right = 12.55;
  const top = 1.90;
  const bottom = 5.90;
  const slot = (right - left) / 12;
  const x = (month: number) => left + slot * (month - 1) + slot / 2;

  const availableValues = series.flatMap(item => item.points.filter(point => point.state === 'available').map(point => point.value));
  if (availableValues.length === 0) {
    addEmpty(slide, pptx, emptyMessage);
    return;
  }

  const rawMax = Math.max(0, ...availableValues);
  const rawMin = Math.min(0, ...availableValues);
  const spread = rawMax - rawMin;
  const max = rawMax + Math.max(spread * 0.18, 1);
  const min = rawMin - (rawMin < 0 ? Math.max(spread * 0.08, 1) : 0);
  const range = Math.max(max - min, 1);
  const y = (value: number) => bottom - ((value - min) / range) * (bottom - top);

  for (let index = 0; index < 4; index += 1) {
    const value = max - ((max - min) * index) / 3;
    const gridY = y(value);
    slide.addShape(pptx.ShapeType.line, {
      x: left, y: gridY, w: right - left, h: 0,
      line: { color: COLOR.subtle, transparency: 35, width: 0.7 },
    });
    slide.addText(fmtBRLCompact(value), {
      x: 0.58, y: gridY - 0.1, w: 0.62, h: 0.18,
      fontFace: 'Aptos', fontSize: 9, color: COLOR.muted, align: 'right', margin: 0, fit: 'shrink',
    });
  }
  if (min < 0) {
    slide.addShape(pptx.ShapeType.line, { x: left, y: y(0), w: right - left, h: 0, line: { color: COLOR.muted, width: 1 } });
  }

  MONTHLY_LINE_CHART_MONTH_LABELS.forEach((label, index) => {
    slide.addText(label, {
      x: x(index + 1) - slot / 2, y: 5.98, w: slot, h: 0.2,
      fontFace: 'Aptos', fontSize: 9, color: COLOR.muted, align: 'center', margin: 0,
    });
  });

  series.forEach(item => {
    let previous: { x: number; y: number } | null = null;
    item.points.forEach(point => {
      if (point.state !== 'available') {
        previous = null;
        return;
      }
      const current = { x: x(point.month), y: y(point.value) };
      if (previous) {
        slide.addShape(pptx.ShapeType.line, {
          x: previous.x, y: previous.y, w: current.x - previous.x, h: current.y - previous.y,
          line: { color: item.color, width: 2.25, beginArrowType: 'none', endArrowType: 'none' },
        });
      }
      previous = current;
    });
  });

  series.forEach(item => {
    item.points.filter(point => point.state === 'available').forEach(point => {
      slide.addShape(pptx.ShapeType.ellipse, {
        x: x(point.month) - 0.05, y: y(point.value) - 0.05, w: 0.10, h: 0.10,
        line: { color: item.color, transparency: 100 }, fill: { color: item.color },
      });
    });
  });

  const labelsByMonth = new Map<number, Array<{ color: string; value: number; y: number }>>();
  series.forEach(item => {
    item.points.forEach(point => {
      if (point.state !== 'available') return;
      const entries = labelsByMonth.get(point.month) ?? [];
      entries.push({ color: item.color, value: point.value, y: y(point.value) });
      labelsByMonth.set(point.month, entries);
    });
  });
  labelsByMonth.forEach((entries, month) => {
    [...entries].sort((left0, right0) => left0.y - right0.y).forEach((entry, index) => {
      const text = fmtBRLCompact(entry.value);
      const width = Math.max(text.length * 0.062 + 0.16, 0.42);
      const labelY = Math.max(entry.y - 0.05 - index * 0.24, top + 0.02);
      slide.addShape(pptx.ShapeType.roundRect, {
        x: x(month) - width / 2, y: labelY - 0.11, w: width, h: 0.22,
        line: { color: entry.color, width: 0.75 },
        fill: { color: COLOR.background },
      });
      slide.addText(text, {
        x: x(month) - width / 2, y: labelY - 0.11, w: width, h: 0.22,
        fontFace: 'Aptos', fontSize: 9, bold: true, color: entry.color,
        align: 'center', valign: 'middle', margin: 0, fit: 'shrink',
      });
    });
  });

  let legendX = 9.0;
  const legendY = 1.5;
  series.forEach(item => {
    slide.addShape(pptx.ShapeType.line, { x: legendX, y: legendY, w: 0.3, h: 0, line: { color: item.color, width: 2.25 } });
    slide.addText(item.label, {
      x: legendX + 0.36, y: legendY - 0.11, w: 1.4, h: 0.22,
      fontFace: 'Aptos', fontSize: 11, color: COLOR.white, margin: 0, fit: 'shrink',
    });
    legendX += 0.36 + item.label.length * 0.075 + 0.5;
  });
}

function addRevenueHistory(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  revenue: PresentationRevenueData,
): void {
  const series = revenue.requestedYears.map((year, index) => {
    const pointsByMonth = new Map(revenue.history.filter(point => point.year === year).map(point => [point.month, point]));
    return {
      label: String(year),
      color: MONTHLY_LINE_CHART_YEAR_COLORS[index % MONTHLY_LINE_CHART_YEAR_COLORS.length],
      points: Array.from({ length: 12 }, (_, monthIndex) => {
        const month = monthIndex + 1;
        const point = pointsByMonth.get(month);
        return { month, state: point?.state ?? 'unavailable', value: point?.total ?? 0 };
      }),
    };
  });
  addMonthlyLineChart(slide, pptx, series, 'Sem meses com fechamento de caixa nos anos selecionados.');
}

function expensePeriodText(period: PresentationExpensesData['current']): string {
  if (period.state === 'available') return fmtBRL(period.total);
  return period.state === 'empty' ? 'Sem despesas' : 'Sem cobertura';
}

function expenseDeltaText(delta: PresentationExpensesData['delta']['absolute'], percentage = false): string {
  if (delta.state === 'available') return percentage ? formatPercentBR(delta.value, 1) : fmtBRL(delta.value);
  if (delta.reason === 'zero-baseline') return 'Base anterior zero';
  return delta.reason === 'previous-period-absent' ? 'Mês anterior ausente' : 'Mês selecionado ausente';
}

/** Soma o `amount` dos nós de topo da árvore, separando operacional × não operacional (mesma regra do slide: excluir_dos_totais é herdado pela subárvore inteira). */
function operationalExpenseSplit(
  tree: readonly PresentationExpenseNode[],
): { operational: number; nonOperational: number } {
  return tree.reduce((totals, node) => (
    node.operationalClass === 'non-operational'
      ? { ...totals, nonOperational: totals.nonOperational + node.amount }
      : { ...totals, operational: totals.operational + node.amount }
  ), { operational: 0, nonOperational: 0 });
}

function addExpensesSummary(slide: PptxGenJS.Slide, pptx: PptxGenJS, expenses: PresentationExpensesData): void {
  [expenses.current, expenses.previous].forEach((period, index) => {
    const x = 0.9 + index * 6.15;
    slide.addShape(pptx.ShapeType.rect, { x, y: 2.05, w: 0.05, h: 2.45, line: { color: COLOR.expense, transparency: 100 }, fill: { color: COLOR.expense } });
    slide.addText(index === 0 ? 'MÊS SELECIONADO' : 'MÊS ANTERIOR', { x: x + 0.22, y: 2.05, w: 5.35, h: 0.25, fontFace: 'Aptos', fontSize: 14, bold: true, color: COLOR.muted, margin: 0 });
    slide.addText(period.month, { x: x + 0.22, y: 2.45, w: 5.35, h: 0.32, fontFace: 'Aptos', fontSize: 19, color: COLOR.white, margin: 0 });
    slide.addText(expensePeriodText(period), { x: x + 0.22, y: 3.05, w: 5.4, h: 0.62, fontFace: 'Aptos Display', fontSize: 31, bold: true, color: COLOR.white, margin: 0, fit: 'shrink' });
    slide.addText(`${period.quantity} lançamento(s) do razão`, { x: x + 0.22, y: 3.92, w: 5.3, h: 0.27, fontFace: 'Aptos', fontSize: 15, color: COLOR.muted, margin: 0 });
  });
  if (expenses.current.state === 'available') {
    const split = operationalExpenseSplit(expenses.tree);
    slide.addText('DESPESAS OPERACIONAIS (MÊS SELECIONADO)', { x: 0.9, y: 4.35, w: 5.8, h: 0.22, fontFace: 'Aptos', fontSize: 12, bold: true, color: COLOR.muted, margin: 0 });
    slide.addText('DESPESAS NÃO OPERACIONAIS (MÊS SELECIONADO)', { x: 7.0, y: 4.35, w: 5.8, h: 0.22, fontFace: 'Aptos', fontSize: 12, bold: true, color: COLOR.warning, margin: 0 });
    slide.addText(fmtBRL(split.operational), { x: 0.9, y: 4.6, w: 5.8, h: 0.32, fontFace: 'Aptos', fontSize: 17, bold: true, color: COLOR.white, margin: 0, fit: 'shrink' });
    slide.addText(fmtBRL(split.nonOperational), { x: 7.0, y: 4.6, w: 5.8, h: 0.32, fontFace: 'Aptos', fontSize: 17, bold: true, color: COLOR.warning, margin: 0, fit: 'shrink' });
  }
  const reading = expenses.delta.meaning === 'increase' ? 'Aumento · desfavorável' : expenses.delta.meaning === 'reduction' ? 'Redução · favorável' : expenses.delta.meaning === 'unchanged' ? 'Estável' : 'Indisponível';
  [['Variação absoluta', expenseDeltaText(expenses.delta.absolute)], ['Variação percentual', expenseDeltaText(expenses.delta.percentage, true)], ['Leitura executiva', reading]].forEach(([label, value], index) => {
    const x = 0.9 + index * 4.1;
    slide.addText(label, { x, y: 5.3, w: 3.7, h: 0.24, fontFace: 'Aptos', fontSize: 14, color: COLOR.muted, margin: 0 });
    slide.addText(value, { x, y: 5.67, w: 3.7, h: 0.38, fontFace: 'Aptos', fontSize: 20, bold: true, color: index === 2 && expenses.delta.favorability === 'favorable' ? COLOR.revenue : index === 2 && expenses.delta.favorability === 'unfavorable' ? COLOR.expense : COLOR.white, margin: 0, fit: 'shrink' });
  });
}

function flattenExpenseNodes(nodes: readonly PresentationExpenseNode[], depth = 0): Array<{ node: PresentationExpenseNode; depth: number }> {
  return nodes.flatMap(node => [{ node, depth }, ...flattenExpenseNodes(node.children, depth + 1)]);
}

/** % que `amount` representa da receita operacional líquida do período; sem base disponível → traço. */
function expenseShareOfNetRevenueText(amount: number, netRevenue: number | null): string {
  if (netRevenue === null || netRevenue <= 0) return '—';
  return formatPercentBR((amount / netRevenue) * 100, 1);
}

function addExpensesTree(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  nodes: readonly PresentationExpenseNode[],
  netRevenue: number | null,
): void {
  const rows = flattenExpenseNodes(nodes);
  if (rows.length === 0) { addEmpty(slide, pptx, 'Sem despesas no mês selecionado.'); return; }
  [['CATEGORIA', 0.8, 5.8], ['VALOR', 8.7, 1.7], ['% RECEITA LÍQ.', 10.5, 1.9]].forEach(([label, x, width]) => slide.addText(String(label), { x: Number(x), y: 1.65, w: Number(width), h: 0.2, fontFace: 'Aptos', fontSize: 11, bold: true, color: COLOR.muted, margin: 0, align: Number(x) > 1 ? 'right' : 'left' }));
  rows.forEach(({ node, depth }, index) => {
    const y = 2.02 + index * 0.5;
    slide.addShape(pptx.ShapeType.line, { x: 0.8, y: y + 0.32, w: 11.6, h: 0, line: { color: COLOR.subtle, width: 0.5, transparency: 35 } });
    slide.addText(`${depth > 0 ? '↳ ' : ''}${node.name}`, { x: 0.8 + depth * 0.3, y, w: 5.0 - depth * 0.3, h: 0.22, fontFace: 'Aptos', fontSize: 13, bold: depth === 0, color: COLOR.white, margin: 0, fit: 'shrink' });
    if (node.operationalClass === 'non-operational') slide.addText('NÃO OPERACIONAL', { x: 5.9, y, w: 1.0, h: 0.18, fontFace: 'Aptos', fontSize: 8, bold: true, color: COLOR.warning, margin: 0 });
    slide.addText(fmtBRL(node.amount), { x: 8.7, y, w: 1.7, h: 0.22, fontFace: 'Aptos', fontSize: 13, bold: true, color: COLOR.white, margin: 0, align: 'right', fit: 'shrink' });
    slide.addText(expenseShareOfNetRevenueText(node.amount, netRevenue), { x: 10.5, y, w: 1.9, h: 0.22, fontFace: 'Aptos', fontSize: 12, color: COLOR.muted, margin: 0, align: 'right', fit: 'shrink' });
  });
}

function addExpensesRolling(slide: PptxGenJS.Slide, pptx: PptxGenJS, expenses: PresentationExpensesData): void {
  const max = Math.max(1, ...expenses.rollingThreeMonths.map(point => point.total));
  expenses.rollingThreeMonths.forEach((point, index) => {
    const x = 1.35 + index * 4.05;
    const height = point.state === 'available' ? Math.max((point.total / max) * 3.5, 0.15) : 0.15;
    slide.addText(point.state === 'available' ? fmtBRL(point.total) : point.state === 'empty' ? 'Sem despesas' : 'Sem cobertura', { x: x - 0.7, y: 1.7, w: 2.9, h: 0.35, fontFace: 'Aptos', fontSize: 20, bold: true, color: COLOR.white, align: 'center', margin: 0, fit: 'shrink' });
    slide.addShape(pptx.ShapeType.rect, { x, y: 5.7 - height, w: 1.5, h: height, line: { color: COLOR.expense, transparency: 100 }, fill: { color: COLOR.expense, transparency: 30 } });
    slide.addText(point.yearMonth, { x: x - 0.5, y: 5.88, w: 2.5, h: 0.25, fontFace: 'Aptos', fontSize: 16, bold: true, color: COLOR.white, align: 'center', margin: 0 });
    slide.addText(`${point.quantity} lançamento(s)`, { x: x - 0.5, y: 6.2, w: 2.5, h: 0.2, fontFace: 'Aptos', fontSize: 11, color: COLOR.muted, align: 'center', margin: 0 });
  });
}

function addExpensesHistory(slide: PptxGenJS.Slide, pptx: PptxGenJS, expenses: PresentationExpensesData): void {
  const series = expenses.requestedYears.map((year, index) => {
    const pointsByMonth = new Map(expenses.history.filter(point => point.year === year).map(point => [point.month, point]));
    return {
      label: String(year),
      color: MONTHLY_LINE_CHART_YEAR_COLORS[index % MONTHLY_LINE_CHART_YEAR_COLORS.length],
      points: Array.from({ length: 12 }, (_, monthIndex) => {
        const month = monthIndex + 1;
        const point = pointsByMonth.get(month);
        return { month, state: point?.state ?? 'unavailable', value: point?.total ?? 0 };
      }),
    };
  });
  addMonthlyLineChart(slide, pptx, series, 'Sem despesas realizadas nos anos selecionados.');
}

function addRevenueExpensesMonthly(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  year: number,
  points: readonly PresentationRevenueExpenseMonthPoint[],
): void {
  if (points.length === 0) {
    addEmpty(slide, pptx, revenueExpensesYearMissingMessage(year));
    return;
  }
  const series: PptxMonthlyLineSeries[] = [
    {
      label: 'Receita líquida',
      color: COLOR.revenue,
      points: points.map(point => ({ month: point.month, state: point.netRevenue.state, value: point.netRevenue.total })),
    },
    {
      label: 'Despesa',
      color: COLOR.expense,
      points: points.map(point => ({ month: point.month, state: point.expense.state, value: point.expense.total })),
    },
  ];
  addMonthlyLineChart(slide, pptx, series, 'Sem receita líquida ou despesa disponível nos meses deste ano.');
}

function addResultsSummary(slide: PptxGenJS.Slide, pptx: PptxGenJS, results: PresentationResultsData): void {
  const metrics = [
    ['Receita operacional', fmtBRL(results.current.revenue), COLOR.revenue, 'Base operacional do período'],
    ['Despesa operacional', fmtBRL(results.current.expense), COLOR.expense, 'Base operacional do período'],
    ['Resultado operacional', fmtBRL(results.current.result), results.current.result < 0 ? COLOR.expense : COLOR.white, 'Receita − despesa'],
    ['Margem operacional', formatPercentBR(results.current.marginPercent, 1), COLOR.white, 'Resultado ÷ receita'],
  ] as const;
  metrics.forEach(([label, value, color, formula], index) => {
    const x = 0.72 + index * 3.1;
    slide.addShape(pptx.ShapeType.rect, {
      x, y: 2.25, w: 0.06, h: 2.35,
      line: { color: COLOR.gold, transparency: 100 }, fill: { color: COLOR.gold },
    });
    slide.addText(label, { x: x + 0.22, y: 2.35, w: 2.65, h: 0.34, fontFace: 'Aptos', fontSize: 17, color: COLOR.muted, margin: 0, fit: 'shrink' });
    slide.addText(value, { x: x + 0.22, y: 3.05, w: 2.65, h: 0.52, fontFace: 'Aptos Display', fontSize: 27, bold: true, color, margin: 0, fit: 'shrink' });
    slide.addText(formula, { x: x + 0.22, y: 4.02, w: 2.65, h: 0.25, fontFace: 'Aptos', fontSize: 12, color: COLOR.muted, margin: 0, fit: 'shrink' });
  });
}

function addResultsComparison(slide: PptxGenJS.Slide, pptx: PptxGenJS, results: PresentationResultsData): void {
  if (results.comparison.state === 'unavailable') {
    addEmpty(slide, pptx, results.comparison.reason === 'outside-available-period'
      ? 'Período anterior fora do histórico disponível.'
      : 'Comparação com o período anterior indisponível.');
    return;
  }
  const { previous, deltas } = results.comparison;
  const rows = [
    ['Receita', results.current.revenue, previous.revenue, deltas.revenue, true],
    ['Despesa', results.current.expense, previous.expense, deltas.expense, true],
    ['Resultado', results.current.result, previous.result, deltas.result, true],
    ['Margem', results.current.marginPercent, previous.marginPercent, deltas.margin, false],
  ] as const;
  const x = [0.72, 3.15, 5.45, 7.75, 10.05];
  const widths = [2.2, 2.05, 2.05, 2.05, 2.5];
  ['Métrica', 'Período atual', 'Período anterior', 'Variação absoluta', 'Variação relativa'].forEach((label, index) => {
    slide.addText(label, { x: x[index], y: 1.68, w: widths[index], h: 0.25, fontFace: 'Aptos', fontSize: 12, bold: true, color: COLOR.muted, margin: 0, align: index === 0 ? 'left' : 'right', fit: 'shrink' });
  });
  rows.forEach(([label, current, previousValue, delta, currency], index) => {
    const y = 2.22 + index * 0.83;
    const format = (value: number) => currency ? fmtBRL(value) : formatPercentBR(value, 1);
    const absolute = delta.absoluteChange === null
      ? 'Indisponível'
      : currency ? fmtBRL(delta.absoluteChange) : `${delta.absoluteChange.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`;
    slide.addShape(pptx.ShapeType.line, { x: 0.72, y: y - 0.13, w: 11.83, h: 0, line: { color: COLOR.subtle, transparency: 35, width: 0.7 } });
    [label, format(current), format(previousValue), absolute, formatMetricDelta(delta)].forEach((value, column) => {
      slide.addText(value, { x: x[column], y, w: widths[column], h: 0.28, fontFace: 'Aptos', fontSize: 14, bold: column === 0 || column === 4, color: column === 2 ? COLOR.muted : COLOR.white, margin: 0, align: column === 0 ? 'left' : 'right', fit: 'shrink' });
    });
  });
  slide.addText('Base zero preserva a variação absoluta sem gerar valores inválidos.', { x: 0.72, y: 5.85, w: 11.83, h: 0.24, fontFace: 'Aptos', fontSize: 11, color: COLOR.muted, margin: 0 });
}

function addResultsBridge(slide: PptxGenJS.Slide, pptx: PptxGenJS, results: PresentationResultsData): void {
  if (results.bridge.state === 'unavailable') {
    addEmpty(slide, pptx, results.bridge.reason === 'outside-available-period'
      ? 'Ponte indisponível: período anterior fora do histórico.'
      : 'Ponte indisponível sem comparação equivalente.');
    return;
  }
  results.bridge.steps.forEach((step, index) => {
    const x = 0.75 + index * 3.12;
    slide.addShape(pptx.ShapeType.rect, { x, y: 2.12, w: 2.72, h: 0.06, line: { color: COLOR.gold, transparency: 100 }, fill: { color: COLOR.gold } });
    slide.addText(step.label, { x, y: 2.45, w: 2.72, h: 0.35, fontFace: 'Aptos', fontSize: 16, bold: true, color: COLOR.muted, margin: 0, align: 'center', fit: 'shrink' });
    const signed = step.key === 'previous-result' || step.key === 'current-result'
      ? fmtBRL(step.value)
      : step.value > 0
        ? `+${fmtBRL(step.value)}`
        : step.value < 0
          ? `-${fmtBRL(Math.abs(step.value))}`
          : fmtBRL(step.value);
    const color = step.favorability === 'favorable' ? COLOR.revenue : step.favorability === 'unfavorable' ? COLOR.expense : COLOR.white;
    slide.addText(signed, { x, y: 3.15, w: 2.72, h: 0.48, fontFace: 'Aptos Display', fontSize: 27, bold: true, color, margin: 0, align: 'center', fit: 'shrink' });
    if (index > 0) slide.addText('+', { x: x - 0.3, y: 3.15, w: 0.2, h: 0.3, fontFace: 'Aptos', fontSize: 22, color: COLOR.muted, margin: 0, align: 'center' });
    if (step.key === 'expense-effect') slide.addText('Despesa maior reduz o resultado; menor aumenta.', { x, y: 3.95, w: 2.72, h: 0.38, fontFace: 'Aptos', fontSize: 11, color: COLOR.muted, margin: 0, align: 'center', fit: 'shrink' });
  });
  slide.addShape(pptx.ShapeType.line, { x: 0.75, y: 5.05, w: 11.78, h: 0, line: { color: COLOR.subtle, width: 1 } });
  slide.addText('Variação total do resultado', { x: 0.75, y: 5.35, w: 3.2, h: 0.28, fontFace: 'Aptos', fontSize: 14, color: COLOR.muted, margin: 0 });
  slide.addText(results.bridge.totalChange > 0
    ? `+${fmtBRL(results.bridge.totalChange)}`
    : results.bridge.totalChange < 0
      ? `-${fmtBRL(Math.abs(results.bridge.totalChange))}`
      : fmtBRL(results.bridge.totalChange), { x: 5.15, y: 5.28, w: 3, h: 0.38, fontFace: 'Aptos Display', fontSize: 21, bold: true, color: results.bridge.totalChange < 0 ? COLOR.expense : results.bridge.totalChange > 0 ? COLOR.revenue : COLOR.white, margin: 0, align: 'center', fit: 'shrink' });
  slide.addText('Ponte fechada exatamente no resultado atual', { x: 9.15, y: 5.35, w: 3.38, h: 0.28, fontFace: 'Aptos', fontSize: 12, color: COLOR.muted, margin: 0, align: 'right', fit: 'shrink' });
}

function addResultsNonOperational(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  results: PresentationResultsData,
  composition: CategoryCompositionSection,
): void {
  const totals = results.nonOperational.totals;
  [
    ['Receitas não operacionais', totals.revenue],
    ['Despesas não operacionais', totals.expense],
    ['Saldo não operacional', totals.result],
  ].forEach(([label, value], index) => {
    const x = 0.72 + index * 4.08;
    slide.addShape(pptx.ShapeType.rect, { x, y: 1.5, w: 0.05, h: 0.75, line: { color: COLOR.gold, transparency: 100 }, fill: { color: COLOR.gold } });
    slide.addText(String(label), { x: x + 0.18, y: 1.5, w: 3.55, h: 0.2, fontFace: 'Aptos', fontSize: 11, color: COLOR.muted, margin: 0, fit: 'shrink' });
    slide.addText(fmtBRL(value as number), { x: x + 0.18, y: 1.83, w: 3.55, h: 0.3, fontFace: 'Aptos Display', fontSize: 19, bold: true, color: COLOR.warning, margin: 0, fit: 'shrink' });
  });
  addCompositionColumn(slide, pptx, 'Receitas', composition.revenue, 'revenue', 0.72, 2.55);
  addCompositionColumn(slide, pptx, 'Despesas', composition.expense, 'expense', 6.92, 2.55);
}

function addInsights(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  items: readonly PresentationInsight[],
  rulesetVersion: string,
): void {
  if (items.length === 0) {
    addEmpty(slide, pptx, 'Nenhum insight atingiu os limiares mínimos de relevância e cobertura. Nenhuma leitura foi fabricada.');
    return;
  }
  slide.addText(`Regras ${rulesetVersion} · ordenação por relevância, domínio, prioridade da regra e ID`, {
    x: 0.72, y: 1.42, w: 11.88, h: 0.2,
    fontFace: 'Aptos', fontSize: 9, color: COLOR.muted, margin: 0, fit: 'shrink',
  });
  const gap = 0.2;
  const width = (11.88 - gap * (items.length - 1)) / items.length;
  items.forEach((insight, index) => {
    const x = 0.72 + index * (width + gap);
    const toneColor = insight.tone === 'positive'
      ? COLOR.revenue
      : insight.tone === 'negative' ? COLOR.expense : COLOR.gold;
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y: 1.72, w: width, h: 4.82,
      rectRadius: 0.05,
      line: { color: COLOR.subtle, width: 1 },
      fill: { color: COLOR.background, transparency: 100 },
    });
    slide.addShape(pptx.ShapeType.rect, {
      x, y: 1.72, w: 0.06, h: 4.82,
      line: { color: toneColor, transparency: 100 },
      fill: { color: toneColor },
    });
    slide.addText(insight.domain === 'revenue' ? 'FATURAMENTO' : 'DESPESAS', {
      x: x + 0.18, y: 1.9, w: width * 0.48, h: 0.17,
      fontFace: 'Aptos', fontSize: 9, bold: true, color: toneColor, margin: 0, fit: 'shrink',
    });
    slide.addText(`Regra ${insight.ruleVersion} · score ${insight.relevance.score}`, {
      x: x + width * 0.48, y: 1.9, w: width * 0.46 - 0.14, h: 0.17,
      fontFace: 'Aptos', fontSize: 7, color: COLOR.muted, margin: 0, align: 'right', fit: 'shrink',
    });
    slide.addText(insight.title, {
      x: x + 0.18, y: 2.22, w: width - 0.36, h: 0.58,
      fontFace: 'Aptos Display', fontSize: 17, bold: true, color: COLOR.white,
      margin: 0, breakLine: false, fit: 'shrink', valign: 'top',
    });
    slide.addText(insight.description, {
      x: x + 0.18, y: 2.92, w: width - 0.36, h: 0.55,
      fontFace: 'Aptos', fontSize: 10, color: COLOR.muted,
      margin: 0, breakLine: false, fit: 'shrink', valign: 'top',
    });
    slide.addShape(pptx.ShapeType.line, {
      x: x + 0.18, y: 3.68, w: 0, h: 0.83,
      line: { color: toneColor, width: 2 },
    });
    slide.addText('EVIDÊNCIA', {
      x: x + 0.32, y: 3.7, w: width - 0.5, h: 0.15,
      fontFace: 'Aptos', fontSize: 7, color: COLOR.muted, margin: 0,
    });
    slide.addText(presentationInsightEvidenceLabel(insight), {
      x: x + 0.32, y: 3.95, w: width - 0.5, h: 0.5,
      fontFace: 'Aptos', fontSize: 10, bold: true, color: COLOR.white,
      margin: 0, breakLine: false, fit: 'shrink', valign: 'top',
    });
    slide.addText([
      `Período: ${insight.period.label}`,
      `Fonte: ${insight.source.label}`,
      `Regime: ${presentationInsightRegimeLabel(insight)}`,
    ].join('\n'), {
      x: x + 0.18, y: 4.82, w: width - 0.36, h: 1.25,
      fontFace: 'Aptos', fontSize: 8, color: COLOR.muted,
      margin: 0, breakLine: false, fit: 'shrink', valign: 'bottom',
    });
  });
}

function addTimeSeries(slide: PptxGenJS.Slide, pptx: PptxGenJS, timeSeries: PresentationTimeSeries): void {
  if (timeSeries.points.length === 0) {
    addEmpty(slide, pptx, 'Sem pontos na série temporal.');
    return;
  }
  const left = 1.25;
  const right = 12.55;
  const top = 1.82;
  const bottom = 6.18;
  const values = timeSeries.points.flatMap(point => [point.metrics.revenue, point.metrics.expense, point.metrics.result]);
  const rawMax = Math.max(0, ...values);
  const rawMin = Math.min(0, ...values);
  const padding = Math.max((rawMax - rawMin) * 0.08, 1);
  const max = rawMax + padding;
  const min = rawMin - (rawMin < 0 ? padding : 0);
  const range = Math.max(max - min, 1);
  const y = (value: number) => bottom - ((value - min) / range) * (bottom - top);
  const zeroY = y(0);
  const step = (right - left) / timeSeries.points.length;

  for (let index = 0; index < 4; index += 1) {
    const value = max - ((max - min) * index) / 3;
    const gridY = y(value);
    slide.addShape(pptx.ShapeType.line, {
      x: left, y: gridY, w: right - left, h: 0,
      line: { color: COLOR.subtle, transparency: 35, width: 0.7 },
    });
    slide.addText(fmtBRLCompact(value), {
      x: 0.72, y: gridY - 0.1, w: 0.48, h: 0.18,
      fontFace: 'Aptos', fontSize: 10, color: COLOR.muted,
      align: 'right', margin: 0, fit: 'shrink',
    });
  }
  slide.addShape(pptx.ShapeType.line, {
    x: left, y: zeroY, w: right - left, h: 0,
    line: { color: COLOR.muted, width: 1 },
  });

  let previousResult: { x: number; y: number } | null = null;
  timeSeries.points.forEach((point, index) => {
    const center = left + step * index + step / 2;
    const barWidth = Math.min(step * 0.22, 0.22);
    const revenueY = y(point.metrics.revenue);
    const expenseY = y(point.metrics.expense);
    slide.addShape(pptx.ShapeType.rect, {
      x: center - barWidth - 0.025,
      y: Math.min(revenueY, zeroY),
      w: barWidth,
      h: Math.max(Math.abs(zeroY - revenueY), 0.015),
      line: { color: COLOR.revenue, transparency: 100 },
      fill: { color: COLOR.revenue },
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: center + 0.025,
      y: Math.min(expenseY, zeroY),
      w: barWidth,
      h: Math.max(Math.abs(zeroY - expenseY), 0.015),
      line: { color: COLOR.expense, transparency: 100 },
      fill: { color: COLOR.expense },
    });

    const result = { x: center, y: y(point.metrics.result) };
    if (previousResult) {
      slide.addShape(pptx.ShapeType.line, {
        x: previousResult.x,
        y: previousResult.y,
        w: result.x - previousResult.x,
        h: result.y - previousResult.y,
        line: { color: COLOR.gold, width: 2.5, beginArrowType: 'none', endArrowType: 'none' },
      });
    }
    slide.addShape(pptx.ShapeType.ellipse, {
      x: result.x - 0.055, y: result.y - 0.055, w: 0.11, h: 0.11,
      line: { color: COLOR.gold, transparency: 100 }, fill: { color: COLOR.gold },
    });
    previousResult = result;

    slide.addText(formatPresentationSeriesLabel(point.key, timeSeries.granularity), {
      x: center - step * 0.44, y: 6.27, w: step * 0.88, h: 0.35,
      fontFace: 'Aptos', fontSize: 11, color: COLOR.muted,
      align: 'center', valign: 'top', margin: 0, fit: 'shrink',
    });
  });

  const legend = [
    { x: 9.1, label: 'Receita', color: COLOR.revenue },
    { x: 10.3, label: 'Despesa', color: COLOR.expense },
    { x: 11.55, label: 'Resultado', color: COLOR.gold },
  ];
  legend.forEach(item => {
    slide.addShape(pptx.ShapeType.rect, {
      x: item.x, y: 1.45, w: 0.12, h: 0.12,
      line: { color: item.color, transparency: 100 }, fill: { color: item.color },
    });
    slide.addText(item.label, {
      x: item.x + 0.17, y: 1.42, w: 0.85, h: 0.2,
      fontFace: 'Aptos', fontSize: 12, color: COLOR.white, margin: 0,
    });
  });
}

function addCompositionColumn(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  title: string,
  nodes: CategoryCompositionSection['revenue'],
  tone: 'revenue' | 'expense',
  x: number,
  y = 1.62,
): void {
  const rows = flattenPresentationCategories(nodes);
  slide.addText(title, {
    x, y, w: 2.2, h: 0.3,
    fontFace: 'Aptos', fontSize: 20, bold: true,
    color: tone === 'revenue' ? COLOR.revenue : COLOR.expense, margin: 0,
  });
  slide.addText('Direto / Acumulado', {
    x: x + 3.8, y: y + 0.03, w: 1.9, h: 0.2,
    fontFace: 'Aptos', fontSize: 12, color: COLOR.muted,
    align: 'right', margin: 0,
  });
  slide.addShape(pptx.ShapeType.line, {
    x, y: y + 0.4, w: 5.7, h: 0,
    line: { color: COLOR.subtle, width: 1 },
  });
  if (rows.length === 0) {
    slide.addText('Sem valores nesta composição.', {
      x, y: y + 0.75, w: 5.7, h: 0.3,
      fontFace: 'Aptos', fontSize: 16, color: COLOR.muted, margin: 0,
    });
    return;
  }
  rows.forEach(({ node, depth }, index) => {
    const rowY = y + 0.58 + index * 0.48;
    slide.addText(`${depth > 0 ? '↳ ' : ''}${node.name}`, {
      x: x + depth * 0.16, y: rowY, w: Math.max(3.35 - depth * 0.16, 2.6), h: 0.23,
      fontFace: 'Aptos', fontSize: 16, bold: depth === 0,
      color: COLOR.white, margin: 0, fit: 'shrink', breakLine: false,
    });
    slide.addText(formatPercentBR(node.sharePercent, 1), {
      x: x + depth * 0.16, y: rowY + 0.23, w: 1.1, h: 0.14,
      fontFace: 'Aptos', fontSize: 10, color: COLOR.muted, margin: 0,
    });
    slide.addText(`${fmtBRL(node.directAmount)} / ${fmtBRL(node.amount)}`, {
      x: x + 3.42, y: rowY, w: 2.28, h: 0.23,
      fontFace: 'Aptos Mono', fontSize: 12, color: COLOR.white,
      align: 'right', margin: 0, fit: 'shrink', breakLine: false,
    });
    slide.addShape(pptx.ShapeType.line, {
      x, y: rowY + 0.42, w: 5.7, h: 0,
      line: { color: COLOR.subtle, transparency: 55, width: 0.6 },
    });
  });
}

function addComposition(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  section: CategoryCompositionSection,
  nonOperational = false,
): void {
  const y = nonOperational ? 2.08 : 1.62;
  if (nonOperational) {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.72, y: 1.5, w: 3.75, h: 0.36,
      line: { color: COLOR.gold, transparency: 45, width: 1 },
      fill: { color: '2B2514' },
    });
    slide.addText('FORA DO RESULTADO OPERACIONAL', {
      x: 0.85, y: 1.58, w: 3.45, h: 0.18,
      fontFace: 'Aptos', fontSize: 12, bold: true, color: COLOR.warning, margin: 0,
    });
  }
  addCompositionColumn(slide, pptx, 'Receitas', section.revenue, 'revenue', 0.72, y);
  addCompositionColumn(slide, pptx, 'Despesas', section.expense, 'expense', 6.92, y);
}

function addRankingColumn(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  title: string,
  items: readonly PresentationRankingItem[],
  tone: 'revenue' | 'expense',
  x: number,
): void {
  slide.addText(title, {
    x, y: 1.62, w: 3.5, h: 0.3,
    fontFace: 'Aptos', fontSize: 22, bold: true,
    color: tone === 'revenue' ? COLOR.revenue : COLOR.expense, margin: 0,
  });
  if (items.length === 0) {
    slide.addText('Nenhuma categoria no período.', {
      x, y: 2.2, w: 5.7, h: 0.3,
      fontFace: 'Aptos', fontSize: 16, color: COLOR.muted, margin: 0,
    });
    return;
  }
  items.forEach((item, index) => {
    const rowY = 2.18 + index * 0.68;
    slide.addText(String(item.rank), {
      x, y: rowY, w: 0.35, h: 0.3,
      fontFace: 'Aptos Display', fontSize: 22, bold: true, color: COLOR.gold,
      align: 'center', margin: 0,
    });
    slide.addText(item.label, {
      x: x + 0.52, y: rowY, w: 3.35, h: 0.25,
      fontFace: 'Aptos', fontSize: 16, bold: true, color: COLOR.white,
      margin: 0, fit: 'shrink', breakLine: false,
    });
    slide.addText(`${formatPercentBR(item.sharePercent, 1)} da composição`, {
      x: x + 0.52, y: rowY + 0.3, w: 3.2, h: 0.18,
      fontFace: 'Aptos', fontSize: 11, color: COLOR.muted, margin: 0,
    });
    slide.addText(fmtBRL(item.amount), {
      x: x + 4, y: rowY, w: 1.7, h: 0.25,
      fontFace: 'Aptos Mono', fontSize: 15, bold: true,
      color: tone === 'revenue' ? COLOR.revenue : COLOR.expense,
      align: 'right', margin: 0, fit: 'shrink', breakLine: false,
    });
    slide.addShape(pptx.ShapeType.line, {
      x, y: rowY + 0.56, w: 5.7, h: 0,
      line: { color: COLOR.subtle, transparency: 40, width: 0.7 },
    });
  });
}

function addOpenItems(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  indicators: OpenItemsIndicators,
): void {
  const items = [
    { x: 0.78, label: 'Contas a pagar em aberto', data: indicators.accountsPayableOpen, color: COLOR.warning },
    { x: 6.92, label: 'Contas a receber em aberto', data: indicators.accountsReceivableOpen, color: COLOR.white },
  ];
  items.forEach(item => {
    slide.addShape(pptx.ShapeType.rect, {
      x: item.x, y: 2.1, w: 5.55, h: 0.06,
      line: { color: COLOR.gold, transparency: 100 }, fill: { color: COLOR.gold },
    });
    slide.addText(item.label, {
      x: item.x, y: 2.45, w: 5.4, h: 0.35,
      fontFace: 'Aptos', fontSize: 22, bold: true, color: COLOR.muted, margin: 0,
    });
    slide.addText(fmtBRL(item.data.amount), {
      x: item.x, y: 3.1, w: 5.4, h: 0.72,
      fontFace: 'Aptos Display', fontSize: 38, bold: true,
      color: item.color, margin: 0, fit: 'shrink', breakLine: false,
    });
    slide.addText(`${formatIntegerBR(item.data.count)} título(s)`, {
      x: item.x, y: 4.15, w: 3, h: 0.35,
      fontFace: 'Aptos', fontSize: 20, color: COLOR.white, margin: 0,
    });
    slide.addText('Indicador em aberto - fora do resultado gerencial', {
      x: item.x, y: 4.65, w: 5.4, h: 0.3,
      fontFace: 'Aptos', fontSize: 16, color: COLOR.muted,
      margin: 0, fit: 'shrink', breakLine: false,
    });
  });
}

function formatPlanValue(unit: 'currency' | 'percent', value: number | null): string {
  if (value === null) return 'Não configurado';
  return unit === 'currency' ? fmtBRL(value) : formatPercentBR(value, 1);
}

function addPlanComparison(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  plan: PresentationPlanData,
): void {
  const indicators = buildPresentationPlanIndicators(plan);
  indicators.forEach((indicator, index) => {
    const x = 0.72 + index * 2.5;
    const statusColor = indicator.status === 'favorable'
      ? COLOR.revenue
      : indicator.status === 'unfavorable'
        ? COLOR.expense
        : indicator.status === 'partial'
          ? COLOR.warning
          : COLOR.muted;
    slide.addShape(pptx.ShapeType.rect, {
      x, y: 1.72, w: 2.22, h: 3.72,
      line: { color: COLOR.subtle, width: 1 },
      fill: { color: COLOR.background, transparency: 100 },
    });
    slide.addShape(pptx.ShapeType.rect, {
      x, y: 1.72, w: 0.05, h: 3.72,
      line: { color: COLOR.gold, transparency: 100 },
      fill: { color: COLOR.gold },
    });
    slide.addText(indicator.label, {
      x: x + 0.18, y: 1.94, w: 1.85, h: 0.42,
      fontFace: 'Aptos', fontSize: 17, bold: true, color: COLOR.white,
      margin: 0, fit: 'shrink', breakLine: false,
    });
    const rows = [
      { label: 'Realizado', value: indicator.actual },
      { label: 'Orçado', value: indicator.budget },
      { label: 'Projeção', value: indicator.projection },
    ];
    rows.forEach((row, rowIndex) => {
      const rowY = 2.58 + rowIndex * 0.72;
      slide.addText(row.label, {
        x: x + 0.18, y: rowY, w: 1.85, h: 0.2,
        fontFace: 'Aptos', fontSize: 12, color: COLOR.muted, margin: 0,
      });
      slide.addText(formatPlanValue(indicator.unit, row.value), {
        x: x + 0.18, y: rowY + 0.23, w: 1.85, h: 0.3,
        fontFace: 'Aptos Display', fontSize: 17, bold: true, color: COLOR.white,
        margin: 0, fit: 'shrink', breakLine: false,
      });
    });
    slide.addText(indicator.statusLabel, {
      x: x + 0.18, y: 4.91, w: 1.85, h: 0.24,
      fontFace: 'Aptos', fontSize: 12, bold: true, color: statusColor,
      margin: 0, fit: 'shrink', breakLine: false,
    });
  });

  const cmvTarget = plan.budget.cmvTargetState === 'available'
    ? formatPercentBR(plan.budget.cmvTargetPercent ?? 0, 1)
    : 'não configurada';
  slide.addText(
    `Projeção determinística: realizado até o corte ÷ ${plan.projection.sampleDays} dias × ${plan.projection.totalDays} dias. Meta de CMV: ${cmvTarget}.`,
    {
      x: 0.72, y: 5.72, w: 11.9, h: 0.35,
      fontFace: 'Aptos', fontSize: 15, color: COLOR.muted,
      margin: 0, fit: 'shrink', breakLine: false,
    },
  );
  slide.addText('Competência · contas em aberto fora do resultado · sem metas presumidas', {
    x: 0.72, y: 6.12, w: 11.9, h: 0.28,
    fontFace: 'Aptos', fontSize: 13, color: COLOR.gold, margin: 0,
  });
}

function addSimulationBadge(slide: PptxGenJS.Slide, pptx: PptxGenJS): void {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.72, y: 1.48, w: 1.35, h: 0.34,
    line: { color: COLOR.gold, transparency: 30 },
    fill: { color: '2B2514' },
  });
  slide.addText('SIMULAÇÃO', {
    x: 0.81, y: 1.55, w: 1.18, h: 0.16,
    fontFace: 'Aptos', fontSize: 12, bold: true, color: COLOR.warning,
    charSpacing: 1.4, margin: 0, align: 'center',
  });
}

function addScenarioImpact(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  scenario: PresentationScenarioResult,
): void {
  addSimulationBadge(slide, pptx);
  const metrics = [
    { label: 'Receita', base: scenario.baseline.revenue, value: scenario.scenario.revenue, impact: scenario.impact.revenue.absolute, percent: false },
    { label: 'Despesas', base: scenario.baseline.expense, value: scenario.scenario.expense, impact: scenario.impact.expense.absolute, percent: false },
    { label: 'Resultado', base: scenario.baseline.result, value: scenario.scenario.result, impact: scenario.impact.result.absolute, percent: false },
    { label: 'Margem', base: scenario.baseline.marginPercent, value: scenario.scenario.marginPercent, impact: scenario.impact.margin.absolute, percent: true },
    { label: 'CMV', base: scenario.baseline.cmv, value: scenario.scenario.cmv, impact: scenario.impact.cmv.absolute, percent: false },
  ];
  const format = (value: number | null, percent: boolean) => value === null
    ? 'Indisponível'
    : percent ? formatPercentBR(value, 1) : fmtBRL(value);
  metrics.forEach((metric, index) => {
    const x = 0.72 + index * 2.52;
    slide.addShape(pptx.ShapeType.rect, {
      x, y: 2.02, w: 0.035, h: 2.45,
      line: { color: COLOR.gold, transparency: 100 }, fill: { color: COLOR.gold },
    });
    slide.addText(metric.label, {
      x: x + 0.16, y: 2.02, w: 2.15, h: 0.25,
      fontFace: 'Aptos', fontSize: 14, bold: true, color: COLOR.muted, margin: 0,
    });
    slide.addText('BASE', {
      x: x + 0.16, y: 2.48, w: 2.15, h: 0.18,
      fontFace: 'Aptos', fontSize: 10, color: COLOR.muted, margin: 0,
    });
    slide.addText(format(metric.base, metric.percent), {
      x: x + 0.16, y: 2.7, w: 2.15, h: 0.34,
      fontFace: 'Aptos Display', fontSize: 19, bold: true, color: COLOR.white, margin: 0, fit: 'shrink',
    });
    slide.addText('CENÁRIO', {
      x: x + 0.16, y: 3.22, w: 2.15, h: 0.18,
      fontFace: 'Aptos', fontSize: 10, color: COLOR.muted, margin: 0,
    });
    slide.addText(format(metric.value, metric.percent), {
      x: x + 0.16, y: 3.46, w: 2.15, h: 0.38,
      fontFace: 'Aptos Display', fontSize: 21, bold: true, color: COLOR.white, margin: 0, fit: 'shrink',
    });
    slide.addText(
      metric.impact === null ? 'Impacto indisponível' : metric.percent ? `${metric.impact.toFixed(1)} p.p.` : fmtBRL(metric.impact),
      {
        x: x + 0.16, y: 4.05, w: 2.15, h: 0.22,
        fontFace: 'Aptos', fontSize: 12, bold: true,
        color: (metric.impact ?? 0) >= 0 ? COLOR.revenue : COLOR.expense,
        margin: 0, fit: 'shrink',
      },
    );
  });

  const ranking = [...scenario.activeLevers]
    .sort((left, right) => Math.abs(right.resultImpact) - Math.abs(left.resultImpact) || left.id.localeCompare(right.id))
    .slice(0, 6);
  slide.addText('Premissas explícitas · impacto no resultado', {
    x: 0.72, y: 4.75, w: 6.5, h: 0.25,
    fontFace: 'Aptos', fontSize: 15, bold: true, color: COLOR.white, margin: 0,
  });
  ranking.forEach((lever, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = column === 0 ? 0.72 : 6.92;
    const y = 5.18 + row * 0.38;
    slide.addText(String(index + 1), {
      x, y, w: 0.25, h: 0.2, fontFace: 'Aptos', fontSize: 12, bold: true, color: COLOR.gold, margin: 0,
    });
    slide.addText(lever.label, {
      x: x + 0.32, y, w: 3.65, h: 0.2, fontFace: 'Aptos', fontSize: 12, color: COLOR.muted, margin: 0, fit: 'shrink',
    });
    slide.addText(fmtBRL(lever.resultImpact), {
      x: x + 4.15, y, w: 1.15, h: 0.2, fontFace: 'Aptos', fontSize: 12, bold: true,
      color: lever.resultImpact >= 0 ? COLOR.revenue : COLOR.expense, align: 'right', margin: 0, fit: 'shrink',
    });
  });
  slide.addText(`Base ${scenario.baselineMode} · corte ${scenario.cutoffDate} · ${scenario.formulaVersion} · contas em aberto e transferências fora`, {
    x: 0.72, y: 6.42, w: 11.9, h: 0.22, fontFace: 'Aptos', fontSize: 10, color: COLOR.muted, margin: 0,
  });
}

function addScenarioSensitivity(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  scenario: PresentationScenarioResult,
): void {
  if (scenario.sensitivity.state !== 'available') {
    addEmpty(slide, pptx, 'Sensibilidade não configurada.');
    return;
  }
  addSimulationBadge(slide, pptx);
  const sensitivity = scenario.sensitivity;
  const left = 1.25;
  const right = 12.55;
  const top = 2.05;
  const bottom = 5.8;
  const values = sensitivity.points.map(point => point.result);
  const minX = Math.min(...sensitivity.points.map(point => point.inputValue));
  const maxX = Math.max(...sensitivity.points.map(point => point.inputValue));
  const minY = Math.min(0, ...values);
  const maxY = Math.max(0, ...values);
  const xRange = Math.max(maxX - minX, 1);
  const yRange = Math.max(maxY - minY, 1);
  const x = (value: number) => left + ((value - minX) / xRange) * (right - left);
  const y = (value: number) => bottom - ((value - minY) / yRange) * (bottom - top);
  for (let index = 0; index < 4; index += 1) {
    const value = maxY - ((maxY - minY) * index) / 3;
    const gridY = y(value);
    slide.addShape(pptx.ShapeType.line, {
      x: left, y: gridY, w: right - left, h: 0,
      line: { color: COLOR.subtle, transparency: 35, width: 0.7 },
    });
    slide.addText(fmtBRLCompact(value), {
      x: 0.72, y: gridY - 0.1, w: 0.48, h: 0.18,
      fontFace: 'Aptos', fontSize: 10, color: COLOR.muted, align: 'right', margin: 0,
    });
  }
  let previous: { x: number; y: number } | null = null;
  sensitivity.points.forEach(point => {
    const current = { x: x(point.inputValue), y: y(point.result) };
    if (previous) {
      slide.addShape(pptx.ShapeType.line, {
        x: previous.x, y: previous.y, w: current.x - previous.x, h: current.y - previous.y,
        line: { color: COLOR.gold, width: 2.5, beginArrowType: 'none', endArrowType: 'none' },
      });
    }
    slide.addShape(pptx.ShapeType.ellipse, {
      x: current.x - (point.isBase ? 0.075 : 0.04),
      y: current.y - (point.isBase ? 0.075 : 0.04),
      w: point.isBase ? 0.15 : 0.08,
      h: point.isBase ? 0.15 : 0.08,
      line: { color: COLOR.gold, width: point.isBase ? 1.5 : 0.5 },
      fill: { color: point.isBase ? COLOR.white : COLOR.gold },
    });
    previous = current;
  });
  slide.addText(`${sensitivity.leverLabel} (${sensitivity.unit === 'currency' ? 'R$' : '%'})`, {
    x: 4.65, y: 5.92, w: 4, h: 0.25, fontFace: 'Aptos', fontSize: 13, bold: true, color: COLOR.white, align: 'center', margin: 0,
  });
  const base = sensitivity.points.find(point => point.isBase);
  const formatInput = (value: number) => sensitivity.unit === 'currency' ? fmtBRL(value) : formatPercentBR(value, 2);
  slide.addText(`Faixa ${formatInput(minX)} a ${formatInput(maxX)} · configuração atual ${base ? formatInput(base.inputValue) : 'indisponível'} · demais alavancas fixas`, {
    x: 0.72, y: 6.28, w: 7.8, h: 0.23, fontFace: 'Aptos', fontSize: 11, color: COLOR.muted, margin: 0, fit: 'shrink',
  });
  slide.addText(
    sensitivity.breakEven.state === 'available'
      ? `Equilíbrio: ${formatInput(sensitivity.breakEven.inputValue)}`
      : 'Ponto de equilíbrio indisponível com as informações atuais',
    {
      x: 8.7, y: 6.28, w: 3.9, h: 0.23, fontFace: 'Aptos', fontSize: 11,
      color: COLOR.gold, bold: true, align: 'right', margin: 0, fit: 'shrink',
    },
  );
}

function addDecisionCommitments(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  detail: PresentationDecisionDetail,
): void {
  const revision = detail.revisions.find(item => item.id === detail.decision.currentRevisionId);
  if (!revision) { addEmpty(slide, pptx, 'Revisão aprovada indisponível.'); return; }
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.72, y: 1.7, w: 1.45, h: 0.34,
    line: { color: COLOR.gold, width: 1 }, fill: { color: COLOR.gold, transparency: 85 },
  });
  slide.addText(presentationDecisionStatusLabel(detail.decision.status), {
    x: 0.78, y: 1.78, w: 1.33, h: 0.16, fontFace: 'Aptos', fontSize: 11,
    bold: true, color: COLOR.warning, align: 'center', margin: 0, fit: 'shrink',
  });
  if (detail.decision.referenceType === 'SCENARIO') {
    slide.addText('SIMULAÇÃO', {
      x: 2.35, y: 1.79, w: 1.2, h: 0.16, fontFace: 'Aptos', fontSize: 11,
      bold: true, color: COLOR.warning, charSpacing: 1.5, margin: 0,
    });
  }
  const contextLimit = 430;
  const context = detail.decision.context.length > contextLimit
    ? `${detail.decision.context.slice(0, contextLimit)}… [contexto completo no registro ${detail.decision.id}]`
    : detail.decision.context;
  slide.addText(context, {
    x: 0.72, y: 2.2, w: 5.2, h: 1.25, fontFace: 'Aptos', fontSize: 15,
    color: COLOR.white, margin: 0, valign: 'top', fit: 'shrink', breakLine: false,
  });
  slide.addText(
    `Responsável: ${detail.decision.executiveResponsibleName ?? 'não informado'}\nAprovador: ${revision.approvedByName ?? 'usuário removido'}\nRevisão ${revision.revisionNumber} · corte ${revision.snapshot.cutoffDate}`,
    { x: 0.72, y: 3.52, w: 5.2, h: 0.72, fontFace: 'Aptos', fontSize: 11, color: COLOR.muted, margin: 0, breakLine: false },
  );
  const metrics = [
    ['Receita', revision.snapshot.metrics.revenue, false],
    ['Despesa', revision.snapshot.metrics.expense, false],
    ['Resultado', revision.snapshot.metrics.result, false],
    ['Margem', revision.snapshot.metrics.marginPercent, true],
  ] as const;
  metrics.forEach((metric, index) => {
    const x = 6.35 + (index % 2) * 3.15;
    const y = 1.78 + Math.floor(index / 2) * 0.82;
    slide.addShape(pptx.ShapeType.rect, {
      x, y, w: 0.05, h: 0.62, line: { color: COLOR.gold, transparency: 100 }, fill: { color: COLOR.gold },
    });
    slide.addText(`${metric[0]} esperado`, { x: x + 0.15, y, w: 2.75, h: 0.18, fontFace: 'Aptos', fontSize: 11, color: COLOR.muted, margin: 0 });
    const formatted = metric[1] === null ? 'Indisponível' : metric[2] ? formatPercentBR(metric[1], 1) : fmtBRL(metric[1]);
    slide.addText(formatted, { x: x + 0.15, y: y + 0.24, w: 2.75, h: 0.28, fontFace: 'Aptos', fontSize: 17, bold: true, color: COLOR.white, margin: 0, fit: 'shrink' });
  });
  const assumptions = revision.snapshot.assumptions.length === 0
    ? 'Referência canônica sem premissas de simulação.'
    : revision.snapshot.assumptions.slice(0, 3).map(item => `${item.label}: ${item.exactValue || item.calculatedInputValue}`).join(' · ')
      + (revision.snapshot.assumptions.length > 3 ? ` · +${revision.snapshot.assumptions.length - 3} premissa(s) no snapshot` : '');
  slide.addText(assumptions, { x: 6.35, y: 3.48, w: 6.15, h: 0.62, fontFace: 'Aptos', fontSize: 11, color: COLOR.muted, margin: 0, fit: 'shrink' });
  slide.addShape(pptx.ShapeType.line, { x: 0.72, y: 4.36, w: 11.88, h: 0, line: { color: COLOR.subtle, width: 1 } });
  slide.addText('Compromissos', { x: 0.72, y: 4.5, w: 2, h: 0.2, fontFace: 'Aptos', fontSize: 14, bold: true, color: COLOR.gold, margin: 0 });
  if (detail.actions.length === 0) {
    slide.addText('Nenhuma ação registrada.', { x: 0.72, y: 4.88, w: 5, h: 0.25, fontFace: 'Aptos', fontSize: 13, color: COLOR.muted, margin: 0 });
    return;
  }
  let leftY = 4.88;
  let rightY = 4.88;
  detail.actions.forEach((action, index) => {
    const x = index % 2 === 0 ? 0.72 : 6.75;
    const y = index % 2 === 0 ? leftY : rightY;
    const estimatedLines = Math.max(1, Math.ceil(action.description.length / 85));
    const height = Math.min(0.6, 0.18 + estimatedLines * 0.13);
    slide.addText(action.description, { x, y, w: 4.9, h: height, fontFace: 'Aptos', fontSize: 11, color: COLOR.white, margin: 0, fit: 'shrink', valign: 'top' });
    slide.addText(`${action.responsibleName} · ${action.dueDate ? formatDateValueBR(action.dueDate) : 'sem prazo'} · ${presentationActionStatusLabel(action.status)}`, { x, y: y + height + 0.03, w: 5.45, h: 0.16, fontFace: 'Aptos', fontSize: 9, color: COLOR.muted, margin: 0, fit: 'shrink' });
    slide.addShape(pptx.ShapeType.line, { x, y: y + height + 0.24, w: 5.45, h: 0, line: { color: COLOR.subtle, width: 0.7, transparency: 35 } });
    if (index % 2 === 0) leftY = y + height + 0.34;
    else rightY = y + height + 0.34;
  });
}

function addDecisionFollowUp(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  detail: PresentationDecisionDetail,
  comparison: Extract<PresentationDecisionComparison, { state: 'available' }>,
): void {
  slide.addText(`${detail.decision.title} · snapshot ${new Date(comparison.snapshotCapturedAt).toLocaleString('pt-BR')} · base atual ${new Date(comparison.currentGeneratedAt).toLocaleString('pt-BR')}`, {
    x: 0.72, y: 1.72, w: 11.88, h: 0.22, fontFace: 'Aptos', fontSize: 11, color: COLOR.muted, margin: 0, fit: 'shrink',
  });
  const x = [0.72, 2.55, 5.05, 7.55, 10.05];
  const widths = [1.7, 2.35, 2.35, 2.35, 2.3];
  ['Métrica', 'Snapshot aprovado', 'Base atual', 'Variação', 'Leitura'].forEach((header, index) => {
    slide.addText(header, { x: x[index], y: 2.18, w: widths[index], h: 0.2, fontFace: 'Aptos', fontSize: 12, bold: true, color: COLOR.gold, margin: 0, align: index > 0 && index < 4 ? 'right' : 'left' });
  });
  const labels = { revenue: 'Receita', expense: 'Despesa', result: 'Resultado', marginPercent: 'Margem', cmv: 'CMV' } as const;
  comparison.metrics.forEach((metric, row) => {
    const y = 2.62 + row * 0.68;
    slide.addShape(pptx.ShapeType.line, { x: 0.72, y: y - 0.14, w: 11.88, h: 0, line: { color: COLOR.subtle, width: 0.7, transparency: 30 } });
    const percent = metric.key === 'marginPercent';
    const format = (value: number | null) => value === null ? 'Indisponível' : percent ? formatPercentBR(value, 1) : fmtBRL(value);
    const values = [labels[metric.key], format(metric.snapshot), format(metric.current), format(metric.absoluteChange), metric.favorability === 'favorable' ? 'Favorável' : metric.favorability === 'unfavorable' ? 'Desfavorável' : metric.favorability === 'neutral' ? 'Neutra' : 'Indisponível'];
    values.forEach((value, index) => slide.addText(value, { x: x[index], y, w: widths[index], h: 0.24, fontFace: 'Aptos', fontSize: 13, color: index === 4 ? COLOR.warning : COLOR.white, margin: 0, align: index > 0 && index < 4 ? 'right' : 'left', fit: 'shrink' }));
  });
  slide.addText('Comparação informativa entre métricas equivalentes. Não atribui causalidade às ações nem classifica a decisão como sucesso ou falha.', {
    x: 0.72, y: 6.18, w: 11.88, h: 0.24, fontFace: 'Aptos', fontSize: 11, color: COLOR.muted, margin: 0,
  });
}

function addSlideContent(slide: PptxGenJS.Slide, pptx: PptxGenJS, source: PresentationSlide): void {
  if (source.availability.state !== 'available' && source.availability.state !== 'empty') {
    addEmpty(slide, pptx, availabilityMessage(source.availability));
    return;
  }
  const payload = source.availability.data;
  if (
    source.availability.state === 'empty'
    && payload.type !== 'cover'
    && !payload.type.startsWith('expenses-')
    && !payload.type.startsWith('results-')
    && payload.type !== 'insights'
  ) {
    addEmpty(slide, pptx, availabilityMessage(source.availability));
    return;
  }
  switch (payload.type) {
    case 'chapter-foundation':
      addEmpty(slide, pptx, 'Conteúdo não solicitado nesta fase.');
      break;
    case 'revenue-summary':
      addRevenueSummary(slide, pptx, payload.revenue);
      break;
    case 'revenue-gross-net':
      addRevenueGrossNet(slide, pptx, payload.revenue);
      break;
    case 'revenue-by-brand':
      addRevenueByBrand(slide, pptx, payload.revenue, payload.items);
      break;
    case 'revenue-weekdays':
      addRevenueWeekdays(slide, pptx, payload.revenue);
      break;
    case 'revenue-history':
      addRevenueHistory(slide, pptx, payload.revenue);
      break;
    case 'expenses-summary':
      addExpensesSummary(slide, pptx, payload.expenses);
      break;
    case 'expenses-tree':
      addExpensesTree(slide, pptx, payload.nodes, payload.netRevenue);
      break;
    case 'expenses-rolling':
      addExpensesRolling(slide, pptx, payload.expenses);
      break;
    case 'expenses-history':
      addExpensesHistory(slide, pptx, payload.expenses);
      break;
    case 'revenue-expenses-monthly':
      addRevenueExpensesMonthly(slide, pptx, payload.year, payload.points);
      break;
    case 'results-summary':
      addResultsSummary(slide, pptx, payload.results);
      break;
    case 'results-comparison':
      addResultsComparison(slide, pptx, payload.results);
      break;
    case 'results-evolution':
      addTimeSeries(slide, pptx, payload.timeSeries);
      break;
    case 'results-bridge':
      addResultsBridge(slide, pptx, payload.results);
      break;
    case 'results-non-operational':
      addResultsNonOperational(slide, pptx, payload.results, payload.composition);
      break;
    case 'insights':
      addInsights(slide, pptx, payload.items, payload.insights.rulesetVersion);
      break;
    case 'cover':
      addCover(slide, pptx, payload.periodLabel);
      break;
    case 'executive-summary':
      addExecutiveSummary(slide, pptx, payload.metrics.managerialResult, payload.deltas);
      break;
    case 'plan-comparison':
      addPlanComparison(slide, pptx, payload.plan);
      break;
    case 'scenario-impact':
      addScenarioImpact(slide, pptx, payload.scenario);
      break;
    case 'scenario-sensitivity':
      addScenarioSensitivity(slide, pptx, payload.scenario);
      break;
    case 'decision-commitments':
      addDecisionCommitments(slide, pptx, payload.decision);
      break;
    case 'decision-follow-up':
      addDecisionFollowUp(slide, pptx, payload.decision, payload.comparison);
      break;
    case 'time-series':
      addTimeSeries(slide, pptx, payload.timeSeries);
      break;
    case 'category-composition':
      addComposition(slide, pptx, payload.composition);
      break;
    case 'rankings':
      addRankingColumn(slide, pptx, 'Principais receitas', payload.rankings.topRevenueCategories, 'revenue', 0.72);
      addRankingColumn(slide, pptx, 'Principais despesas', payload.rankings.topExpenseCategories, 'expense', 6.92);
      break;
    case 'open-items':
      addOpenItems(slide, pptx, payload.indicators);
      break;
    case 'non-operational':
      addComposition(slide, pptx, payload.composition, true);
      break;
    case 'highlights':
      addEmpty(slide, pptx, 'Destaques não solicitados nesta apresentação.');
      break;
  }
}

function slideSourceNotes(source: PresentationSlide): string {
  if (source.kind === 'chapter-foundation') {
    return '[Sources]\n- Dados financeiros não solicitados nesta fase';
  }
  if (source.chapter === 'revenue') {
    return '[Sources]\n- public.financeiro_fechamento_caixa.faturamento_bruto\n- data local: public.financeiro_fechamento_caixa.data\n- líquido por loja: livro razão, categoria vinculada em financeiro_fechamento_marcas.categoria_id\n- detalhamento por marcas não somado novamente';
  }
  if (source.kind === 'revenue-expenses-monthly') {
    return '[Sources]\n- receita líquida: public.fin_lancamentos; tipo=RECEITA; status REALIZADO/CONCILIADO; sem rateio (categoria_id direto)\n- despesas: public.fin_lancamentos + public.fin_lancamento_rateios; DFC\n- data efetiva: COALESCE(data_pagamento, conciliado_em::date, data_competencia); regime de caixa\n- excluir_dos_totais (categoria) e excluir_dos_relatorios (lançamento) fora dos totais\n- conciliações pendentes e transferências excluídas';
  }
  if (source.chapter === 'expenses') {
    return '[Sources]\n- public.fin_lancamentos\n- public.fin_lancamento_rateios\n- DFC; regime de caixa\n- data efetiva: COALESCE(data_pagamento, conciliado_em::date, data_competencia)\n- rateio substitui categoria do lançamento\n- transferências e conciliações pendentes excluídas';
  }
  if (source.chapter === 'results') {
    return '[Sources]\n- public.get_fin_presentation_socios\n- public.fin_lancamentos\n- public.fin_lancamento_rateios\n- data efetiva: COALESCE(data_pagamento, conciliado_em::date, data_competencia); regime de caixa do Dashboard\n- rateio prevalece sobre o cabecalho\n- valores nao operacionais ficam fora do resultado operacional';
  }
  if (source.chapter === 'insights') {
    if (source.availability.state !== 'available' && source.availability.state !== 'empty') {
      return '[Sources]\n- Insights indisponíveis; nenhuma inferência gerada';
    }
    const payload = source.availability.data;
    if (payload.type !== 'insights') return '[Sources]\n- Payload de Insights indisponível';
    const rules = payload.items.map(insight => (
      `- ${insight.id}; regra=${insight.ruleId}@${insight.ruleVersion}; domínio=${insight.domain}; score=${insight.relevance.score}; período=${insight.period.label}`
    )).join('\n');
    return `[Sources]\n- public.financeiro_fechamento_caixa.faturamento_bruto; data local do fechamento\n- public.fin_lancamentos + public.fin_lancamento_rateios; regime de caixa do DFC\n[Rules]\n- rulesetVersion=${payload.insights.rulesetVersion}\n- sem causalidade, previsão ou recomendação automática\n${rules || '- nenhum insight atingiu os limiares'}`;
  }
  const base = `[Sources]\n- ${PRESENTATION_SOURCE_LABEL}\n- ${PRESENTATION_REGIME_LABEL}`;
  if (source.availability.state !== 'available') return base;
  const payload = source.availability.data;
  if (payload.type === 'decision-commitments' || payload.type === 'decision-follow-up') {
    const detail = payload.decision;
    const revision = detail.revisions.find(item => item.id === detail.decision.currentRevisionId);
    if (!revision) return base;
    const sources = Object.entries(revision.snapshot.sources).map(([key, value]) => `- ${key}: ${value}`).join('\n');
    const rules = Object.entries(revision.snapshot.rules).map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`).join('\n');
    const actions = detail.actions.map(action => `- actionId=${action.id}; status=${action.status}; responsibleUserId=${action.responsibleUserId ?? 'removed'}; dueDate=${action.dueDate ?? 'not-informed'}`).join('\n');
    return `${base}\n[Decision audit]\n- decisionId=${detail.decision.id}\n- decisionVersion=${detail.decision.version}\n- decisionStatus=${detail.decision.status}\n- revisionId=${revision.id}\n- revisionNumber=${revision.revisionNumber}\n- snapshotVersion=${revision.snapshot.contractVersion}\n- referenceType=${revision.snapshot.referenceType}\n- formulaVersion=${revision.snapshot.formulaVersion}\n- metricFormulaVersion=${revision.snapshot.metricFormulaVersion}\n- cutoffDate=${revision.snapshot.cutoffDate}\n- capturedAt=${revision.snapshot.capturedAt}\n- approvedAt=${revision.approvedAt ?? 'not-approved'}\n[Sources]\n${sources}\n[Rules]\n${rules}\n[Actions]\n${actions || '- none'}`;
  }
  if (payload.type !== 'scenario-impact' && payload.type !== 'scenario-sensitivity') return base;
  const scenario = payload.scenario;
  const levers = scenario.activeLevers.map(lever => `- ${lever.label}: impacto no resultado ${fmtBRL(lever.resultImpact)}`).join('\n');
  return `${base}\n- ${scenario.sources.budget}\n- ${scenario.sources.cmvTarget}\n[Simulation]\n- SIMULAÇÃO; não é previsão garantida\n- Base: ${scenario.baselineMode}\n- Corte: ${scenario.cutoffDate}\n- Fórmula: ${scenario.formulaVersion}\n- ${scenario.rules.scenarioFormula}\n- ${scenario.rules.cmvFormula}\n[Active assumptions]\n${levers}`;
}

function slideNotes(source: PresentationSlide): string {
  return `[Presentation]\n- slideId=${source.id}\n- chapter=${source.chapter}\n- kind=${source.kind}\n- order=${source.order}\n${slideSourceNotes(source)}`;
}

export async function createPresentationPptxBlob(
  data: PresentationSociosData,
  options: PresentationExportOptions = {},
): Promise<Blob> {
  const slides = data.slides.filter(isPresentationSlideExportable);
  if (slides.length === 0) throw new Error('Não há slides disponíveis para exportar.');

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Moralles Food';
  pptx.company = 'Moralles Food';
  pptx.subject = `Faturamento, despesas, resultados e insights - ${data.periodLabel}`;
  pptx.title = `Apresentação Sócios - ${data.periodLabel}`;
  pptx.theme = {
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
  };

  for (let index = 0; index < slides.length; index += 1) {
    await yieldForCancellation(options.signal);
    const outputSlide = pptx.addSlide();
    outputSlide.background = { color: COLOR.background };
    addSlideContent(outputSlide, pptx, slides[index]);
    if (slides[index].kind !== 'cover') addHeader(outputSlide, pptx, slides[index]);
    addFooter(outputSlide, pptx, data, slides[index], index + 1, slides.length);
    outputSlide.addNotes(slideNotes(slides[index]));
    options.onProgress?.({
      completed: index + 1,
      total: slides.length,
      message: `Preparando slide ${index + 1} de ${slides.length}`,
      cancellable: true,
    });
  }

  abortIfRequested(options.signal);
  options.onProgress?.({
    completed: slides.length,
    total: slides.length,
    message: 'Compactando PowerPoint',
    cancellable: false,
  });
  const output = await pptx.write({ outputType: 'arraybuffer', compression: true });
  return new Blob([output as BlobPart], { type: MIME_PPTX });
}
