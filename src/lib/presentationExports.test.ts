import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { createPresentationPdfBlob } from '@/lib/presentationPdfExport';
import { createPresentationPptxBlob } from '@/lib/presentationPptxExport';
import {
  attachPresentationExpenses,
  attachPresentationPlan,
  attachPresentationRevenue,
} from '@/lib/financeiroPresentationAdapter';
import { isPresentationSlideExportable } from '@/lib/presentationSlides';
import {
  createPresentationPlanData,
  createPresentationSociosData,
} from '@/test/fixtures/presentationSocios';
import { createPresentationRevenueData, createPresentationWithRevenue } from '@/test/fixtures/presentationRevenue';
import { createPresentationExpensesData, createPresentationWithExpenses } from '@/test/fixtures/presentationExpenses';
import { createPresentationWithInsights } from '@/test/fixtures/presentationInsights';

async function readPdfText(blob: Blob): Promise<string> {
  return new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
}

async function readPptx(blob: Blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const numericOrder = (left: string, right: string) => left.localeCompare(right, undefined, { numeric: true });
  const slideFiles = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort(numericOrder);
  const noteFiles = Object.keys(zip.files).filter(name => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name)).sort(numericOrder);
  const slideXml = (await Promise.all(slideFiles.map(name => zip.file(name)!.async('string')))).join('\n');
  const noteXmls = await Promise.all(noteFiles.map(name => zip.file(name)!.async('string')));
  const notesXml = noteXmls.join('\n');
  const coreXml = await zip.file('docProps/core.xml')!.async('string');
  return { zip, slideFiles, noteFiles, slideXml, noteXmls, notesXml, coreXml };
}

describe('exportações da Apresentação Sócios', () => {
  it('grava a unidade analisada em todas as páginas PDF e slides PowerPoint', async () => {
    const data = { ...createPresentationSociosData(), company: { id:'unit-b',name:'Loja Shopping' } };
    const pdf = await readPdfText(await createPresentationPdfBlob(data));
    expect(pdf).toContain('Loja Shopping');expect(pdf).not.toContain('Loja Centro');
    const pptx = await readPptx(await createPresentationPptxBlob(data));
    expect(pptx.coreXml).toContain('Loja Shopping');
    expect(pptx.slideXml.match(/Loja Shopping/g)).toHaveLength(pptx.slideFiles.length);
    expect(pptx.notesXml).toContain('id=unit-b');
    expect(pptx.slideXml).not.toContain('Loja Centro');
  });

  it('usa o mesmo registry de Resultados na tela, no PDF e no PowerPoint', async () => {
    const data = createPresentationSociosData();
    const exportable = data.slides.filter(isPresentationSlideExportable);
    const resultKinds = data.slides.filter(slide => slide.chapter === 'results').map(slide => slide.kind);
    expect(resultKinds).toEqual([
      'results-summary',
      'results-comparison',
      'results-evolution',
      'results-bridge',
      'results-non-operational',
    ]);

    const pdfProgress = vi.fn();
    const pdf = await createPresentationPdfBlob(data, { onProgress: pdfProgress });
    const pdfText = await readPdfText(pdf);
    expect(pdf.type).toBe('application/pdf');
    expect(pdfText.startsWith('%PDF-')).toBe(true);
    expect(pdfText).toContain('Resultados');
    expect(pdfText).toContain('R$1.200,00');
    expect(pdfText).toContain('R$700,00');
    expect(pdfText).toContain('R$500,00');
    expect(pdfText).toContain('41,7%');
    expect(pdfText).toContain('Base zero - indisponível');
    expect(pdfText).toContain('Efeito de despesa');
    expect(pdfText).toContain('Informativo não operacional');
    expect(pdfText).toMatch(/\/Subject \(Faturamento, despesas, resultados e insights -/);
    expect(pdfText).not.toMatch(/Infinity|NaN/);

    const pptxProgress = vi.fn();
    const pptx = await createPresentationPptxBlob(data, { onProgress: pptxProgress });
    expect(pptx.type).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');
    const { zip, slideFiles, noteFiles, slideXml, noteXmls, notesXml, coreXml } = await readPptx(pptx);
    expect(zip.file('[Content_Types].xml')).not.toBeNull();
    expect(zip.file('ppt/presentation.xml')).not.toBeNull();
    expect(slideFiles).toHaveLength(exportable.length);
    expect(noteFiles).toHaveLength(exportable.length);
    expect(slideXml).toContain('Resultados');
    expect(slideXml).toContain('R$1.200,00');
    expect(slideXml).toContain('R$700,00');
    expect(slideXml).toContain('R$500,00');
    expect(slideXml).toContain('41,7%');
    expect(slideXml).toContain('Base zero - indisponível');
    expect(slideXml).toContain('Efeito de despesa');
    expect(slideXml).toContain('Informativo não operacional');
    expect(notesXml).toContain('public.get_fin_presentation_socios');
    expect(notesXml).toContain('public.fin_lancamento_rateios');
    expect(notesXml).toContain('COALESCE(data_pagamento, conciliado_em::date, data_competencia); regime de caixa do Dashboard');
    expect(notesXml).toContain('valores nao operacionais ficam fora do resultado operacional');
    exportable.forEach((slide, index) => {
      expect(noteXmls[index]).toContain(`slideId=${slide.id}`);
      expect(noteXmls[index]).toContain(`chapter=${slide.chapter}`);
      expect(noteXmls[index]).toContain(`kind=${slide.kind}`);
      expect(noteXmls[index]).toContain(`order=${slide.order}`);
    });
    expect(coreXml).toContain('Faturamento, despesas, resultados e insights - Março de 2026');
    expect(`${slideXml}\n${notesXml}`).not.toMatch(/Infinity|NaN/);
    expect(pdfProgress.mock.calls.at(-1)?.[0].total).toBe(exportable.length);
    expect(pptxProgress.mock.calls.at(-1)?.[0].total).toBe(exportable.length);
  });

  it('usa o mesmo conjunto de slides de Faturamento em PDF e PowerPoint', async () => {
    const data = createPresentationWithRevenue();
    const pdfText = await readPdfText(await createPresentationPdfBlob(data));
    expect(pdfText).toContain('Faturamento');
    expect(pdfText).toContain('R$3.000,00');
    expect(pdfText).toContain('Segunda-feira');

    const { slideFiles, slideXml } = await readPptx(await createPresentationPptxBlob(data));
    expect(slideFiles).toHaveLength(data.slides.filter(isPresentationSlideExportable).length);
    expect(slideXml).toContain('Faturamento bruto — Fechamento de Caixa');
    expect(slideXml).toContain('R$3.000,00');
    expect(slideXml).toContain('Segunda-feira');
    expect(`${pdfText}\n${slideXml}`).not.toMatch(/Infinity|NaN/);
  });

  it('usa o mesmo registro de Despesas em tela, PDF e PowerPoint', async () => {
    const data = createPresentationWithExpenses();
    expect(data.slides.filter(slide => slide.chapter === 'expenses')).toHaveLength(4);
    const pdfText = await readPdfText(await createPresentationPdfBlob(data));
    expect(pdfText).toContain('Despesas financeiras');
    expect(pdfText).toContain('R$1.200,00');
    expect(pdfText).toContain('Insumos');

    const { slideXml, notesXml } = await readPptx(await createPresentationPptxBlob(data));
    expect(slideXml).toContain('Despesas financeiras — DFC');
    expect(slideXml).toContain('R$1.200,00');
    expect(slideXml).toContain('Insumos');
    expect(notesXml).toContain('regime de caixa');
    expect(`${pdfText}\n${slideXml}\n${notesXml}`).not.toMatch(/Infinity|NaN/);
  });

  it('exporta Receita líquida × Despesa por mês com rótulo compacto e fontes das duas origens em PDF e PowerPoint', async () => {
    const revenue = createPresentationRevenueData();
    const expenses = createPresentationExpensesData();
    const withRevenue = attachPresentationRevenue(createPresentationSociosData(), {
      state: 'available', data: revenue, fetchedAt: revenue.generatedAt,
    });
    const data = attachPresentationExpenses(withRevenue, {
      state: 'available', data: expenses, fetchedAt: expenses.generatedAt,
    });
    expect(data.slides.some(slide => slide.kind === 'revenue-expenses-monthly')).toBe(true);

    const pdfText = await readPdfText(await createPresentationPdfBlob(data));
    expect(pdfText).toContain('Receita líquida');
    expect(pdfText).toContain('R$2,7k');
    expect(pdfText).not.toMatch(/Infinity|NaN/);

    const { slideXml, notesXml } = await readPptx(await createPresentationPptxBlob(data));
    expect(slideXml).toContain('Receita líquida');
    expect(slideXml).toContain('R$2,7k');
    expect(notesXml).toContain('receita líquida: public.fin_lancamentos');
    expect(notesXml).toContain('despesas: public.fin_lancamentos + public.fin_lancamento_rateios; DFC');
    expect(`${pdfText}\n${slideXml}\n${notesXml}`).not.toMatch(/Infinity|NaN/);
  });

  it('exporta o mesmo ranking paginado de Insights em PDF e PowerPoint', async () => {
    const data = createPresentationWithInsights();
    expect(data.insights?.state).toBe('available');
    if (data.insights?.state !== 'available') return;
    const insightSlides = data.slides.filter(slide => slide.kind === 'insights');
    expect(insightSlides).toHaveLength(2);
    expect(insightSlides.flatMap(slide => (
      slide.availability.state === 'available'
      && slide.availability.data.type === 'insights'
        ? slide.availability.data.items.map(insight => insight.id)
        : []
    ))).toEqual(data.insights.data.insights.map(insight => insight.id));

    const pdfText = await readPdfText(await createPresentationPdfBlob(data));
    expect(pdfText).toContain('Insights');
    expect(pdfText).toContain('Pessoas concentrou despesas no mês');
    expect(pdfText).toContain('R$45.000,00');
    expect(pdfText).toContain('Faturamento bruto — Fechamento de Caixa');
    expect(pdfText).toContain('Despesas financeiras — regime de caixa do DFC');

    const { slideFiles, slideXml, notesXml } = await readPptx(
      await createPresentationPptxBlob(data),
    );
    expect(slideFiles).toHaveLength(data.slides.filter(isPresentationSlideExportable).length);
    expect(slideXml).toContain('Pessoas concentrou despesas no mês');
    expect(slideXml).toContain('R$45.000,00');
    expect(slideXml).toContain('Faturamento bruto — Fechamento de Caixa');
    expect(slideXml).toContain('Despesas financeiras — regime de caixa do DFC');
    expect(notesXml).toContain('rulesetVersion=1.0');
    expect(notesXml).toContain('public.financeiro_fechamento_caixa.faturamento_bruto');
    expect(notesXml).toContain('public.fin_lancamento_rateios');
    expect(notesXml).toContain('regime de caixa do DFC');
    expect(`${pdfText}\n${slideXml}\n${notesXml}`).not.toMatch(/Infinity|NaN/);
  });

  it('preserva dados de preparação sem misturá-los aos Insights', async () => {
    const data = attachPresentationPlan(createPresentationSociosData(), {
      state: 'available',
      data: createPresentationPlanData(),
      fetchedAt: '2026-08-25T15:30:00-03:00',
    });
    expect(data.plan?.state).toBe('available');
    expect(data.slides.some(slide => slide.kind === 'plan-comparison')).toBe(false);

    const pdfText = await readPdfText(await createPresentationPdfBlob(data));
    const { slideXml } = await readPptx(await createPresentationPptxBlob(data));
    expect(pdfText).not.toContain('ORCADO');
    expect(slideXml).not.toContain('Orçado');
  });

  it('cancela com segurança antes de produzir o arquivo', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(createPresentationPdfBlob(createPresentationSociosData(), { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
  });

  it.each([
    ['PDF', createPresentationPdfBlob],
    ['PPTX', createPresentationPptxBlob],
  ] as const)('cancela %s durante a preparação entre slides', async (_label, createBlob) => {
    const controller = new AbortController();
    const promise = createBlob(createPresentationSociosData(), {
      signal: controller.signal,
      onProgress: (progress) => {
        if (progress.completed === 1 && progress.cancellable) controller.abort();
      },
    });

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('exporta apenas as fundações explícitas quando Resultados está indisponível', async () => {
    const data = createPresentationSociosData('unavailable');
    expect(data.slides.filter(isPresentationSlideExportable)).toHaveLength(3);
    const { slideFiles, slideXml } = await readPptx(await createPresentationPptxBlob(data));
    expect(slideFiles).toHaveLength(3);
    expect(slideXml.match(/Conteúdo não solicitado nesta fase\./g)).toHaveLength(3);
    expect(slideXml).not.toContain('R$1.200,00');
  });
});
