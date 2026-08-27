import PptxGenJS from 'pptxgenjs';
import type { PresentationMinutesExport } from '@/domain/financeiro/presentation';
import type { PresentationExportOptions } from '@/lib/presentationPdfExport';
import {
  buildPresentationMinutesPages,
  type PresentationMinutesPage,
} from '@/lib/presentationMinutesPages';

const MIME_PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const COLOR = {
  background: '090909',
  white: 'FFFFFF',
  muted: 'A8B0BD',
  subtle: '475569',
  gold: 'D6B85F',
} as const;

function abortIfRequested(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Exportação cancelada.', 'AbortError');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapSvgText(value: string, maximum: number): string[] {
  return value.split('\n').flatMap(paragraph => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean).flatMap(word => {
      if (word.length <= maximum) return [word];
      return Array.from({ length: Math.ceil(word.length / maximum) }, (_item, index) => (
        word.slice(index * maximum, (index + 1) * maximum)
      ));
    });
    if (words.length === 0) return [''];
    const lines: string[] = [];
    let current = words[0];
    words.slice(1).forEach(word => {
      if (`${current} ${word}`.length <= maximum) current = `${current} ${word}`;
      else {
        lines.push(current);
        current = word;
      }
    });
    lines.push(current);
    return lines;
  });
}

function svgDataUri(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

function createSlideSvg(
  page: PresentationMinutesPage,
  sessionId: string,
  slideNumber: number,
  totalSlides: number,
  draftWatermark: boolean,
): string {
  const lines: string[] = [];
  const addLine = (text: string, y: number, size: number, color: string, weight = 400) => {
    lines.push(`<text x="70" y="${y}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="#${color}" dominant-baseline="hanging">${escapeXml(text)}</text>`);
  };
  let y = 198;
  page.blocks.forEach(block => {
    wrapSvgText(block.heading, 86).forEach(line => {
      addLine(line, y, 22, COLOR.gold, 700);
      y += 28;
    });
    y += 4;
    wrapSvgText(block.body, 108).forEach(line => {
      addLine(line, y, 19, COLOR.white);
      y += 25;
    });
    y += 14;
  });
  const watermark = draftWatermark
    ? `<text x="666" y="385" font-family="Arial, sans-serif" font-size="74" font-weight="700" fill="#343434" text-anchor="middle" transform="rotate(24 666 385)">RASCUNHO</text>`
    : '';
  const footer = `Moralles Food · Sessão ${sessionId} · Slide ${slideNumber} de ${totalSlides}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1333" height="750" viewBox="0 0 1333 750"><rect width="1333" height="750" fill="#${COLOR.background}"/>${watermark}<rect x="70" y="35" width="65" height="6" fill="#${COLOR.gold}"/><text x="70" y="84" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#${COLOR.white}" dominant-baseline="hanging">${escapeXml(page.title)}</text><text x="70" y="145" font-family="Arial, sans-serif" font-size="21" fill="#${COLOR.muted}" dominant-baseline="hanging">${escapeXml(page.subtitle)}</text>${lines.join('')}<line x1="70" y1="682" x2="1263" y2="682" stroke="#${COLOR.subtle}" stroke-width="1"/><text x="70" y="700" font-family="Arial, sans-serif" font-size="10" fill="#${COLOR.muted}" dominant-baseline="hanging">${escapeXml(footer)}</text></svg>`;
}

function pageAlternativeText(page: PresentationMinutesPage): string {
  return [
    page.title,
    page.subtitle,
    ...page.blocks.flatMap(block => [block.heading, block.body]),
  ].filter(Boolean).join('\n');
}

async function yieldForCancellation(signal?: AbortSignal): Promise<void> {
  abortIfRequested(signal);
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  abortIfRequested(signal);
}

export async function createPresentationMinutesPptxBlob(
  data: PresentationMinutesExport,
  options: PresentationExportOptions = {},
): Promise<Blob> {
  if (data.detail.session.status === 'APPROVED' && !data.revision?.approvedAt) {
    throw new Error('ATA_APPROVED_REVISION_REQUIRED');
  }
  const pages = buildPresentationMinutesPages(data);
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Moralles Food';
  pptx.company = 'Moralles Food';
  pptx.subject = `Ata executiva da sessão ${data.detail.session.id}`;
  pptx.title = `Ata Executiva - ${data.detail.session.title}`;
  pptx.theme = { headFontFace: 'Arial', bodyFontFace: 'Arial' };

  for (let index = 0; index < pages.length; index += 1) {
    await yieldForCancellation(options.signal);
    const page = pages[index];
    const slide = pptx.addSlide();
    slide.background = { color: COLOR.background };
    if (data.draftWatermark) {
      slide.addText('RASCUNHO', {
        x: 2.8, y: 2.55, w: 7.8, h: 1.2,
        fontFace: 'Arial', fontSize: 54, bold: true,
        color: '343434', transparency: 8, rotate: 24,
        align: 'center', margin: 0,
      });
    }
    if (page.kind === 'cover') {
      const subtitleFontSize = page.subtitle.length > 140 ? 16 : page.subtitle.length > 90 ? 20 : 25;
      const subtitleY = 3.62;
      const subtitleHeight = page.subtitle.length > 140 ? 1.32 : page.subtitle.length > 90 ? 0.96 : 0.58;
      const coverHeadingY = subtitleY + subtitleHeight + 0.24;
      const coverBodyY = coverHeadingY + 0.42;
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.9, y: 1.75, w: 1.15, h: 0.08,
        line: { color: COLOR.gold, transparency: 100 }, fill: { color: COLOR.gold },
      });
      slide.addText('RITUAL EXECUTIVO', {
        x: 0.9, y: 2.05, w: 4.8, h: 0.3,
        fontFace: 'Arial', fontSize: 18, bold: true, color: COLOR.muted, margin: 0,
      });
      slide.addText(page.title, {
        x: 0.9, y: 2.55, w: 9.8, h: 0.8,
        fontFace: 'Arial', fontSize: 46, bold: true, color: COLOR.white, margin: 0,
      });
      slide.addText(page.subtitle, {
        x: 0.9, y: subtitleY, w: 11.2, h: subtitleHeight,
        fontFace: 'Arial', fontSize: subtitleFontSize, bold: true, color: COLOR.gold, margin: 0,
        fit: 'shrink', valign: 'top',
      });
      slide.addText(page.blocks[0].heading, {
        x: 0.9, y: coverHeadingY, w: 11.2, h: 0.32,
        fontFace: 'Arial', fontSize: 17, color: COLOR.white, margin: 0,
      });
      slide.addText(page.blocks[0].body, {
        x: 0.9, y: coverBodyY, w: 11.2, h: Math.max(0.72, 6.5 - coverBodyY),
        fontFace: 'Arial', fontSize: 15, color: COLOR.muted, margin: 0, breakLine: false, valign: 'top',
      });
    } else {
      slide.addImage({
        data: svgDataUri(createSlideSvg(
          page,
          data.detail.session.id,
          index + 1,
          pages.length,
          data.draftWatermark,
        )),
        x: 0, y: 0, w: 13.333, h: 7.5,
        altText: pageAlternativeText(page),
      });
    }
    if (page.kind === 'cover') {
      slide.addShape(pptx.ShapeType.line, {
        x: 0.7, y: 6.82, w: 11.93, h: 0,
        line: { color: COLOR.subtle, width: 1 },
      });
      slide.addText(`Moralles Food · Sessão ${data.detail.session.id} · Slide ${index + 1} de ${pages.length}`, {
        x: 0.7, y: 6.9, w: 11.9, h: 0.22,
        fontFace: 'Arial', fontSize: 9.5, color: COLOR.muted, margin: 0,
      });
    }
    slide.addNotes(page.notes);
    options.onProgress?.({
      completed: index + 1,
      total: pages.length,
      message: `Preparando slide ${index + 1} de ${pages.length}`,
      cancellable: true,
    });
  }
  abortIfRequested(options.signal);
  options.onProgress?.({ completed: pages.length, total: pages.length, message: 'Compactando PowerPoint', cancellable: false });
  const output = await pptx.write({ outputType: 'arraybuffer', compression: true });
  return new Blob([output as BlobPart], { type: MIME_PPTX });
}
