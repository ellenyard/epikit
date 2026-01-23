import type { DataColumn, CaseRecord } from '../types/analysis';
import { parseFlexibleNumber, formatCsvNumber } from './localeNumbers';
import type { LocaleConfig } from '../contexts/LocaleContext';

export interface ParseResult {
  columns: DataColumn[];
  records: CaseRecord[];
  errors: string[];
}

export interface CSVParseOptions {
  delimiter?: string; // Auto-detect if not provided
  localeConfig?: LocaleConfig; // For parsing locale-specific numbers
}

/**
 * Detect the delimiter used in a CSV file by analyzing the header row
 */
function detectDelimiter(headerLine: string): string {
  const possibleDelimiters = [',', ';', '\t', '|'];
  const counts = possibleDelimiters.map(delim => ({
    delimiter: delim,
    count: (headerLine.match(new RegExp(delim, 'g')) || []).length
  }));

  // Return the delimiter with the most occurrences
  const best = counts.reduce((a, b) => (b.count > a.count ? b : a));
  return best.count > 0 ? best.delimiter : ',';
}

export function parseCSV(content: string, options: CSVParseOptions = {}): ParseResult {
  const errors: string[] = [];
  const lines = content.split(/\r?\n/).filter(line => line.trim());

  if (lines.length === 0) {
    return { columns: [], records: [], errors: ['File is empty'] };
  }

  // Auto-detect or use provided delimiter
  const delimiter = options.delimiter || detectDelimiter(lines[0]);

  // Parse header row
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine, delimiter);

  if (headers.length === 0) {
    return { columns: [], records: [], errors: ['No columns found in header'] };
  }

  // Infer column types from first few data rows
  const sampleRows = lines.slice(1, Math.min(11, lines.length)).map(line => parseCSVLine(line, delimiter));
  const columns: DataColumn[] = headers.map((header, index) => {
    const sampleValues = sampleRows.map(row => row[index]).filter(v => v !== undefined && v !== '');
    const inferredType = inferColumnType(sampleValues, options.localeConfig);

    return {
      key: sanitizeColumnKey(header),
      label: header.trim(),
      type: inferredType,
    };
  });

  // Parse data rows
  const records: CaseRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], delimiter);

    if (values.length !== headers.length) {
      errors.push(`Row ${i + 1}: Expected ${headers.length} columns, found ${values.length}`);
      continue;
    }

    const record: CaseRecord = { id: crypto.randomUUID() };
    columns.forEach((col, index) => {
      const rawValue = values[index];
      record[col.key] = parseValue(rawValue, col.type, options.localeConfig);
    });

    records.push(record);
  }

  return { columns, records, errors };
}

function parseCSVLine(line: string, delimiter: string = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }

  result.push(current.trim());
  return result;
}

function sanitizeColumnKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function inferColumnType(values: string[], localeConfig?: LocaleConfig): DataColumn['type'] {
  if (values.length === 0) return 'text';

  // Try locale-aware number parsing if config is provided
  if (localeConfig) {
    const isNumber = values.every(v => {
      const parsed = parseFlexibleNumber(v, localeConfig);
      return !isNaN(parsed) && v !== '';
    });
    if (isNumber) return 'number';
  } else {
    // Fallback to standard parsing
    const isNumber = values.every(v => !isNaN(Number(v)) && v !== '');
    if (isNumber) return 'number';
  }

  // Check for date patterns - must contain date separators and have valid structure
  // Accepts formats like: YYYY-MM-DD, DD/MM/YYYY, MM-DD-YYYY, YYYY/MM/DD, etc.
  // Also accepts ISO 8601 formats with time components
  const datePattern = /^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}|^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}T\d{2}:\d{2}/;
  const isDate = values.every(v => {
    // Must match a date pattern AND be parseable as a valid date
    if (!datePattern.test(v)) return false;
    const parsed = Date.parse(v);
    return !isNaN(parsed);
  });
  if (isDate) return 'date';

  const isBoolean = values.every(v =>
    ['true', 'false', 'yes', 'no', '1', '0'].includes(v.toLowerCase())
  );
  if (isBoolean) return 'boolean';

  return 'text';
}

function parseValue(value: string, type: DataColumn['type'], localeConfig?: LocaleConfig): unknown {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  switch (type) {
    case 'number':
      if (localeConfig) {
        return parseFlexibleNumber(value, localeConfig);
      }
      return Number(value);
    case 'date':
      return value; // Keep as string for display, parse when needed
    case 'boolean':
      return ['true', 'yes', '1'].includes(value.toLowerCase());
    default:
      return value;
  }
}

export interface CSVExportOptions {
  delimiter?: string; // Default: ','
  localeConfig?: LocaleConfig; // For locale-specific delimiter
}

/**
 * Export data to CSV format
 * IMPORTANT: Numbers always use period (.) as decimal separator for R compatibility
 * regardless of locale. The delimiter (comma or semicolon) is locale-specific.
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

      return escapeCSVValue(String(value ?? ''), delimiter);
    }).join(delimiter);
  });

  return [header, ...rows].join('\n');
}

function escapeCSVValue(value: string, delimiter: string = ','): string {
  if (value.includes(delimiter) || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
