/**
 * Date format detection and parsing utilities
 * Helps identify ambiguous date formats and lets users confirm the correct interpretation
 */

export type DateFormat =
  | 'YYYY-MM-DD'  // ISO: 2024-01-15
  | 'MM/DD/YYYY'  // US: 01/15/2024
  | 'DD/MM/YYYY'  // International: 15/01/2024
  | 'MM-DD-YYYY'  // US with dashes: 01-15-2024
  | 'DD-MM-YYYY'  // International with dashes: 15-01-2024
  | 'YYYY/MM/DD'  // ISO with slashes: 2024/01/15
  | 'M/D/YYYY'    // US short: 1/15/2024
  | 'D/M/YYYY';   // International short: 15/1/2024

export interface DateFormatInfo {
  format: DateFormat;
  label: string;
  example: string;
  region: string;
}

export const DATE_FORMATS: DateFormatInfo[] = [
  { format: 'YYYY-MM-DD', label: 'ISO Standard', example: '2024-01-15', region: 'International' },
  { format: 'MM/DD/YYYY', label: 'US Format', example: '01/15/2024', region: 'United States' },
  { format: 'DD/MM/YYYY', label: 'International', example: '15/01/2024', region: 'Europe, Asia, Africa' },
  { format: 'MM-DD-YYYY', label: 'US with Dashes', example: '01-15-2024', region: 'United States' },
  { format: 'DD-MM-YYYY', label: 'International with Dashes', example: '15-01-2024', region: 'Europe, Asia' },
  { format: 'YYYY/MM/DD', label: 'ISO with Slashes', example: '2024/01/15', region: 'Japan, China' },
];

export interface DateColumnAnalysis {
  columnKey: string;
  columnLabel: string;
  sampleValues: string[];
  detectedFormat: DateFormat | null;
  possibleFormats: DateFormat[];
  isAmbiguous: boolean;
  parsedPreviews: { format: DateFormat; parsed: string }[];
}

export interface DateDetectionResult {
  columns: DateColumnAnalysis[];
  hasAmbiguousDates: boolean;
}

/**
 * Analyze columns to detect date formats and identify ambiguous cases
 */
export function detectDateFormats(
  data: Record<string, unknown>[],
  columns: { key: string; label: string; type: string }[]
): DateDetectionResult {
  const dateColumns = columns.filter(col =>
    col.type === 'date' || col.key.toLowerCase().includes('date')
  );

  const analyses: DateColumnAnalysis[] = [];
  let hasAmbiguous = false;

  for (const col of dateColumns) {
    // Get sample values (non-empty, first 10)
    const sampleValues = data
      .map(row => row[col.key])
      .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
      .slice(0, 10);

    if (sampleValues.length === 0) continue;

    const analysis = analyzeColumn(col.key, col.label, sampleValues);
    analyses.push(analysis);

    if (analysis.isAmbiguous) {
      hasAmbiguous = true;
    }
  }

  return { columns: analyses, hasAmbiguousDates: hasAmbiguous };
}

function analyzeColumn(key: string, label: string, values: string[]): DateColumnAnalysis {
  const possibleFormats: DateFormat[] = [];

  // Test each format against all values
  for (const formatInfo of DATE_FORMATS) {
    const allValid = values.every(v => isValidForFormat(v, formatInfo.format));
    if (allValid) {
      possibleFormats.push(formatInfo.format);
    }
  }

  // Determine if ambiguous (specifically MM/DD vs DD/MM ambiguity)
  const hasUSFormat = possibleFormats.includes('MM/DD/YYYY') || possibleFormats.includes('MM-DD-YYYY') || possibleFormats.includes('M/D/YYYY');
  const hasIntlFormat = possibleFormats.includes('DD/MM/YYYY') || possibleFormats.includes('DD-MM-YYYY') || possibleFormats.includes('D/M/YYYY');
  const isAmbiguous = hasUSFormat && hasIntlFormat;

  // Determine best guess for format
  let detectedFormat: DateFormat | null = null;
  if (possibleFormats.length > 0) {
    // Prefer ISO format if available
    if (possibleFormats.includes('YYYY-MM-DD')) {
      detectedFormat = 'YYYY-MM-DD';
    } else if (possibleFormats.includes('YYYY/MM/DD')) {
      detectedFormat = 'YYYY/MM/DD';
    } else {
      // For ambiguous cases, we'll need user input
      // Default to first possible format but flag as ambiguous
      detectedFormat = possibleFormats[0];
    }
  }

  // Generate parsed previews for the first sample value
  const firstValue = values[0];
  const parsedPreviews = possibleFormats
    .filter(f => f.includes('DD') && f.includes('MM')) // Only show formats that could be ambiguous
    .slice(0, 3) // Limit to 3 previews
    .map(format => ({
      format,
      parsed: formatDatePreview(firstValue, format),
    }));

  return {
    columnKey: key,
    columnLabel: label,
    sampleValues: values.slice(0, 3),
    detectedFormat,
    possibleFormats,
    isAmbiguous,
    parsedPreviews,
  };
}

function isValidForFormat(value: string, format: DateFormat): boolean {
  const parts = parseToComponents(value);
  if (!parts) return false;

  const { a, b, c } = parts;

  switch (format) {
    case 'YYYY-MM-DD':
    case 'YYYY/MM/DD':
      // Year-Month-Day: first part is 4 digits, month 1-12, day 1-31
      return a.length === 4 && isValidMonth(parseInt(b)) && isValidDay(parseInt(c));

    case 'MM/DD/YYYY':
    case 'MM-DD-YYYY':
      // Month-Day-Year: month 1-12, day 1-31, year 2 or 4 digits
      return isValidMonth(parseInt(a)) && isValidDay(parseInt(b)) && isValidYearLength(c);

    case 'DD/MM/YYYY':
    case 'DD-MM-YYYY':
      // Day-Month-Year: day 1-31, month 1-12, year 2 or 4 digits
      return isValidDay(parseInt(a)) && isValidMonth(parseInt(b)) && isValidYearLength(c);

    case 'M/D/YYYY':
      // US short format
      return isValidMonth(parseInt(a)) && isValidDay(parseInt(b)) && isValidYearLength(c);

    case 'D/M/YYYY':
      // International short format
      return isValidDay(parseInt(a)) && isValidMonth(parseInt(b)) && isValidYearLength(c);

    default:
      return false;
  }
}

function parseToComponents(value: string): { a: string; b: string; c: string } | null {
  // Match patterns like: 2024-01-15, 01/15/2024, 15-01-2024, etc.
  const match = value.match(/^(\d{1,4})[-/](\d{1,2})[-/](\d{1,4})/);
  if (!match) return null;
  return { a: match[1], b: match[2], c: match[3] };
}

function isValidMonth(m: number): boolean {
  return m >= 1 && m <= 12;
}

function isValidDay(d: number): boolean {
  return d >= 1 && d <= 31;
}

function isValidYearLength(raw: string): boolean {
  return raw.length === 4 || raw.length === 2;
}

// Expand 2-digit years using Excel's pivot rule: 00-29 -> 2000s, 30-99 -> 1900s
function expandYear(year: number, raw: string): number {
  if (raw.length === 2) {
    return year <= 29 ? 2000 + year : 1900 + year;
  }
  return year;
}

// Days in a given month (month is 1-12); handles leap years
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Return all known date formats that every sample value matches.
 */
export function matchingDateFormats(values: string[]): DateFormat[] {
  if (values.length === 0) return [];
  return DATE_FORMATS
    .map(f => f.format)
    .filter(format => values.every(v => isValidForFormat(v, format)));
}

/**
 * Pick a single format when the matching formats are unambiguous
 * (ISO preferred, otherwise exactly one of US vs international ordering).
 * Returns null when there are no matches or the match is ambiguous.
 */
export function resolveUnambiguousFormat(formats: DateFormat[]): DateFormat | null {
  if (formats.includes('YYYY-MM-DD')) return 'YYYY-MM-DD';
  if (formats.includes('YYYY/MM/DD')) return 'YYYY/MM/DD';
  const us = formats.filter(f => f.startsWith('MM'));
  const intl = formats.filter(f => f.startsWith('DD'));
  if (us.length > 0 && intl.length === 0) return us[0];
  if (intl.length > 0 && us.length === 0) return intl[0];
  return null;
}

function formatDatePreview(value: string, format: DateFormat): string {
  const parts = parseToComponents(value);
  if (!parts) return 'Invalid';

  const { a, b, c } = parts;
  let year: number, month: number, day: number, yearRaw: string;

  switch (format) {
    case 'YYYY-MM-DD':
    case 'YYYY/MM/DD':
      year = parseInt(a);
      month = parseInt(b);
      day = parseInt(c);
      yearRaw = a;
      break;
    case 'MM/DD/YYYY':
    case 'MM-DD-YYYY':
    case 'M/D/YYYY':
      month = parseInt(a);
      day = parseInt(b);
      year = parseInt(c);
      yearRaw = c;
      break;
    case 'DD/MM/YYYY':
    case 'DD-MM-YYYY':
    case 'D/M/YYYY':
      day = parseInt(a);
      month = parseInt(b);
      year = parseInt(c);
      yearRaw = c;
      break;
    default:
      return 'Invalid';
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (month < 1 || month > 12) return 'Invalid';

  return `${monthNames[month - 1]} ${day}, ${expandYear(year, yearRaw)}`;
}

/**
 * Parse a date string using a specific format and return ISO date string
 */
export function parseDateWithFormat(value: string, format: DateFormat): string | null {
  const parts = parseToComponents(value);
  if (!parts) return null;

  const { a, b, c } = parts;
  let year: number, month: number, day: number;

  switch (format) {
    case 'YYYY-MM-DD':
    case 'YYYY/MM/DD':
      if (a.length !== 4) return null;
      year = parseInt(a);
      month = parseInt(b);
      day = parseInt(c);
      break;
    case 'MM/DD/YYYY':
    case 'MM-DD-YYYY':
    case 'M/D/YYYY':
      if (!isValidYearLength(c)) return null;
      month = parseInt(a);
      day = parseInt(b);
      year = expandYear(parseInt(c), c);
      break;
    case 'DD/MM/YYYY':
    case 'DD-MM-YYYY':
    case 'D/M/YYYY':
      if (!isValidYearLength(c)) return null;
      day = parseInt(a);
      month = parseInt(b);
      year = expandYear(parseInt(c), c);
      break;
    default:
      return null;
  }

  // Validate against the real calendar (month length, leap years)
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;

  // Return as ISO date string (YYYY-MM-DD)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Re-parse data with confirmed date formats.
 * Values that fail to convert are left unchanged and counted in failedCount.
 */
export function applyDateFormats(
  records: Record<string, unknown>[],
  formatMappings: { columnKey: string; format: DateFormat }[]
): { records: Record<string, unknown>[]; failedCount: number } {
  let failedCount = 0;

  const updated = records.map(record => {
    const newRecord = { ...record };

    for (const mapping of formatMappings) {
      const value = record[mapping.columnKey];
      if (typeof value === 'string' && value.trim()) {
        const parsed = parseDateWithFormat(value, mapping.format);
        if (parsed) {
          newRecord[mapping.columnKey] = parsed;
        } else {
          failedCount++;
        }
      }
    }

    return newRecord;
  });

  return { records: updated, failedCount };
}
