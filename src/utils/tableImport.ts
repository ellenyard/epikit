/**
 * Turning a grid of imported cells into a dataset.
 *
 * CSV, Excel and pasted text all arrive here as the same thing: a header row
 * and rows of cells. Typing the columns in one place is what keeps the three
 * routes from disagreeing about what a value is.
 *
 * The rules, each of which replaces a way data used to be changed silently:
 *
 *  - A column's type is decided from every row. Sampling the first ten typed
 *    a column from its tidy opening rows and then forced row 11's "Unknown"
 *    into that type: to false in a yes/no column, to empty in a numeric one.
 *  - Nothing is stored as true/false. Yes/No columns keep the words the file
 *    used, so "Unknown", "Refused" and "N/A" stay what they are.
 *  - A value that does not fit its column is never dropped. Either the column
 *    stays text, or the value is kept as written, and the import says which.
 *  - Where the file cannot say what a value means (03/04/2025, 1.234), the
 *    column is returned as a question for the user instead of a guess.
 */
import type { DataColumn, CaseRecord } from '../types/analysis';
import { analyzeNumberColumn, classifyNumber, numberFromShape } from './localeNumbers';
import type { DecimalMark, NumberReading, NumberShape } from './localeNumbers';
import { convertDateValue, summarizeDateValues, describeIsoDate } from './dateDetection';
import type { DateChoice, DateOrder, DateValuesSummary } from './dateDetection';
import { isDigitLabel, isMissingMarker, looksCategorical, looksLikeIdentifier } from './typeInference';

/** A date, date-time or time-of-day cell from a spreadsheet, already as text. */
export interface TemporalCell {
  temporal: 'date' | 'datetime' | 'time';
  text: string;
}

export type RawCell = string | number | TemporalCell | null;

/**
 * How much a warning matters, which is also the order they are shown in.
 *  - changed: a value is stored differently from how the file wrote it
 *  - check:   everything was kept, but something probably needs attention
 *  - info:    how the file was read
 */
export interface ImportWarning {
  level: 'changed' | 'check' | 'info';
  message: string;
}

export interface RawTable {
  headers: string[];
  rows: RawCell[][];
  /** The line or sheet row each row came from, for pointing at it. */
  rowNumbers: number[];
  warnings: ImportWarning[];
  /** The CSV field delimiter, which is evidence about decimal marks. */
  delimiter?: string;
}

export interface DateQuestion {
  columnKey: string;
  columnLabel: string;
  /** Values that are a different date under each order. */
  examples: string[];
  count: number;
  /** The column also holds values that are only day-first and others only month-first. */
  mixed: boolean;
  /** What the first example becomes under each order, in words. */
  previews: Record<DateOrder, string>;
  suggested: DateOrder;
  /** Where the suggestion came from: another date column in the file, or the user's setting. */
  suggestedFrom: 'sibling' | 'setting';
}

export interface NumberQuestion {
  columnKey: string;
  columnLabel: string;
  mark: DecimalMark;
  examples: string[];
  count: number;
  /** What the first example becomes under each reading. */
  previews: Record<NumberReading, number>;
  suggested: NumberReading;
}

export interface ParseResult {
  columns: DataColumn[];
  records: CaseRecord[];
  /** Warning messages, most consequential first. Kept for existing callers. */
  errors: string[];
  warnings: ImportWarning[];
  /** Columns whose meaning the file does not settle. Empty when nothing is in doubt. */
  dateQuestions: DateQuestion[];
  numberQuestions: NumberQuestion[];
}

export interface BuildOptions {
  /** Answers to dateQuestions, by column key. */
  dateChoices?: Record<string, DateChoice>;
  /** Answers to numberQuestions, by column key. */
  numberChoices?: Record<string, NumberReading>;
  /**
   * The order to suggest for an ambiguous date column when no other date
   * column in the file settles it: the user's date-format setting.
   */
  preferredDateOrder?: DateOrder;
}

const LEVEL_ORDER: Record<ImportWarning['level'], number> = { changed: 0, check: 1, info: 2 };

export function sortWarnings(warnings: ImportWarning[]): ImportWarning[] {
  return warnings
    .map((warning, index) => ({ warning, index }))
    .sort((a, b) => LEVEL_ORDER[a.warning.level] - LEVEL_ORDER[b.warning.level] || a.index - b.index)
    .map(entry => entry.warning);
}

export function emptyResult(message: string): ParseResult {
  return {
    columns: [], records: [], errors: [message],
    warnings: [{ level: 'changed', message }],
    dateQuestions: [], numberQuestions: [],
  };
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
export function buildColumnKeys(headers: string[]): string[] {
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

const isBlank = (cell: RawCell | undefined): boolean =>
  cell === null || cell === undefined || (typeof cell === 'string' && cell.trim() === '');

/**
 * Find the header row in a grid whose first rows may be a title.
 *
 * Ministry line lists routinely open with "Cholera line list - District X" in
 * the first cell and the column names a row or two below. Taking row 1 as the
 * header named the first column after the title and turned the real header
 * into a data row. The header is taken to be the first row that fills at least
 * half the width the rows below it use.
 */
export function locateHeaderRow(rows: RawCell[][]): number {
  const filled = (row: RawCell[]) => row.reduce<number>((n, cell) => n + (isBlank(cell) ? 0 : 1), 0);
  const sample = rows.slice(0, 50).map(filled).filter(n => n > 0).sort((a, b) => a - b);
  if (sample.length < 2) return 0;
  const typical = sample[Math.floor(sample.length / 2)];
  if (typical < 2) return 0;
  const needed = Math.max(2, Math.ceil(typical / 2));
  const limit = Math.min(rows.length, 15);
  for (let i = 0; i < limit; i++) {
    if (filled(rows[i]) >= needed) return i;
  }
  return 0;
}

const quote = (value: string) => `"${value.length > 40 ? `${value.slice(0, 37)}…` : value}"`;
const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** "rows 12, 13 and 40", capped so a long list stays readable. */
function rowList(rows: number[]): string {
  const shown = rows.slice(0, 5);
  const more = rows.length - shown.length;
  const text = shown.join(', ');
  return `${rows.length === 1 ? 'row' : 'rows'} ${text}${more > 0 ? ` and ${more.toLocaleString('en-US')} more` : ''}`;
}

/** Distinct examples in first-seen order, quoted. */
function exampleList(values: string[], limit = 3): string {
  return [...new Set(values)].slice(0, limit).map(quote).join(', ');
}

interface ColumnOutcome {
  type: DataColumn['type'];
  values: unknown[];
}

/**
 * Type one column from all of its cells.
 * `rowNumbers` is only used to point at rows in warnings.
 */
function buildColumn(
  key: string,
  label: string,
  cells: RawCell[],
  rowNumbers: number[],
  summary: DateValuesSummary,
  table: RawTable,
  options: BuildOptions,
  provenOrders: Set<DateOrder>,
  result: ParseResult
): ColumnOutcome {
  const warn = (level: ImportWarning['level'], message: string) =>
    result.warnings.push({ level, message });

  // What each cell is, decided once.
  const text: (string | null)[] = new Array(cells.length);
  const shapes: (NumberShape | null)[] = new Array(cells.length).fill(null);
  let filled = 0, numeric = 0, markers = 0, labels = 0, temporalDates = 0, temporalTimes = 0;
  const numberStrings: string[] = [];

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (isBlank(cell)) { text[i] = null; continue; }
    filled++;
    if (typeof cell === 'number') {
      text[i] = String(cell);
      shapes[i] = { kind: 'plain', value: cell };
      numeric++;
    } else if (typeof cell === 'string') {
      const trimmed = cell.trim();
      text[i] = trimmed;
      if (isMissingMarker(trimmed)) { markers++; continue; }
      if (looksLikeIdentifier(trimmed) || isDigitLabel(trimmed)) { labels++; continue; }
      const shape = classifyNumber(trimmed);
      if (shape) { shapes[i] = shape; numeric++; numberStrings.push(trimmed); }
    } else {
      text[i] = cell!.text;
      if (cell!.temporal === 'time') temporalTimes++; else temporalDates++;
    }
  }

  if (filled === 0) return { type: 'text', values: text };

  // The markers found, for saying what was treated as missing.
  const emptyMarkers = (values: unknown[]) => {
    const found: string[] = [];
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (typeof cell === 'string' && isMissingMarker(cell)) { found.push(cell.trim()); values[i] = null; }
    }
    if (found.length > 0) {
      warn('changed', `${label}: ${plural(found.length, 'value', 'values')} (${exampleList(found)}) ${found.length === 1 ? 'was' : 'were'} imported as empty.`);
    }
  };

  // ---- Number ---------------------------------------------------------------
  const notNumbers = filled - numeric - markers;
  if (numeric > 0 && notNumbers === 0) {
    const analysis = analyzeNumberColumn(numberStrings, table.delimiter);
    if (analysis.consistent) {
      const readings = { ...analysis.readings };
      if (analysis.openMark) {
        const first = classifyNumber(analysis.openExamples[0]) as Extract<NumberShape, { kind: 'open' }>;
        const suggested = readings[analysis.openMark] ?? 'decimal';
        result.numberQuestions.push({
          columnKey: key, columnLabel: label, mark: analysis.openMark,
          examples: analysis.openExamples, count: analysis.openCount,
          previews: { decimal: first.asDecimal, thousands: first.asThousands },
          suggested,
        });
        const chosen = options.numberChoices?.[key] ?? suggested;
        readings[analysis.openMark] = chosen;
        const example = analysis.openExamples[0];
        const [shown, other] = chosen === 'thousands'
          ? [first.asThousands, first.asDecimal]
          : [first.asDecimal, first.asThousands];
        warn('check', `${label}: ${plural(analysis.openCount, 'value', 'values')} such as ${quote(example)} could be a decimal or a thousands figure. ${analysis.openCount === 1 ? 'It was' : 'They were'} read ${chosen === 'thousands' ? 'as thousands' : 'as decimals'} (${quote(example)} is ${shown}, not ${other}).`);
      }
      const values: unknown[] = shapes.map(shape => (shape ? numberFromShape(shape, readings) : null));
      emptyMarkers(values);
      return { type: 'number', values };
    }
    warn('check', `${label} was imported as text: its values use "." and "," in ways that contradict each other (${exampleList(numberStrings.filter(v => /[.,]/.test(v)), 4)}).`);
  } else if (numeric > 0 && labels === 0 && temporalDates + temporalTimes === 0 && numeric >= notNumbers) {
    // Mostly numbers. Emptying the rest would lose "<1" and "6 months", which
    // in an age column means losing the infants, so the column stays text.
    const odd: string[] = [], oddRows: number[] = [];
    for (let i = 0; i < cells.length; i++) {
      if (text[i] !== null && !shapes[i] && !isMissingMarker(text[i])) { odd.push(text[i]!); oddRows.push(rowNumbers[i]); }
    }
    warn('check', `${label} was imported as text because ${plural(odd.length, 'value is not a number', 'values are not numbers')} (${exampleList(odd)}; ${rowList(oddRows)}). Nothing was changed. To analyse it as a number, correct those values in the file and import it again.`);
  }

  // ---- Date -----------------------------------------------------------------
  const strings: string[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (typeof cells[i] === 'string' && text[i] !== null && !isMissingMarker(text[i])) strings.push(text[i]!);
  }
  const dateCount = summary.dateCount + temporalDates;
  const notDates = filled - markers - dateCount;
  // A column that is mostly dates is a date column. What is not a date in it
  // is kept as written and reported, where it can be seen and corrected.
  if (dateCount > 0 && dateCount >= notDates) {
    let order: DateOrder | null = summary.order === 'DMY' || summary.order === 'MDY' ? summary.order : null;

    if (summary.order === 'ambiguous' || summary.order === 'mixed') {
      const sibling = provenOrders.size === 1 ? [...provenOrders][0] : null;
      const suggested = sibling ?? options.preferredDateOrder ?? 'DMY';
      const example = summary.ambiguousExamples[0];
      result.dateQuestions.push({
        columnKey: key, columnLabel: label,
        examples: summary.ambiguousExamples, count: summary.ambiguousCount,
        mixed: summary.order === 'mixed',
        previews: {
          DMY: describeIsoDate(convertDateValue(example, 'DMY')!.iso),
          MDY: describeIsoDate(convertDateValue(example, 'MDY')!.iso),
        },
        suggested,
        suggestedFrom: sibling ? 'sibling' : 'setting',
      });
      const choice = options.dateChoices?.[key];
      if (choice === 'text' || choice === undefined) {
        // Unanswered, or the user said these are not dates: keep what the
        // file wrote, as text, so nothing downstream reads it as a date.
        return { type: looksCategorical(strings) ? 'categorical' : 'text', values: text };
      }
      order = choice;
    }

    const values: unknown[] = text.slice();
    const failed: string[] = [], failedRows: number[] = [];
    let offsets = 0;
    const shortYears: string[] = [];
    let shortYearExample = '';
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (typeof cell !== 'string' || text[i] === null || isMissingMarker(text[i])) continue;
      const parsed = convertDateValue(text[i]!, order);
      if (!parsed) { failed.push(text[i]!); failedRows.push(rowNumbers[i]); continue; }
      values[i] = parsed.iso;
      if (parsed.hadOffset) offsets++;
      if (parsed.twoDigitYear) {
        shortYears.push(text[i]!);
        if (!shortYearExample) shortYearExample = `${text[i]} → ${parsed.iso.slice(0, 10)}`;
      }
    }
    emptyMarkers(values);
    if (failed.length > 0) {
      warn('check', `${label}: ${plural(failed.length, 'value', 'values')} could not be read as a date and ${failed.length === 1 ? 'was' : 'were'} left as written (${exampleList(failed)}; ${rowList(failedRows)}). ${failed.length === 1 ? 'It' : 'They'} will not appear on an epi curve until corrected.`);
    }
    if (shortYears.length > 0) {
      warn('check', `${label}: ${plural(shortYears.length, 'date has', 'dates have')} a two-digit year. The century was chosen so that no date falls in a future year (${shortYearExample}).`);
    }
    if (offsets > 0) {
      warn('info', `${label}: ${plural(offsets, 'value carries', 'values carry')} a time-zone offset. The date and time are kept as written and the offset is dropped, so a record shows the same day on every computer.`);
    }
    return { type: 'date', values };
  }

  // ---- Text -----------------------------------------------------------------
  const present = text.filter((v): v is string => v !== null);
  // A column of clock times stays text ("22:00"), as onset-time columns are.
  if (temporalTimes === filled) return { type: 'text', values: text };
  return { type: looksCategorical(present) ? 'categorical' : 'text', values: text };
}

/**
 * Build the dataset from a grid. Call it again with the user's answers to
 * `dateQuestions` and `numberQuestions` once they have been asked.
 */
export function buildDataset(table: RawTable, options: BuildOptions = {}): ParseResult {
  const result: ParseResult = {
    columns: [], records: [], errors: [],
    warnings: [...table.warnings],
    dateQuestions: [], numberQuestions: [],
  };

  const width = table.rows.reduce((max, row) => Math.max(max, row.length), table.headers.length);
  const labels = Array.from({ length: width }, (_, i) => (table.headers[i] ?? '').trim() || `Column ${i + 1}`);
  const keys = buildColumnKeys(Array.from({ length: width }, (_, i) => table.headers[i] ?? ''));

  const columnCells = labels.map((_, c) => table.rows.map(row => (c < row.length ? row[c] : null)));

  // Columns whose own values prove a day/month order. An ambiguous column in
  // the same file was almost certainly written the same way.
  const summaries = columnCells.map(cells =>
    summarizeDateValues(cells.filter((c): c is string => typeof c === 'string'))
  );
  const provenOrders = new Set<DateOrder>();
  for (const { order } of summaries) {
    if (order === 'DMY' || order === 'MDY') provenOrders.add(order);
  }

  const outcomes = columnCells.map((cells, c) =>
    buildColumn(keys[c], labels[c], cells, table.rowNumbers, summaries[c], table, options, provenOrders, result)
  );

  result.columns = outcomes.map((outcome, c) => ({ key: keys[c], label: labels[c], type: outcome.type }));
  result.records = table.rows.map((_, r) => {
    const record: CaseRecord = { id: crypto.randomUUID() };
    for (let c = 0; c < width; c++) record[keys[c]] = outcomes[c].values[r];
    return record;
  });

  result.warnings = sortWarnings(result.warnings);
  result.errors = result.warnings.map(w => w.message);
  return result;
}
