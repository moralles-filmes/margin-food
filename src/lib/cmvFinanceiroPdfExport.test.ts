import { describe, expect, it } from 'vitest';
import { CAT, CMV_FILTRO_SEMANA, cmvPayloadCru } from '@/test/fixtures/cmvFinanceiro';
import { buildCmvReport, formatarCentavos, formatarPercentual, parseCmvPayload } from '@/domain/financeiro/cmv';
import {
  CMV_ATALHOS_PDF, CMV_TODOS_BLOCOS, createCmvPdf, createCmvPdfBlob, normalizarBlocos, textoPdf,
  type CmvBlocoPdf, type CmvPdfBoleto, type CmvPdfSnapshot,
} from './cmvFinanceiroPdfExport';

async function readPdfText(blob: Blob): Promise<string> {
  return new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
}

const emitidoEm = new Date('2026-09-20T18:45:00Z');
const report = buildCmvReport(parseCmvPayload(cmvPayloadCru()), CMV_FILTRO_SEMANA);

function boletos(n: number): CmvPdfBoleto[] {
  return Array.from({ length: n }, (_, i) => ({
    descricao: `Boleto teste ${String(i + 1).padStart(3, '0')}`,
    fornecedor: i % 2 === 0 ? 'Fornecedor Fictício' : null,
    dataCompetencia: '2026-09-08',
    dataVencimento: '2026-09-18',
    status: i % 3 === 0 ? 'PAGO' : 'APROVADO',
    categoriaNome: i % 5 === 0 ? null : 'Peixes',
    tituloCentavos: 215000,
    linhaCentavos: 120000,
    cmvIncluir: true,
  }));
}

function snapshot(blocos: CmvBlocoPdf[], extra: Partial<CmvPdfSnapshot> = {}): CmvPdfSnapshot {
  return { report, blocos, demonstrativoExpandido: true, observacoes: '', boletos: null, emitidoEm, ...extra };
}

describe('CMV Financeiro — exportação PDF', () => {
  it('"Tudo": A4 paisagem, identidade, período, mesmas cifras da tela e paginação', async () => {
    const { blob, paginas, fileName } = createCmvPdfBlob(snapshot(CMV_TODOS_BLOCOS, { boletos: boletos(3), observacoes: 'Conferido com o financeiro.' }));
    const text = await readPdfText(blob);

    expect(blob.type).toBe('application/pdf');
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toMatch(/\/MediaBox \[0 0 841\.8\d* 595\.2\d*\]/); // A4 paisagem
    expect(fileName).toBe('cmv-financeiro-unidade-teste-2026-09-07-a-2026-09-13.pdf');

    expect(text).toContain('Unidade Teste');
    expect(text).toContain('CMV Financeiro');
    expect(text).toContain('07/09/2026 a 13/09/2026');
    expect(text).toContain('31/08/2026 a 06/09/2026');
    // mesmas cifras e formatadores da tela
    expect(text).toContain(formatarCentavos(report.faturamento.atual));
    expect(text).toContain(formatarCentavos(report.cmv.atual));
    expect(text).toContain(formatarPercentual(report.percentual.atual));
    expect(text).toContain('R$ 10.000,00');
    expect(text).toContain('R$ 3.100,00');
    expect(text).toContain('31,00%');
    expect(text).toContain('+6,00 p.p.');
    for (const nome of ['Peixes', 'Bebidas', 'Frutos do Mar', 'Sem categoria', 'Atum \\(inativa\\)']) expect(text).toContain(nome);
    expect(text).toContain('Saldo ap');
    expect(text).toContain('Boleto teste 001');
    expect(text).toContain('Conferido com o financeiro.');

    expect(text).not.toMatch(/NaN|Infinity|undefined|#DIV/);
    const total = Number(text.match(/P.gina 1 de (\d+)/)?.[1]);
    expect(total).toBe(paginas);
    expect(text).toContain(`de ${paginas}`);
  });

  it('origem dos dados e avisos de incompletude acompanham qualquer seleção, inclusive "Apenas cards"', async () => {
    const { blob, paginas, blocosPorPagina } = createCmvPdfBlob(snapshot(['cards']));
    const text = await readPdfText(blob);
    expect(paginas).toBe(1);
    expect(blocosPorPagina).toEqual([['cards']]);
    expect(text).toContain('Fechamento de Caixa');
    expect(text).toContain('pela data de compet');
    expect(text).toContain('2 despesas do per');
    expect(text).toContain('Emitido em');
    expect(text).toContain('Dados consultados em');
    // bloco não selecionado não entra de carona
    expect(text).not.toContain('Demonstrativo de CMV');
    expect(text).not.toContain('Ranking de categorias');
  });

  it('respeita a seleção: cada atalho desenha exatamente os seus blocos', () => {
    for (const atalho of CMV_ATALHOS_PDF) {
      const { blocosPorPagina } = createCmvPdf(snapshot(atalho.blocos, { boletos: boletos(2), observacoes: 'x' }));
      const desenhados = new Set(blocosPorPagina.flat());
      expect([...desenhados].sort()).toEqual([...atalho.blocos].sort());
    }
  });

  it('exige pelo menos um bloco e mantém a ordem fixa do relatório', () => {
    expect(() => createCmvPdf(snapshot([]))).toThrow(/pelo menos um bloco/);
    expect(normalizarBlocos(['demonstrativo', 'cards', 'cards'])).toEqual(['cards', 'demonstrativo']);
  });

  it('demonstrativo resumido não imprime subcategorias; expandido imprime todas', async () => {
    const resumido = await readPdfText(createCmvPdfBlob(snapshot(['demonstrativo'], { demonstrativoExpandido: false })).blob);
    expect(resumido).toContain('resumido');
    expect(resumido).toContain('Peixes');
    expect(resumido).not.toContain('Atum');
    const expandido = await readPdfText(createCmvPdfBlob(snapshot(['demonstrativo'])).blob);
    expect(expandido).toContain('expandido');
    // parênteses são escapados no fluxo do PDF
    expect(expandido).toContain('Atum \\(inativa\\)');
  });

  it('tabela extensa: todas as linhas saem, com cabeçalho repetido e sem página vazia', async () => {
    const linhas = boletos(180);
    const { blob, paginas, blocosPorPagina } = createCmvPdfBlob(snapshot(['boletos'], { boletos: linhas }));
    const text = await readPdfText(blob);
    expect(paginas).toBeGreaterThan(3);
    expect(text).toContain('Boleto teste 001');
    expect(text).toContain('Boleto teste 180');
    expect((text.match(/Boleto teste \d{3}/g) ?? []).length).toBe(180);
    expect((text.match(/Valor inclu.do/g) ?? []).length).toBe(paginas);
    expect((text.match(/Unidade Teste . CMV Financeiro/g) ?? []).length).toBe(paginas - 1);
    expect(blocosPorPagina.every(p => p.length > 0)).toBe(true);
    expect(text).toContain(formatarCentavos(180 * 120000));
  });

  it('sem fechamento ou sem dados não imprime zero enganoso', async () => {
    const vazio = buildCmvReport(parseCmvPayload(cmvPayloadCru({ faturamento: [], cmv: [], boletos: [], qualidade: [], categorias: [] })), CMV_FILTRO_SEMANA);
    const text = await readPdfText(createCmvPdfBlob({ ...snapshot(CMV_TODOS_BLOCOS, { boletos: [] }), report: vazio }).blob);
    expect(text).toContain('Sem fechamento');
    expect(text).toContain('Nenhum boleto inclu');
    expect(text).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('valores negativos trocam a rosca por lista sem quebrar o documento', async () => {
    const negativo = buildCmvReport(parseCmvPayload(cmvPayloadCru({
      cmv: [
        { data: '2026-09-08', categoria_id: CAT.salmao, centavos: 100000 },
        { data: '2026-09-09', categoria_id: CAT.bebidas, centavos: -20000 },
      ],
    })), CMV_FILTRO_SEMANA);
    const text = await readPdfText(createCmvPdfBlob({ ...snapshot(['composicao']), report: negativo }).blob);
    expect(text).toContain('apresentada em lista');
    expect(text).toContain('-R$ 200,00');
  });

  it('texto fora do Latin-1 é trocado por equivalente legível, nunca por lixo', () => {
    expect(textoPdf('Peixes — Salmão “fresco” → 10…')).toBe('Peixes - Salmão "fresco" > 10...');
    expect(textoPdf('Ação × ÷ ç ã é')).toBe('Ação × ÷ ç ã é');
    expect(textoPdf('emoji 🐟 fim')).toBe('emoji ? fim');
    expect(textoPdf('a\u0007b\nc')).toBe('ab\nc');
  });
});
