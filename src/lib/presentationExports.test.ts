import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { createPresentationPdfBlob } from '@/lib/presentationPdfExport';
import { createPresentationPptxBlob } from '@/lib/presentationPptxExport';
import { attachPresentationDecision, attachPresentationPlan } from '@/lib/financeiroPresentationAdapter';
import {
  createPresentationPlanData,
  createPresentationSociosData,
} from '@/test/fixtures/presentationSocios';
import { createPresentationWithScenario } from '@/test/fixtures/presentationScenario';
import {
  createPresentationDecisionComparison,
  createPresentationDecisionDetail,
} from '@/test/fixtures/presentationDecision';

function createPresentationWithPlan() {
  return attachPresentationPlan(createPresentationSociosData(), {
    state: 'available',
    data: createPresentationPlanData(),
    fetchedAt: '2026-08-25T15:30:00-03:00',
  });
}

describe('exportações da Apresentação Sócios', () => {
  it('gera PDF 16:9 válido com o período e informa progresso', async () => {
    const progress = vi.fn();
    const blob = await createPresentationPdfBlob(createPresentationWithPlan(), { onProgress: progress });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = new TextDecoder('latin1').decode(bytes);

    expect(blob.type).toBe('application/pdf');
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('Março de 2026');
    expect(text).toContain('R$1.200,00');
    expect(text).toContain('R$700,00');
    expect(text).toContain('R$500,00');
    expect(text).toContain('41,7%');
    expect(text).toContain('R$320,00');
    expect(text).toContain('R$540,00');
    expect(text).toContain('ORCADO');
    expect(text).toContain('R$1.100,00');
    expect(text).not.toMatch(/Infinity|NaN/);
    expect(progress).toHaveBeenCalled();
    expect(progress.mock.calls.at(-1)?.[0]).toMatchObject({ message: 'Finalizando PDF', cancellable: false });
  });

  it('gera PPTX válido, legível como pacote Office, com período, hierarquia e não operacional', async () => {
    const progress = vi.fn();
    const blob = await createPresentationPptxBlob(createPresentationWithPlan(), { onProgress: progress });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 2))).toBe('PK');
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');

    const zip = await JSZip.loadAsync(bytes);
    expect(zip.file('[Content_Types].xml')).not.toBeNull();
    expect(zip.file('ppt/presentation.xml')).not.toBeNull();
    const slideFiles = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    expect(slideFiles).toHaveLength(8);
    const slideXml = (await Promise.all(slideFiles.map(name => zip.file(name)!.async('string')))).join('\n');
    expect(slideXml).toContain('Março de 2026');
    expect(slideXml).toContain('R$1.200,00');
    expect(slideXml).toContain('R$700,00');
    expect(slideXml).toContain('R$500,00');
    expect(slideXml).toContain('41,7%');
    expect(slideXml).toContain('R$320,00');
    expect(slideXml).toContain('R$540,00');
    expect(slideXml).toContain('Orçado');
    expect(slideXml).toContain('R$1.100,00');
    expect(slideXml).toContain('Sem categoria — Despesas');
    expect(slideXml).toContain('FORA DO RESULTADO OPERACIONAL');
    expect(slideXml).not.toMatch(/Infinity|NaN/);
    expect(progress.mock.calls.at(-1)?.[0]).toMatchObject({ message: 'Compactando PowerPoint', cancellable: false });
  });

  it('preserva cenário, sensibilidade, marca SIMULAÇÃO e fontes auditáveis em PDF e PowerPoint', async () => {
    const data = createPresentationWithScenario();
    const pdf = await createPresentationPdfBlob(data);
    const pdfText = new TextDecoder('latin1').decode(new Uint8Array(await pdf.arrayBuffer()));
    expect(pdfText).toContain('SIMULAÇÃO');
    expect(pdfText).toContain('Renegociação executiva');
    expect(pdfText).toContain('R$620,00');
    expect(pdfText).not.toMatch(/Infinity|NaN/);

    const pptx = await createPresentationPptxBlob(data);
    const zip = await JSZip.loadAsync(await pptx.arrayBuffer());
    const slideFiles = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    expect(slideFiles).toHaveLength(10);
    const slideXml = (await Promise.all(slideFiles.map(name => zip.file(name)!.async('string')))).join('\n');
    expect(slideXml).toContain('SIMULAÇÃO');
    expect(slideXml).toContain('Renegociação executiva');
    expect(slideXml).toContain('R$620,00');
    const noteFiles = Object.keys(zip.files).filter(name => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name));
    const notesXml = (await Promise.all(noteFiles.map(name => zip.file(name)!.async('string')))).join('\n');
    expect(notesXml).toContain('presentation-scenario-v1.0');
    expect(notesXml).toContain('fin_orcamentos');
    expect(notesXml).toContain('não é previsão garantida');
    expect(`${slideXml}\n${notesXml}`).not.toMatch(/Infinity|NaN/);
  });

  it('preserva decisão, ações, comparação e notas auditáveis no PDF e PowerPoint', async () => {
    const detail = createPresentationDecisionDetail(8);
    const data = attachPresentationDecision(createPresentationWithPlan(), {
      state: 'available',
      data: { detail, comparison: createPresentationDecisionComparison() },
      fetchedAt: detail.fetchedAt,
    });
    const pdf = await createPresentationPdfBlob(data);
    const pdfText = new TextDecoder('latin1').decode(new Uint8Array(await pdf.arrayBuffer()));
    expect(pdfText).toContain('Decisão e compromissos');
    expect(pdfText).toContain('Compromisso executivo 1');
    expect(pdfText).toContain('Snapshot aprovado');
    expect(pdfText).toContain('Base atual');
    expect(pdfText).not.toMatch(/Infinity|NaN/);

    const pptx = await createPresentationPptxBlob(data);
    const zip = await JSZip.loadAsync(await pptx.arrayBuffer());
    const slideFiles = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    const slideXml = (await Promise.all(slideFiles.map(name => zip.file(name)!.async('string')))).join('\n');
    expect(slideXml).toContain('Decisão e compromissos');
    expect(slideXml).toContain('Compromisso executivo 8');
    expect(slideXml).toContain('Snapshot aprovado');
    expect(slideXml).toContain('Base atual');
    const noteFiles = Object.keys(zip.files).filter(name => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name));
    const notesXml = (await Promise.all(noteFiles.map(name => zip.file(name)!.async('string')))).join('\n');
    expect(notesXml).toContain(`decisionId=${detail.decision.id}`);
    expect(notesXml).toContain(`revisionId=${detail.revisions[0].id}`);
    expect(notesXml).toContain('snapshotVersion=presentation-decision-snapshot-v1.0');
    expect(notesXml).toContain('actual: fin_lancamentos');
    expect(notesXml).toContain(`actionId=${detail.actions[0].id}`);
    expect(`${slideXml}\n${notesXml}`).not.toMatch(/Infinity|NaN/);
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
      onProgress: progress => {
        if (progress.completed === 1 && progress.cancellable) controller.abort();
      },
    });

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('não exporta slides indisponíveis como se tivessem dados', async () => {
    const blob = await createPresentationPptxBlob(createPresentationSociosData('unavailable'));
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const slideFiles = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    expect(slideFiles).toHaveLength(1);
  });
});
