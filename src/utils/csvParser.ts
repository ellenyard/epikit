import type { DataColumn, CaseRecord } from '../types/analysis';

export interface ParseResult {
  columns: DataColumn[];
  records: CaseRecord[];
  errors: string[];
}

export function parseCSV(content: string): ParseResult {
  const errors: string[] = [];
  const lines = content.split(/\r?\n/).filter(line => line.trim());

  if (lines.length === 0) {
    return { columns: [], records: [], errors: ['File is empty'] };
  }

  // Parse header row
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);

  if (headers.length === 0) {
    return { columns: [], records: [], errors: ['No columns found in header'] };
  }

  // Infer column types from first few data rows
  const sampleRows = lines.slice(1, Math.min(11, lines.length)).map(parseCSVLine);
  const columns: DataColumn[] = headers.map((header, index) => {
    const sampleValues = sampleRows.map(row => row[index]).filter(v => v !== undefined && v !== '');
    const inferredType = inferColumnType(sampleValues);

    return {
      key: sanitizeColumnKey(header),
      label: header.trim(),
      type: inferredType,
    };
  });

  // Parse data rows
  const records: CaseRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);

    if (values.length !== headers.length) {
      errors.push(`Row ${i + 1}: Expected ${headers.length} columns, found ${values.length}`);
      continue;
    }

    const record: CaseRecord = { id: crypto.randomUUID() };
    columns.forEach((col, index) => {
      const rawValue = values[index];
      record[col.key] = parseValue(rawValue, col.type);
    });

    records.push(record);
  }

  return { columns, records, errors };
}

function parseCSVLine(line: string): string[] {
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
      } else if (char === ',') {
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

function inferColumnType(values: string[]): DataColumn['type'] {
  if (values.length === 0) return 'text';

  const isNumber = values.every(v => !isNaN(Number(v)) && v !== '');
  if (isNumber) return 'number';

  const isDate = values.every(v => !isNaN(Date.parse(v)));
  if (isDate) return 'date';

  const isBoolean = values.every(v =>
    ['true', 'false', 'yes', 'no', '1', '0'].includes(v.toLowerCase())
  );
  if (isBoolean) return 'boolean';

  return 'text';
}

function parseValue(value: string, type: DataColumn['type']): unknown {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  switch (type) {
    case 'number':
      return Number(value);
    case 'date':
      return value; // Keep as string for display, parse when needed
    case 'boolean':
      return ['true', 'yes', '1'].includes(value.toLowerCase());
    default:
      return value;
  }
}

export function exportToCSV(columns: DataColumn[], records: CaseRecord[]): string {
  const header = columns.map(col => escapeCSVValue(col.label)).join(',');

  const rows = records.map(record => {
    return columns.map(col => escapeCSVValue(String(record[col.key] ?? ''))).join(',');
  });

  return [header, ...rows].join('\n');
}

function escapeCSVValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
