import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { APP_NAME } from '@/lib/brand';
import { todayBR } from '@/lib/datetime';
import { fmtBRL as fmtBRLMoney } from '@/lib/money';

const HEADER_COLOR: [number, number, number] = [30, 41, 59]; // slate-800

function addHeader(doc: jsPDF, titulo: string, subtitulo: string) {
  doc.setFontSize(14);
  doc.text(APP_NAME, 14, 15);
  doc.setFontSize(11);
  doc.text(titulo, 14, 23);
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(subtitulo, 14, 29);
  doc.setTextColor(0);
}

function addFooter(doc: jsPDF) {
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(`Gerado por ${APP_NAME} em ${new Date().toLocaleString('pt-BR')}`, 14, doc.internal.pageSize.height - 8);
  doc.setTextColor(0);
}

const fmtBRL = fmtBRLMoney;

export function gerarPDFDre(dados: { mes: string; linhas: { codigo: string; nome: string; valor: number; pctReceita: string; tipo: string }[] }) {
  const doc = new jsPDF();
  addHeader(doc, 'DRE — Demonstrativo de Resultado', `Competência: ${dados.mes}`);

  (doc as any).autoTable({
    startY: 36,
    head: [['Cód.', 'Linha', 'Valor', '% Receita']],
    body: dados.linhas.map(l => [l.codigo, l.nome, fmtBRL(l.valor), l.pctReceita]),
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: HEADER_COLOR, textColor: 255 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    didParseCell: (data: any) => {
      const row = dados.linhas[data.row.index];
      if (row && (row.tipo === 'subtotal' || row.tipo === 'resultado')) {
        data.cell.styles.fontStyle = 'bold';
        if (row.tipo === 'resultado') {
          data.cell.styles.fillColor = row.valor >= 0 ? [220, 252, 231] : [254, 226, 226];
        }
      }
    },
  });

  addFooter(doc);
  doc.save(`dre-${dados.mes}.pdf`);
}

export function gerarPDFFluxoCaixa(dados: {
  periodo: string;
  totais: { entradas: number; saidas: number; previstoEntradas: number; previstoSaidas: number };
  linhas: { data: string; entradas: number; saidas: number; previstoEntradas: number; previstoSaidas: number; saldoPrevisto: number }[];
}) {
  const doc = new jsPDF('landscape');
  addHeader(doc, 'Fluxo de Caixa — Real + Projetado', dados.periodo);

  // Summary
  doc.setFontSize(9);
  const y = 36;
  doc.text(`Entradas Realizadas: ${fmtBRL(dados.totais.entradas)}`, 14, y);
  doc.text(`Saídas Realizadas: ${fmtBRL(dados.totais.saidas)}`, 100, y);
  doc.text(`Saldo Real: ${fmtBRL(dados.totais.entradas - dados.totais.saidas)}`, 186, y);

  (doc as any).autoTable({
    startY: y + 8,
    head: [['Data', 'Entradas', 'Saídas', 'Prev. Entradas', 'Prev. Saídas', 'Saldo Dia']],
    body: dados.linhas.map(l => [
      l.data,
      l.entradas > 0 ? fmtBRL(l.entradas) : '—',
      l.saidas > 0 ? fmtBRL(l.saidas) : '—',
      l.previstoEntradas > 0 ? fmtBRL(l.previstoEntradas) : '—',
      l.previstoSaidas > 0 ? fmtBRL(l.previstoSaidas) : '—',
      fmtBRL(l.saldoPrevisto),
    ]),
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: HEADER_COLOR, textColor: 255 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  });

  addFooter(doc);
  doc.save(`fluxo-caixa-${dados.periodo.replace(/\s/g, '-')}.pdf`);
}

export function gerarPDFContasPagar(dados: { items: { data_vencimento: string; descricao: string; fornecedor: string; valor: number; status: string }[] }) {
  const doc = new jsPDF();
  addHeader(doc, 'Relatório de Contas a Pagar', `${dados.items.length} registros`);

  const total = dados.items.reduce((s, i) => s + i.valor, 0);

  (doc as any).autoTable({
    startY: 36,
    head: [['Vencimento', 'Descrição', 'Fornecedor', 'Valor', 'Status']],
    body: dados.items.map(i => [i.data_vencimento, i.descricao, i.fornecedor || '—', fmtBRL(i.valor), i.status]),
    foot: [['', '', 'TOTAL', fmtBRL(total), '']],
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: HEADER_COLOR, textColor: 255 },
    footStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' },
  });

  addFooter(doc);
  doc.save(`contas-pagar-${todayBR()}.pdf`);
}

export function gerarPDFContasReceber(dados: { items: { data_vencimento: string; descricao: string; cliente: string; valor: number; status: string }[] }) {
  const doc = new jsPDF();
  addHeader(doc, 'Relatório de Contas a Receber', `${dados.items.length} registros`);

  const total = dados.items.reduce((s, i) => s + i.valor, 0);

  (doc as any).autoTable({
    startY: 36,
    head: [['Vencimento', 'Descrição', 'Cliente', 'Valor', 'Status']],
    body: dados.items.map(i => [i.data_vencimento, i.descricao, i.cliente || '—', fmtBRL(i.valor), i.status]),
    foot: [['', '', 'TOTAL', fmtBRL(total), '']],
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: HEADER_COLOR, textColor: 255 },
    footStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' },
  });

  addFooter(doc);
  doc.save(`contas-receber-${todayBR()}.pdf`);
}
