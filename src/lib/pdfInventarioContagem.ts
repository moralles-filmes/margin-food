import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { APP_NAME } from '@/lib/brand';
import { exportFileName } from '@/lib/exportHelpers';
import { formatDisplayBR, formatDateTimeBR } from '@/lib/datetime';
import { parseLocalDate } from '@/lib/dateUtils';
import { decomposeStockLayers, formatStockLayers } from '@/lib/unitConversions';
import type { Inventario, InventarioItem } from '@/hooks/useInventarioStore';

export interface GerarPDFListaContagemOpcoes {
  agruparPorLocal?: boolean;
  mostrarSaldoTeorico?: boolean;
  apenasNaoContados?: boolean;
  nomeConferente?: string | null;
}

const HEADER_COLOR: [number, number, number] = [220, 80, 50];

const TIPO_LABEL: Record<string, string> = {
  completo: 'Completo',
  parcial: 'Parcial',
  ciclico: 'Cíclico',
};

function formatSaldoParaContagem(
  saldoBase: number,
  unidadeCompra: string | null | undefined,
  unidadeMedida: string | null | undefined,
  fator: number | null | undefined,
): string {
  const uc = unidadeCompra || unidadeMedida || 'un';
  const um = unidadeMedida || 'un';
  if (!unidadeCompra || unidadeCompra === um || !fator || fator <= 0) {
    return `${saldoBase.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${um}`;
  }
  const layers = decomposeStockLayers(saldoBase, fator, uc, um);
  return formatStockLayers(layers);
}

function buildUnitLabel(
  unidadeCompra: string | null | undefined,
  unidadeMedida: string | null | undefined,
  fator: number | null | undefined,
): string {
  const uc = unidadeCompra || unidadeMedida || 'un';
  const um = unidadeMedida || 'un';
  const isDual = !!unidadeCompra && unidadeCompra !== um && !!fator && fator > 0;
  if (!isDual) return uc;
  const fatorStr = fator!.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
  return `${uc}\n(1 ${uc} = ${fatorStr} ${um})`;
}

interface Grupo {
  local: string;
  categoria: string;
  itens: InventarioItem[];
}

function agrupar(itens: InventarioItem[], porLocal: boolean): Grupo[] {
  const sorted = [...itens].sort((a, b) => {
    const la = a.produtos?.local_estoque ?? 'ZZZZ';
    const lb = b.produtos?.local_estoque ?? 'ZZZZ';
    const ca = a.produtos?.categoria ?? '';
    const cb = b.produtos?.categoria ?? '';
    const na = a.produtos?.nome_produto ?? '';
    const nb = b.produtos?.nome_produto ?? '';
    if (la !== lb) return la.localeCompare(lb, 'pt-BR');
    if (ca !== cb) return ca.localeCompare(cb, 'pt-BR');
    return na.localeCompare(nb, 'pt-BR');
  });

  const map = new Map<string, Grupo>();
  for (const item of sorted) {
    const local = item.produtos?.local_estoque ?? 'Sem local definido';
    const cat = item.produtos?.categoria ?? 'Sem categoria';
    const key = porLocal ? `${local}||${cat}` : `_||${cat}`;
    if (!map.has(key)) {
      map.set(key, { local: porLocal ? local : '', categoria: cat, itens: [] });
    }
    map.get(key)!.itens.push(item);
  }
  return Array.from(map.values());
}

function addPageFooters(doc: jsPDF, totalPages: number): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const geradoEm = formatDateTimeBR(new Date());

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150);
    doc.text(`Gerado por ${APP_NAME} em ${geradoEm}`, 14, pageH - 8);
    doc.text(`Página ${i}/${totalPages}`, pageW - 14, pageH - 8, { align: 'right' });
    doc.setTextColor(0);
  }
}

export function gerarPDFListaContagem(
  inventario: Inventario,
  itens: InventarioItem[],
  opcoes: GerarPDFListaContagemOpcoes = {},
): void {
  const {
    agruparPorLocal = true,
    mostrarSaldoTeorico = false,
    apenasNaoContados = false,
    nomeConferente = null,
  } = opcoes;

  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  let y = 15;

  // ===== HEADER =====
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(APP_NAME, 14, y);

  doc.setFontSize(11);
  doc.setTextColor(...HEADER_COLOR);
  doc.text('LISTA DE CONTAGEM DE INVENTÁRIO', pageW - 14, y, { align: 'right' });
  doc.setTextColor(0);

  y += 8;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const invCode = `Nº INV-${inventario.id.slice(-8).toUpperCase()}`;
  const invDate = formatDisplayBR(parseLocalDate(inventario.data));
  doc.text(invCode, 14, y);
  doc.text(`Data: ${invDate}`, pageW - 14, y, { align: 'right' });

  y += 5;
  const tipoLabel = TIPO_LABEL[inventario.tipo] ?? inventario.tipo;
  doc.text(`Tipo: ${tipoLabel}`, 14, y);
  if (inventario.turnos?.nome) {
    doc.text(`Turno: ${inventario.turnos.nome}`, pageW - 14, y, { align: 'right' });
  }

  // ===== DIVIDER =====
  y += 5;
  doc.setDrawColor(...HEADER_COLOR);
  doc.setLineWidth(0.5);
  doc.line(14, y, pageW - 14, y);
  doc.setDrawColor(0);

  // ===== BLOCO INFO =====
  y += 7;
  const infoLines: string[] = [];
  if (nomeConferente) infoLines.push(`Conferente: ${nomeConferente}`);
  if (inventario.observacao) infoLines.push(`Observação: ${inventario.observacao}`);
  if (apenasNaoContados) infoLines.push('(apenas itens não contados)');

  if (infoLines.length > 0) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(80);
    infoLines.forEach(line => {
      doc.text(line, 14, y);
      y += 5;
    });
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    y += 2;
  }

  // ===== FILTRO + AGRUPAMENTO =====
  const itensFiltrados = apenasNaoContados
    ? itens.filter(i => i.contagem_fisica === null)
    : itens;

  const grupos = agrupar(itensFiltrados, agruparPorLocal);

  // ===== TABELA POR GRUPO =====
  if (itensFiltrados.length === 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(120);
    doc.text('Nenhum item para contagem.', pageW / 2, y + 10, { align: 'center' });
    doc.setTextColor(0);
  } else {
    for (const grupo of grupos) {
      // Título do grupo
      const tituloGrupo = agruparPorLocal
        ? `${grupo.local}  →  ${grupo.categoria}`
        : grupo.categoria;

      // Verificar se há espaço suficiente para o título + pelo menos 1 linha de tabela
      if (y > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage();
        y = 15;
      }

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...HEADER_COLOR);
      doc.text(tituloGrupo, 14, y);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal');
      y += 4;

      // Colunas
      const head = mostrarSaldoTeorico
        ? ['#', 'Produto', 'Unid. Contagem', 'Saldo Sistema', 'Contagem', 'Obs.']
        : ['#', 'Produto', 'Unid. Contagem', 'Contagem', 'Obs.'];

      const body = grupo.itens.map((item, idx) => {
        const p = item.produtos;
        const nome = item.tipo_item === 'salmao'
          ? `[SALMÃO] ${p?.nome_produto ?? '—'}`
          : (p?.nome_produto ?? '—');
        const unidLabel = buildUnitLabel(p?.unidade_compra, p?.unidade_medida, p?.fator_conversao_padrao);

        if (mostrarSaldoTeorico) {
          const saldoDisplay = formatSaldoParaContagem(
            item.saldo_teorico,
            p?.unidade_compra,
            p?.unidade_medida,
            p?.fator_conversao_padrao,
          );
          return [String(idx + 1), nome, unidLabel, saldoDisplay, '', ''];
        }
        return [String(idx + 1), nome, unidLabel, '', ''];
      });

      const colStyles = mostrarSaldoTeorico
        ? {
            0: { cellWidth: 8, halign: 'center' as const },
            2: { cellWidth: 28 },
            3: { cellWidth: 28, halign: 'right' as const },
            4: { cellWidth: 28 },
            5: { cellWidth: 28 },
          }
        : {
            0: { cellWidth: 8, halign: 'center' as const },
            2: { cellWidth: 28 },
            3: { cellWidth: 32 },
            4: { cellWidth: 32 },
          };

      autoTable(doc, {
        startY: y,
        head: [head],
        body,
        styles: { fontSize: 7.5, cellPadding: 3, lineColor: [220, 220, 220], lineWidth: 0.1 },
        headStyles: {
          fillColor: HEADER_COLOR,
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 7.5,
          cellPadding: 3,
        },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles: colStyles,
        bodyStyles: { minCellHeight: 12 },
        margin: { left: 14, right: 14 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        didParseCell: (data: any) => {
          if (data.section === 'body' && data.column.index === 2) {
            data.cell.styles.fontSize = 7;
          }
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable?.finalY ?? y + 10;
      y += 6;
    }

    // ===== ASSINATURAS =====
    const pageH = doc.internal.pageSize.getHeight();
    let sigY = y + 10;

    // Se não cabe, nova página
    if (sigY > pageH - 40) {
      doc.addPage();
      sigY = 30;
    }

    doc.setDrawColor(180);
    doc.setLineWidth(0.3);
    const col1X = 14;
    const col2X = pageW / 2 + 10;
    const lineLen = 75;

    doc.line(col1X, sigY, col1X + lineLen, sigY);
    doc.line(col2X, sigY, col2X + lineLen, sigY);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text('Conferente', col1X + lineLen / 2, sigY + 5, { align: 'center' });
    doc.text('Supervisor', col2X + lineLen / 2, sigY + 5, { align: 'center' });
    doc.setTextColor(0);
  }

  // ===== RODAPÉ EM TODAS AS PÁGINAS =====
  addPageFooters(doc, doc.getNumberOfPages());

  doc.save(exportFileName('inventario', `contagem_${inventario.id.slice(-8)}`, 'pdf'));
}
