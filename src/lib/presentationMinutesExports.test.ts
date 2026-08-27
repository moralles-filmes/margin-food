import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { buildPresentationMinutesPages } from './presentationMinutesPages';
import { createPresentationMinutesPdfBlob } from './presentationMinutesPdfExport';
import { createPresentationMinutesPptxBlob } from './presentationMinutesPptxExport';
import { createPresentationMinutesExport } from '@/test/fixtures/presentationMeeting';

describe('exportações da ata executiva', () => {
  it('pagina pautas extensas sem truncar o último conteúdo no modelo compartilhado', () => {
    const payload = createPresentationMinutesExport({ agendaCount: 18 });
    const pages = buildPresentationMinutesPages(payload);
    const text = pages.flatMap(page => [
      page.title,
      page.subtitle,
      ...page.blocks.flatMap(block => [block.heading, block.body]),
    ]).join('\n');
    expect(pages.length).toBeGreaterThan(12);
    expect(text).toContain('18. Item executivo extenso 18');
    expect(text).toContain('Notas registradas pelo usuário para o item 18.');
    expect(text).toContain('Documentar premissas operacionais');
    expect(text).toContain('Sem base de comparação');
  });

  it('gera PDF real, multipágina e com marca textual RASCUNHO', async () => {
    const progress = vi.fn();
    const payload = createPresentationMinutesExport({ agendaCount: 12, draft: true });
    const blob = await createPresentationMinutesPdfBlob(payload, { onProgress: progress });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = new TextDecoder('latin1').decode(bytes);
    expect(blob.type).toBe('application/pdf');
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('RASCUNHO');
    expect(text).toContain('Item executivo extenso 12');
    expect((text.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(5);
    expect(progress.mock.calls.at(-1)?.[0]).toMatchObject({ message: 'Finalizando PDF', cancellable: false });
  });

  it('gera pacote PowerPoint Office real com o mesmo conteúdo e notas auditáveis', async () => {
    const payload = createPresentationMinutesExport({ agendaCount: 14 });
    const pages = buildPresentationMinutesPages(payload);
    const blob = await createPresentationMinutesPptxBlob(payload);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 2))).toBe('PK');
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');

    const zip = await JSZip.loadAsync(bytes);
    expect(zip.file('[Content_Types].xml')).not.toBeNull();
    expect(zip.file('ppt/presentation.xml')).not.toBeNull();
    const slideFiles = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    expect(slideFiles).toHaveLength(pages.length);
    const slideXml = (await Promise.all(slideFiles.map(name => zip.file(name)!.async('string')))).join('\n');
    expect(slideXml).toContain('Ritual executivo de março');
    expect(slideXml).toContain('Item executivo extenso 14');
    expect(slideXml).toContain('Documentar premissas operacionais');

    const noteFiles = Object.keys(zip.files).filter(name => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name));
    expect(noteFiles).toHaveLength(pages.length);
    const notesXml = (await Promise.all(noteFiles.map(name => zip.file(name)!.async('string')))).join('\n');
    expect(notesXml).toContain(`sessionId=${payload.detail.session.id}`);
    expect(notesXml).toContain(`revisionId=${payload.revision?.id}`);
    expect(notesXml).toContain('snapshotVersion=presentation-meeting-snapshot-v1.0');
    expect(notesXml).toContain('formulaVersion=presentation-plan-v1.0');
    expect(notesXml).toContain('actual: fin_lancamentos');
    expect(notesXml).toContain('budget: fin_orcamentos');
    expect(`${slideXml}\n${notesXml}`).not.toMatch(/Infinity|NaN/);
  });

  it('recusa sessão aprovada sem revisão aprovada e respeita cancelamento', async () => {
    const invalid = createPresentationMinutesExport();
    invalid.revision = null;
    await expect(createPresentationMinutesPdfBlob(invalid)).rejects.toThrow('ATA_APPROVED_REVISION_REQUIRED');
    await expect(createPresentationMinutesPptxBlob(invalid)).rejects.toThrow('ATA_APPROVED_REVISION_REQUIRED');

    const controller = new AbortController();
    controller.abort();
    await expect(createPresentationMinutesPdfBlob(createPresentationMinutesExport({ draft: true }), { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
  });

  it('mantém exportações válidas com título máximo e tokens sem espaços', async () => {
    const payload = createPresentationMinutesExport({ agendaCount: 2 });
    const longTitle = 'Ata executiva com contexto detalhado '.repeat(8).slice(0, 200);
    const longToken = 'X'.repeat(240);
    payload.detail.session.title = longTitle;
    payload.revision!.content.session.title = longTitle;
    payload.detail.agendaItems[1].discussionNotes = longToken;
    payload.revision!.content.agendaItems[1].discussionNotes = longToken;

    const pdf = await createPresentationMinutesPdfBlob(payload);
    const pptx = await createPresentationMinutesPptxBlob(payload);
    expect(pdf.size).toBeGreaterThan(1_000);
    expect(pptx.size).toBeGreaterThan(10_000);

    const zip = await JSZip.loadAsync(new Uint8Array(await pptx.arrayBuffer()));
    const slideFiles = Object.keys(zip.files)
      .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    const firstSlideXml = await zip.file('ppt/slides/slide1.xml')!.async('string');
    const slideXml = (await Promise.all(
      slideFiles.map(name => zip.file(name)!.async('string')),
    )).join('\n');
    expect(slideXml).toContain(longTitle);
    expect(slideXml).toContain('X'.repeat(108));
    expect(`${slideXml}`).not.toMatch(/Infinity|NaN/);

    const cover = buildPresentationMinutesPages(payload)[0];
    const shapeBounds = (text: string) => {
      const shape = firstSlideXml.split('<p:sp>').find(candidate => candidate.includes(text));
      expect(shape).toBeDefined();
      const y = Number(shape!.match(/<a:off x="\d+" y="(\d+)"\/>/)?.[1]);
      const height = Number(shape!.match(/<a:ext cx="\d+" cy="(\d+)"\/>/)?.[1]);
      expect(Number.isFinite(y)).toBe(true);
      expect(Number.isFinite(height)).toBe(true);
      return { y, height };
    };
    const subtitle = shapeBounds(longTitle);
    const heading = shapeBounds(cover.blocks[0].heading);
    expect(subtitle.y + subtitle.height).toBeLessThanOrEqual(heading.y);
  });
});
