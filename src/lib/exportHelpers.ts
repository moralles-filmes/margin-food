/**
 * ─── Standard Export Helpers (Enterprise Safe) ───
 *
 * Centralized export utilities for PDF and Excel with consistent:
 * - File naming: {module}_{section}_{YYYY-MM-DD}.{ext}
 * - Timezone: America/Sao_Paulo
 * - Loading feedback
 * - Error handling
 *
 * Usage:
 *   import { exportTableToPdf, exportTableToExcel } from '@/lib/exportHelpers';
 */

import { APP_NAME } from '@/lib/brand';
import { todayBR } from '@/lib/datetime';
import { toast } from 'sonner';

/** Column definition for table exports */
export interface ExportColumn {
  header: string;
  key: string;
  /** Optional formatter — receives the raw value, returns display string */
  format?: (value: unknown) => string;
  /** Alignment: 'left' (default) | 'right' | 'center' */
  align?: 'left' | 'right' | 'center';
}

export interface ExportOptions {
  /** Module name (e.g., 'financeiro') */
  module: string;
  /** Section name (e.g., 'lancamentos') */
  section: string;
  /** Report title displayed in the header */
  title: string;
  /** Optional subtitle (e.g., date range) */
  subtitle?: string;
  /** Column definitions */
  columns: ExportColumn[];
  /** Data rows — each row is a Record keyed by column.key */
  rows: Record<string, unknown>[];
  /** Optional summary rows at the bottom */
  summaryRows?: { label: string; value: string }[];
}

/**
 * Generate a standardized file name.
 * Pattern: {module}_{section}_{YYYY-MM-DD}.{ext}
 */
export function exportFileName(module: string, section: string, ext: string): string {
  return `${module}_${section}_${todayBR()}.${ext}`;
}

/**
 * Export a table to PDF using the enterprise standard format.
 * Returns true on success, false on error.
 */
export async function exportTableToPdf(options: ExportOptions): Promise<boolean> {
  try {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF();
    const { title, subtitle, columns, rows, summaryRows, module, section } = options;

    // Header
    doc.setFontSize(14);
    doc.text(APP_NAME, 14, 15);
    doc.setFontSize(11);
    doc.text(title, 14, 23);
    if (subtitle) {
      doc.setFontSize(8);
      doc.text(subtitle, 14, 29);
    }

    // Table
    const startY = subtitle ? 35 : 30;
    const head = [columns.map(c => c.header)];
    const body = rows.map(row =>
      columns.map(col => {
        const raw = row[col.key];
        return col.format ? col.format(raw) : String(raw ?? '');
      })
    );

    const colStyles: Record<string, { halign: 'left' | 'right' | 'center' }> = {};
    columns.forEach((col, i) => {
      if (col.align) colStyles[i] = { halign: col.align };
    });

    autoTable(doc, {
      startY,
      head,
      body,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [41, 37, 36] },
      columnStyles: colStyles,
    });

    // Summary
    if (summaryRows && summaryRows.length > 0) {
      const finalY = (doc as any).lastAutoTable?.finalY || startY + 20;
      let y = finalY + 10;
      doc.setFontSize(9);
      for (const sr of summaryRows) {
        doc.text(`${sr.label}: ${sr.value}`, 14, y);
        y += 6;
      }
    }

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.text(
        `${APP_NAME} — Gerado em ${todayBR()} — Página ${i}/${pageCount}`,
        14,
        doc.internal.pageSize.height - 10,
      );
    }

    doc.save(exportFileName(module, section, 'pdf'));
    toast.success('PDF exportado com sucesso');
    return true;
  } catch (err) {
    console.error('Export PDF error:', err);
    toast.error('Erro ao exportar PDF');
    return false;
  }
}

/**
 * Export a table to CSV (Excel-compatible) using the enterprise standard format.
 * Returns true on success, false on error.
 */
export async function exportTableToExcel(options: ExportOptions): Promise<boolean> {
  try {
    const { columns, rows, module, section } = options;
    const BOM = '\uFEFF'; // UTF-8 BOM for Excel compatibility
    const sep = ';';

    const header = columns.map(c => `"${c.header}"`).join(sep);
    const lines = rows.map(row =>
      columns.map(col => {
        const raw = row[col.key];
        const val = col.format ? col.format(raw) : String(raw ?? '');
        return `"${val.replace(/"/g, '""')}"`;
      }).join(sep)
    );

    const csv = BOM + [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = exportFileName(module, section, 'csv');
    a.click();
    URL.revokeObjectURL(url);

    toast.success('Excel (CSV) exportado com sucesso');
    return true;
  } catch (err) {
    console.error('Export Excel error:', err);
    toast.error('Erro ao exportar Excel');
    return false;
  }
}
