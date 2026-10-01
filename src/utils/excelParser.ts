/**
 * Excel file parsing utility using xlsx (SheetJS)
 */
import { buildDataset, emptyResult, locateHeaderRow } from './tableImport';
import type { BuildOptions, ImportWarning, ParseResult, RawCell, RawTable } from './tableImport';

export interface ExcelParseOptions extends BuildOptions {
  sheetIndex?: number; // Default: 0 (first sheet)
  sheetName?: string; // Override sheet by name
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Read one sheet of a workbook into a grid: header, rows, and notes about how
 * it was read. Typing the columns is left to buildDataset, which the CSV
 * route shares.
 *
 * Dates are read from the cell's serial number and number format rather than
 * as JavaScript Date objects. A Date carries a time zone, and for a
 * time-of-day cell (a serial below 1, which is a moment on 30 December 1899)
 * the zone's nineteenth-century offset leaks into the result. The serial
 * number is the calendar value the spreadsheet shows, in any zone, and it
 * keeps what the Date route dropped: the time on a date-time cell, and a
 * time-only cell as a time instead of as the date 1899-12-31.
 */
export async function extractExcelTable(
  buffer: ArrayBuffer,
  options: { sheetIndex?: number; sheetName?: string } = {}
): Promise<RawTable | string> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, cellNF: true, cellText: true });

  const sheetName = options.sheetName || workbook.SheetNames[options.sheetIndex || 0];
  if (!sheetName) return 'No sheets found in workbook';

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return `Sheet "${sheetName}" not found`;
  if (!sheet['!ref']) return 'Sheet is empty';

  const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904);
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const warnings: ImportWarning[] = [];
  let errorCells = 0;

  const readCell = (r: number, c: number): RawCell => {
    const cell = sheet[XLSX.utils.encode_cell({ r, c })];
    if (!cell || cell.v === undefined || cell.v === null) return null;

    switch (cell.t) {
      case 'n': {
        const value = cell.v as number;
        const format = typeof cell.z === 'string' ? cell.z : '';
        if (format && XLSX.SSF.is_date(format)) {
          const d = XLSX.SSF.parse_date_code(value, { date1904 });
          if (!d) return String(cell.w ?? value);
          const time = `${pad(d.H)}:${pad(d.M)}${d.S ? `:${pad(d.S)}` : ''}`;
          const hasTime = d.H + d.M + d.S > 0;
          // A serial below 1 has no date part: it is a time of day.
          if (value >= 0 && value < 1) return { temporal: 'time', text: time };
          const date = `${String(d.y).padStart(4, '0')}-${pad(d.m)}-${pad(d.d)}`;
          return hasTime
            ? { temporal: 'datetime', text: `${date}T${time}` }
            : { temporal: 'date', text: date };
        }
        // A format of nothing but zeros (00000) pads a code to a fixed width.
        // The stored number has lost the padding; the displayed text has not.
        if (/^0{2,}$/.test(format) && typeof cell.w === 'string') return cell.w;
        return value;
      }
      case 'b':
        // As Excel shows it. Kept as text so it is never mistaken for a
        // yes/no answer the file did not give.
        return cell.v ? 'TRUE' : 'FALSE';
      case 'e':
        errorCells++;
        return null;
      case 'd':
        return String(cell.w ?? cell.v);
      default:
        return String(cell.v);
    }
  };

  const grid: RawCell[][] = [];
  const sheetRows: number[] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: RawCell[] = [];
    let any = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const value = readCell(r, c);
      if (value !== null && !(typeof value === 'string' && value.trim() === '')) any = true;
      row.push(value);
    }
    // Skip completely empty rows
    if (any) { grid.push(row); sheetRows.push(r + 1); }
  }

  if (grid.length === 0) return 'Sheet is empty';

  // The sheet's declared range often runs past the data. Drop the columns
  // nothing is in, so they do not become empty "Column N" variables.
  let width = 0;
  for (const row of grid) {
    for (let c = row.length - 1; c >= width; c--) {
      const value = row[c];
      if (value !== null && !(typeof value === 'string' && value.trim() === '')) { width = c + 1; break; }
    }
  }
  for (const row of grid) row.length = width;

  const headerIndex = locateHeaderRow(grid);
  const cellText = (cell: RawCell): string =>
    cell === null ? '' : typeof cell === 'object' ? cell.text : String(cell).trim();

  if (headerIndex > 0) {
    const title = cellText(grid[0].find(cell => cell !== null) ?? null);
    warnings.push({
      level: 'info',
      message: `${headerIndex === 1 ? 'The first row was' : `The first ${headerIndex} rows were`} treated as a title, not as data ("${title.slice(0, 60)}"). Column names were read from row ${sheetRows[headerIndex]}.`,
    });
  }

  const headers = grid[headerIndex].map(cellText);
  if (headers.every(h => !h)) return 'No column headers found';

  if (errorCells > 0) {
    warnings.push({
      level: 'check',
      message: `${errorCells.toLocaleString('en-US')} ${errorCells === 1 ? 'cell holds' : 'cells hold'} a spreadsheet error such as #N/A or #DIV/0! and ${errorCells === 1 ? 'was' : 'were'} imported as empty.`,
    });
  }

  // Add info about other sheets if multiple
  if (workbook.SheetNames.length > 1) {
    warnings.push({
      level: 'info',
      message: `Imported sheet "${sheetName}". Workbook has ${workbook.SheetNames.length} sheets total.`,
    });
  }

  return {
    headers,
    rows: grid.slice(headerIndex + 1),
    rowNumbers: sheetRows.slice(headerIndex + 1),
    warnings,
  };
}

/**
 * Parse an Excel file (.xlsx, .xls) and return structured data
 */
export async function parseExcel(buffer: ArrayBuffer, options: ExcelParseOptions = {}): Promise<ParseResult> {
  try {
    const table = await extractExcelTable(buffer, options);
    if (typeof table === 'string') return emptyResult(table);
    return buildDataset(table, options);
  } catch (e) {
    return emptyResult(`Failed to parse Excel file: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
}

/**
 * Get list of sheet names from an Excel file
 */
export async function getSheetNames(buffer: ArrayBuffer): Promise<string[]> {
  try {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'array', bookSheets: true });
    return workbook.SheetNames;
  } catch {
    return [];
  }
}
