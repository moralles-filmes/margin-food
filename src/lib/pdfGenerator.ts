import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { APP_NAME } from '@/lib/brand';
import { fmtBRL } from '@/lib/money';
import { formatDateValueBR } from '@/lib/datetime';

interface PDFPedido {
  fornecedor: string;
  data: string;
  dataPrevista: string;
  formaPagamento: string;
  itens: { produto: string; quantidade: number; precoUnitario: number; total: number }[];
  observacao: string;
}

export function gerarPDFPedido(pedido: PDFPedido) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(APP_NAME, 14, 15);
  doc.setFontSize(12);
  doc.text('Pedido de Compra', 14, 23);
  doc.setFontSize(9);
  doc.text(`Fornecedor: ${pedido.fornecedor}`, 14, 32);
  doc.text(`Data: ${formatDateValueBR(pedido.data, '-')}`, 14, 38);
  doc.text(`Previsão entrega: ${formatDateValueBR(pedido.dataPrevista, '-')}`, 14, 44);
  doc.text(`Pagamento: ${pedido.formaPagamento}`, 14, 50);

  const total = pedido.itens.reduce((s, i) => s + i.total, 0);

  autoTable(doc, {
    startY: 58,
    head: [['Produto', 'Qtd', 'Preço Unit.', 'Total']],
    body: pedido.itens.map(i => [i.produto, i.quantidade.toString(), fmtBRL(i.precoUnitario), fmtBRL(i.total)]),
    foot: [['', '', 'TOTAL', fmtBRL(total)]],
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [220, 80, 50], textColor: 255 },
    footStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' },
  });

  if (pedido.observacao) {
    const finalY = (doc as any).lastAutoTable?.finalY || 100;
    doc.setFontSize(8);
    doc.text(`Obs: ${pedido.observacao}`, 14, finalY + 10);
  }

  doc.setFontSize(7);
  doc.text(`Gerado por ${APP_NAME} em ${new Date().toLocaleString('pt-BR')}`, 14, doc.internal.pageSize.height - 10);
  doc.save(`pedido-${pedido.fornecedor}-${pedido.data}.pdf`);
}

