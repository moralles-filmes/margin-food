import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { APP_NAME } from '@/lib/brand';
import { fmtBRL } from '@/lib/money';

interface PDFListaCompra {
  titulo: string;
  data: string;
  itens: { produto: string; quantidade: number; unidade: string; categoria: string; prioridade: string }[];
}

interface PDFPedido {
  fornecedor: string;
  data: string;
  dataPrevista: string;
  formaPagamento: string;
  itens: { produto: string; quantidade: number; precoUnitario: number; total: number }[];
  observacao: string;
}

interface PDFCotacao {
  categoria: string;
  data: string;
  fornecedores: { nome: string; itens: { produto: string; quantidade: number; preco: number }[]; frete: number; prazo: number }[];
}

export function gerarPDFListaCompras(lista: PDFListaCompra) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(APP_NAME, 14, 15);
  doc.setFontSize(10);
  doc.text(`Lista de Compras — ${lista.data}`, 14, 22);
  doc.setFontSize(8);
  doc.text(lista.titulo, 14, 28);

  (doc as any).autoTable({
    startY: 35,
    head: [['Produto', 'Qtd', 'Unidade', 'Categoria', 'Prioridade']],
    body: lista.itens.map(i => [i.produto, i.quantidade.toString(), i.unidade, i.categoria, i.prioridade]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [220, 80, 50], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  });

  doc.setFontSize(7);
  doc.text(`Gerado por ${APP_NAME} em ${new Date().toLocaleString('pt-BR')}`, 14, doc.internal.pageSize.height - 10);
  doc.save(`lista-compras-${lista.data}.pdf`);
}

export function gerarPDFPedido(pedido: PDFPedido) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(APP_NAME, 14, 15);
  doc.setFontSize(12);
  doc.text('Pedido de Compra', 14, 23);
  doc.setFontSize(9);
  doc.text(`Fornecedor: ${pedido.fornecedor}`, 14, 32);
  doc.text(`Data: ${pedido.data}`, 14, 38);
  doc.text(`Previsão entrega: ${pedido.dataPrevista}`, 14, 44);
  doc.text(`Pagamento: ${pedido.formaPagamento}`, 14, 50);

  const total = pedido.itens.reduce((s, i) => s + i.total, 0);

  (doc as any).autoTable({
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

export function gerarPDFCotacao(cotacao: PDFCotacao) {
  const doc = new jsPDF('landscape');
  doc.setFontSize(16);
  doc.text(APP_NAME, 14, 15);
  doc.setFontSize(12);
  doc.text(`Cotação — ${cotacao.categoria}`, 14, 23);
  doc.setFontSize(9);
  doc.text(`Data: ${cotacao.data}`, 14, 30);

  // Build comparison table
  const allProducts = [...new Set(cotacao.fornecedores.flatMap(f => f.itens.map(i => i.produto)))];
  const head = ['Produto', ...cotacao.fornecedores.map(f => f.nome)];
  const body = allProducts.map(prod => {
    const row = [prod];
    cotacao.fornecedores.forEach(f => {
      const item = f.itens.find(i => i.produto === prod);
      row.push(item ? fmtBRL(item.preco) : '—');
    });
    return row;
  });

  // Add totals row
  const totalsRow = ['TOTAL'];
  cotacao.fornecedores.forEach(f => {
    const total = f.itens.reduce((s, i) => s + i.preco * i.quantidade, 0);
    totalsRow.push(fmtBRL(total));
  });
  body.push(totalsRow);

  // Frete row
  const freteRow = ['Frete'];
  cotacao.fornecedores.forEach(f => freteRow.push(fmtBRL(f.frete)));
  body.push(freteRow);

  // Prazo row
  const prazoRow = ['Prazo (dias)'];
  cotacao.fornecedores.forEach(f => prazoRow.push(f.prazo.toString()));
  body.push(prazoRow);

  (doc as any).autoTable({
    startY: 38,
    head: [head],
    body,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [220, 80, 50], textColor: 255 },
  });

  doc.setFontSize(7);
  doc.text(`Gerado por ${APP_NAME} em ${new Date().toLocaleString('pt-BR')}`, 14, doc.internal.pageSize.height - 10);
  doc.save(`cotacao-${cotacao.categoria}-${cotacao.data}.pdf`);
}
