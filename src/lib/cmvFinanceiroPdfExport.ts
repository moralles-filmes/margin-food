/**
 * Exportação PDF do CMV Financeiro (A4 paisagem, jsPDF + jspdf-autotable).
 *
 * O PDF é desenhado a partir de um SNAPSHOT — o mesmo `CmvReport` que a tela
 * mostra, mais os blocos escolhidos — e nunca recalcula indicador. Texto e
 * gráficos são vetoriais (nada de captura de tela). Paleta impressa literal,
 * fora dos tokens CSS, como nos demais exports em PDF do sistema.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { APP_NAME } from '@/lib/brand';
import { formatDateTimeBR } from '@/lib/datetime';
import { fmtBRLCompact } from '@/lib/money';
import { slugifyBorderoName } from '@/domain/financeiro/bordero';
import {
  achatarCategorias, corCategoriaRgb, fatiasDaComposicao, formatarCentavos, formatarCentavosComSinal,
  formatarData, formatarIntervalo, formatarPercentual, formatarPontos, formatarVariacao,
  type CmvDecisao, type CmvPontoSerie, type CmvReport, type Rgb,
} from '@/domain/financeiro/cmv';

export type CmvBlocoPdf =
  | 'cards' | 'evolucao' | 'composicao' | 'comparativo' | 'ranking'
  | 'demonstrativo' | 'temporal' | 'boletos' | 'observacoes';

export const CMV_BLOCOS_PDF: { id: CmvBlocoPdf; rotulo: string; descricao: string }[] = [
  { id: 'cards', rotulo: 'Cards principais', descricao: 'Faturamento, CMV, % CMV, variação e despesas vinculadas' },
  { id: 'evolucao', rotulo: 'Gráfico de evolução', descricao: 'Faturamento × CMV × % CMV por faixa do período' },
  { id: 'composicao', rotulo: 'Composição por categoria', descricao: 'Participação de cada categoria no CMV' },
  { id: 'comparativo', rotulo: 'Comparativo', descricao: 'Período atual × anterior, indicadores e categorias' },
  { id: 'ranking', rotulo: 'Ranking e leituras', descricao: 'Ranking das categorias e leituras do período' },
  { id: 'demonstrativo', rotulo: 'Demonstrativo por categoria', descricao: 'Categorias e subcategorias, em formato de demonstrativo' },
  { id: 'temporal', rotulo: 'Detalhamento temporal', descricao: 'Faturamento, CMV e % por faixa, atual e anterior' },
  { id: 'boletos', rotulo: 'Despesas de origem', descricao: 'Todas as linhas incluídas no CMV do período (boletos, lançamentos e conciliação)' },
  { id: 'observacoes', rotulo: 'Observações', descricao: 'Anotações e considerações adicionais' },
];

export const CMV_TODOS_BLOCOS: CmvBlocoPdf[] = CMV_BLOCOS_PDF.map(b => b.id);

export const CMV_ATALHOS_PDF: { id: string; rotulo: string; blocos: CmvBlocoPdf[] }[] = [
  { id: 'tudo', rotulo: 'Tudo', blocos: CMV_TODOS_BLOCOS },
  { id: 'cards', rotulo: 'Apenas cards', blocos: ['cards'] },
  { id: 'cards_graficos', rotulo: 'Cards + gráficos', blocos: ['cards', 'evolucao', 'composicao'] },
  { id: 'graficos_demonstrativo', rotulo: 'Gráficos + demonstrativo', blocos: ['evolucao', 'composicao', 'demonstrativo'] },
];

export interface CmvPdfBoleto {
  descricao: string;
  /** Ausente em linha antiga = boleto. */
  fonte?: 'boleto' | 'lancamento';
  origem?: string | null;
  contaNome?: string | null;
  fornecedor: string | null;
  dataCompetencia: string | null;
  dataVencimento: string | null;
  status: string;
  categoriaNome: string | null;
  tituloCentavos: number;
  linhaCentavos: number;
  cmvIncluir: CmvDecisao;
}

/** Tudo o que define o arquivo. A prévia e o download saem do MESMO snapshot. */
export interface CmvPdfSnapshot {
  report: CmvReport;
  blocos: CmvBlocoPdf[];
  demonstrativoExpandido: boolean;
  observacoes: string;
  /** Linhas incluídas no CMV do intervalo apurado (todas as páginas); `null` se o bloco não foi pedido. */
  boletos: CmvPdfBoleto[] | null;
  /** Momento da emissão (injetável em teste). */
  emitidoEm: Date;
}

export interface CmvPdfResultado {
  doc: jsPDF;
  fileName: string;
  paginas: number;
  /** Blocos desenhados em cada página (índice 0 = página 1), na ordem. */
  blocosPorPagina: CmvBlocoPdf[][];
}

const STATUS_ROTULO: Record<string, string> = {
  AGUARDANDO_APROVACAO: 'Aguard. aprovação',
  APROVADO: 'Em aberto',
  PAGO: 'Pago',
  REALIZADO: 'Realizado',
  PREVISTO: 'Previsto',
};

const COR = {
  ink: [15, 23, 42] as Rgb,
  muted: [100, 116, 139] as Rgb,
  border: [226, 232, 240] as Rgb,
  surface: [248, 250, 252] as Rgb,
  rootRow: [241, 245, 249] as Rgb,
  primary: [29, 78, 216] as Rgb,
  primarySoft: [239, 246, 255] as Rgb,
  navy: [15, 30, 70] as Rgb,
  faturamento: [16, 185, 129] as Rgb,
  cmv: [37, 99, 235] as Rgb,
  percentual: [220, 154, 11] as Rgb,
  anterior: [191, 219, 254] as Rgb,
  warning: [146, 64, 14] as Rgb,
  warningSoft: [254, 249, 195] as Rgb,
  white: [255, 255, 255] as Rgb,
} as const;

const CARD_FUNDO: Rgb[] = [[236, 253, 245], [254, 242, 242], [254, 249, 195], [239, 246, 255], [240, 249, 255]];

const PAGE = { width: 297, height: 210, margin: 12 } as const;
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;
const CONTINUATION_TOP = 22;
const BOTTOM_RESERVED = 16;
const LIMITE_Y = PAGE.height - BOTTOM_RESERVED;

/**
 * As fontes padrão do PDF cobrem Latin-1. Tudo fora disso é trocado por um
 * equivalente legível; nada vira caractere quebrado.
 */
export function textoPdf(valor: string): string {
  const trocado = valor
    .replace(/[—–−]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(/→/g, '>')
    .replace(/•/g, '·');
  let saida = '';
  for (const caractere of trocado) {
    const codigo = caractere.codePointAt(0) ?? 0;
    if (codigo === 9 || codigo === 10 || codigo === 13) saida += caractere;
    else if (codigo < 32 || codigo === 127) continue; // caractere de controle
    else saida += codigo > 255 ? '?' : caractere;
  }
  return saida;
}

const t = textoPdf;

export function buildCmvPdfFileName(report: CmvReport): string {
  return `cmv-financeiro-${slugifyBorderoName(report.empresa)}-${report.filtro.inicio}-a-${report.filtro.fim}.pdf`;
}

interface Contexto {
  doc: jsPDF;
  snapshot: CmvPdfSnapshot;
  blocosPorPagina: CmvBlocoPdf[][];
}

function marcar(ctx: Contexto, bloco: CmvBlocoPdf, daPagina: number): void {
  const ate = ctx.doc.getNumberOfPages();
  for (let pagina = daPagina; pagina <= ate; pagina += 1) {
    const lista = (ctx.blocosPorPagina[pagina - 1] ??= []);
    if (!lista.includes(bloco)) lista.push(bloco);
  }
}

function setFill(doc: jsPDF, cor: Rgb) { doc.setFillColor(cor[0], cor[1], cor[2]); }
function setDraw(doc: jsPDF, cor: Rgb) { doc.setDrawColor(cor[0], cor[1], cor[2]); }
function setText(doc: jsPDF, cor: Rgb) { doc.setTextColor(cor[0], cor[1], cor[2]); }

function lastTableY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? PAGE.margin;
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed <= LIMITE_Y) return y;
  doc.addPage();
  return CONTINUATION_TOP;
}

/** Título + espaço mínimo do corpo, para a seção não ficar com o título órfão no pé da página. */
function sectionTitle(doc: jsPDF, text: string, y: number, minSpace: number): number {
  const top = ensureSpace(doc, y, minSpace);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  setText(doc, COR.navy);
  doc.text(t(text), PAGE.margin, top + 5);
  return top + 9;
}

function periodoLabel(report: CmvReport): string {
  return formatarIntervalo(report.filtro);
}

function comparacaoLabel(report: CmvReport): string {
  const { efetivoAtual, efetivoAnterior, diasEfetivos, diasEfetivosAnterior } = report.janelas;
  if (!efetivoAtual || !efetivoAnterior) return 'Sem comparação: período ainda não iniciado';
  const dias = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;
  return `Apurado: ${formatarIntervalo(efetivoAtual)} (${dias(diasEfetivos)}) · Comparado com: ${formatarIntervalo(efetivoAnterior)} (${dias(diasEfetivosAnterior)})`;
}

function momento(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? '-' : formatDateTimeBR(data);
}

function drawFirstPageHeader(ctx: Contexto): number {
  const { doc, snapshot: { report, emitidoEm } } = ctx;
  const rightX = PAGE.width - PAGE.margin;
  setFill(doc, COR.primary);
  doc.rect(0, 0, PAGE.width, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  setText(doc, COR.ink);
  doc.text(t(report.empresa), PAGE.margin, 13, { maxWidth: 150 });
  doc.setFontSize(20);
  setText(doc, COR.navy);
  doc.text('CMV Financeiro', PAGE.margin, 23);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setText(doc, COR.muted);
  doc.text(t('Custo das mercadorias pelas despesas marcadas para o CMV (boletos, lançamentos e conciliação, por competência) sobre o faturamento do Fechamento de Caixa.'), PAGE.margin, 29);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(t('PERÍODO'), rightX, 11, { align: 'right' });
  doc.setFontSize(11);
  setText(doc, COR.ink);
  doc.text(t(periodoLabel(report)), rightX, 17, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setText(doc, COR.muted);
  doc.text(t(`Emitido em ${formatDateTimeBR(emitidoEm)}`), rightX, 22.5, { align: 'right' });
  doc.text(t(`Dados consultados em ${momento(report.geradoEm)}`), rightX, 27, { align: 'right' });

  setDraw(doc, COR.border);
  doc.setLineWidth(0.3);
  doc.line(PAGE.margin, 33, rightX, 33);
  return 37;
}

/** Origem e incompletude acompanham QUALQUER seleção de blocos, inclusive "Apenas cards". */
function drawOrigem(ctx: Contexto, top: number): number {
  const { doc, snapshot: { report } } = ctx;
  const linhas: { texto: string; aviso: boolean }[] = [
    { texto: 'CMV: linhas marcadas para o CMV nas despesas (boletos de Contas a Pagar, lançamentos e conciliação), pela data de competência. Faturamento: bruto do Fechamento de Caixa. % CMV = CMV ÷ faturamento.', aviso: false },
    { texto: comparacaoLabel(report), aviso: false },
    ...report.avisos.map(a => ({ texto: `Atenção: ${a.texto}`, aviso: true })),
  ];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const quebradas = linhas.map(l => ({ ...l, partes: doc.splitTextToSize(t(l.texto), CONTENT_WIDTH - 6) as string[] }));
  const altura = quebradas.reduce((s, l) => s + l.partes.length * 3.4, 0) + 4;
  const temAviso = report.avisos.length > 0;
  setFill(doc, temAviso ? COR.warningSoft : COR.surface);
  setDraw(doc, COR.border);
  doc.roundedRect(PAGE.margin, top, CONTENT_WIDTH, altura, 1.5, 1.5, 'FD');
  let y = top + 4.6;
  for (const linha of quebradas) {
    setText(doc, linha.aviso ? COR.warning : COR.muted);
    doc.setFont('helvetica', linha.aviso ? 'bold' : 'normal');
    doc.text(linha.partes, PAGE.margin + 3, y);
    y += linha.partes.length * 3.4;
  }
  return top + altura + 5;
}

function drawCards(ctx: Contexto, top: number): number {
  const { doc, snapshot: { report } } = ctx;
  const y0 = ensureSpace(doc, top, 30);
  const inicio = doc.getNumberOfPages();
  const { faturamento, cmv, percentual, documentos, anterior } = report;
  const semAnterior = anterior.intervalo === null;
  const base = (v: string | null) => (v === null ? 'Sem base de comparação' : `${v} vs. período anterior`);
  const cards = [
    {
      rotulo: 'Faturamento', valor: formatarCentavos(faturamento.atual),
      variacao: base(faturamento.variacaoPercentual === null ? null : formatarVariacao(faturamento.variacaoPercentual)),
      rodape: semAnterior ? '-' : anterior.faturamentoCentavos === null ? 'Anterior: sem fechamento' : `Anterior: ${formatarCentavos(anterior.faturamentoCentavos)}`,
    },
    {
      rotulo: 'CMV Financeiro', valor: formatarCentavos(cmv.atual),
      variacao: base(cmv.variacaoPercentual === null ? null : formatarVariacao(cmv.variacaoPercentual)),
      rodape: semAnterior ? '-' : `Anterior: ${formatarCentavos(anterior.cmvCentavos)}`,
    },
    {
      rotulo: '% CMV', valor: formatarPercentual(percentual.atual),
      variacao: base(percentual.pontos === null ? null : formatarPontos(percentual.pontos)),
      rodape: percentual.atual === null
        ? (report.atual.motivoSemPercentual ?? '-')
        : semAnterior ? '-' : `Anterior: ${formatarPercentual(percentual.anterior)}`,
    },
    {
      rotulo: 'Variação do CMV em R$', valor: formatarCentavosComSinal(cmv.diferenca),
      variacao: cmv.variacaoPercentual === null ? 'Sem base de comparação' : `${formatarVariacao(cmv.variacaoPercentual)} no custo`,
      rodape: semAnterior ? '-' : `${formatarCentavos(anterior.cmvCentavos)} > ${formatarCentavos(cmv.atual)}`,
    },
    {
      rotulo: 'Despesas vinculadas ao CMV', valor: documentos.atual === null ? '-' : String(documentos.atual),
      variacao: base(documentos.variacaoPercentual === null ? null : formatarVariacao(documentos.variacaoPercentual)),
      rodape: semAnterior ? '-' : `Anterior: ${anterior.documentos} ${anterior.documentos === 1 ? 'despesa' : 'despesas'}`,
    },
  ];
  const gap = 3;
  const width = (CONTENT_WIDTH - gap * 4) / 5;
  const height = 25;
  cards.forEach((card, i) => {
    const x = PAGE.margin + i * (width + gap);
    setFill(doc, CARD_FUNDO[i]);
    setDraw(doc, COR.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y0, width, height, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setText(doc, COR.muted);
    doc.text(t(card.rotulo), x + 3, y0 + 5.5, { maxWidth: width - 6 });
    doc.setFontSize(13);
    setText(doc, COR.ink);
    doc.text(t(card.valor), x + 3, y0 + 12.5, { maxWidth: width - 6 });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setText(doc, COR.ink);
    doc.text(t(card.variacao), x + 3, y0 + 17.5, { maxWidth: width - 6 });
    setText(doc, COR.muted);
    doc.text(t(card.rodape), x + 3, y0 + 21.8, { maxWidth: width - 6 });
  });
  marcar(ctx, 'cards', inicio);
  return y0 + height + 6;
}

function tetoBonito(valor: number): number {
  if (!(valor > 0)) return 1;
  const potencia = 10 ** Math.floor(Math.log10(valor));
  const fracao = valor / potencia;
  const passo = fracao <= 1 ? 1 : fracao <= 2 ? 2 : fracao <= 2.5 ? 2.5 : fracao <= 5 ? 5 : 10;
  return passo * potencia;
}

function legendaPdf(doc: jsPDF, itens: { rotulo: string; cor: Rgb }[], x: number, y: number): void {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  let cursor = x;
  for (const item of itens) {
    setFill(doc, item.cor);
    doc.rect(cursor, y - 2, 2.4, 2.4, 'F');
    setText(doc, COR.muted);
    const texto = t(item.rotulo);
    doc.text(texto, cursor + 3.4, y);
    cursor += 3.4 + doc.getTextWidth(texto) + 5;
  }
}

function drawEvolucao(ctx: Contexto, top: number): number {
  const { doc, snapshot: { report } } = ctx;
  const altura = 62;
  let y = sectionTitle(doc, 'Faturamento × CMV × % CMV', top, altura + 14);
  const inicio = doc.getNumberOfPages();
  legendaPdf(doc, [
    { rotulo: 'Faturamento (R$)', cor: COR.faturamento },
    { rotulo: 'CMV Financeiro (R$)', cor: COR.cmv },
    { rotulo: '% CMV (eixo direito)', cor: COR.percentual },
  ], PAGE.margin, y);
  y += 4;

  const serie = report.serie;
  const x0 = PAGE.margin + 18;
  const largura = CONTENT_WIDTH - 18 - 12;
  const base = y + altura - 9;
  const alturaUtil = altura - 14;
  const maxValor = tetoBonito(Math.max(1, ...serie.map(p => Math.max(p.faturamentoCentavos ?? 0, p.cmvCentavos ?? 0))) / 100);
  const maxPct = Math.max(10, Math.ceil(Math.max(0, ...serie.map(p => p.cmvPercentual ?? 0)) / 10) * 10);

  doc.setFontSize(6.5);
  doc.setLineWidth(0.15);
  for (let i = 0; i <= 4; i += 1) {
    const gy = base - (alturaUtil * i) / 4;
    setDraw(doc, COR.border);
    doc.line(x0, gy, x0 + largura, gy);
    setText(doc, COR.muted);
    doc.text(t(fmtBRLCompact((maxValor * i) / 4)), x0 - 1.5, gy + 1, { align: 'right' });
    doc.text(`${Math.round((maxPct * i) / 4)}%`, x0 + largura + 1.5, gy + 1);
  }

  const slot = largura / Math.max(1, serie.length);
  const barra = Math.min(7, slot * 0.3);
  const passoRotulo = Math.max(1, Math.ceil(serie.length / 24));
  const pontos: { x: number; y: number; ponto: CmvPontoSerie }[] = [];
  serie.forEach((ponto, i) => {
    const centro = x0 + slot * i + slot / 2;
    if (!ponto.futuro) {
      if (ponto.faturamentoCentavos !== null && ponto.faturamentoCentavos > 0) {
        const h = (ponto.faturamentoCentavos / 100 / maxValor) * alturaUtil;
        setFill(doc, COR.faturamento);
        doc.rect(centro - barra - 0.3, base - h, barra, h, 'F');
      }
      if ((ponto.cmvCentavos ?? 0) > 0) {
        const h = ((ponto.cmvCentavos as number) / 100 / maxValor) * alturaUtil;
        setFill(doc, COR.cmv);
        doc.rect(centro + 0.3, base - h, barra, h, 'F');
      }
      if (ponto.cmvPercentual !== null) {
        pontos.push({ x: centro, y: base - (Math.min(ponto.cmvPercentual, maxPct) / maxPct) * alturaUtil, ponto });
      }
    }
    if (i % passoRotulo === 0) {
      setText(doc, COR.muted);
      doc.setFontSize(6.5);
      doc.text(t(ponto.bucket.rotulo), centro, base + 3.5, { align: 'center' });
      if (report.granularidade !== 'dia') {
        doc.setFontSize(5.5);
        doc.text(t(`${ponto.bucket.inicio.slice(8, 10)}/${ponto.bucket.inicio.slice(5, 7)} a ${ponto.bucket.fim.slice(8, 10)}/${ponto.bucket.fim.slice(5, 7)}`), centro, base + 6.2, { align: 'center' });
      }
    }
  });
  setDraw(doc, COR.percentual);
  doc.setLineWidth(0.5);
  for (let i = 1; i < pontos.length; i += 1) {
    // Só liga faixas vizinhas: um buraco sem faturamento não é interpolado.
    if (serie.indexOf(pontos[i].ponto) - serie.indexOf(pontos[i - 1].ponto) === 1) {
      doc.line(pontos[i - 1].x, pontos[i - 1].y, pontos[i].x, pontos[i].y);
    }
  }
  setFill(doc, COR.percentual);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  for (const p of pontos) {
    doc.circle(p.x, p.y, 0.8, 'F');
    if (serie.length <= 16) {
      setText(doc, COR.percentual);
      doc.text(t(formatarPercentual(p.ponto.cmvPercentual, 1)), p.x, p.y - 1.8, { align: 'center' });
    }
  }
  marcar(ctx, 'evolucao', inicio);
  return y + altura + 3;
}

function drawComposicao(ctx: Contexto, top: number): number {
  const { doc, snapshot: { report } } = ctx;
  const total = report.cmv.atual ?? 0;
  const fatias = fatiasDaComposicao(report.grupos, total, 10);
  const altura = Math.max(52, fatias.length * 5.2 + 12);
  let y = sectionTitle(doc, 'Composição do CMV por categoria', top, altura + 4);
  const inicio = doc.getNumberOfPages();
  if (fatias.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setText(doc, COR.muted);
    doc.text(t('Nenhuma despesa incluída no CMV neste período.'), PAGE.margin, y + 3);
    marcar(ctx, 'composicao', inicio);
    return y + 9;
  }

  const legendaX = report.composicaoEmRosca ? PAGE.margin + 70 : PAGE.margin;
  if (report.composicaoEmRosca) {
    const cx = PAGE.margin + 30;
    const cy = y + 25;
    const raio = 24;
    let angulo = -Math.PI / 2;
    for (const fatia of fatias) {
      const arco = (fatia.centavos / total) * Math.PI * 2;
      const cor = corCategoriaRgb(fatia.cor);
      setFill(doc, cor);
      setDraw(doc, cor);
      doc.setLineWidth(0.1);
      const passos = Math.max(1, Math.ceil(arco / (Math.PI / 60)));
      for (let i = 0; i < passos; i += 1) {
        const a1 = angulo + (arco * i) / passos;
        const a2 = angulo + (arco * (i + 1)) / passos;
        doc.triangle(cx, cy, cx + raio * Math.cos(a1), cy + raio * Math.sin(a1), cx + raio * Math.cos(a2), cy + raio * Math.sin(a2), 'FD');
      }
      angulo += arco;
    }
    setFill(doc, COR.white);
    doc.circle(cx, cy, raio * 0.58, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    setText(doc, COR.ink);
    doc.text(t(formatarCentavos(total)), cx, cy, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    setText(doc, COR.muted);
    doc.text('Total do CMV', cx, cy + 3.5, { align: 'center' });
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setText(doc, COR.muted);
    doc.text(t('Há valores negativos ou total não positivo: a composição é apresentada em lista.'), PAGE.margin, y + 2);
    y += 5;
  }

  let ly = y + 4;
  doc.setFontSize(8);
  for (const fatia of fatias) {
    setFill(doc, corCategoriaRgb(fatia.cor));
    doc.circle(legendaX + 1.2, ly - 1, 1.2, 'F');
    doc.setFont('helvetica', 'normal');
    setText(doc, COR.ink);
    doc.text(t(fatia.nome), legendaX + 4.5, ly, { maxWidth: 90 });
    doc.text(t(formatarCentavos(fatia.centavos)), legendaX + 130, ly, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(t(formatarPercentual(fatia.participacao, 1)), legendaX + 150, ly, { align: 'right' });
    ly += 5.2;
  }
  marcar(ctx, 'composicao', inicio);
  return y + altura + 4;
}

const TABLE_BASE = {
  theme: 'plain' as const,
  margin: { left: PAGE.margin, right: PAGE.margin, top: CONTINUATION_TOP, bottom: BOTTOM_RESERVED },
  rowPageBreak: 'avoid' as const,
  showHead: 'everyPage' as const,
  styles: { font: 'helvetica', fontSize: 8, textColor: COR.ink, cellPadding: 1.8, lineColor: COR.border, lineWidth: { bottom: 0.2 }, overflow: 'linebreak' as const },
  headStyles: { fillColor: COR.primary, textColor: COR.white, fontStyle: 'bold' as const, fontSize: 7.8 },
  footStyles: { fillColor: COR.primarySoft, textColor: COR.ink, fontStyle: 'bold' as const },
};

const direita = { halign: 'right' as const };

function drawComparativo(ctx: Contexto, top: number): number {
  const { doc, snapshot: { report } } = ctx;
  const { atual, anterior, faturamento, cmv, percentual, documentos } = report;
  const y = sectionTitle(doc, 'Comparativo — período atual × anterior', top, 44);
  const inicio = doc.getNumberOfPages();
  const saldoAnterior = anterior.faturamentoCentavos === null ? null : anterior.faturamentoCentavos - anterior.cmvCentavos;
  const intervalo = (lado: typeof atual) => (lado.intervalo ? formatarIntervalo(lado.intervalo) : '-');
  autoTable(doc, {
    ...TABLE_BASE,
    startY: y,
    head: [['Indicador', `Atual (${intervalo(atual)})`, `Anterior (${intervalo(anterior)})`, 'Diferença', 'Variação %'].map(t)],
    body: [
      ['Faturamento (Fechamento de Caixa)', formatarCentavos(faturamento.atual), formatarCentavos(faturamento.anterior), formatarCentavosComSinal(faturamento.diferenca), formatarVariacao(faturamento.variacaoPercentual)],
      ['CMV Financeiro', formatarCentavos(cmv.atual), formatarCentavos(cmv.anterior), formatarCentavosComSinal(cmv.diferenca), formatarVariacao(cmv.variacaoPercentual)],
      ['% CMV (CMV ÷ faturamento)', formatarPercentual(percentual.atual), formatarPercentual(percentual.anterior), formatarPontos(percentual.pontos), '-'],
      ['Saldo após CMV, antes das demais despesas', formatarCentavos(report.saldoAposCmvCentavos), formatarCentavos(saldoAnterior),
        formatarCentavosComSinal(report.saldoAposCmvCentavos === null || saldoAnterior === null ? null : report.saldoAposCmvCentavos - saldoAnterior), '-'],
      ['Despesas vinculadas ao CMV', documentos.atual === null ? '-' : String(documentos.atual), documentos.anterior === null ? '-' : String(documentos.anterior),
        documentos.diferenca === null ? '-' : `${documentos.diferenca > 0 ? '+' : ''}${documentos.diferenca}`, formatarVariacao(documentos.variacaoPercentual)],
      ['Dias no intervalo comparado', String(atual.dias), String(anterior.dias), '-', '-'],
      ['Dias com fechamento de caixa', `${atual.diasComFechamento} de ${atual.dias}`, `${anterior.diasComFechamento} de ${anterior.dias}`, '-', '-'],
    ].map(linha => linha.map(t)),
    columnStyles: { 1: direita, 2: direita, 3: direita, 4: direita },
  });
  let fim = lastTableY(doc) + 5;
  if (report.grupos.length > 0) {
    fim = ensureSpace(doc, fim, 26);
    autoTable(doc, {
      ...TABLE_BASE,
      startY: fim,
      head: [['Categoria', 'Valor atual', 'Valor anterior', 'Diferença em R$', 'Variação %', 'Participação no CMV'].map(t)],
      body: report.grupos.map(g => [
        g.nome, formatarCentavos(g.atualCentavos), formatarCentavos(g.anteriorCentavos),
        formatarCentavosComSinal(g.diferencaCentavos), formatarVariacao(g.variacaoPercentual), formatarPercentual(g.participacao, 1),
      ].map(t)),
      foot: [[
        'Total', formatarCentavos(report.totalCategorias.atualCentavos), formatarCentavos(report.totalCategorias.anteriorCentavos),
        formatarCentavosComSinal(report.totalCategorias.diferencaCentavos), formatarVariacao(report.totalCategorias.variacaoPercentual),
        formatarPercentual(report.totalCategorias.participacao, 1),
      ].map(t)],
      showFoot: 'lastPage',
      columnStyles: { 1: direita, 2: direita, 3: direita, 4: direita, 5: direita },
      didParseCell: data => { if (data.section !== 'body' && data.column.index > 0) data.cell.styles.halign = 'right'; },
    });
    fim = lastTableY(doc) + 6;
  }
  marcar(ctx, 'comparativo', inicio);
  return fim;
}

function drawRanking(ctx: Contexto, top: number): number {
  const { doc, snapshot: { report } } = ctx;
  const grupos = report.grupos.filter(g => g.atualCentavos !== 0);
  let y = sectionTitle(doc, 'Ranking de categorias e leituras do período', top, 30);
  const inicio = doc.getNumberOfPages();
  const maior = Math.max(1, ...grupos.map(g => Math.abs(g.atualCentavos)));
  doc.setFontSize(8);
  for (const grupo of grupos) {
    y = ensureSpace(doc, y, 6);
    const cor = corCategoriaRgb(grupo.cor);
    setFill(doc, cor);
    doc.circle(PAGE.margin + 1.2, y + 1.6, 1.2, 'F');
    doc.setFont('helvetica', 'normal');
    setText(doc, COR.ink);
    doc.text(t(grupo.nome), PAGE.margin + 4.5, y + 2.6, { maxWidth: 58 });
    setFill(doc, COR.rootRow);
    doc.rect(PAGE.margin + 66, y, 130, 3.4, 'F');
    setFill(doc, cor);
    doc.rect(PAGE.margin + 66, y, (Math.abs(grupo.atualCentavos) / maior) * 130, 3.4, 'F');
    doc.text(t(formatarCentavos(grupo.atualCentavos)), PAGE.margin + 232, y + 2.6, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(t(formatarPercentual(grupo.participacao, 1)), PAGE.margin + 252, y + 2.6, { align: 'right' });
    y += 5.6;
  }
  if (grupos.length === 0) {
    doc.setFont('helvetica', 'normal');
    setText(doc, COR.muted);
    doc.text(t('Sem categorias com CMV no período.'), PAGE.margin, y + 3);
    y += 7;
  }
  y += 2;
  doc.setFontSize(8);
  for (const insight of report.insights) {
    const partes = doc.splitTextToSize(t(insight.texto), CONTENT_WIDTH - 6) as string[];
    y = ensureSpace(doc, y, partes.length * 3.8 + 2);
    setFill(doc, insight.tom === 'alerta' ? COR.warning : COR.primary);
    doc.circle(PAGE.margin + 1, y + 1.6, 0.8, 'F');
    doc.setFont('helvetica', 'normal');
    setText(doc, COR.ink);
    doc.text(partes, PAGE.margin + 4, y + 2.6);
    y += partes.length * 3.8 + 1.4;
  }
  marcar(ctx, 'ranking', inicio);
  return y + 4;
}

function drawDemonstrativo(ctx: Contexto, top: number): number {
  const { doc, snapshot: { report, demonstrativoExpandido } } = ctx;
  const linhas = achatarCategorias(report.grupos, { expandirTudo: demonstrativoExpandido });
  const titulo = `Demonstrativo de CMV por categoria (${demonstrativoExpandido ? 'expandido: categorias e subcategorias' : 'resumido: só os grupos'})`;
  const y = sectionTitle(doc, titulo, top, 30);
  const inicio = doc.getNumberOfPages();
  const total = report.totalCategorias;
  autoTable(doc, {
    ...TABLE_BASE,
    startY: y,
    head: [['Categoria / Subcategoria', 'Valor atual', 'Valor anterior', 'Diferença em R$', 'Variação %', 'Participação no CMV', '% do faturamento'].map(t)],
    body: linhas.length === 0
      ? [[t('Nenhuma despesa incluída no CMV neste período.'), '', '', '', '', '', '']]
      : linhas.map(l => [
        `${l.nome}${l.ativo ? '' : ' (inativa)'}`, formatarCentavos(l.atualCentavos), formatarCentavos(l.anteriorCentavos),
        formatarCentavosComSinal(l.diferencaCentavos), formatarVariacao(l.variacaoPercentual),
        formatarPercentual(l.participacao, 1), formatarPercentual(l.pesoFaturamento, 2),
      ].map(t)),
    foot: [[
      'Total do CMV', formatarCentavos(total.atualCentavos), formatarCentavos(total.anteriorCentavos),
      formatarCentavosComSinal(total.diferencaCentavos), formatarVariacao(total.variacaoPercentual),
      formatarPercentual(total.participacao, 1), formatarPercentual(total.pesoFaturamento, 2),
    ].map(t)],
    showFoot: 'lastPage',
    columnStyles: { 0: { cellWidth: 92 }, 1: direita, 2: direita, 3: direita, 4: direita, 5: direita, 6: direita },
    didParseCell: data => {
      if (data.section !== 'body') {
        if (data.column.index > 0) data.cell.styles.halign = 'right';
        return;
      }
      const linha = linhas[data.row.index];
      if (!linha) return;
      if (linha.profundidade === 0) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = COR.rootRow;
      }
      if (data.column.index === 0) {
        data.cell.styles.cellPadding = { top: 1.8, right: 1.8, bottom: 1.8, left: 1.8 + linha.profundidade * 5 };
      }
    },
  });
  let fim = lastTableY(doc) + 4;
  fim = ensureSpace(doc, fim, 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setText(doc, COR.muted);
  doc.text(t(
    `Faturamento de referência: ${formatarCentavos(report.faturamento.atual)} · Total do CMV: ${formatarCentavos(report.cmv.atual)} · % CMV consolidado: ${formatarPercentual(report.percentual.atual)} · Saldo após CMV, antes das demais despesas: ${formatarCentavos(report.saldoAposCmvCentavos)}`,
  ), PAGE.margin, fim + 2, { maxWidth: CONTENT_WIDTH });
  marcar(ctx, 'demonstrativo', inicio);
  return fim + 8;
}

function celulasDaFaixa(ponto: CmvPontoSerie | undefined, foraDoTrecho: string): string[] {
  if (!ponto) return ['-', '-', '-', '-'];
  if (ponto.futuro) return [ponto.bucket.descricao, foraDoTrecho, '', ''];
  return [
    `${ponto.bucket.descricao}${ponto.parcial ? ' (parcial)' : ''}`,
    ponto.faturamentoCentavos === null ? 'Sem fechamento' : formatarCentavos(ponto.faturamentoCentavos),
    formatarCentavos(ponto.cmvCentavos),
    formatarPercentual(ponto.cmvPercentual),
  ];
}

function drawTemporal(ctx: Contexto, top: number): number {
  const { doc, snapshot: { report } } = ctx;
  const y = sectionTitle(doc, 'Detalhamento por faixa do período', top, 30);
  const inicio = doc.getNumberOfPages();
  const total = Math.max(report.serie.length, report.serieAnterior.length);
  const body = Array.from({ length: total }, (_, i) => [
    ...celulasDaFaixa(report.serie[i], 'Ainda não ocorreu'),
    ...celulasDaFaixa(report.serieAnterior[i], 'Fora do trecho comparado'),
  ].map(t));
  autoTable(doc, {
    ...TABLE_BASE,
    startY: y,
    head: [['Faixa atual', 'Faturamento', 'CMV', '% CMV', 'Faixa anterior', 'Faturamento', 'CMV', '% CMV'].map(t)],
    body,
    columnStyles: { 1: direita, 2: direita, 3: direita, 5: direita, 6: direita, 7: direita },
    didParseCell: data => { if (data.section === 'head' && ![0, 4].includes(data.column.index)) data.cell.styles.halign = 'right'; },
  });
  marcar(ctx, 'temporal', inicio);
  return lastTableY(doc) + 6;
}

function drawBoletos(ctx: Contexto, top: number): number {
  const { doc, snapshot: { boletos } } = ctx;
  const linhas = boletos ?? [];
  const y = sectionTitle(doc, `Despesas de origem — linhas incluídas no CMV (${linhas.length})`, top, 30);
  const inicio = doc.getNumberOfPages();
  const data = (iso: string | null) => (iso ? formatarData(iso) : '-');
  autoTable(doc, {
    ...TABLE_BASE,
    startY: y,
    head: [['Origem / descrição', 'Competência', 'Vencimento', 'Situação', 'Categoria', 'Valor do documento', 'Valor incluído'].map(t)],
    body: linhas.length === 0
      ? [[t('Nenhuma linha incluída no CMV neste período.'), '', '', '', '', '', '']]
      : linhas.map(l => [
        l.fonte === 'lancamento'
          ? `${l.origem === 'conciliacao' ? 'Conciliação' : 'Lançamento'}${l.contaNome ? ` · ${l.contaNome}` : ''} · ${l.descricao}`
          : (l.fornecedor ? `${l.fornecedor} · ${l.descricao}` : l.descricao),
        data(l.dataCompetencia), data(l.dataVencimento), STATUS_ROTULO[l.status] ?? l.status,
        l.categoriaNome ?? 'Sem categoria', formatarCentavos(l.tituloCentavos), formatarCentavos(l.linhaCentavos),
      ].map(t)),
    foot: linhas.length === 0 ? undefined : [[
      t('Total incluído'), '', '', '', '', '', t(formatarCentavos(linhas.reduce((s, l) => s + l.linhaCentavos, 0))),
    ]],
    showFoot: 'lastPage',
    columnStyles: { 0: { cellWidth: 92 }, 4: { cellWidth: 50 }, 5: direita, 6: direita },
    didParseCell: d => { if (d.section !== 'body' && d.column.index >= 5) d.cell.styles.halign = 'right'; },
  });
  marcar(ctx, 'boletos', inicio);
  return lastTableY(doc) + 6;
}

function drawObservacoes(ctx: Contexto, top: number): number {
  const { doc, snapshot } = ctx;
  const texto = snapshot.observacoes.trim();
  if (!texto) return top;
  let y = sectionTitle(doc, 'Observações', top, 16);
  const inicio = doc.getNumberOfPages();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const partes = doc.splitTextToSize(t(texto), CONTENT_WIDTH) as string[];
  for (const parte of partes) {
    y = ensureSpace(doc, y, 5);
    setText(doc, COR.ink);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(parte, PAGE.margin, y + 3);
    y += 4.4;
  }
  marcar(ctx, 'observacoes', inicio);
  return y + 4;
}

function drawFooters(ctx: Contexto): void {
  const { doc, snapshot: { report, emitidoEm } } = ctx;
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    if (page > 1) {
      setFill(doc, COR.primary);
      doc.rect(0, 0, PAGE.width, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      setText(doc, COR.ink);
      doc.text(t(`${report.empresa} · CMV Financeiro`), PAGE.margin, 11, { maxWidth: 160 });
      doc.setFont('helvetica', 'normal');
      setText(doc, COR.muted);
      doc.text(t(`Período: ${periodoLabel(report)}`), PAGE.width - PAGE.margin, 11, { align: 'right' });
      setDraw(doc, COR.border);
      doc.setLineWidth(0.3);
      doc.line(PAGE.margin, 15, PAGE.width - PAGE.margin, 15);
    }
    setDraw(doc, COR.border);
    doc.setLineWidth(0.3);
    doc.line(PAGE.margin, PAGE.height - 11, PAGE.width - PAGE.margin, PAGE.height - 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setText(doc, COR.muted);
    doc.text(
      t(`${APP_NAME} · CMV Financeiro · Emitido em ${formatDateTimeBR(emitidoEm)} · Dados de ${momento(report.geradoEm)} · CMV por competência das despesas; faturamento do Fechamento de Caixa`),
      PAGE.margin, PAGE.height - 6.5, { maxWidth: 230 },
    );
    doc.text(t(`Página ${page} de ${total}`), PAGE.width - PAGE.margin, PAGE.height - 6.5, { align: 'right' });
  }
}

const DESENHO: Record<CmvBlocoPdf, (ctx: Contexto, y: number) => number> = {
  cards: drawCards,
  evolucao: drawEvolucao,
  composicao: drawComposicao,
  comparativo: drawComparativo,
  ranking: drawRanking,
  demonstrativo: drawDemonstrativo,
  temporal: drawTemporal,
  boletos: drawBoletos,
  observacoes: drawObservacoes,
};

/** Blocos efetivos, na ordem fixa do relatório, sem repetição. */
export function normalizarBlocos(blocos: readonly CmvBlocoPdf[]): CmvBlocoPdf[] {
  return CMV_TODOS_BLOCOS.filter(id => blocos.includes(id));
}

export function createCmvPdf(snapshot: CmvPdfSnapshot): CmvPdfResultado {
  const blocos = normalizarBlocos(snapshot.blocos);
  if (blocos.length === 0) throw new Error('Selecione pelo menos um bloco para exportar.');
  const { report } = snapshot;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setProperties({
    title: t(`CMV Financeiro - ${report.empresa} - ${periodoLabel(report)}`),
    subject: t(`CMV Financeiro por competência das despesas sobre o faturamento do Fechamento de Caixa - ${periodoLabel(report)}`),
    creator: APP_NAME,
  });
  const ctx: Contexto = { doc, snapshot, blocosPorPagina: [] };
  let y = drawFirstPageHeader(ctx);
  y = drawOrigem(ctx, y);
  // Só o que foi escolhido é desenhado: nenhum bloco entra "de carona" por causa do layout.
  for (const bloco of blocos) y = DESENHO[bloco](ctx, y);
  drawFooters(ctx);
  const paginas = doc.getNumberOfPages();
  return {
    doc,
    fileName: buildCmvPdfFileName(report),
    paginas,
    blocosPorPagina: Array.from({ length: paginas }, (_, i) => ctx.blocosPorPagina[i] ?? []),
  };
}

export function createCmvPdfBlob(snapshot: CmvPdfSnapshot): CmvPdfResultado & { blob: Blob } {
  const resultado = createCmvPdf(snapshot);
  return { ...resultado, blob: resultado.doc.output('blob') };
}
