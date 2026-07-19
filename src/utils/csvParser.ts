import type { DataColumn, CaseRecord } from '../types/analysis';
import { parseFlexibleNumber, formatCsvNumber } from './localeNumbers';
import type { LocaleConfig } from '../contexts/LocaleContext';
import { matchingDateFormats, resolveUnambiguousFormat, parseDateWithFormat } from './dateDetection';
import type { DateFormat } from './dateDetection';

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
export function detectDelimiter(headerLine: string): string {
  const possibleDelimiters = [',', ';', '\t', '|'];
  const counts = possibleDelimiters.map(delim => ({
    delimiter: delim,
    count: countDelimiterOccurrences(headerLine, delim)
  }));

  // Return the delimiter with the most occurrences
  const best = counts.reduce((a, b) => (b.count > a.count ? b : a));
  return best.count > 0 ? best.delimiter : ',';
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

/**
 * Split CSV text into records, honoring quoted fields that may contain line
 * breaks. Handles \r\n, lone \r, and lone \n line endings.
 */
function splitCSVRecords(content: string): string[] {
  const records: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (char === '"') {
      if (inQuotes && content[i + 1] === '"') {
        current += '""';
        i++; // Escaped quote inside a quoted field
      } else {
        inQuotes = !inQuotes;
        current += char;
      }
    } else if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && content[i + 1] === '\n') i++;
      records.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  records.push(current);
  return records;
}

export function parseCSV(content: string, options: CSVParseOptions = {}): ParseResult {
  const errors: string[] = [];
  const lines = splitCSVRecords(content).filter(line => line.trim());

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

  if (headers.length === 1 && hasCommonDelimiterHint(headerLine)) {
    errors.push(
      'Only one column was detected, but the header contains common CSV delimiters. Check that the file delimiter is correct before importing.'
    );
  }

  // Infer column types from first few data rows
  const sampleRows = lines.slice(1, Math.min(11, lines.length)).map(line => parseCSVLine(line, delimiter));
  const columnKeys = buildColumnKeys(headers);
  const columns: DataColumn[] = headers.map((header, index) => {
    const sampleValues = sampleRows.map(row => row[index]).filter(v => v !== undefined && v !== '');
    const inferredType = inferColumnType(sampleValues, options.localeConfig);

    return {
      key: columnKeys[index],
      label: header.trim(),
      type: inferredType,
    };
  });

  // Pick a normalization format for unambiguous date columns so dates are
  // stored as ISO strings. Ambiguous columns keep raw values; the import
  // wizard lets the user pick the interpretation.
  const dateNormalization = new Map<string, DateFormat>();
  columns.forEach((col, index) => {
    if (col.type !== 'date') return;
    const sampleValues = sampleRows.map(row => row[index]).filter(v => v !== undefined && v !== '');
    const resolved = resolveUnambiguousFormat(matchingDateFormats(sampleValues));
    if (resolved) dateNormalization.set(col.key, resolved);
  });

  // Parse data rows
  const records: CaseRecord[] = [];
  let unparseableNumberCount = 0;
  const unparseableNumberExamples: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], delimiter);

    if (values.length !== headers.length) {
      errors.push(`Row ${i + 1}: Expected ${headers.length} columns, found ${values.length}`);
      continue;
    }

    const record: CaseRecord = { id: crypto.randomUUID() };
    columns.forEach((col, index) => {
      const rawValue = values[index];

      if (col.type === 'number' && rawValue !== '') {
        // Values that fail numeric parsing become empty instead of silent NaN
        const num = options.localeConfig
          ? parseFlexibleNumber(rawValue, options.localeConfig)
          : Number(rawValue);
        if (isNaN(num)) {
          unparseableNumberCount++;
          if (unparseableNumberExamples.length < 3) {
            unparseableNumberExamples.push(`row ${i + 1} ("${rawValue}")`);
          }
          record[col.key] = null;
        } else {
          record[col.key] = num;
        }
        return;
      }

      if (col.type === 'date' && rawValue !== '') {
        const format = dateNormalization.get(col.key);
        // Skip values with time components so times are not silently dropped
        if (format && !/[T:]/.test(rawValue)) {
          record[col.key] = parseDateWithFormat(rawValue, format) ?? rawValue;
        } else {
          record[col.key] = rawValue;
        }
        return;
      }

      record[col.key] = parseValue(rawValue, col.type, options.localeConfig);
    });

    records.push(record);
  }

  if (unparseableNumberCount > 0) {
    errors.push(
      `${unparseableNumberCount} numeric value${unparseableNumberCount === 1 ? '' : 's'} could not be parsed and ${unparseableNumberCount === 1 ? 'was' : 'were'} set to empty (${unparseableNumberExamples.join('; ')}${unparseableNumberCount > unparseableNumberExamples.length ? '; …' : ''})`
    );
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

/**
 * Build unique, collision-free column keys. 'id' is reserved for record UUIDs,
 * duplicate keys get numeric suffixes, and empty headers get a fallback key.
 */
function buildColumnKeys(headers: string[]): string[] {
  const used = new Set<string>();
  return headers.map((header, index) => {
    let base = sanitizeColumnKey(header) || `column_${index + 1}`;
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

  // Check for date patterns using the shared date format validators.
  // This avoids Date.parse's US bias (DD/MM/YYYY with day > 12 used to be
  // mistyped as text) and accepts 2-digit years.
  if (matchingDateFormats(values).length > 0) return 'date';

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
