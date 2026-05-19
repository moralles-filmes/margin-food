/**
 * Shared export utilities for DRE and DFC demonstrativos.
 * Builds flat row arrays from the same data used by DemonstrativoTree,
 * then generates PDF (jsPDF + autoTable) or Excel (xlsx).
 */
import { buildTree, type CatNode } from '@/components/financeiro/CadastroBaseTree';
import { fmtBRL } from '@/lib/formatters';
import { APP_NAME } from '@/lib/brand';

// ── Row builder (mirrors DemonstrativoTree logic, fully expanded) ──

interface ExportRow {
  codigo: string;
  nome: string;
  valor: number;
  depth: number;
  style: 'header' | 'section' | 'normal' | 'total';
}

interface BuildOptions {
  categorias: any[];
  lancamentos: any[];
  rateios: any[];
  isDFC?: boolean;
  saldoInicial?: number;
  showPctReceita?: boolean;
}

function buildExportRows(opts: BuildOptions): { rows: ExportRow[]; receitaTotal: number } {
  const { categorias, lancamentos, rateios, isDFC = false, saldoInicial = 0 } = opts;
  const tree = buildTree(categorias);
  if (tree.length === 0) return { rows: [], receitaTotal: 0 };

  const lancIdsWithRateio = new Set(rateios.map((r: any) => r.lancamento_id));
  const valorPorCategoria: Record<string, number> = {};

  rateios.forEach((r: any) => {
    const catId = r.categoria_id || 'sem';
    valorPorCategoria[catId] = (valorPorCategoria[catId] || 0) + Number(r.valor);
  });
  lancamentos.filter(l => !lancIdsWithRateio.has(l.id)).forEach(l => {
    const catId = l.categoria_id || 'sem';
    valorPorCategoria[catId] = (valorPorCategoria[catId] || 0) + Number(l.valor);
  });

  const calcNodeValue = (node: CatNode): number => {
    let own = valorPorCategoria[node.id] || 0;
    for (const child of node.children) own += calcNodeValue(child);
    return own;
  };

  const receitaNodes = tree.filter(n => n.tipo === 'receita');
  const despesaNodes = tree.filter(n => n.tipo === 'despesa');
  const recTotal = receitaNodes.reduce((s, n) => s + calcNodeValue(n), 0);
  const despTotal = despesaNodes.reduce((s, n) => s + calcNodeValue(n), 0);

  const rows: ExportRow[] = [];

  const flatten = (nodes: CatNode[], depth: number, sign: 1 | -1) => {
    for (const node of nodes) {
      const valor = calcNodeValue(node);
      rows.push({ codigo: node.codigo, nome: node.nome, valor: sign * valor, depth, style: 'normal' });
      if (node.children.length > 0) flatten(node.children, depth + 1, sign);
    }
  };

  // DFC: saldo inicial
  if (isDFC) {
    rows.push({ codigo: '', nome: 'SALDO INICIAL', valor: saldoInicial, depth: 0, style: 'total' });
  }

  // Receitas
  rows.push({ codigo: '', nome: isDFC ? 'TOTAL DE RECEBIMENTOS' : 'TOTAL DE RECEITAS', valor: recTotal, depth: 0, style: 'section' });
  flatten(receitaNodes, 1, 1);

  // Despesas
  rows.push({ codigo: '', nome: isDFC ? 'TOTAL DE PAGAMENTOS' : 'TOTAL DE DESPESAS', valor: -despTotal, depth: 0, style: 'section' });
  flatten(despesaNodes, 1, -1);

  // Resultado / Saldo
  const resultadoLiquido = recTotal - despTotal;
  if (isDFC) {
    rows.push({ codigo: '', nome: 'RESULTADO LÍQUIDO DO PERÍODO', valor: resultadoLiquido, depth: 0, style: 'section' });
    rows.push({ codigo: '', nome: 'SALDO ACUMULADO', valor: saldoInicial + resultadoLiquido, depth: 0, style: 'total' });
  } else {
    rows.push({ codigo: '', nome: 'RESULTADO DO PERÍODO', valor: resultadoLiquido, depth: 0, style: 'total' });
  }

  return { rows, receitaTotal: recTotal };
}

// ── PDF Export ──

const HEADER_COLOR: [number, number, number] = [30, 41, 59];

export async function exportDemonstrativoPDF(opts: BuildOptions & { titulo: string; periodo: string }) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const { rows, receitaTotal } = buildExportRows(opts);
  const doc = new jsPDF();

  // Header
  doc.setFontSize(14);
  doc.text(APP_NAME, 14, 15);
  doc.setFontSize(11);
  doc.text(opts.titulo, 14, 23);
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`Período: ${opts.periodo}`, 14, 29);
  doc.setTextColor(0);

  const showPct = opts.showPctReceita && receitaTotal > 0;

  const head = showPct
    ? [['Cód.', 'Descrição', 'Valor (R$)', '% Receita']]
    : [['Cód.', 'Descrição', 'Valor (R$)']];

  const body = rows.map(r => {
    const indent = '  '.repeat(r.depth);
    const pct = showPct ? `${((Math.abs(r.valor) / receitaTotal) * 100).toFixed(1)}%` : undefined;
    const row = [r.codigo, `${indent}${r.nome}`, fmtBRL(r.valor)];
    if (showPct) row.push(pct!);
    return row;
  });

  autoTable(doc, {
    startY: 36,
    head,
    body,
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: HEADER_COLOR, textColor: 255 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    didParseCell: (data: any) => {
      const row = rows[data.row.index];
      if (!row) return;
      if (row.style === 'total') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = row.valor >= 0 ? [220, 252, 231] : [254, 226, 226];
      } else if (row.style === 'section') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [230, 230, 240];
      }
    },
  });

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(`Gerado por ${APP_NAME} em ${new Date().toLocaleString('pt-BR')}`, 14, doc.internal.pageSize.height - 8);

  const slug = opts.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  doc.save(`${slug}-${opts.periodo.replace(/\s/g, '-')}.pdf`);
}

// ── Excel Export ──

export async function exportDemonstrativoExcel(opts: BuildOptions & { titulo: string; periodo: string }) {
  const XLSX = await import('xlsx');
  const { rows, receitaTotal } = buildExportRows(opts);
  const showPct = opts.showPctReceita && receitaTotal > 0;

  const wsData: (string | number)[][] = [
    [opts.titulo],
    [`Período: ${opts.periodo}`],
    [],
    showPct ? ['Código', 'Descrição', 'Valor (R$)', '% Receita'] : ['Código', 'Descrição', 'Valor (R$)'],
  ];

  for (const r of rows) {
    const indent = '  '.repeat(r.depth);
    const row: (string | number)[] = [r.codigo, `${indent}${r.nome}`, r.valor];
    if (showPct) row.push(`${((Math.abs(r.valor) / receitaTotal) * 100).toFixed(1)}%`);
    wsData.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws['!cols'] = [{ wch: 10 }, { wch: 45 }, { wch: 18 }, ...(showPct ? [{ wch: 12 }] : [])];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, opts.titulo.substring(0, 31));

  const slug = opts.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  XLSX.writeFile(wb, `${slug}-${opts.periodo.replace(/\s/g, '-')}.xlsx`);
}
