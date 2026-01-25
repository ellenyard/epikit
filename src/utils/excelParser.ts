/**
 * Excel file parsing utility using xlsx (SheetJS)
 */
import * as XLSX from 'xlsx';
import type { DataColumn, CaseRecord } from '../types/analysis';
import type { ParseResult } from './csvParser';

export interface ExcelParseOptions {
  sheetIndex?: number; // Default: 0 (first sheet)
  sheetName?: string; // Override sheet by name
}

/**
 * Parse an Excel file (.xlsx, .xls) and return structured data
 */
export function parseExcel(buffer: ArrayBuffer, options: ExcelParseOptions = {}): ParseResult {
  const errors: string[] = [];

  try {
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
      raw: false, // Get formatted strings
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
    const columns: DataColumn[] = headers.map((header, index) => {
      const sampleValues = sampleRows
        .map(row => Array.isArray(row) ? row[index] : undefined)
        .filter(v => v !== undefined && v !== null && v !== '');

      return {
        key: sanitizeColumnKey(header || `column_${index}`),
        label: header || `Column ${index + 1}`,
        type: inferColumnType(sampleValues),
      };
    });

    // Parse data rows
    const records: CaseRecord[] = [];
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];

      // Skip completely empty rows
      if (!row || !Array.isArray(row) || row.every(cell => cell === '' || cell === null || cell === undefined)) {
        continue;
      }

      const record: CaseRecord = { id: crypto.randomUUID() };
      columns.forEach((col, index) => {
        const rawValue = row[index];
        record[col.key] = parseValue(rawValue, col.type);
      });

      records.push(record);
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
export function getSheetNames(buffer: ArrayBuffer): string[] {
  try {
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

  // Check for dates (Excel often converts dates to Date objects or serial numbers)
  const isDate = values.every(v => {
    if (v instanceof Date) return true;
    if (typeof v === 'string') {
      // Check for date patterns
      const datePattern = /^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/;
      if (datePattern.test(v)) {
        return !isNaN(Date.parse(v));
      }
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

function parseValue(value: unknown, type: DataColumn['type']): unknown {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  switch (type) {
    case 'number':
      if (typeof value === 'number') return value;
      return Number(value);
    case 'date':
      if (value instanceof Date) {
        return value.toISOString().split('T')[0]; // Return as YYYY-MM-DD string
      }
      return String(value);
    case 'boolean':
      if (typeof value === 'boolean') return value;
      return ['true', 'yes', '1'].includes(String(value).toLowerCase());
    default:
      return String(value);
  }
}
