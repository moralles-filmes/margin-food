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
 *   import { exportTableToExcel } from '@/lib/exportHelpers';
 */

import { todayBR } from '@/lib/datetime';
import { toast } from 'sonner';

/** Column definition for table exports */
interface ExportColumn {
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
