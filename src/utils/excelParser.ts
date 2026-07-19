/**
 * Excel file parsing utility using xlsx (SheetJS)
 */
import type { DataColumn, CaseRecord } from '../types/analysis';
import type { ParseResult } from './csvParser';
import { matchingDateFormats, resolveUnambiguousFormat, parseDateWithFormat } from './dateDetection';
import type { DateFormat } from './dateDetection';

export interface ExcelParseOptions {
  sheetIndex?: number; // Default: 0 (first sheet)
  sheetName?: string; // Override sheet by name
}

/**
 * Parse an Excel file (.xlsx, .xls) and return structured data
 */
export async function parseExcel(buffer: ArrayBuffer, options: ExcelParseOptions = {}): Promise<ParseResult> {
  const errors: string[] = [];

  try {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

    // Get sheet to parse
    const sheetName = options.sheetName || workbook.SheetNames[options.sheetIndex || 0];
    if (!sheetName) {
      return { columns: [], records: [], errors: ['No sheets found in workbook'] };
    }

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return { columns: [], records: [], errors: [`Sheet "${sheetName}" not found`] };
    }

    // Convert to JSON with header row (returns array of arrays)
    const jsonData = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1, // Use first row as headers
      defval: '', // Default value for empty cells
      raw: true, // Keep native types (numbers stay numeric, dates stay Dates)
    });

    if (jsonData.length === 0) {
      return { columns: [], records: [], errors: ['Sheet is empty'] };
    }

    // First row is headers
    const headerRow = jsonData[0];
    if (!headerRow || !Array.isArray(headerRow)) {
      return { columns: [], records: [], errors: ['No column headers found'] };
    }
    const headers = headerRow.map(h => String(h ?? '').trim());
    if (headers.length === 0 || headers.every(h => !h)) {
      return { columns: [], records: [], errors: ['No column headers found'] };
    }

    // Infer column types from sample data
    const sampleRows = jsonData.slice(1, Math.min(11, jsonData.length));
    const columnKeys = buildColumnKeys(headers);
    const columns: DataColumn[] = headers.map((header, index) => {
      const sampleValues = sampleRows
        .map(row => Array.isArray(row) ? row[index] : undefined)
        .filter(v => v !== undefined && v !== null && v !== '');

      return {
        key: columnKeys[index],
        label: header || `Column ${index + 1}`,
        type: inferColumnType(sampleValues),
      };
    });

    // Pick a normalization format for unambiguous date columns (string values
    // only; real date cells arrive as Date objects and are converted in
    // parseValue). Ambiguous columns keep raw values for the import wizard.
    const dateNormalization = new Map<string, DateFormat>();
    columns.forEach((col, index) => {
      if (col.type !== 'date') return;
      const stringSamples = sampleRows
        .map(row => Array.isArray(row) ? row[index] : undefined)
        .filter((v): v is string => typeof v === 'string' && v.trim() !== '');
      const resolved = resolveUnambiguousFormat(matchingDateFormats(stringSamples));
      if (resolved) dateNormalization.set(col.key, resolved);
    });

    // Parse data rows
    const records: CaseRecord[] = [];
    let unparseableNumberCount = 0;
    const unparseableNumberExamples: string[] = [];
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];

      // Skip completely empty rows
      if (!row || !Array.isArray(row) || row.every(cell => cell === '' || cell === null || cell === undefined)) {
        continue;
      }

      const record: CaseRecord = { id: crypto.randomUUID() };
      columns.forEach((col, index) => {
        const rawValue = row[index];

        if (col.type === 'number' && rawValue !== '' && rawValue !== null && rawValue !== undefined) {
          // Values that fail numeric parsing become empty instead of silent NaN
          const num = typeof rawValue === 'number' ? rawValue : Number(rawValue);
          if (isNaN(num)) {
            unparseableNumberCount++;
            if (unparseableNumberExamples.length < 3) {
              unparseableNumberExamples.push(`row ${i + 1} ("${String(rawValue)}")`);
            }
            record[col.key] = null;
          } else {
            record[col.key] = num;
          }
          return;
        }

        if (col.type === 'date' && typeof rawValue === 'string' && rawValue.trim() !== '') {
          const format = dateNormalization.get(col.key);
          // Skip values with time components so times are not silently dropped
          if (format && !/[T:]/.test(rawValue)) {
            record[col.key] = parseDateWithFormat(rawValue, format) ?? rawValue;
            return;
          }
        }

        record[col.key] = parseValue(rawValue, col.type);
      });

      records.push(record);
    }

    if (unparseableNumberCount > 0) {
      errors.push(
        `${unparseableNumberCount} numeric value${unparseableNumberCount === 1 ? '' : 's'} could not be parsed and ${unparseableNumberCount === 1 ? 'was' : 'were'} set to empty (${unparseableNumberExamples.join('; ')}${unparseableNumberCount > unparseableNumberExamples.length ? '; …' : ''})`
      );
    }

    // Add info about other sheets if multiple
    if (workbook.SheetNames.length > 1) {
      errors.push(`Note: Imported sheet "${sheetName}". Workbook has ${workbook.SheetNames.length} sheets total.`);
    }

    return { columns, records, errors };
  } catch (e) {
    return {
      columns: [],
      records: [],
      errors: [`Failed to parse Excel file: ${e instanceof Error ? e.message : 'Unknown error'}`]
    };
  }
}

/**
 * Get list of sheet names from an Excel file
 */
export async function getSheetNames(buffer: ArrayBuffer): Promise<string[]> {
  try {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'array' });
    return workbook.SheetNames;
  } catch {
    return [];
  }
}

function sanitizeColumnKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'column';
}

/**
 * Build unique, collision-free column keys. 'id' is reserved for record UUIDs,
 * duplicate keys get numeric suffixes, and empty headers get a fallback key.
 */
function buildColumnKeys(headers: string[]): string[] {
  const used = new Set<string>();
  return headers.map((header, index) => {
    let base = (header ? sanitizeColumnKey(header) : '') || `column_${index + 1}`;
    if (base === 'id') base = 'id_';
    let key = base;
    let suffix = 2;
    while (used.has(key)) {
      key = `${base}_${suffix}`;
      suffix++;
    }
    used.add(key);
    return key;
  });
}

function inferColumnType(values: unknown[]): DataColumn['type'] {
  if (values.length === 0) return 'text';

  // Check for numbers
  const isNumber = values.every(v => {
    if (typeof v === 'number') return true;
    if (typeof v === 'string') {
      const num = Number(v);
      return !isNaN(num) && v.trim() !== '';
    }
    return false;
  });
  if (isNumber) return 'number';

  // Check for dates (Excel date cells arrive as Date objects with cellDates;
  // string dates use the shared format validators to avoid Date.parse's US bias)
  const isDate = values.every(v => {
    if (v instanceof Date) return true;
    if (typeof v === 'string') {
      return v.trim() !== '' && matchingDateFormats([v.trim()]).length > 0;
    }
    return false;
  });
  if (isDate) return 'date';

  // Check for booleans
  const isBoolean = values.every(v => {
    if (typeof v === 'boolean') return true;
    if (typeof v === 'string') {
      return ['true', 'false', 'yes', 'no', '1', '0'].includes(v.toLowerCase());
    }
    return false;
  });
  if (isBoolean) return 'boolean';

  return 'text';
}

/**
 * Format a Date as an ISO yyyy-mm-dd string using local components
 * (avoids the UTC shift of toISOString).
 */
function formatLocalDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseValue(value: unknown, type: DataColumn['type']): unknown {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  switch (type) {
    case 'number': {
      if (typeof value === 'number') return value;
      const num = Number(value);
      return isNaN(num) ? null : num;
    }
    case 'date':
      if (value instanceof Date) {
        return formatLocalDate(value); // Return as YYYY-MM-DD string
      }
      return String(value);
    case 'boolean':
      if (typeof value === 'boolean') return value;
      return ['true', 'yes', '1'].includes(String(value).toLowerCase());
    default:
      return String(value);
  }
}
