import jsPDF from 'jspdf';
import autoTable, { type CellInput, type RowInput } from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { APP_NAME } from '@/lib/brand';
import { fmtBRL, formatDateBR, parseLocalDate } from '@/lib/formatters';
import {
  FORMA_VENDA_LABEL,
  buildResumoPorMarca,
  ticketMedio,
  type FechamentoDia,
  type FechamentoMarcaLinha,
} from '@/domain/financeiro/fechamentoMarcas';

export interface FechamentoExportInput {
  companyName: string;
  startDate: string;
  endDate: string;
  dias: FechamentoDia[];
}

type RGB = [number, number, number];

// Paleta impressa e literal: jsPDF exige cor em número, não CSS var.
const COLOR: Record<'primary' | 'ink' | 'muted' | 'line' | 'soft' | 'softBlue', RGB> = {
  primary: [37, 99, 235],
  ink: [15, 23, 42],
  muted: [100, 116, 139],
  line: [226, 232, 240],
  soft: [241, 245, 249],
  softBlue: [239, 246, 255],
};

const MARGIN = 14;
const SEM_VALOR = '—';

const fmtQtd = (value: number) => value.toLocaleString('pt-BR');
const fmtDate = (iso: string) => formatDateBR(parseLocalDate(iso));
const fmtTicket = (valor: number, quantidade: number | null) => {
  const ticket = ticketMedio(valor, quantidade);
  return ticket == null ? SEM_VALOR : fmtBRL(ticket);
};

function periodLabel(input: Pick<FechamentoExportInput, 'startDate' | 'endDate'>) {
  if (input.startDate && input.endDate) return `${fmtDate(input.startDate)} a ${fmtDate(input.endDate)}`;
  if (input.startDate) return `a partir de ${fmtDate(input.startDate)}`;
  if (input.endDate) return `até ${fmtDate(input.endDate)}`;
  return 'todo o período';
}

function diaLabel(iso: string) {
  const label = format(parseLocalDate(iso), "EEEE, dd/MM/yyyy", { locale: ptBR });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatTotaisQuantidade(pedidos: number, pessoas: number): string {
  const partes = [
    pedidos > 0 ? `${fmtQtd(pedidos)} ${pedidos === 1 ? 'pedido' : 'pedidos'}` : '',
    pessoas > 0 ? `${fmtQtd(pessoas)} ${pessoas === 1 ? 'pessoa' : 'pessoas'}` : '',
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(' · ') : SEM_VALOR;
}

export function summarizeFechamentoPeriodo(dias: FechamentoDia[]) {
  return dias.reduce(
    (total, dia) => ({
      dias: total.dias + 1,
      bruto: total.bruto + dia.bruto,
      taxas: total.taxas + dia.taxas,
      descontos: total.descontos + dia.descontos,
      liquido: total.liquido + dia.liquido,
      pedidos: total.pedidos + dia.totalPedidos,
      pessoas: total.pessoas + dia.totalPessoas,
    }),
    { dias: 0, bruto: 0, taxas: 0, descontos: 0, liquido: 0, pedidos: 0, pessoas: 0 }
  );
}

/** Uma marca por linha: [marca, forma de venda, quantidade, faturamento, ticket médio]. */
export function marcaLinhaCells(linha: FechamentoMarcaLinha): string[] {
  const temQuantidade = linha.quantidade != null && linha.formaVenda != null;
  return [
    linha.nome,
    temQuantidade ? FORMA_VENDA_LABEL[linha.formaVenda!] : SEM_VALOR,
    temQuantidade ? fmtQtd(linha.quantidade!) : SEM_VALOR,
    fmtBRL(linha.valor),
    fmtTicket(linha.valor, linha.quantidade),
  ];
}

function sortAsc(dias: FechamentoDia[]) {
  return [...dias].sort((a, b) => a.data.localeCompare(b.data));
}

function lastTableY(doc: jsPDF, fallback: number) {
  return (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? fallback;
}

export function buildFechamentoPdf(input: FechamentoExportInput): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const dias = sortAsc(input.dias);
  const totais = summarizeFechamentoPeriodo(dias);

  // ── Cabeçalho ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...COLOR.ink);
  doc.text(input.companyName || APP_NAME, MARGIN, 18, { maxWidth: pageWidth - MARGIN * 2 - 45 });
  doc.setFontSize(11);
  doc.setTextColor(...COLOR.primary);
  doc.text('Fechamento de Caixa', MARGIN, 25);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLOR.muted);
  doc.text(`Período: ${periodLabel(input)}`, MARGIN, 30.5);
  doc.setFontSize(8);
  doc.text(`Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth - MARGIN, 18, { align: 'right' });
  doc.setDrawColor(...COLOR.primary);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, 34, pageWidth - MARGIN, 34);

  // ── Resumo do período ──
  autoTable(doc, {
    startY: 38,
    margin: { left: MARGIN, right: MARGIN },
    theme: 'plain',
    body: [
      ['Dias registrados', 'Faturamento bruto', 'Faturamento líquido', 'Total de pedidos', 'Total de pessoas'],
      [
        String(totais.dias),
        fmtBRL(totais.bruto),
        fmtBRL(totais.liquido),
        totais.pedidos > 0 ? fmtQtd(totais.pedidos) : SEM_VALOR,
        totais.pessoas > 0 ? fmtQtd(totais.pessoas) : SEM_VALOR,
      ],
    ],
    styles: { fillColor: COLOR.soft, halign: 'left', cellPadding: { top: 2.5, right: 3, bottom: 0.5, left: 3 } },
    didParseCell: data => {
      if (data.row.index === 0) {
        data.cell.styles.fontSize = 7;
        data.cell.styles.textColor = COLOR.muted;
      } else {
        data.cell.styles.fontSize = 11;
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = COLOR.ink;
        data.cell.styles.cellPadding = { top: 0.5, right: 3, bottom: 3, left: 3 };
      }
    },
  });

  // ── Um bloco por dia, uma marca por linha ──
  let y = lastTableY(doc, 50) + 7;

  dias.forEach(dia => {
    const body: RowInput[] = dia.marcas.length > 0
      ? dia.marcas.map(marcaLinhaCells)
      : [[{
          content: 'Faturamento não detalhado por marca',
          colSpan: 5,
          styles: { fontStyle: 'italic', textColor: COLOR.muted },
        }]];

    const rodape = [
      `Taxas: ${fmtBRL(dia.taxas)}`,
      `Descontos: ${fmtBRL(dia.descontos)}`,
      `Líquido: ${fmtBRL(dia.liquido)}`,
    ].join('   ·   ') + (dia.observacao ? `\nObservação: ${dia.observacao}` : '');

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, bottom: 16 },
      pageBreak: 'avoid',
      theme: 'grid',
      head: [
        [{
          content: diaLabel(dia.data),
          colSpan: 5,
          styles: { fillColor: COLOR.primary, textColor: 255, fontSize: 10, halign: 'left' },
        }],
        ['Marca', 'Forma de venda', 'Quantidade', 'Faturamento', 'Ticket médio'],
      ],
      body,
      foot: [
        [
          'Total do dia',
          {
            content: formatTotaisQuantidade(dia.totalPedidos, dia.totalPessoas),
            colSpan: 2,
            styles: { halign: 'right' },
          },
          fmtBRL(dia.bruto),
          '',
        ],
        [{
          content: rodape,
          colSpan: 5,
          styles: { fontStyle: 'normal', fontSize: 8, textColor: COLOR.muted, fillColor: 255, halign: 'left' },
        }],
      ],
      showFoot: 'lastPage',
      styles: { fontSize: 9, cellPadding: 2.5, lineColor: COLOR.line, lineWidth: 0.1, textColor: COLOR.ink },
      headStyles: { fillColor: COLOR.softBlue, textColor: COLOR.ink, fontStyle: 'bold', fontSize: 8 },
      footStyles: { fillColor: COLOR.soft, textColor: COLOR.ink, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 56 },
        1: { cellWidth: 32 },
        2: { cellWidth: 26, halign: 'right' },
        3: { cellWidth: 36, halign: 'right' },
        4: { cellWidth: 32, halign: 'right' },
      },
      didParseCell: data => {
        // Cabeçalho e total acompanham o alinhamento numérico das colunas.
        if (data.section !== 'body' && data.column.index >= 2) data.cell.styles.halign = 'right';
      },
    });
    y = lastTableY(doc, y) + 6;
  });

  // ── Resumo por marca no período ──
  const resumo = buildResumoPorMarca(dias);
  if (resumo.length > 0) {
    if (y > pageHeight - 60) {
      doc.addPage();
      y = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLOR.ink);
    doc.text('Resumo por marca no período', MARGIN, y + 4);

    const pct = (valor: number) => (totais.bruto > 0
      ? `${((valor / totais.bruto) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
      : SEM_VALOR);
    const semDetalhe = totais.bruto - resumo.reduce((sum, item) => sum + item.valor, 0);
    const resumoBody: CellInput[][] = resumo.map(item => [
      item.nome,
      item.formaVenda ? FORMA_VENDA_LABEL[item.formaVenda] : SEM_VALOR,
      item.formaVenda ? fmtQtd(item.quantidade) : SEM_VALOR,
      fmtBRL(item.valor),
      pct(item.valor),
      item.formaVenda ? fmtTicket(item.valorComQuantidade, item.quantidade) : SEM_VALOR,
    ]);
    if (semDetalhe > 0.005) {
      resumoBody.push(['Sem detalhamento por marca', SEM_VALOR, SEM_VALOR, fmtBRL(semDetalhe), pct(semDetalhe), SEM_VALOR]);
    }

    autoTable(doc, {
      startY: y + 8,
      margin: { left: MARGIN, right: MARGIN, bottom: 16 },
      theme: 'grid',
      head: [['Marca', 'Forma de venda', 'Quantidade', 'Faturamento', '% do total', 'Ticket médio']],
      body: resumoBody,
      foot: [[
        'Total geral',
        {
          content: formatTotaisQuantidade(totais.pedidos, totais.pessoas),
          colSpan: 2,
          styles: { halign: 'right' },
        },
        fmtBRL(totais.bruto),
        totais.bruto > 0 ? '100,0%' : SEM_VALOR,
        '',
      ]],
      showFoot: 'lastPage',
      styles: { fontSize: 9, cellPadding: 2.5, lineColor: COLOR.line, lineWidth: 0.1, textColor: COLOR.ink },
      headStyles: { fillColor: COLOR.primary, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      footStyles: { fillColor: COLOR.soft, textColor: COLOR.ink, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 48 },
        1: { cellWidth: 28 },
        2: { cellWidth: 24, halign: 'right' },
        3: { cellWidth: 32, halign: 'right' },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 28, halign: 'right' },
      },
      didParseCell: data => {
        if (data.section !== 'body' && data.column.index >= 2) data.cell.styles.halign = 'right';
      },
    });
  }

  // ── Rodapé em todas as páginas ──
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COLOR.muted);
    doc.text(`Gerado por ${APP_NAME}`, MARGIN, pageHeight - 8);
    doc.text(`Página ${page} de ${pages}`, pageWidth - MARGIN, pageHeight - 8, { align: 'right' });
  }

  return doc;
}

type SheetRow = Record<string, string | number>;

/** Aba "Fechamento": uma linha por dia. Aba "Por marca": uma linha por dia e marca. */
export function buildFechamentoExcelSheets(input: FechamentoExportInput): { fechamento: SheetRow[]; porMarca: SheetRow[] } {
  const dias = sortAsc(input.dias);
  const totais = summarizeFechamentoPeriodo(dias);

  const fechamento: SheetRow[] = dias.map(dia => ({
    Data: fmtDate(dia.data),
    'Faturamento Bruto': dia.bruto,
    Pedidos: dia.totalPedidos,
    Pessoas: dia.totalPessoas,
    Taxas: dia.taxas,
    Descontos: dia.descontos,
    'Faturamento Líquido': dia.liquido,
    Observação: dia.observacao || '',
  }));
  fechamento.push({
    Data: 'TOTAL',
    'Faturamento Bruto': totais.bruto,
    Pedidos: totais.pedidos,
    Pessoas: totais.pessoas,
    Taxas: totais.taxas,
    Descontos: totais.descontos,
    'Faturamento Líquido': totais.liquido,
    Observação: '',
  });

  const porMarca: SheetRow[] = dias.flatMap(dia => dia.marcas.map(linha => {
    const temQuantidade = linha.quantidade != null && linha.formaVenda != null;
    return {
      Data: fmtDate(dia.data),
      Marca: linha.nome,
      'Forma de venda': temQuantidade ? FORMA_VENDA_LABEL[linha.formaVenda!] : '',
      Quantidade: temQuantidade ? linha.quantidade! : '',
      Faturamento: linha.valor,
      'Ticket médio': ticketMedio(linha.valor, linha.quantidade) ?? '',
    };
  }));

  return { fechamento, porMarca };
}

export function fechamentoExportFilename(input: Pick<FechamentoExportInput, 'startDate' | 'endDate'>, ext: 'pdf' | 'xlsx') {
  return `fechamento-caixa-${input.startDate}-${input.endDate}.${ext}`;
}
