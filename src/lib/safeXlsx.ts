type CellValue = string | number | boolean | Date | null | undefined;
type RowData = CellValue[];
type ColumnWidth = { wch?: number; width?: number };

interface SheetData {
  __rows: RowData[];
  '!cols'?: ColumnWidth[];
}

interface WorkbookData {
  __sheets: { name: string; sheet: SheetData }[];
}

function normalizeSheetName(name: string): string {
  return (name || 'Planilha').replace(new RegExp('[\\\\/?*\\[\\]:]', 'g'), ' ').slice(0, 31) || 'Planilha';
}

function toRowsFromObjects(rows: Record<string, CellValue>[]): RowData[] {
  const headers = Array.from(rows.reduce((keys, row) => {
    Object.keys(row).forEach((key) => keys.add(key));
    return keys;
  }, new Set<string>()));

  return [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ''))];
}

async function writeWorkbook(workbookData: WorkbookData, filename: string) {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();

  for (const { name, sheet } of workbookData.__sheets) {
    const worksheet = workbook.addWorksheet(normalizeSheetName(name));
    worksheet.addRows(sheet.__rows.map((row) => row.map((cell) => cell ?? '')));

    if (sheet['!cols']) {
      sheet['!cols'].forEach((col, index) => {
        const width = col.wch ?? col.width;
        if (width) worksheet.getColumn(index + 1).width = width;
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const utils = {
  aoa_to_sheet(rows: RowData[]): SheetData {
    return { __rows: rows };
  },
  json_to_sheet(rows: Record<string, CellValue>[]): SheetData {
    return { __rows: toRowsFromObjects(rows) };
  },
  book_new(): WorkbookData {
    return { __sheets: [] };
  },
  book_append_sheet(workbook: WorkbookData, sheet: SheetData, name: string) {
    workbook.__sheets.push({ name, sheet });
  },
};

export function writeFile(workbook: WorkbookData, filename: string) {
  void writeWorkbook(workbook, filename).catch((error) => {
    console.error('[safeXlsx.writeFile]', error);
  });
}
