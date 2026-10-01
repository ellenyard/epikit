import type { DataColumn, CaseRecord } from '../types/analysis';
import { formatCsvNumber } from './localeNumbers';
import type { LocaleConfig } from '../contexts/LocaleContext';
import { buildDataset, emptyResult, locateHeaderRow } from './tableImport';
import type { BuildOptions, ImportWarning, ParseResult, RawTable } from './tableImport';

export type { ParseResult } from './tableImport';

export interface CSVParseOptions extends BuildOptions {
  delimiter?: string; // Auto-detect if not provided
  /**
   * No longer consulted when reading numbers: the decimal mark is worked out
   * from the file (see localeNumbers.ts). Still accepted so callers need not
   * change.
   */
  localeConfig?: LocaleConfig;
}

const DELIMITERS = [',', ';', '\t', '|'];

/**
 * Detect the delimiter used in a CSV file.
 *
 * Reads the first lines rather than the header alone. A header such as
 * "id;Nom, prénom;âge" holds as many commas as semicolons, and a title line
 * above the header may hold neither; the delimiter is the one that splits the
 * most lines into the same number of fields.
 */
export function detectDelimiter(sample: string): string {
  const lines = sample.split(/\r\n|\n|\r/).filter(line => line.trim()).slice(0, 10);
  if (lines.length === 0) return ',';

  let best = { delimiter: ',', agreeing: 0, count: 0 };
  for (const delimiter of DELIMITERS) {
    const counts = lines.map(line => countDelimiterOccurrences(line, delimiter));
    const tally = new Map<number, number>();
    for (const count of counts) if (count > 0) tally.set(count, (tally.get(count) ?? 0) + 1);
    for (const [count, agreeing] of tally) {
      if (agreeing > best.agreeing || (agreeing === best.agreeing && count > best.count)) {
        best = { delimiter, agreeing, count };
      }
    }
  }
  return best.delimiter;
}

function countDelimiterOccurrences(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && nextChar === '"') {
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && char === delimiter) {
      count++;
    }
  }

  return count;
}

function hasCommonDelimiterHint(line: string): boolean {
  return [',', ';', '\t'].some(delim => countDelimiterOccurrences(line, delim) > 0);
}

interface CsvRow {
  fields: string[];
  /** Line of the file the row starts on. */
  line: number;
}

/**
 * Split CSV text into rows of fields.
 *
 * A quotation mark opens a quoted field only at the start of a field, as in
 * RFC 4180. Anywhere else it is an ordinary character. Treating every quote
 * as a toggle meant one inch mark in a free-text cell (height 5" approx)
 * opened a quoted field that ran to the end of the file: every later row was
 * folded into that cell and the import reported no error.
 *
 * A quoted field that is never closed is handled the same way: the quote is
 * taken as a literal character and parsing resumes from it, with a warning.
 */
function tokenize(content: string, delimiter: string, warnings: ImportWarning[]): CsvRow[] {
  const rows: CsvRow[] = [];
  const length = content.length;
  let fields: string[] = [];
  let field = '';
  let line = 1;
  let rowLine = 1;
  let i = 0;
  // Positions of quotes already found to be unmatched, to be read literally.
  const literalQuotes = new Set<number>();
  const unmatched: number[] = [];

  const endField = () => { fields.push(field.trim()); field = ''; };
  const endRow = () => {
    endField();
    rows.push({ fields, line: rowLine });
    fields = [];
  };

  while (i < length) {
    const char = content[i];

    if (char === '"' && field.trim() === '' && !literalQuotes.has(i)) {
      // Quoted field. Read to the closing quote; "" inside is one quote.
      const start = i;
      const startLine = line;
      let value = '';
      let closed = false;
      i++;
      while (i < length) {
        const c = content[i];
        if (c === '"') {
          if (content[i + 1] === '"') { value += '"'; i += 2; continue; }
          closed = true;
          i++;
          break;
        }
        if (c === '\n' || (c === '\r' && content[i + 1] !== '\n')) line++;
        value += c;
        i++;
      }
      if (!closed) {
        // Never closed: go back and read the quote as a literal character.
        literalQuotes.add(start);
        unmatched.push(startLine);
        line = startLine;
        i = start;
        continue;
      }
      field = value;
      continue;
    }

    if (char === delimiter) {
      endField();
      i++;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && content[i + 1] === '\n') i++;
      endRow();
      line++;
      rowLine = line;
      i++;
    } else {
      field += char;
      i++;
    }
  }
  if (field !== '' || fields.length > 0) endRow();

  if (unmatched.length > 0) {
    warnings.push({
      level: 'check',
      message: `${unmatched.length === 1 ? 'A quotation mark' : `${unmatched.length} quotation marks`} at the start of a value had no closing mark (line ${unmatched.slice(0, 5).join(', ')}). ${unmatched.length === 1 ? 'It was' : 'They were'} kept as part of the text; check ${unmatched.length === 1 ? 'that row' : 'those rows'}.`,
    });
  }

  return rows;
}

/**
 * Read CSV or tab-separated text into a grid: header, rows, and notes about
 * how the text was read. Typing the columns is left to buildDataset.
 */
export function extractCSVTable(content: string, options: { delimiter?: string } = {}): RawTable | null {
  const warnings: ImportWarning[] = [];
  let text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

  // Excel's "sep=;" first line names the delimiter and is not data.
  let declared: string | undefined;
  const sep = /^sep=(.)\r?\n/i.exec(text);
  let lineOffset = 0;
  if (sep) {
    declared = sep[1];
    text = text.slice(sep[0].length);
    lineOffset = 1;
  }

  if (!text.trim()) return null;

  const delimiter = options.delimiter || declared || detectDelimiter(text);
  const rows = tokenize(text, delimiter, warnings)
    .filter(row => row.fields.some(f => f !== ''));
  if (rows.length === 0) return null;

  const headerIndex = locateHeaderRow(rows.map(row => row.fields));
  if (headerIndex > 0) {
    const skipped = rows.slice(0, headerIndex).map(row => row.fields.find(f => f !== '') ?? '');
    warnings.push({
      level: 'info',
      message: `${headerIndex === 1 ? 'The first line was' : `The first ${headerIndex} lines were`} treated as a title, not as data ("${skipped[0].slice(0, 60)}"). Column names were read from line ${rows[headerIndex].line + lineOffset}.`,
    });
  }

  const headers = rows[headerIndex].fields;
  const dataRows = rows.slice(headerIndex + 1);

  if (headers.length === 1 && hasCommonDelimiterHint(headers[0])) {
    warnings.push({
      level: 'check',
      message: 'Only one column was detected, but the header contains common CSV delimiters. Check that the file delimiter is correct before importing.',
    });
  }

  // A trailing delimiter leaves one empty field at the end of every row; it is
  // not a column.
  const usedWidth = (fields: string[]) => {
    let n = fields.length;
    while (n > 0 && fields[n - 1] === '') n--;
    return n;
  };
  const headerWidth = Math.max(usedWidth(headers), 1);
  const short: number[] = [];
  let widest = headerWidth;
  for (const row of dataRows) {
    const used = usedWidth(row.fields);
    if (used > widest) widest = used;
    if (row.fields.length < headerWidth) short.push(row.line + lineOffset);
  }

  if (short.length > 0) {
    warnings.push({
      level: 'check',
      message: `${short.length === 1 ? '1 row has' : `${short.length.toLocaleString('en-US')} rows have`} fewer values than there are columns; the missing cells were left empty (line ${short.slice(0, 5).join(', ')}${short.length > 5 ? ', …' : ''}).`,
    });
  }
  if (widest > headerWidth) {
    warnings.push({
      level: 'check',
      message: `Some rows have more values than the header has names. The extra ${widest - headerWidth === 1 ? 'column was' : 'columns were'} kept and named "Column ${headerWidth + 1}"${widest - headerWidth > 1 ? ` to "Column ${widest}"` : ''}.`,
    });
  }

  return {
    headers: headers.slice(0, widest),
    rows: dataRows.map(row => {
      const cells: (string | null)[] = [];
      for (let c = 0; c < widest; c++) cells.push(c < row.fields.length && row.fields[c] !== '' ? row.fields[c] : null);
      return cells;
    }),
    rowNumbers: dataRows.map(row => row.line + lineOffset),
    warnings,
    delimiter,
  };
}

export function parseCSV(content: string, options: CSVParseOptions = {}): ParseResult {
  const table = extractCSVTable(content, options);
  if (!table) return emptyResult('File is empty');
  return buildDataset(table, options);
}

export interface CSVExportOptions {
  delimiter?: string; // Default: ','
  localeConfig?: LocaleConfig; // For locale-specific delimiter
  bom?: boolean; // Default: true
}

/**
 * Export data to CSV format
 * IMPORTANT: Numbers always use period (.) as decimal separator for R compatibility
 * regardless of locale. The delimiter (comma or semicolon) is locale-specific.
 *
 * The text starts with a byte-order mark. Without one, Excel on Windows reads
 * the file in the system code page and every accented name comes out garbled
 * (José as JosÃ©). R (readr, data.table, rio), Stata and pandas all skip it.
 */
export function exportToCSV(
  columns: DataColumn[],
  records: CaseRecord[],
  options: CSVExportOptions = {}
): string {
  // Use locale-specific delimiter if provided, otherwise comma
  const delimiter = options.localeConfig?.csvDelimiter || options.delimiter || ',';

  const header = columns.map(col => escapeCSVValue(col.label, delimiter)).join(delimiter);

  const rows = records.map(record => {
    return columns.map(col => {
      const value = record[col.key];

      // For numbers, always use period decimal (R compatibility)
      if (col.type === 'number' && typeof value === 'number') {
        return formatCsvNumber(value);
      }

      // Datasets saved before imports kept Yes/No as text hold true/false.
      // Write them the way the line list shows them.
      if (typeof value === 'boolean') {
        return value ? 'Yes' : 'No';
      }

      return escapeCSVValue(String(value ?? ''), delimiter);
    }).join(delimiter);
  });

  return (options.bom === false ? '' : '\ufeff') + [header, ...rows].join('\n');
}

function escapeCSVValue(value: string, delimiter: string = ','): string {
  if (value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
