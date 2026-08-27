import jsPDF from 'jspdf';
import type { PresentationMinutesExport } from '@/domain/financeiro/presentation';
import type { PresentationExportOptions } from '@/lib/presentationPdfExport';
import { buildPresentationMinutesPages } from '@/lib/presentationMinutesPages';

const PAGE_WIDTH = 320;
const PAGE_HEIGHT = 180;
const COLOR = {
  background: '#090909',
  white: '#ffffff',
  muted: '#a8b0bd',
  subtle: '#475569',
  gold: '#d6b85f',
} as const;

function abortIfRequested(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Exportação cancelada.', 'AbortError');
}

async function yieldForCancellation(signal?: AbortSignal): Promise<void> {
  abortIfRequested(signal);
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  abortIfRequested(signal);
}

function background(doc: jsPDF): void {
  doc.setFillColor(COLOR.background);
  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 'F');
}

function draftWatermark(doc: jsPDF): void {
  doc.setTextColor('#343434');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(48);
  doc.text('RASCUNHO', PAGE_WIDTH / 2, PAGE_HEIGHT / 2, { align: 'center', angle: 24 });
}

function footer(doc: jsPDF, page: number, total: number, sessionId: string): void {
  doc.setDrawColor(COLOR.subtle);
  doc.setLineWidth(0.25);
  doc.line(17, 169, 303, 169);
  doc.setTextColor(COLOR.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Moralles Food · Ata Executiva · Sessão ${sessionId} · Página ${page} de ${total}`, 17, 174);
}

export async function createPresentationMinutesPdfBlob(
  data: PresentationMinutesExport,
  options: PresentationExportOptions = {},
): Promise<Blob> {
  if (data.detail.session.status === 'APPROVED' && !data.revision?.approvedAt) {
    throw new Error('ATA_APPROVED_REVISION_REQUIRED');
  }
  const pages = buildPresentationMinutesPages(data);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [PAGE_WIDTH, PAGE_HEIGHT] });

  for (let index = 0; index < pages.length; index += 1) {
    await yieldForCancellation(options.signal);
    if (index > 0) doc.addPage([PAGE_WIDTH, PAGE_HEIGHT], 'landscape');
    background(doc);
    if (data.draftWatermark) draftWatermark(doc);
    const page = pages[index];
    if (page.kind === 'cover') {
      doc.setFillColor(COLOR.gold);
      doc.rect(22, 43, 28, 2.2, 'F');
      doc.setTextColor(COLOR.muted);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('RITUAL EXECUTIVO', 22, 57);
      doc.setTextColor(COLOR.white);
      doc.setFontSize(42);
      doc.text(page.title, 22, 84);
      doc.setTextColor(COLOR.gold);
      const subtitleFontSize = page.subtitle.length > 140 ? 15 : page.subtitle.length > 90 ? 18 : 21;
      doc.setFontSize(subtitleFontSize);
      const subtitle = (doc.splitTextToSize(page.subtitle, 260) as string[]).slice(0, 3);
      doc.text(subtitle, 22, 102);
      const subtitleBottom = 102 + Math.max(0, subtitle.length - 1) * (subtitleFontSize * 0.4);
      doc.setTextColor(COLOR.white);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      const cover = page.blocks[0];
      const headingY = Math.max(121, subtitleBottom + 11);
      doc.text(cover.heading, 22, headingY, { maxWidth: 276 });
      doc.setTextColor(COLOR.muted);
      doc.setFontSize(9);
      doc.text(doc.splitTextToSize(cover.body, 276), 22, headingY + 11);
    } else {
      doc.setFillColor(COLOR.gold);
      doc.rect(17, 13, 15, 1.6, 'F');
      doc.setTextColor(COLOR.white);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(25);
      doc.text(page.title, 17, 27, { maxWidth: 286 });
      doc.setTextColor(COLOR.muted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.text(page.subtitle, 17, 35, { maxWidth: 286 });
      let y = 47;
      page.blocks.forEach(block => {
        doc.setTextColor(COLOR.gold);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        const heading = doc.splitTextToSize(block.heading, 286) as string[];
        doc.text(heading, 17, y);
        y += heading.length * 4.3 + 1.5;
        doc.setTextColor(COLOR.white);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        const body = doc.splitTextToSize(block.body, 286) as string[];
        doc.text(body, 17, y);
        y += body.length * 4 + 4;
      });
    }
    footer(doc, index + 1, pages.length, data.detail.session.id);
    options.onProgress?.({
      completed: index + 1,
      total: pages.length,
      message: `Preparando página ${index + 1} de ${pages.length}`,
      cancellable: true,
    });
  }
  abortIfRequested(options.signal);
  options.onProgress?.({ completed: pages.length, total: pages.length, message: 'Finalizando PDF', cancellable: false });
  return doc.output('blob');
}
