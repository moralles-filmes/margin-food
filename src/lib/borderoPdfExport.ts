/**
 * Exportação PDF do Borderô (A4 retrato, jsPDF + jspdf-autotable).
 *
 * O PDF é gerado a partir do MESMO `BorderoReport` exibido na tela e dos mesmos
 * formatadores (`formatBorderoMoney`, `formatBorderoPeriod`) — não recalcula nada.
 * Paleta impressa literal, intencionalmente fora dos tokens CSS (jsPDF exige cor
 * em string), como nos demais exports em PDF do sistema.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { APP_NAME } from '@/lib/brand';
import { formatDateTimeBR, formatDateValueBR, todayBR } from '@/lib/datetime';
import {
  BORDERO_FINAL_BALANCE_MESSAGE,
  borderoCategoryPaths,
  borderoEntryParty,
  borderoEntrySituation,
  buildBorderoPdfFileName,
  flattenBorderoCategories,
  formatBorderoMoney,
  formatBorderoMonth,
  formatBorderoPeriod,
  type BorderoFinalBalanceState,
  type BorderoPeriodMode,
  type BorderoReport,
} from '@/domain/financeiro/bordero';

export interface BorderoPdfOptions {
  mode: BorderoPeriodMode;
  /** Momento da exportação (injetável para teste). */
  exportedAt?: Date;
  /** Hoje em yyyy-MM-dd, para marcar contas vencidas (injetável para teste). */
  todayISO?: string;
}

export interface BorderoPdfModel {
  storeName: string;
  title: string;
  subtitle: string;
  periodLabel: string;
  periodCaption: string;
  exportedAtLabel: string;
  dataPositionLabel: string;
  summary: {
    paid: string;
    payable: string;
    total: string;
    balance: string;
    final: string;
    finalState: BorderoFinalBalanceState;
    finalMessage: string;
  };
  categoryRows: Array<{ label: string; paid: string; open: string; value: string; depth: number; nonOperational: boolean }>;
  totals: Array<{ label: string; paid: string; open: string; value: string }>;
  accountRows: Array<{ name: string; bank: string; value: string; unavailable: boolean }>;
  itemRows: Array<{ date: string; situation: string; party: string; category: string; value: string }>;
  overdueNote: string | null;
  fileName: string;
}

export const BORDERO_TITLE = 'BORDERÔ';
export const BORDERO_SUBTITLE = 'Despesas do período — já pagas e a vencer — e disponibilidade de caixa.';

const PERIOD_CAPTION: Record<BorderoPeriodMode, string> = {
  week: 'Semana (segunda a domingo)',
  month: '',
  custom: 'Período personalizado',
};

export function buildBorderoPdfModel(report: BorderoReport, options: BorderoPdfOptions): BorderoPdfModel {
  const paths = borderoCategoryPaths(report.tree, ' / ');
  const generatedAt = new Date(report.generatedAt);
  const todayISO = options.todayISO ?? todayBR();
  return {
    storeName: report.store.name,
    title: BORDERO_TITLE,
    subtitle: BORDERO_SUBTITLE,
    periodLabel: formatBorderoPeriod(report.period),
    periodCaption: options.mode === 'month'
      ? formatBorderoMonth(report.period.start.slice(0, 7))
      : PERIOD_CAPTION[options.mode],
    exportedAtLabel: formatDateTimeBR(options.exportedAt ?? new Date()),
    dataPositionLabel: Number.isNaN(generatedAt.getTime()) ? '—' : formatDateTimeBR(generatedAt),
    summary: {
      paid: formatBorderoMoney(report.totalPaidCents),
      payable: formatBorderoMoney(report.totalPayableCents),
      total: formatBorderoMoney(report.totalExpenseCents),
      balance: formatBorderoMoney(report.totalAccountBalanceCents),
      final: formatBorderoMoney(report.projectedFinalBalanceCents),
      finalState: report.finalBalanceState,
      finalMessage: BORDERO_FINAL_BALANCE_MESSAGE[report.finalBalanceState],
    },
    categoryRows: flattenBorderoCategories(report.tree, { includeEmpty: false, isExpanded: () => true })
      .map(row => ({
        label: row.node.name,
        paid: formatBorderoMoney(row.node.paidCents),
        open: formatBorderoMoney(row.node.openCents),
        value: formatBorderoMoney(row.node.amountCents),
        depth: row.depth,
        nonOperational: row.node.nonOperational,
      })),
    totals: [
      {
        label: 'TOTAL DE CONTAS',
        paid: formatBorderoMoney(report.totalPaidCents),
        open: formatBorderoMoney(report.totalPayableCents),
        value: formatBorderoMoney(report.totalExpenseCents),
      },
      { label: 'SALDO DAS CONTAS', paid: '', open: '', value: formatBorderoMoney(report.totalAccountBalanceCents) },
      { label: 'SALDO FINAL PROVISIONADO', paid: '', open: '', value: formatBorderoMoney(report.projectedFinalBalanceCents) },
    ],
    accountRows: report.accounts.map(account => ({
      name: account.name,
      bank: account.bank ?? '—',
      value: formatBorderoMoney(account.balanceCents),
      unavailable: !account.balanceAvailable,
    })),
    itemRows: report.entries.map(entry => ({
      date: formatDateValueBR(entry.referenceDate),
      situation: borderoEntrySituation(entry, todayISO).label,
      party: borderoEntryParty(entry),
      category: paths.get(entry.categoryId) ?? '—',
      value: formatBorderoMoney(entry.amountCents),
    })),
    overdueNote: report.overdueBeforePeriod.count > 0
      ? `Atenção: ${report.overdueBeforePeriod.count} conta(s) em aberto com vencimento anterior ao período `
        + `(${formatBorderoMoney(report.overdueBeforePeriod.amountCents)}) não compõem este borderô.`
      : null,
    fileName: buildBorderoPdfFileName(report.store.name, options.mode, report.period),
  };
}

// ─── Desenho ────────────────────────────────────────────────────────────────

const COLOR = {
  ink: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
  surface: '#F8FAFC',
  rootRow: '#F1F5F9',
  primary: '#1D4ED8',
  primarySoft: '#EFF6FF',
  success: '#15803D',
  successSoft: '#ECFDF5',
  danger: '#B91C1C',
  dangerSoft: '#FEF2F2',
  warning: '#92400E',
} as const;

const PAGE = { width: 210, height: 297, margin: 14 } as const;
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;
const CONTINUATION_TOP = 24;
const BOTTOM_RESERVED = 18;

const FINAL_TONE: Record<BorderoFinalBalanceState, { text: string; fill: string }> = {
  positive: { text: COLOR.success, fill: COLOR.successSoft },
  zero: { text: COLOR.ink, fill: COLOR.surface },
  negative: { text: COLOR.danger, fill: COLOR.dangerSoft },
};

const FINAL_STATE_TAG: Record<BorderoFinalBalanceState, string> = {
  positive: 'POSITIVO',
  zero: 'NEUTRO',
  negative: 'NEGATIVO',
};

function lastTableY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? PAGE.margin;
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed <= PAGE.height - BOTTOM_RESERVED) return y;
  doc.addPage();
  return CONTINUATION_TOP;
}

/** `minSpace`: título + cabeçalho + algumas linhas, para a seção não começar órfã no pé da página. */
function sectionTitle(doc: jsPDF, text: string, y: number, minSpace = 30): number {
  const top = ensureSpace(doc, y, minSpace);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(COLOR.primary);
  doc.text(text, PAGE.margin, top + 5);
  return top + 8;
}

function drawFirstPageHeader(doc: jsPDF, model: BorderoPdfModel): number {
  const rightX = PAGE.width - PAGE.margin;

  doc.setFillColor(COLOR.primary);
  doc.rect(0, 0, PAGE.width, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(COLOR.ink);
  const storeLines = doc.splitTextToSize(model.storeName, 112) as string[];
  doc.text(storeLines, PAGE.margin, 15);
  const afterStore = 15 + (storeLines.length - 1) * 6;

  doc.setFontSize(22);
  doc.setTextColor(COLOR.primary);
  doc.text(model.title, PAGE.margin, afterStore + 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(COLOR.muted);
  doc.text(model.subtitle, PAGE.margin, afterStore + 16);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('PERÍODO', rightX, 13, { align: 'right' });
  doc.setFontSize(11);
  doc.setTextColor(COLOR.ink);
  doc.text(model.periodLabel, rightX, 19, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(COLOR.muted);
  if (model.periodCaption) doc.text(model.periodCaption, rightX, 24, { align: 'right' });
  doc.text(`Gerado em ${model.exportedAtLabel}`, rightX, 29, { align: 'right' });

  const dividerY = Math.max(afterStore + 21, 33);
  doc.setDrawColor(COLOR.border);
  doc.setLineWidth(0.3);
  doc.line(PAGE.margin, dividerY, rightX, dividerY);
  return dividerY + 5;
}

function drawSummary(doc: jsPDF, model: BorderoPdfModel, top: number): number {
  const gap = 3;
  const width = (CONTENT_WIDTH - gap * 4) / 5;
  const height = 28;
  const tone = FINAL_TONE[model.summary.finalState];
  const plain = { color: COLOR.ink, fill: COLOR.surface, border: COLOR.border, note: '' };
  const cards = [
    { label: 'CONTAS JÁ PAGAS', value: model.summary.paid, ...plain },
    { label: 'CONTAS A VENCER', value: model.summary.payable, ...plain },
    { label: 'TOTAL DE CONTAS', value: model.summary.total, ...plain },
    { label: 'SALDO DAS CONTAS', value: model.summary.balance, ...plain },
    {
      label: `SALDO FINAL PROVISIONADO · ${FINAL_STATE_TAG[model.summary.finalState]}`,
      value: model.summary.final,
      color: tone.text,
      fill: tone.fill,
      border: tone.text,
      note: model.summary.finalMessage,
    },
  ];

  cards.forEach((card, index) => {
    const x = PAGE.margin + index * (width + gap);
    doc.setFillColor(card.fill);
    doc.setDrawColor(card.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, top, width, height, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(COLOR.muted);
    doc.text(doc.splitTextToSize(card.label, width - 5) as string[], x + 2.5, top + 5);

    doc.setFontSize(10.5);
    doc.setTextColor(card.color);
    doc.text(card.value, x + 2.5, top + 15, { maxWidth: width - 5 });

    if (card.note) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.text(doc.splitTextToSize(card.note, width - 5) as string[], x + 2.5, top + 20);
    }
  });
  return top + height + 6;
}

function drawContinuationHeader(doc: jsPDF, model: BorderoPdfModel): void {
  doc.setFillColor(COLOR.primary);
  doc.rect(0, 0, PAGE.width, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(COLOR.ink);
  doc.text(`${model.storeName} · ${model.title}`, PAGE.margin, 11, { maxWidth: 120 });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLOR.muted);
  doc.text(`Período: ${model.periodLabel}`, PAGE.width - PAGE.margin, 11, { align: 'right' });
  doc.setDrawColor(COLOR.border);
  doc.line(PAGE.margin, 15, PAGE.width - PAGE.margin, 15);
}

function drawFooters(doc: jsPDF, model: BorderoPdfModel): void {
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    if (page > 1) drawContinuationHeader(doc, model);
    doc.setDrawColor(COLOR.border);
    doc.line(PAGE.margin, PAGE.height - 12, PAGE.width - PAGE.margin, PAGE.height - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(COLOR.muted);
    doc.text(
      `${APP_NAME} · Borderô · Posição dos dados: ${model.dataPositionLabel} · Pagas por data de pagamento; a vencer por vencimento`,
      PAGE.margin,
      PAGE.height - 7,
      { maxWidth: 150 },
    );
    doc.text(`Página ${page} de ${total}`, PAGE.width - PAGE.margin, PAGE.height - 7, { align: 'right' });
  }
}

const TABLE_BASE = {
  theme: 'plain' as const,
  margin: { left: PAGE.margin, right: PAGE.margin, top: CONTINUATION_TOP, bottom: BOTTOM_RESERVED },
  rowPageBreak: 'avoid' as const,
  showHead: 'everyPage' as const,
  styles: { font: 'helvetica', fontSize: 9, textColor: COLOR.ink, cellPadding: 2.2, lineColor: COLOR.border, lineWidth: { bottom: 0.2 } },
  headStyles: { fillColor: COLOR.primary, textColor: '#FFFFFF', fontStyle: 'bold' as const, fontSize: 8.5 },
  footStyles: { fillColor: COLOR.primarySoft, textColor: COLOR.ink, fontStyle: 'bold' as const },
};

export function createBorderoPdfDocument(model: BorderoPdfModel): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setProperties({
    title: `Borderô — ${model.storeName} — ${model.periodLabel}`,
    subject: `Contas já pagas, contas a vencer, saldo das contas e saldo final provisionado — ${model.periodLabel}`,
    creator: APP_NAME,
  });

  let y = drawFirstPageHeader(doc, model);
  y = drawSummary(doc, model, y);

  const tone = FINAL_TONE[model.summary.finalState];
  autoTable(doc, {
    ...TABLE_BASE,
    startY: y,
    head: [['DESPESAS DO PERÍODO', 'PAGAS', 'A VENCER', 'TOTAL']],
    body: model.categoryRows.map(row => [
      row.nonOperational ? `${row.label} (não operacional)` : row.label,
      row.paid,
      row.open,
      row.value,
    ]),
    foot: model.totals.map(total => [total.label, total.paid, total.open, total.value]),
    showFoot: 'lastPage',
    columnStyles: {
      1: { halign: 'right', cellWidth: 32 },
      2: { halign: 'right', cellWidth: 32 },
      3: { halign: 'right', cellWidth: 36 },
    },
    didParseCell: data => {
      if (data.column.index > 0) data.cell.styles.halign = 'right';
      if (data.section === 'body') {
        const row = model.categoryRows[data.row.index];
        if (!row) return;
        if (row.depth === 0) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = COLOR.rootRow;
        } else if (data.column.index === 0) {
          data.cell.styles.cellPadding = { top: 2.2, bottom: 2.2, right: 2.2, left: 2.2 + row.depth * 5 };
          data.cell.styles.textColor = COLOR.muted;
        }
      }
      if (data.section === 'foot') {
        data.cell.styles.fontSize = 10;
        if (data.row.index === 2) {
          data.cell.styles.fillColor = tone.fill;
          data.cell.styles.textColor = tone.text;
          data.cell.styles.fontSize = 11;
        }
      }
    },
  });
  y = lastTableY(doc) + 4;

  if (model.overdueNote) {
    y = ensureSpace(doc, y, 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(COLOR.warning);
    const lines = doc.splitTextToSize(model.overdueNote, CONTENT_WIDTH) as string[];
    doc.text(lines, PAGE.margin, y + 3);
    y += 3 + lines.length * 3.6;
  }

  y = sectionTitle(doc, 'COMPOSIÇÃO DO SALDO DAS CONTAS', y + 4);
  autoTable(doc, {
    ...TABLE_BASE,
    startY: y,
    head: [['Conta', 'Banco', 'Saldo']],
    body: model.accountRows.length > 0
      ? model.accountRows.map(row => [row.unavailable ? `${row.name} (saldo indisponível)` : row.name, row.bank, row.value])
      : [['Nenhuma conta bancária ativa', '—', formatBorderoMoney(0)]],
    foot: [[{ content: 'SALDO DAS CONTAS', colSpan: 2 }, model.summary.balance]],
    showFoot: 'lastPage',
    columnStyles: { 2: { halign: 'right', cellWidth: 48 } },
    didParseCell: data => { if (data.column.index === 2) data.cell.styles.halign = 'right'; },
  });
  y = lastTableY(doc) + 4;

  y = sectionTitle(doc, 'DETALHAMENTO DAS DESPESAS', y + 4, 50);
  if (model.itemRows.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(COLOR.muted);
    doc.text('Não existem despesas para este período.', PAGE.margin, y + 4);
  } else {
    autoTable(doc, {
      ...TABLE_BASE,
      startY: y,
      head: [['Data', 'Situação', 'Fornecedor / Descrição', 'Categoria', 'Valor']],
      body: model.itemRows.map(row => [row.date, row.situation, row.party, row.category, row.value]),
      foot: [[{ content: 'TOTAL DE CONTAS', colSpan: 4 }, model.summary.total]],
      showFoot: 'lastPage',
      styles: { ...TABLE_BASE.styles, fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 19 },
        1: { cellWidth: 30 },
        3: { cellWidth: 46 },
        4: { halign: 'right', cellWidth: 26 },
      },
      didParseCell: data => { if (data.column.index === 4) data.cell.styles.halign = 'right'; },
    });
  }

  drawFooters(doc, model);
  return doc;
}

export function createBorderoPdfBlob(report: BorderoReport, options: BorderoPdfOptions): { blob: Blob; model: BorderoPdfModel } {
  const model = buildBorderoPdfModel(report, options);
  const doc = createBorderoPdfDocument(model);
  return { blob: doc.output('blob'), model };
}

export function exportBorderoPdf(report: BorderoReport, options: BorderoPdfOptions): BorderoPdfModel {
  const model = buildBorderoPdfModel(report, options);
  createBorderoPdfDocument(model).save(model.fileName);
  return model;
}
