import jsPDF from 'jspdf';
import type {
  CategoryCompositionSection,
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
} from '@/lib/presentationFormatting';
import { isPresentationSlideExportable } from '@/lib/presentationSlides';
import { fmtBRL, fmtBRLCompact, formatIntegerBR, formatPercentBR } from '@/lib/formatters';
import {
  presentationInsightEvidenceLabel,
  presentationInsightRegimeLabel,
} from '@/lib/presentationInsightsFormatting';

export interface PresentationExportProgress {
  completed: number;
  total: number;
  message: string;
  cancellable: boolean;
}

export interface PresentationExportOptions {
  signal?: AbortSignal;
  onProgress?: (progress: PresentationExportProgress) => void;
}

const PAGE_WIDTH = 320;
const PAGE_HEIGHT = 180;
const COLOR = {
  background: '#090909',
  white: '#ffffff',
  muted: '#a8b0bd',
  subtle: '#475569',
  gold: '#d6b85f',
  revenue: '#6ee7b7',
  expense: '#fda4af',
  warning: '#fde68a',
} as const;

const REVENUE_SOURCE_FOOTER = 'Faturamento bruto — Fechamento de Caixa · Data local do fechamento';
const EXPENSES_SOURCE_FOOTER = 'Despesas financeiras — DFC · Regime de caixa';
const RESULTS_SOURCE_FOOTER = 'Resultado operacional — mesmo regime de caixa do Dashboard · Fonte: get_fin_presentation_socios';
const INSIGHTS_SOURCE_FOOTER = 'Insights determinísticos · fonte canônica identificada em cada insight';

function abortIfRequested(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Exportação cancelada.', 'AbortError');
}

async function yieldForCancellation(signal?: AbortSignal): Promise<void> {
  abortIfRequested(signal);
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  abortIfRequested(signal);
}

function setColor(doc: jsPDF, color: string, target: 'text' | 'fill' | 'draw' = 'text'): void {
  if (target === 'text') doc.setTextColor(color);
  else if (target === 'fill') doc.setFillColor(color);
  else doc.setDrawColor(color);
}

function drawBackground(doc: jsPDF): void {
  setColor(doc, COLOR.background, 'fill');
  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 'F');
}

function drawHeader(doc: jsPDF, slide: PresentationSlide): void {
  setColor(doc, COLOR.gold, 'fill');
  doc.roundedRect(17, 13, 15, 1.6, 0.8, 0.8, 'F');
  setColor(doc, COLOR.white);
  doc.setFont('helvetica', 'bold');
  let titleFontSize = 26;
  doc.setFontSize(titleFontSize);
  let titleLines = doc.splitTextToSize(slide.title, 286) as string[];
  while (titleLines.length > 2 && titleFontSize > 14) {
    titleFontSize -= 1;
    doc.setFontSize(titleFontSize);
    titleLines = doc.splitTextToSize(slide.title, 286) as string[];
  }
  doc.text(titleLines, 17, 26);
  if (slide.subtitle) {
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    const titleLineHeight = titleFontSize * 0.3528 * 1.15;
    doc.text(slide.subtitle, 17, 33 + Math.max(titleLines.length - 1, 0) * titleLineHeight, { maxWidth: 286 });
  }
}

function drawFooter(
  doc: jsPDF,
  data: PresentationSociosData,
  slide: PresentationSlide,
  slideNumber: number,
  totalSlides: number,
): void {
  setColor(doc, COLOR.subtle, 'draw');
  doc.setLineWidth(0.25);
  doc.line(17, 169, 303, 169);
  setColor(doc, COLOR.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(
    slide.kind === 'chapter-foundation'
      ? `Estrutura da apresentação · Dados não solicitados nesta fase · Slide ${slideNumber} de ${totalSlides}`
      : slide.chapter === 'revenue'
        ? `${REVENUE_SOURCE_FOOTER} · ${presentationGeneratedLabel(data.generatedAt)} · Slide ${slideNumber} de ${totalSlides}`
        : slide.chapter === 'expenses'
          ? `${EXPENSES_SOURCE_FOOTER} · ${presentationGeneratedLabel(data.generatedAt)} · Slide ${slideNumber} de ${totalSlides}`
          : slide.chapter === 'results'
            ? `${RESULTS_SOURCE_FOOTER} · ${presentationGeneratedLabel(data.generatedAt)} · Slide ${slideNumber} de ${totalSlides}`
            : slide.chapter === 'insights'
              ? `${INSIGHTS_SOURCE_FOOTER} · ${presentationGeneratedLabel(data.generatedAt)} · Slide ${slideNumber} de ${totalSlides}`
          : `${PRESENTATION_SOURCE_LABEL} · ${PRESENTATION_REGIME_LABEL} · ${presentationGeneratedLabel(data.generatedAt)} · Slide ${slideNumber} de ${totalSlides}`,
    17,
    174,
  );
}

function drawEmpty(doc: jsPDF, message: string): void {
  setColor(doc, COLOR.subtle, 'draw');
  doc.setLineDashPattern([2, 2], 0);
  doc.roundedRect(42, 72, 236, 42, 3, 3, 'S');
  doc.setLineDashPattern([], 0);
  setColor(doc, COLOR.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.text(message, 160, 95, { align: 'center', maxWidth: 210 });
}

function drawCover(doc: jsPDF, periodLabel: string): void {
  setColor(doc, COLOR.gold, 'fill');
  doc.roundedRect(22, 47, 24, 2.2, 1.1, 1.1, 'F');
  setColor(doc, COLOR.muted);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('VISÃO EXECUTIVA FINANCEIRA', 22, 60);
  setColor(doc, COLOR.white);
  doc.setFontSize(42);
  doc.text('Apresentação', 22, 86);
  setColor(doc, COLOR.gold);
  doc.text('Sócios', 22, 108);
  setColor(doc, COLOR.white);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(20);
  doc.text(periodLabel, 22, 130);
  setColor(doc, COLOR.muted);
  doc.setFontSize(10);
  doc.text('Resultado operacional no regime de caixa do Dashboard. Transferências excluídas.', 22, 140);
}

function drawExecutiveSummary(
  doc: jsPDF,
  metrics: Parameters<typeof buildExecutiveMetricDisplays>[0],
  deltas: Parameters<typeof buildExecutiveMetricDisplays>[1],
): void {
  const displays = buildExecutiveMetricDisplays(metrics, deltas);
  displays.forEach((metric, index) => {
    const x = 18 + index * 74;
    setColor(doc, COLOR.gold, 'fill');
    doc.rect(x, 67, 1.4, 49, 'F');
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(metric.label, x + 5, 75, { maxWidth: 62 });
    const valueColor = metric.tone === 'positive'
      ? COLOR.revenue
      : metric.tone === 'negative' || (metric.tone === 'result' && metric.value < 0)
        ? COLOR.expense
        : COLOR.white;
    setColor(doc, valueColor);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(metric.formattedValue, x + 5, 91, { maxWidth: 64 });
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('vs. período anterior', x + 5, 104);
    setColor(doc, COLOR.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(metric.comparison, x + 5, 112, { maxWidth: 64 });
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
  return delta.reason === 'previous-period-absent' ? 'Mes anterior ausente' : 'Mes selecionado ausente';
}

function drawRevenueSummary(doc: jsPDF, revenue: PresentationRevenueData): void {
  [revenue.current, revenue.previous].forEach((period, index) => {
    const x = 22 + index * 145;
    setColor(doc, COLOR.gold, 'fill');
    doc.rect(x, 58, 1.4, 58, 'F');
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(index === 0 ? 'MES SELECIONADO' : 'MES ANTERIOR', x + 6, 65);
    setColor(doc, COLOR.white);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text(period.month, x + 6, 76);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(21);
    doc.text(revenuePeriodText(period), x + 6, 93, { maxWidth: 127 });
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(
      period.closingCount === 0 ? '0 ocorrencias · ausencia explicita' : `${period.closingCount} fechamento(s)`,
      x + 6,
      106,
    );
  });
  setColor(doc, COLOR.subtle, 'draw');
  doc.line(22, 128, 298, 128);
  setColor(doc, COLOR.muted);
  doc.setFontSize(8.5);
  doc.text('VARIACAO ABSOLUTA', 22, 139);
  doc.text('VARIACAO PERCENTUAL', 168, 139);
  setColor(doc, COLOR.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(revenueDeltaText(revenue.delta.absolute), 22, 151, { maxWidth: 125 });
  doc.text(revenueDeltaText(revenue.delta.percentage, true), 168, 151, { maxWidth: 125 });
}

function grossToNetDifferenceText(period: PresentationRevenueGrossToNetPeriod, percentage = false): string {
  if (percentage) {
    return period.differencePercent.state === 'available'
      ? formatPercentBR(period.differencePercent.value, 1)
      : 'Bruto zero ou negativo';
  }
  return fmtBRL(period.difference);
}

function drawRevenueGrossNet(doc: jsPDF, revenue: PresentationRevenueData): void {
  const rows = [
    { label: 'MES SELECIONADO', gross: revenue.current, net: revenue.netRevenue.current },
    { label: 'MES ANTERIOR', gross: revenue.previous, net: revenue.netRevenue.previous },
  ];
  rows.forEach((row, index) => {
    const x = 22 + index * 145;
    setColor(doc, COLOR.gold, 'fill'); doc.rect(x, 58, 1.4, 58, 'F');
    setColor(doc, COLOR.muted); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text(row.label, x + 6, 65);
    setColor(doc, COLOR.white); doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.text(row.gross.month, x + 6, 76);
    setColor(doc, COLOR.muted); doc.setFontSize(8); doc.text('BRUTO (FECHAMENTO DE CAIXA)', x + 6, 90);
    setColor(doc, COLOR.white); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(fmtBRL(row.gross.total), x + 6, 100, { maxWidth: 127 });
    setColor(doc, COLOR.muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text('LIQUIDO (LIVRO RAZAO)', x + 6, 113);
    setColor(doc, COLOR.white); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(fmtBRL(row.net.total), x + 6, 123, { maxWidth: 127 });
  });
  setColor(doc, COLOR.subtle, 'draw'); doc.line(22, 137, 298, 137);
  setColor(doc, COLOR.muted); doc.setFontSize(8.5); doc.text('DIFERENCA (MES SELECIONADO)', 22, 148); doc.text('% DA DIFERENCA SOBRE O BRUTO', 168, 148);
  setColor(doc, COLOR.white); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(grossToNetDifferenceText(revenue.grossToNet.current), 22, 160, { maxWidth: 125 });
  doc.text(grossToNetDifferenceText(revenue.grossToNet.current, true), 168, 160, { maxWidth: 125 });
  setColor(doc, COLOR.muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  doc.text('Liquido = receita operacional do livro razao (regime de caixa) — mesma base do KPI Receita operacional de Resultados.', 22, 172, { maxWidth: 276 });
}

function drawRevenueByBrand(doc: jsPDF, revenue: PresentationRevenueData): void {
  const total = revenue.current.total;
  const items = [...revenue.byBrand].sort((left, right) => right.total - left.total);
  if (items.length === 0) { drawEmpty(doc, 'Sem faturamento no mes selecionado.'); return; }
  items.forEach((item: PresentationRevenueBrandPoint, index) => {
    const y = 55 + index * 13;
    setColor(doc, COLOR.gold); doc.setFontSize(14); doc.text(String(index + 1), 22, y);
    setColor(doc, COLOR.white); doc.setFontSize(9.5); doc.text(item.nome, 33, y - 1, { maxWidth: 170 });
    setColor(doc, COLOR.muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    doc.text(`${total > 0 ? formatPercentBR((item.total / total) * 100, 1) : '-'} do bruto do mes · ${item.closingCount} fechamento(s)`, 33, y + 4);
    setColor(doc, COLOR.revenue); doc.setFont('courier', 'bold'); doc.setFontSize(9); doc.text(fmtBRL(item.total), 298, y, { align: 'right' });
    setColor(doc, COLOR.subtle, 'draw'); doc.line(22, y + 7, 298, y + 7);
  });
}

function drawRevenueWeekdays(doc: jsPDF, revenue: PresentationRevenueData): void {
  revenue.weekdays.forEach((day, index) => {
    const width = 39;
    const x = 18 + index * 41;
    setColor(doc, COLOR.gold, 'fill');
    doc.rect(x, 48, width, 1, 'F');
    setColor(doc, COLOR.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(day.label, x, 58, { maxWidth: width });
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('TOTAL', x, 76);
    setColor(doc, COLOR.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(day.state === 'available' ? fmtBRL(day.total) : 'Sem fechamento', x, 84, { maxWidth: width });
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('OCORRENCIAS', x, 102);
    setColor(doc, COLOR.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(String(day.occurrences), x, 110);
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('MEDIA', x, 128);
    setColor(doc, COLOR.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(day.average.state === 'available' ? fmtBRL(day.average.value) : 'Nao aplicavel', x, 136, { maxWidth: width });
  });
}

function drawRevenueHistory(doc: jsPDF, revenue: PresentationRevenueData): void {
  const monthLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const left = 31;
  const cellWidth = 22.5;
  monthLabels.forEach((label, index) => {
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(label, left + index * cellWidth + cellWidth / 2, 54, { align: 'center' });
  });
  revenue.requestedYears.forEach((year, yearIndex) => {
    const y = 66 + yearIndex * 29;
    setColor(doc, COLOR.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(String(year), 18, y + 8);
    revenue.history.filter(point => point.year === year).forEach((point, monthIndex) => {
      const x = left + monthIndex * cellWidth;
      setColor(doc, point.state === 'available' ? COLOR.gold : COLOR.subtle, 'draw');
      doc.roundedRect(x, y, cellWidth - 1.5, 20, 1, 1, 'S');
      setColor(doc, point.state === 'available' ? COLOR.white : COLOR.muted);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.text(point.state === 'available' ? fmtBRLCompact(point.total) : '-', x + (cellWidth - 1.5) / 2, y + 8, { align: 'center', maxWidth: cellWidth - 3 });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.text(point.state === 'available' ? `${point.closingCount} fecha.` : point.state === 'empty' ? 'vazio' : 's/ cobertura', x + (cellWidth - 1.5) / 2, y + 15, { align: 'center', maxWidth: cellWidth - 3 });
    });
  });
}

function expensePeriodText(period: PresentationExpensesData['current']): string {
  if (period.state === 'available') return fmtBRL(period.total);
  return period.state === 'empty' ? 'Sem despesas' : 'Sem cobertura';
}

function expenseDeltaText(delta: PresentationExpensesData['delta']['absolute'], percentage = false): string {
  if (delta.state === 'available') return percentage ? formatPercentBR(delta.value, 1) : fmtBRL(delta.value);
  if (delta.reason === 'zero-baseline') return 'Base anterior zero';
  return delta.reason === 'previous-period-absent' ? 'Mes anterior ausente' : 'Mes selecionado ausente';
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

function drawExpensesSummary(doc: jsPDF, expenses: PresentationExpensesData): void {
  [expenses.current, expenses.previous].forEach((period, index) => {
    const x = 22 + index * 145;
    setColor(doc, COLOR.expense, 'fill'); doc.rect(x, 58, 1.4, 56, 'F');
    setColor(doc, COLOR.muted); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text(index === 0 ? 'MES SELECIONADO' : 'MES ANTERIOR', x + 6, 65);
    setColor(doc, COLOR.white); doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.text(period.month, x + 6, 76);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(21); doc.text(expensePeriodText(period), x + 6, 93, { maxWidth: 127 });
    setColor(doc, COLOR.muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(`${period.quantity} lancamento(s) do razao`, x + 6, 106);
  });
  if (expenses.current.state === 'available') {
    const split = operationalExpenseSplit(expenses.tree);
    setColor(doc, COLOR.subtle, 'draw'); doc.line(22, 114, 298, 114);
    setColor(doc, COLOR.muted); doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text('DESPESAS OPERACIONAIS (MES SELECIONADO)', 22, 121);
    setColor(doc, COLOR.warning); doc.text('DESPESAS NAO OPERACIONAIS (MES SELECIONADO)', 160, 121);
    setColor(doc, COLOR.white); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(fmtBRL(split.operational), 22, 130, { maxWidth: 130 });
    setColor(doc, COLOR.warning); doc.text(fmtBRL(split.nonOperational), 160, 130, { maxWidth: 130 });
  }
  const reading = expenses.delta.meaning === 'increase' ? 'Aumento · desfavoravel' : expenses.delta.meaning === 'reduction' ? 'Reducao · favoravel' : expenses.delta.meaning === 'unchanged' ? 'Estavel' : 'Indisponivel';
  setColor(doc, COLOR.subtle, 'draw'); doc.line(22, 140, 298, 140);
  setColor(doc, COLOR.muted); doc.setFontSize(8); doc.text('VARIACAO ABSOLUTA', 22, 151); doc.text('VARIACAO PERCENTUAL', 119, 151); doc.text('LEITURA EXECUTIVA', 216, 151);
  setColor(doc, COLOR.white); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(expenseDeltaText(expenses.delta.absolute), 22, 163, { maxWidth: 86 }); doc.text(expenseDeltaText(expenses.delta.percentage, true), 119, 163, { maxWidth: 86 });
  setColor(doc, expenses.delta.favorability === 'favorable' ? COLOR.revenue : expenses.delta.favorability === 'unfavorable' ? COLOR.expense : COLOR.white); doc.text(reading, 216, 163, { maxWidth: 82 });
}

function flattenExpenseNodes(nodes: readonly PresentationExpenseNode[], depth = 0): Array<{ node: PresentationExpenseNode; depth: number }> {
  return nodes.flatMap(node => [{ node, depth }, ...flattenExpenseNodes(node.children, depth + 1)]);
}

/** % que `amount` representa da receita operacional líquida do período; sem base disponível → traço. */
function expenseShareOfNetRevenueText(amount: number, netRevenue: number | null): string {
  if (netRevenue === null || netRevenue <= 0) return '-';
  return formatPercentBR((amount / netRevenue) * 100, 1);
}

function drawExpensesTree(doc: jsPDF, nodes: readonly PresentationExpenseNode[], netRevenue: number | null): void {
  const rows = flattenExpenseNodes(nodes);
  if (rows.length === 0) { drawEmpty(doc, 'Sem despesas no mes selecionado.'); return; }
  setColor(doc, COLOR.muted); doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text('CATEGORIA', 22, 48); doc.text('VALOR PROPRIO', 200, 48, { align: 'right' }); doc.text('ACUMULADO', 250, 48, { align: 'right' }); doc.text('% RECEITA LIQ.', 298, 48, { align: 'right' });
  rows.forEach(({ node, depth }, index) => {
    const y = 59 + index * 11;
    setColor(doc, COLOR.subtle, 'draw'); doc.line(22, y + 3, 298, y + 3);
    setColor(doc, COLOR.white); doc.setFont('helvetica', depth === 0 ? 'bold' : 'normal'); doc.setFontSize(8.5); doc.text(`${depth > 0 ? '> ' : ''}${node.name}`, 22 + depth * 5, y, { maxWidth: 132 - depth * 5 });
    if (node.operationalClass === 'non-operational') { setColor(doc, COLOR.warning); doc.setFontSize(6.5); doc.text('NAO OPERACIONAL', 158, y); }
    setColor(doc, COLOR.muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(fmtBRL(node.directAmount), 200, y, { align: 'right' });
    setColor(doc, COLOR.white); doc.setFont('helvetica', 'bold'); doc.text(fmtBRL(node.amount), 250, y, { align: 'right' });
    setColor(doc, COLOR.muted); doc.setFont('helvetica', 'normal'); doc.text(expenseShareOfNetRevenueText(node.amount, netRevenue), 298, y, { align: 'right' });
  });
}

function drawExpensesRolling(doc: jsPDF, expenses: PresentationExpensesData): void {
  const max = Math.max(1, ...expenses.rollingThreeMonths.map(point => point.total));
  expenses.rollingThreeMonths.forEach((point, index) => {
    const x = 42 + index * 90;
    const height = point.state === 'available' ? Math.max((point.total / max) * 70, 3) : 3;
    setColor(doc, COLOR.expense, 'fill'); doc.rect(x, 133 - height, 32, height, 'F');
    setColor(doc, COLOR.white); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(point.state === 'available' ? fmtBRL(point.total) : point.state === 'empty' ? 'Sem despesas' : 'Sem cobertura', x + 16, 53, { align: 'center', maxWidth: 60 });
    setColor(doc, COLOR.muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(point.yearMonth, x + 16, 144, { align: 'center' }); doc.text(`${point.quantity} lancamento(s)`, x + 16, 153, { align: 'center' });
  });
}

function drawExpensesHistory(doc: jsPDF, expenses: PresentationExpensesData): void {
  const cellWidth = 21.2;
  ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'].forEach((label, index) => { setColor(doc, COLOR.muted); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); doc.text(label, 45 + index * cellWidth, 50, { align: 'center' }); });
  expenses.requestedYears.forEach((year, row) => {
    const y = 68 + row * 34;
    setColor(doc, COLOR.white); doc.setFontSize(9); doc.text(String(year), 20, y + 8);
    expenses.history.filter(point => point.year === year).forEach((point, index) => {
      const x = 34.5 + index * cellWidth;
      setColor(doc, point.state === 'available' ? COLOR.expense : COLOR.subtle, 'draw'); doc.rect(x, y, 20, 21, 'S');
      setColor(doc, point.state === 'available' ? COLOR.white : COLOR.muted); doc.setFontSize(6); doc.text(point.state === 'available' ? fmtBRLCompact(point.total) : '-', x + 10, y + 9, { align: 'center', maxWidth: 18 });
      doc.setFontSize(5.5); doc.text(point.state === 'available' ? `${point.quantity} lanc.` : point.state === 'empty' ? 'vazio' : 's/ cobertura', x + 10, y + 16, { align: 'center' });
    });
  });
}

function drawResultsSummary(doc: jsPDF, results: PresentationResultsData): void {
  const metrics = [
    ['Receita operacional', fmtBRL(results.current.revenue), COLOR.revenue, 'Base operacional do periodo'],
    ['Despesa operacional', fmtBRL(results.current.expense), COLOR.expense, 'Base operacional do periodo'],
    ['Resultado operacional', fmtBRL(results.current.result), results.current.result < 0 ? COLOR.expense : COLOR.white, 'Receita - despesa'],
    ['Margem operacional', formatPercentBR(results.current.marginPercent, 1), COLOR.white, 'Resultado / receita'],
  ] as const;
  metrics.forEach(([label, value, color, formula], index) => {
    const x = 18 + index * 74;
    setColor(doc, COLOR.gold, 'fill');
    doc.rect(x, 66, 1.4, 52, 'F');
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(label, x + 5, 75, { maxWidth: 63 });
    setColor(doc, color);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(value, x + 5, 93, { maxWidth: 63 });
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(formula, x + 5, 108, { maxWidth: 63 });
  });
}

function drawResultsComparison(doc: jsPDF, results: PresentationResultsData): void {
  if (results.comparison.state === 'unavailable') {
    drawEmpty(doc, results.comparison.reason === 'outside-available-period'
      ? 'Periodo anterior fora do historico disponivel.'
      : 'Comparacao com o periodo anterior indisponivel.');
    return;
  }
  const { previous, deltas } = results.comparison;
  const rows = [
    ['Receita', results.current.revenue, previous.revenue, deltas.revenue, true],
    ['Despesa', results.current.expense, previous.expense, deltas.expense, true],
    ['Resultado', results.current.result, previous.result, deltas.result, true],
    ['Margem', results.current.marginPercent, previous.marginPercent, deltas.margin, false],
  ] as const;
  const columns = [18, 102, 164, 226, 302];
  ['METRICA', 'ATUAL', 'ANTERIOR', 'VAR. ABSOLUTA', 'VAR. RELATIVA'].forEach((label, index) => {
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(label, columns[index], 52, { align: index === 0 ? 'left' : 'right' });
  });
  rows.forEach(([label, current, previousValue, delta, currency], index) => {
    const y = 70 + index * 20;
    const format = (value: number) => currency ? fmtBRL(value) : formatPercentBR(value, 1);
    const absolute = delta.absoluteChange === null
      ? 'Indisponivel'
      : currency
        ? fmtBRL(delta.absoluteChange)
        : `${delta.absoluteChange.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`;
    setColor(doc, COLOR.subtle, 'draw');
    doc.line(18, y - 7, 302, y - 7);
    setColor(doc, COLOR.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(label, columns[0], y);
    doc.setFont('helvetica', 'normal');
    doc.text(format(current), columns[1], y, { align: 'right' });
    setColor(doc, COLOR.muted);
    doc.text(format(previousValue), columns[2], y, { align: 'right' });
    setColor(doc, COLOR.white);
    doc.text(absolute, columns[3], y, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(formatMetricDelta(delta), columns[4], y, { align: 'right' });
  });
  setColor(doc, COLOR.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Base zero preserva a variacao absoluta sem gerar valores invalidos.', 18, 158);
}

function drawResultsBridge(doc: jsPDF, results: PresentationResultsData): void {
  if (results.bridge.state === 'unavailable') {
    drawEmpty(doc, results.bridge.reason === 'outside-available-period'
      ? 'Ponte indisponivel: periodo anterior fora do historico.'
      : 'Ponte indisponivel sem comparacao equivalente.');
    return;
  }
  results.bridge.steps.forEach((step, index) => {
    const x = 20 + index * 73;
    setColor(doc, COLOR.gold, 'fill');
    doc.rect(x, 62, 65, 1.2, 'F');
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(step.label, x, 75, { maxWidth: 65, align: 'center' });
    setColor(doc, step.favorability === 'favorable' ? COLOR.revenue : step.favorability === 'unfavorable' ? COLOR.expense : COLOR.white);
    doc.setFontSize(15);
    const signed = step.key === 'previous-result' || step.key === 'current-result'
      ? fmtBRL(step.value)
      : step.value > 0
        ? `+${fmtBRL(step.value)}`
        : step.value < 0
          ? `-${fmtBRL(Math.abs(step.value))}`
          : fmtBRL(step.value);
    doc.text(signed, x + 32.5, 96, { maxWidth: 65, align: 'center' });
    if (index > 0) {
      setColor(doc, COLOR.muted);
      doc.setFontSize(14);
      doc.text('+', x - 4, 87);
    }
  });
  setColor(doc, COLOR.subtle, 'draw');
  doc.line(20, 121, 300, 121);
  setColor(doc, COLOR.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Variacao total do resultado', 20, 134);
  setColor(doc, results.bridge.totalChange < 0 ? COLOR.expense : results.bridge.totalChange > 0 ? COLOR.revenue : COLOR.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(results.bridge.totalChange > 0
    ? `+${fmtBRL(results.bridge.totalChange)}`
    : results.bridge.totalChange < 0
      ? `-${fmtBRL(Math.abs(results.bridge.totalChange))}`
      : fmtBRL(results.bridge.totalChange), 160, 134, { align: 'center' });
  setColor(doc, COLOR.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Despesa maior reduz o resultado; despesa menor aumenta o resultado.', 300, 134, { align: 'right' });
}

function drawResultsNonOperational(
  doc: jsPDF,
  results: PresentationResultsData,
  composition: CategoryCompositionSection,
): void {
  const totals = results.nonOperational.totals;
  [
    ['Receitas nao operacionais', totals.revenue],
    ['Despesas nao operacionais', totals.expense],
    ['Saldo nao operacional', totals.result],
  ].forEach(([label, value], index) => {
    const x = 18 + index * 96;
    setColor(doc, COLOR.gold, 'fill');
    doc.rect(x, 40, 1.2, 22, 'F');
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.text(String(label), x + 5, 47, { maxWidth: 84 });
    setColor(doc, COLOR.warning);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(fmtBRL(value as number), x + 5, 58, { maxWidth: 84 });
  });
  drawCompositionColumn(doc, 'Receitas', composition.revenue, 'revenue', 17, 73);
  drawCompositionColumn(doc, 'Despesas', composition.expense, 'expense', 166, 73);
}

function drawInsights(
  doc: jsPDF,
  items: readonly PresentationInsight[],
  rulesetVersion: string,
): void {
  if (items.length === 0) {
    drawEmpty(doc, 'Nenhum insight atingiu os limiares mínimos de relevância e cobertura. Nenhuma leitura foi fabricada.');
    return;
  }
  setColor(doc, COLOR.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(`Regras ${rulesetVersion} · ordenação por relevância, domínio, prioridade da regra e ID`, 17, 40);
  const gap = 5;
  const width = (286 - gap * (items.length - 1)) / items.length;
  items.forEach((insight, index) => {
    const x = 17 + index * (width + gap);
    const toneColor = insight.tone === 'positive'
      ? COLOR.revenue
      : insight.tone === 'negative' ? COLOR.expense : COLOR.gold;
    setColor(doc, COLOR.subtle, 'draw');
    doc.roundedRect(x, 44, width, 117, 2.5, 2.5, 'S');
    setColor(doc, toneColor, 'fill');
    doc.rect(x, 44, 1.5, 117, 'F');
    setColor(doc, toneColor);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text(insight.domain === 'revenue' ? 'FATURAMENTO' : 'DESPESAS', x + 5, 52);
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.4);
    doc.text(`Regra ${insight.ruleVersion} · score ${insight.relevance.score}`, x + width - 4, 52, { align: 'right' });
    setColor(doc, COLOR.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    const titleLines = (doc.splitTextToSize(insight.title, width - 10) as string[]).slice(0, 3);
    doc.text(titleLines, x + 5, 61, { lineHeightFactor: 1.12 });
    const titleEnd = 61 + titleLines.length * 4;
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    const descriptionLines = (doc.splitTextToSize(insight.description, width - 10) as string[]).slice(0, 4);
    doc.text(descriptionLines, x + 5, titleEnd + 4, { lineHeightFactor: 1.15 });
    setColor(doc, toneColor, 'draw');
    doc.setLineWidth(0.6);
    doc.line(x + 5, 102, x + 5, 122);
    setColor(doc, COLOR.muted);
    doc.setFontSize(5.2);
    doc.text('EVIDÊNCIA', x + 8, 106);
    setColor(doc, COLOR.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.1);
    const evidenceLines = (doc.splitTextToSize(
      presentationInsightEvidenceLabel(insight),
      width - 14,
    ) as string[]).slice(0, 4);
    doc.text(evidenceLines, x + 8, 112, { lineHeightFactor: 1.12 });
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.2);
    const metadata = [
      `Período: ${insight.period.label}`,
      `Fonte: ${insight.source.label}`,
      `Regime: ${presentationInsightRegimeLabel(insight)}`,
    ];
    let metadataY = 136;
    metadata.forEach((line) => {
      const lines = (doc.splitTextToSize(line, width - 10) as string[]).slice(0, 2);
      doc.text(lines, x + 5, metadataY, { lineHeightFactor: 1.08 });
      metadataY += Math.max(5, lines.length * 2.6 + 1);
    });
  });
}

function drawTimeSeries(doc: jsPDF, timeSeries: PresentationTimeSeries): void {
  if (timeSeries.points.length === 0) {
    drawEmpty(doc, 'Sem pontos na série temporal.');
    return;
  }
  const left = 35;
  const right = 301;
  const top = 47;
  const bottom = 146;
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
    setColor(doc, COLOR.subtle, 'draw');
    doc.setLineWidth(0.2);
    doc.line(left, gridY, right, gridY);
    setColor(doc, COLOR.muted);
    doc.setFontSize(7);
    doc.text(fmtBRLCompact(value), left - 3, gridY + 1.5, { align: 'right' });
  }

  setColor(doc, COLOR.muted, 'draw');
  doc.setLineWidth(0.35);
  doc.line(left, zeroY, right, zeroY);

  let previousResult: { x: number; y: number } | null = null;
  timeSeries.points.forEach((point, index) => {
    const center = left + step * index + step / 2;
    const barWidth = Math.min(step * 0.22, 5.5);
    const revenueY = y(point.metrics.revenue);
    const expenseY = y(point.metrics.expense);
    setColor(doc, COLOR.revenue, 'fill');
    doc.rect(center - barWidth - 0.8, Math.min(revenueY, zeroY), barWidth, Math.max(Math.abs(zeroY - revenueY), 0.5), 'F');
    setColor(doc, COLOR.expense, 'fill');
    doc.rect(center + 0.8, Math.min(expenseY, zeroY), barWidth, Math.max(Math.abs(zeroY - expenseY), 0.5), 'F');

    const result = { x: center, y: y(point.metrics.result) };
    if (previousResult) {
      setColor(doc, COLOR.gold, 'draw');
      doc.setLineWidth(1.1);
      doc.line(previousResult.x, previousResult.y, result.x, result.y);
    }
    setColor(doc, COLOR.gold, 'fill');
    doc.circle(result.x, result.y, 1.4, 'F');
    previousResult = result;

    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(
      formatPresentationSeriesLabel(point.key, timeSeries.granularity),
      center,
      154,
      { align: 'center', maxWidth: Math.max(step - 1, 10) },
    );
  });

  const legendY = 42;
  setColor(doc, COLOR.revenue, 'fill');
  doc.rect(214, legendY - 3, 3, 3, 'F');
  setColor(doc, COLOR.white);
  doc.setFontSize(8);
  doc.text('Receita', 219, legendY);
  setColor(doc, COLOR.expense, 'fill');
  doc.rect(245, legendY - 3, 3, 3, 'F');
  setColor(doc, COLOR.white);
  doc.text('Despesa', 250, legendY);
  setColor(doc, COLOR.gold, 'draw');
  doc.setLineWidth(1);
  doc.line(278, legendY - 1.5, 284, legendY - 1.5);
  setColor(doc, COLOR.white);
  doc.text('Resultado', 286, legendY);
}

function drawPlanComparison(doc: jsPDF, plan: PresentationPlanData): void {
  const indicators = buildPresentationPlanIndicators(plan);
  const formatValue = (unit: 'currency' | 'percent', value: number | null) => {
    if (value === null) return 'Nao configurado';
    return unit === 'currency' ? fmtBRL(value) : formatPercentBR(value, 1);
  };
  const columnWidth = 55;

  indicators.forEach((indicator, index) => {
    const x = 17 + index * 58;
    setColor(doc, COLOR.gold, 'fill');
    doc.rect(x, 51, 0.8, 83, 'F');
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(indicator.label, x + 4, 57, { maxWidth: columnWidth - 4 });
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('REALIZADO', x + 4, 72);
    setColor(doc, COLOR.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(formatValue(indicator.unit, indicator.actual), x + 4, 80, { maxWidth: columnWidth - 4 });
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('ORCADO', x + 4, 94);
    setColor(doc, COLOR.gold);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(formatValue(indicator.unit, indicator.budget), x + 4, 102, { maxWidth: columnWidth - 4 });
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('PROJECAO', x + 4, 115);
    setColor(doc, COLOR.white);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(formatValue(indicator.unit, indicator.projection), x + 4, 122, { maxWidth: columnWidth - 4 });
    setColor(doc, indicator.status === 'favorable'
      ? COLOR.revenue
      : indicator.status === 'unfavorable' ? COLOR.expense : COLOR.muted);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(indicator.statusLabel, x + 4, 132, { maxWidth: columnWidth - 4 });
  });

  setColor(doc, COLOR.subtle, 'draw');
  doc.setLineWidth(0.3);
  doc.line(17, 143, 303, 143);
  setColor(doc, COLOR.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(
    `Projecao: realizado acumulado / ${plan.projection.sampleDays} dias x ${plan.projection.totalDays} dias. Orcamento mensal proporcional aos dias; contas em aberto excluidas.`,
    17,
    151,
    { maxWidth: 220 },
  );
  setColor(doc, COLOR.gold);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(
    `Meta CMV: ${plan.budget.cmvTargetPercent === null ? 'nao configurada' : formatPercentBR(plan.budget.cmvTargetPercent, 1)}`,
    303,
    151,
    { align: 'right' },
  );
}

function drawScenarioImpact(doc: jsPDF, scenario: PresentationScenarioResult): void {
  setColor(doc, '#2b2514', 'fill');
  setColor(doc, COLOR.gold, 'draw');
  doc.roundedRect(17, 39, 34, 9, 1, 1, 'FD');
  setColor(doc, COLOR.warning);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('SIMULAÇÃO', 22, 45);

  const metrics = [
    { label: 'Receita', base: scenario.baseline.revenue, value: scenario.scenario.revenue, impact: scenario.impact.revenue.absolute, percent: false },
    { label: 'Despesas', base: scenario.baseline.expense, value: scenario.scenario.expense, impact: scenario.impact.expense.absolute, percent: false },
    { label: 'Resultado', base: scenario.baseline.result, value: scenario.scenario.result, impact: scenario.impact.result.absolute, percent: false },
    { label: 'Margem', base: scenario.baseline.marginPercent, value: scenario.scenario.marginPercent, impact: scenario.impact.margin.absolute, percent: true },
    { label: 'CMV', base: scenario.baseline.cmv, value: scenario.scenario.cmv, impact: scenario.impact.cmv.absolute, percent: false },
  ];
  const format = (value: number | null, percent: boolean) => value === null
    ? 'Indisponivel'
    : percent ? formatPercentBR(value, 1) : fmtBRL(value);
  metrics.forEach((metric, index) => {
    const x = 17 + index * 58;
    setColor(doc, COLOR.gold, 'fill');
    doc.rect(x, 55, 0.8, 50, 'F');
    setColor(doc, COLOR.muted);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text(metric.label, x + 4, 61);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.text('BASE', x + 4, 71);
    setColor(doc, COLOR.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(format(metric.base, metric.percent), x + 4, 78, { maxWidth: 49 });
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.text('CENARIO', x + 4, 88);
    setColor(doc, COLOR.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(format(metric.value, metric.percent), x + 4, 96, { maxWidth: 49 });
    setColor(doc, (metric.impact ?? 0) >= 0 ? COLOR.revenue : COLOR.expense);
    doc.setFontSize(7);
    doc.text(metric.impact === null ? 'Impacto indisponivel' : metric.percent ? `${metric.impact.toFixed(1)} p.p.` : fmtBRL(metric.impact), x + 4, 103, { maxWidth: 49 });
  });

  const ranking = [...scenario.activeLevers]
    .sort((left, right) => Math.abs(right.resultImpact) - Math.abs(left.resultImpact) || left.id.localeCompare(right.id))
    .slice(0, 6);
  setColor(doc, COLOR.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('Premissas e impacto no resultado', 17, 119);
  ranking.forEach((lever, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = column === 0 ? 17 : 164;
    const y = 130 + row * 10;
    setColor(doc, COLOR.gold);
    doc.text(String(index + 1), x, y);
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.text(lever.label, x + 7, y, { maxWidth: 90 });
    setColor(doc, lever.resultImpact >= 0 ? COLOR.revenue : COLOR.expense);
    doc.setFont('helvetica', 'bold');
    doc.text(fmtBRL(lever.resultImpact), x + 135, y, { align: 'right' });
  });
  setColor(doc, COLOR.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.text(`Base ${scenario.baselineMode} · corte ${scenario.cutoffDate} · ${scenario.formulaVersion} · contas em aberto e transferências fora`, 17, 163, { maxWidth: 286 });
}

function drawScenarioSensitivity(doc: jsPDF, scenario: PresentationScenarioResult): void {
  if (scenario.sensitivity.state !== 'available') {
    drawEmpty(doc, 'Sensibilidade nao configurada.');
    return;
  }
  const sensitivity = scenario.sensitivity;
  setColor(doc, '#2b2514', 'fill');
  setColor(doc, COLOR.gold, 'draw');
  doc.roundedRect(17, 39, 34, 9, 1, 1, 'FD');
  setColor(doc, COLOR.warning);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('SIMULAÇÃO', 22, 45);
  const left = 36;
  const right = 301;
  const top = 55;
  const bottom = 139;
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
    setColor(doc, COLOR.subtle, 'draw');
    doc.line(left, y(value), right, y(value));
    setColor(doc, COLOR.muted);
    doc.setFontSize(6.5);
    doc.text(fmtBRLCompact(value), left - 3, y(value) + 1.5, { align: 'right' });
  }
  setColor(doc, COLOR.gold, 'draw');
  doc.setLineWidth(1);
  for (let index = 1; index < sensitivity.points.length; index += 1) {
    const previous = sensitivity.points[index - 1];
    const current = sensitivity.points[index];
    doc.line(x(previous.inputValue), y(previous.result), x(current.inputValue), y(current.result));
  }
  sensitivity.points.forEach(point => {
    setColor(doc, point.isBase ? COLOR.white : COLOR.gold, 'fill');
    doc.circle(x(point.inputValue), y(point.result), point.isBase ? 1.7 : 0.9, 'F');
  });
  setColor(doc, COLOR.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(sensitivity.leverLabel, 160, 149, { align: 'center' });
  setColor(doc, COLOR.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  const base = sensitivity.points.find(point => point.isBase);
  const formatInput = (value: number) => sensitivity.unit === 'currency' ? fmtBRL(value) : formatPercentBR(value, 2);
  doc.text(`Faixa ${formatInput(minX)} a ${formatInput(maxX)} · atual ${base ? formatInput(base.inputValue) : 'indisponivel'} · demais alavancas fixas`, 17, 158, { maxWidth: 200 });
  doc.text(
    sensitivity.breakEven.state === 'available'
      ? `Equilibrio: ${formatInput(sensitivity.breakEven.inputValue)}`
      : 'Ponto de equilibrio indisponivel com as informacoes atuais',
    303,
    158,
    { align: 'right', maxWidth: 85 },
  );
}

function drawCompositionColumn(
  doc: jsPDF,
  title: string,
  nodes: CategoryCompositionSection['revenue'],
  tone: 'revenue' | 'expense',
  x: number,
  startY = 48,
): void {
  const width = 137;
  const rows = flattenPresentationCategories(nodes);
  setColor(doc, tone === 'revenue' ? COLOR.revenue : COLOR.expense);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(title, x, startY);
  setColor(doc, COLOR.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Direto / Acumulado', x + width, startY, { align: 'right' });
  setColor(doc, COLOR.subtle, 'draw');
  doc.line(x, startY + 4, x + width, startY + 4);

  if (rows.length === 0) {
    setColor(doc, COLOR.muted);
    doc.setFontSize(9);
    doc.text('Sem valores nesta composição.', x, startY + 18);
    return;
  }

  rows.forEach(({ node, depth }, index) => {
    const y = startY + 12 + index * 9.1;
    setColor(doc, COLOR.white);
    doc.setFont('helvetica', depth === 0 ? 'bold' : 'normal');
    doc.setFontSize(7.8);
    const label = `${depth > 0 ? '> ' : ''}${node.name}`;
    doc.text(label, x + depth * 3, y, { maxWidth: 72 - depth * 3 });
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(formatPercentBR(node.sharePercent, 1), x + depth * 3, y + 3.7);
    setColor(doc, COLOR.white);
    doc.setFont('courier', 'normal');
    doc.setFontSize(6.8);
    doc.text(`${fmtBRL(node.directAmount)} / ${fmtBRL(node.amount)}`, x + width, y, { align: 'right' });
    setColor(doc, COLOR.subtle, 'draw');
    doc.setLineWidth(0.15);
    doc.line(x, y + 5.2, x + width, y + 5.2);
  });
}

function drawComposition(doc: jsPDF, section: CategoryCompositionSection, nonOperational = false): void {
  if (nonOperational) {
    setColor(doc, COLOR.gold, 'draw');
    setColor(doc, '#2b2514', 'fill');
    doc.roundedRect(17, 38, 57, 8, 1, 1, 'FD');
    setColor(doc, COLOR.warning);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('FORA DO RESULTADO OPERACIONAL', 20, 43.3);
  }
  const startY = nonOperational ? 55 : 48;
  drawCompositionColumn(doc, 'Receitas', section.revenue, 'revenue', 17, startY);
  drawCompositionColumn(doc, 'Despesas', section.expense, 'expense', 166, startY);
}

function drawRankingColumn(
  doc: jsPDF,
  title: string,
  items: readonly PresentationRankingItem[],
  tone: 'revenue' | 'expense',
  x: number,
): void {
  setColor(doc, tone === 'revenue' ? COLOR.revenue : COLOR.expense);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(title, x, 50);
  if (items.length === 0) {
    setColor(doc, COLOR.muted);
    doc.setFontSize(9);
    doc.text('Nenhuma categoria no período.', x, 65);
    return;
  }
  items.forEach((item, index) => {
    const y = 65 + index * 13;
    setColor(doc, COLOR.gold);
    doc.setFontSize(14);
    doc.text(String(item.rank), x, y);
    setColor(doc, COLOR.white);
    doc.setFontSize(9.5);
    doc.text(item.label, x + 11, y - 1, { maxWidth: 78 });
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`${formatPercentBR(item.sharePercent, 1)} da composição`, x + 11, y + 4);
    setColor(doc, tone === 'revenue' ? COLOR.revenue : COLOR.expense);
    doc.setFont('courier', 'bold');
    doc.setFontSize(9);
    doc.text(fmtBRL(item.amount), x + 137, y, { align: 'right' });
    setColor(doc, COLOR.subtle, 'draw');
    doc.line(x, y + 7, x + 137, y + 7);
  });
}

function drawOpenItems(
  doc: jsPDF,
  indicators: Extract<PresentationSlide['availability'], { state: 'available' | 'empty' }>['data'] & { type: 'open-items' },
): void {
  const items = [
    { x: 20, label: 'Contas a pagar em aberto', data: indicators.indicators.accountsPayableOpen, color: COLOR.warning },
    { x: 167, label: 'Contas a receber em aberto', data: indicators.indicators.accountsReceivableOpen, color: COLOR.white },
  ];
  items.forEach(item => {
    setColor(doc, COLOR.gold, 'fill');
    doc.rect(item.x, 68, 132, 2, 'F');
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(item.label, item.x, 82);
    setColor(doc, item.color);
    doc.setFontSize(25);
    doc.text(fmtBRL(item.data.amount), item.x, 105, { maxWidth: 130 });
    setColor(doc, COLOR.white);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(`${formatIntegerBR(item.data.count)} título(s)`, item.x, 119);
    setColor(doc, COLOR.muted);
    doc.setFontSize(8);
    doc.text('Indicador em aberto - fora do resultado gerencial', item.x, 128);
  });
}

function drawDecisionCommitments(doc: jsPDF, detail: PresentationDecisionDetail): void {
  const revision = detail.revisions.find(item => item.id === detail.decision.currentRevisionId);
  if (!revision) { drawEmpty(doc, 'Revisão aprovada indisponível.'); return; }
  setColor(doc, COLOR.gold, 'fill');
  doc.roundedRect(17, 42, 35, 8, 1, 1, 'F');
  setColor(doc, COLOR.background);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(presentationDecisionStatusLabel(detail.decision.status), 34.5, 47.3, { align: 'center' });
  if (detail.decision.referenceType === 'SCENARIO') {
    setColor(doc, COLOR.warning);
    doc.text('SIMULAÇÃO', 58, 47.3);
  }
  const contextLimit = 430;
  const context = detail.decision.context.length > contextLimit
    ? `${detail.decision.context.slice(0, contextLimit)}… [contexto completo no registro ${detail.decision.id}]`
    : detail.decision.context;
  setColor(doc, COLOR.white);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(context, 17, 58, { maxWidth: 128, lineHeightFactor: 1.25 });
  setColor(doc, COLOR.muted);
  doc.setFontSize(7);
  doc.text(`Responsável: ${detail.decision.executiveResponsibleName ?? 'não informado'}`, 17, 82, { maxWidth: 128 });
  doc.text(`Aprovador: ${revision.approvedByName ?? 'usuário removido'} · revisão ${revision.revisionNumber} · corte ${revision.snapshot.cutoffDate}`, 17, 87, { maxWidth: 128 });

  const metrics = [
    ['Receita', revision.snapshot.metrics.revenue, false],
    ['Despesa', revision.snapshot.metrics.expense, false],
    ['Resultado', revision.snapshot.metrics.result, false],
    ['Margem', revision.snapshot.metrics.marginPercent, true],
  ] as const;
  metrics.forEach((metric, index) => {
    const x = 163 + (index % 2) * 69;
    const y = 48 + Math.floor(index / 2) * 22;
    setColor(doc, COLOR.gold, 'fill');
    doc.rect(x, y, 1.2, 15, 'F');
    setColor(doc, COLOR.muted);
    doc.setFontSize(7);
    doc.text(`${metric[0]} esperado`, x + 4, y + 4);
    setColor(doc, COLOR.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    const formatted = metric[1] === null ? 'Indisponível' : metric[2] ? formatPercentBR(metric[1], 1) : fmtBRL(metric[1]);
    doc.text(formatted, x + 4, y + 11, { maxWidth: 62 });
  });

  setColor(doc, COLOR.gold);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Compromissos', 17, 101);
  if (detail.actions.length === 0) {
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.text('Nenhuma ação registrada.', 17, 110);
    return;
  }
  let leftY = 109;
  let rightY = 109;
  detail.actions.forEach((action, index) => {
    const x = index % 2 === 0 ? 17 : 163;
    const currentY = index % 2 === 0 ? leftY : rightY;
    setColor(doc, COLOR.white);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    const lines = doc.splitTextToSize(action.description, 128) as string[];
    doc.text(lines, x, currentY, { lineHeightFactor: 1.15 });
    const nextY = currentY + lines.length * 3 + 4;
    setColor(doc, COLOR.muted);
    doc.setFontSize(5.8);
    doc.text(`${action.responsibleName} · ${action.dueDate ?? 'sem prazo'} · ${presentationActionStatusLabel(action.status)}`, x, nextY);
    setColor(doc, COLOR.subtle, 'draw');
    doc.line(x, nextY + 2, x + 128, nextY + 2);
    if (index % 2 === 0) leftY = nextY + 6;
    else rightY = nextY + 6;
  });
}

function drawDecisionFollowUp(
  doc: jsPDF,
  detail: PresentationDecisionDetail,
  comparison: Extract<PresentationDecisionComparison, { state: 'available' }>,
): void {
  setColor(doc, COLOR.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`${detail.decision.title} · snapshot ${new Date(comparison.snapshotCapturedAt).toLocaleString('pt-BR')} · base atual ${new Date(comparison.currentGeneratedAt).toLocaleString('pt-BR')}`, 17, 44, { maxWidth: 286 });
  const columns = [17, 70, 126, 182, 238];
  const headers = ['Métrica', 'Snapshot', 'Base atual', 'Variação', 'Leitura'];
  setColor(doc, COLOR.gold);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  headers.forEach((header, index) => doc.text(header, columns[index], 57));
  const labels = { revenue: 'Receita', expense: 'Despesa', result: 'Resultado', marginPercent: 'Margem', cmv: 'CMV' } as const;
  comparison.metrics.forEach((metric, index) => {
    const y = 70 + index * 16;
    const percent = metric.key === 'marginPercent';
    const format = (value: number | null) => value === null ? 'Indisponível' : percent ? formatPercentBR(value, 1) : fmtBRL(value);
    setColor(doc, COLOR.subtle, 'draw');
    doc.line(17, y - 6, 303, y - 6);
    setColor(doc, COLOR.white);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(labels[metric.key], columns[0], y);
    doc.text(format(metric.snapshot), columns[1], y, { maxWidth: 50 });
    doc.text(format(metric.current), columns[2], y, { maxWidth: 50 });
    doc.text(format(metric.absoluteChange), columns[3], y, { maxWidth: 50 });
    doc.text(metric.favorability === 'favorable' ? 'Favorável' : metric.favorability === 'unfavorable' ? 'Desfavorável' : metric.favorability === 'neutral' ? 'Neutra' : 'Indisponível', columns[4], y);
  });
  setColor(doc, COLOR.muted);
  doc.setFontSize(7);
  doc.text('Comparação informativa de métricas equivalentes; não atribui causalidade nem classifica a decisão como sucesso ou falha.', 17, 158, { maxWidth: 286 });
}

function drawSlideContent(doc: jsPDF, slide: PresentationSlide): void {
  if (slide.availability.state !== 'available' && slide.availability.state !== 'empty') {
    drawEmpty(doc, availabilityMessage(slide.availability));
    return;
  }
  const payload = slide.availability.data;
  if (
    slide.availability.state === 'empty'
    && payload.type !== 'cover'
    && !payload.type.startsWith('expenses-')
    && !payload.type.startsWith('results-')
    && payload.type !== 'insights'
  ) {
    drawEmpty(doc, availabilityMessage(slide.availability));
    return;
  }
  switch (payload.type) {
    case 'chapter-foundation':
      drawEmpty(doc, 'Conteúdo não solicitado nesta fase.');
      break;
    case 'revenue-summary':
      drawRevenueSummary(doc, payload.revenue);
      break;
    case 'revenue-gross-net':
      drawRevenueGrossNet(doc, payload.revenue);
      break;
    case 'revenue-by-brand':
      drawRevenueByBrand(doc, payload.revenue);
      break;
    case 'revenue-weekdays':
      drawRevenueWeekdays(doc, payload.revenue);
      break;
    case 'revenue-history':
      drawRevenueHistory(doc, payload.revenue);
      break;
    case 'expenses-summary':
      drawExpensesSummary(doc, payload.expenses);
      break;
    case 'expenses-tree':
      drawExpensesTree(doc, payload.nodes, payload.netRevenue);
      break;
    case 'expenses-rolling':
      drawExpensesRolling(doc, payload.expenses);
      break;
    case 'expenses-history':
      drawExpensesHistory(doc, payload.expenses);
      break;
    case 'results-summary':
      drawResultsSummary(doc, payload.results);
      break;
    case 'results-comparison':
      drawResultsComparison(doc, payload.results);
      break;
    case 'results-evolution':
      drawTimeSeries(doc, payload.timeSeries);
      break;
    case 'results-bridge':
      drawResultsBridge(doc, payload.results);
      break;
    case 'results-non-operational':
      drawResultsNonOperational(doc, payload.results, payload.composition);
      break;
    case 'insights':
      drawInsights(doc, payload.items, payload.insights.rulesetVersion);
      break;
    case 'cover':
      drawCover(doc, payload.periodLabel);
      break;
    case 'executive-summary':
      drawExecutiveSummary(doc, payload.metrics.managerialResult, payload.deltas);
      break;
    case 'plan-comparison':
      drawPlanComparison(doc, payload.plan);
      break;
    case 'scenario-impact':
      drawScenarioImpact(doc, payload.scenario);
      break;
    case 'scenario-sensitivity':
      drawScenarioSensitivity(doc, payload.scenario);
      break;
    case 'decision-commitments':
      drawDecisionCommitments(doc, payload.decision);
      break;
    case 'decision-follow-up':
      drawDecisionFollowUp(doc, payload.decision, payload.comparison);
      break;
    case 'time-series':
      drawTimeSeries(doc, payload.timeSeries);
      break;
    case 'category-composition':
      drawComposition(doc, payload.composition);
      break;
    case 'rankings':
      drawRankingColumn(doc, 'Principais receitas', payload.rankings.topRevenueCategories, 'revenue', 17);
      drawRankingColumn(doc, 'Principais despesas', payload.rankings.topExpenseCategories, 'expense', 166);
      break;
    case 'open-items':
      drawOpenItems(doc, payload);
      break;
    case 'non-operational':
      drawComposition(doc, payload.composition, true);
      break;
    case 'highlights':
      drawEmpty(doc, 'Destaques não solicitados nesta apresentação.');
      break;
  }
}

export async function createPresentationPdfBlob(
  data: PresentationSociosData,
  options: PresentationExportOptions = {},
): Promise<Blob> {
  const slides = data.slides.filter(isPresentationSlideExportable);
  if (slides.length === 0) throw new Error('Não há slides disponíveis para exportar.');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [PAGE_WIDTH, PAGE_HEIGHT] });
  doc.setProperties({
    title: `Apresentação Sócios - ${data.periodLabel}`,
    subject: `Faturamento, despesas, resultados e insights - ${data.periodLabel}`,
    author: 'Moralles Food',
    creator: 'Moralles Food',
    keywords: 'apresentacao socios, faturamento, despesas, resultados, insights',
  });

  for (let index = 0; index < slides.length; index += 1) {
    await yieldForCancellation(options.signal);
    if (index > 0) doc.addPage([PAGE_WIDTH, PAGE_HEIGHT], 'landscape');
    drawBackground(doc);
    if (slides[index].kind !== 'cover') drawHeader(doc, slides[index]);
    drawSlideContent(doc, slides[index]);
    drawFooter(doc, data, slides[index], index + 1, slides.length);
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
    message: 'Finalizando PDF',
    cancellable: false,
  });
  return doc.output('blob');
}
