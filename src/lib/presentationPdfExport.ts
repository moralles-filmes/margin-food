import jsPDF from 'jspdf';
import type {
  CategoryCompositionSection,
  PresentationPlanData,
  PresentationRankingItem,
  PresentationScenarioResult,
  PresentationDecisionDetail,
  PresentationDecisionComparison,
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
  flattenPresentationCategories,
  formatPresentationSeriesLabel,
  presentationGeneratedLabel,
  presentationActionStatusLabel,
  presentationDecisionStatusLabel,
} from '@/lib/presentationFormatting';
import { isPresentationSlideExportable } from '@/lib/presentationSlides';
import { fmtBRL, fmtBRLCompact, formatIntegerBR, formatPercentBR } from '@/lib/formatters';

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
  doc.setFontSize(26);
  doc.text(slide.title, 17, 26, { maxWidth: 286 });
  if (slide.subtitle) {
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.text(slide.subtitle, 17, 33, { maxWidth: 286 });
  }
}

function drawFooter(
  doc: jsPDF,
  data: PresentationSociosData,
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
    `${PRESENTATION_SOURCE_LABEL} · ${PRESENTATION_REGIME_LABEL} · ${presentationGeneratedLabel(data.generatedAt)} · Slide ${slideNumber} de ${totalSlides}`,
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
  doc.text('Resultado operacional por competência. Transferências excluídas.', 22, 140);
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
  if (slide.availability.state === 'empty' && payload.type !== 'cover') {
    drawEmpty(doc, availabilityMessage(slide.availability));
    return;
  }
  switch (payload.type) {
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

  for (let index = 0; index < slides.length; index += 1) {
    await yieldForCancellation(options.signal);
    if (index > 0) doc.addPage([PAGE_WIDTH, PAGE_HEIGHT], 'landscape');
    drawBackground(doc);
    if (slides[index].kind !== 'cover') drawHeader(doc, slides[index]);
    drawSlideContent(doc, slides[index]);
    drawFooter(doc, data, index + 1, slides.length);
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
