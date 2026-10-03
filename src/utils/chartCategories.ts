/**
 * Turning a column into the categories of a chart axis, legend or panel.
 *
 * Every chart carried its own `cat === null || cat === ''` test followed by
 * `String(cat)`, and every one of them inherited the same three faults:
 *
 *  - " Female", "Female " and "Female" were three bars, and a cell holding
 *    only spaces was a real category with a blank label.
 *  - A Yes/No column that an older import stored as true/false was labelled
 *    "true" and "false", and most charts refused to offer it at all because
 *    their pickers listed text columns only.
 *  - Order was whatever a bare sort or the first record happened to give:
 *    "10-14" ahead of "5-9", After ahead of Before, and a column's declared
 *    order ignored.
 */
import type { CaseRecord, DataColumn } from '../types/analysis';
import { sortCategoryValues } from './recordFilter';

/** How a stored boolean is written on a chart. */
export const BOOLEAN_TRUE_LABEL = 'Yes';
export const BOOLEAN_FALSE_LABEL = 'No';

/**
 * The category a cell belongs to, or null when the cell is missing.
 *
 * Whitespace is trimmed so stray spaces out of a spreadsheet do not split a
 * group, and a cell that is nothing but whitespace is missing.
 */
export function categoryOf(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? BOOLEAN_TRUE_LABEL : BOOLEAN_FALSE_LABEL;
  const text = String(value).trim();
  return text === '' ? null : text;
}

/** A numeric cell's value, or null when it is missing or not a number. */
export function numberOf(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const num = Number(value);
  return isFinite(num) ? num : null;
}

/**
 * Most distinct values a numeric column may hold and still be offered as a
 * category. Enough for 53 epi weeks; a continuous measurement has far more.
 */
export const MAX_NUMERIC_CATEGORIES = 60;

/**
 * True when a column can supply the categories of a chart.
 *
 * Text, categorical and boolean columns always can. A numeric column can when
 * it holds a small set of whole numbers, which is what an epi week, a year or
 * a coded answer looks like; those were previously impossible to put on an
 * axis because the pickers listed text columns only.
 */
export function isCategoryColumn(column: DataColumn, records: CaseRecord[]): boolean {
  if (column.type === 'text' || column.type === 'categorical' || column.type === 'boolean') return true;
  if (column.type !== 'number') return false;

  const seen = new Set<number>();
  for (const record of records) {
    const value = numberOf(record[column.key]);
    if (value === null) continue;
    if (!Number.isInteger(value)) return false;
    seen.add(value);
    if (seen.size > MAX_NUMERIC_CATEGORIES) return false;
  }
  return seen.size > 0;
}

/**
 * Most distinct values a column may hold and still be listed among the likely
 * choices of a category picker. The same bound the automatic picks use.
 */
export const MAX_LIKELY_CATEGORIES = 30;

/** Distinct categories and non-missing cells in a column. */
function categoryShape(records: CaseRecord[], key: string): { distinct: number; present: number } {
  const seen = new Set<string>();
  let present = 0;
  for (const record of records) {
    const category = categoryOf(record[key]);
    if (category === null) continue;
    present++;
    seen.add(category);
  }
  return { distinct: seen.size, present };
}

/**
 * True when a column identifies records rather than grouping them: more
 * distinct values than a chart can show, and nearly one per record. A record
 * ID is the first text column in most line lists, and the pickers listed it
 * first; chosen, it draws one mark per record.
 */
export function isIdentifierColumn(column: DataColumn, records: CaseRecord[]): boolean {
  if (column.type === 'number' || column.type === 'boolean') return false;
  const { distinct, present } = categoryShape(records, column.key);
  return distinct > MAX_LIKELY_CATEGORIES && distinct >= present * 0.8;
}

/**
 * The columns a category, group or panel picker should list, likeliest first.
 *
 * Record IDs are left out. Then come the columns with a handful of values,
 * which is what a category axis wants; then text columns with more values
 * than that, which may still be a fine-grained place or occupation; and last
 * the numeric columns that happen to hold a few whole numbers, of which a
 * dataset can have many.
 */
export function categoryColumns(dataset: { columns: DataColumn[]; records: CaseRecord[] }): DataColumn[] {
  const usable = dataset.columns.filter(column =>
    isCategoryColumn(column, dataset.records) && !isIdentifierColumn(column, dataset.records)
  );
  const text = usable.filter(c => c.type !== 'number');
  const likely = text.filter(c => {
    const { distinct } = categoryShape(dataset.records, c.key);
    return distinct >= 2 && distinct <= MAX_LIKELY_CATEGORIES;
  });
  return [
    ...likely,
    ...text.filter(c => !likely.includes(c)),
    ...usable.filter(c => c.type === 'number'),
  ];
}

/**
 * Put category values in the order a reader expects.
 *
 * The column's declared order wins, then Yes before No for a boolean, then the
 * shared rules: months chronologically, values opening with a number
 * numerically, anything else alphabetically, and Unknown last.
 */
export function orderCategories(
  values: Iterable<string>,
  column?: Pick<DataColumn, 'type' | 'valueOrder'>,
): string[] {
  const unique = Array.from(new Set(values));
  const declared = column?.valueOrder?.map(v => v.trim()).filter(v => v !== '');
  if (declared && declared.length > 0) return sortCategoryValues(unique, declared);
  if (column?.type === 'boolean') {
    return sortCategoryValues(unique, [BOOLEAN_TRUE_LABEL, BOOLEAN_FALSE_LABEL]);
  }
  return sortCategoryValues(unique);
}

/** Distinct categories present in a column, in reading order. */
export function categoriesInColumn(records: CaseRecord[], column: DataColumn | undefined): string[] {
  if (!column) return [];
  const present = new Set<string>();
  for (const record of records) {
    const category = categoryOf(record[column.key]);
    if (category !== null) present.add(category);
  }
  return orderCategories(present, column);
}

/**
 * A comparator that sorts rows into a known category order. Categories the
 * order does not mention go last, in the order they were met.
 */
export function byCategoryOrder<T>(order: string[], key: (row: T) => string): (a: T, b: T) => number {
  const rank = new Map(order.map((value, index) => [value, index]));
  return (a, b) => (rank.get(key(a)) ?? order.length) - (rank.get(key(b)) ?? order.length);
}

/** "1 record" or "12 records", for the notes under a chart. */
export function recordCount(n: number): string {
  return `${n} record${n === 1 ? '' : 's'}`;
}

/* -------------------------------------------------------------------------- */
/* Dates on a line chart's x-axis                                             */
/* -------------------------------------------------------------------------- */

const MONTH_ABBREVIATIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MS_PER_DAY = 86_400_000;

/**
 * The calendar date at the start of a cell, as YYYY-MM-DD, or null when the
 * cell does not open with a real ISO date. A timestamp keeps its date and
 * drops its time, so records from one day share one point.
 */
export function isoDateOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** Days since the epoch for an ISO date. Calendar arithmetic only: no time zone is involved. */
function dayNumber(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

function isoFromDayNumber(days: number): string {
  return new Date(days * MS_PER_DAY).toISOString().slice(0, 10);
}

export type DateStep = 'day' | 'week' | 'month';

export interface DateAxis {
  /** Every date on the axis, including the ones no record falls on. */
  values: string[];
  step: DateStep;
  /** How many of `values` were added to close gaps. */
  filled: number;
}

/** Longest axis that will be filled. Past this the dates are plotted as given. */
export const MAX_DATE_AXIS_POINTS = 800;

/**
 * A continuous run of dates covering the ones observed.
 *
 * The line chart used to place only the dates that had records, evenly spaced,
 * so onsets on 1, 2 and 3 September followed by one on the 20th drew four
 * equidistant points and the line never returned to zero in between. That hides
 * exactly the gap an investigator is looking for.
 *
 * The spacing follows the data: reports dated on the same day of each month
 * step by month, dates a whole number of weeks apart step by week, and
 * everything else steps by day. Returns null when the run would be longer than
 * MAX_DATE_AXIS_POINTS, leaving the caller to plot the observed dates only and
 * say so.
 */
export function buildDateAxis(isoDates: Iterable<string>): DateAxis | null {
  const observed = Array.from(new Set(isoDates)).sort();
  if (observed.length === 0) return { values: [], step: 'day', filled: 0 };
  if (observed.length === 1) return { values: observed, step: 'day', filled: 0 };

  const days = observed.map(dayNumber);
  const first = days[0];
  const last = days[days.length - 1];

  const sameDayOfMonth = observed.every(d => d.slice(8) === observed[0].slice(8));
  const distinctMonths = new Set(observed.map(d => d.slice(0, 7))).size;
  const gaps = days.slice(1).map((d, i) => d - days[i]);
  const allWholeWeeks = gaps.every(g => g % 7 === 0);

  let values: string[];
  let step: DateStep;
  if (sameDayOfMonth && distinctMonths === observed.length && Number(observed[0].slice(8)) <= 28) {
    step = 'month';
    values = [];
    let year = Number(observed[0].slice(0, 4));
    let month = Number(observed[0].slice(5, 7));
    const day = observed[0].slice(8);
    const end = observed[observed.length - 1];
    for (let guard = 0; guard <= MAX_DATE_AXIS_POINTS + 1; guard++) {
      const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${day}`;
      if (iso > end) break;
      values.push(iso);
      month++;
      if (month > 12) { month = 1; year++; }
    }
  } else {
    step = allWholeWeeks ? 'week' : 'day';
    const stride = step === 'week' ? 7 : 1;
    if ((last - first) / stride + 1 > MAX_DATE_AXIS_POINTS) return null;
    values = [];
    for (let d = first; d <= last; d += stride) values.push(isoFromDayNumber(d));
  }

  if (values.length > MAX_DATE_AXIS_POINTS) return null;
  return { values, step, filled: values.length - observed.length };
}

/**
 * Tick labels for a run of ISO dates.
 *
 * Built from the calendar parts of the text, never through the Date
 * constructor: `new Date('2026-09-01')` is midnight UTC, which is the evening
 * of 31 August anywhere west of Greenwich, and every label came out a day
 * early. The year is included once the run spans more than one, since "Jan 5"
 * alone does not say which January.
 */
export function formatDateLabels(isoDates: string[], step: DateStep = 'day'): string[] {
  const years = new Set(isoDates.map(d => d.slice(0, 4)));
  const withYear = years.size > 1;
  return isoDates.map(iso => {
    const [year, month, day] = iso.split('-');
    const monthName = MONTH_ABBREVIATIONS[Number(month) - 1] ?? month;
    if (step === 'month') return `${monthName} ${year}`;
    return withYear ? `${Number(day)} ${monthName} ${year}` : `${Number(day)} ${monthName}`;
  });
}

export interface LineAxis {
  /** The x positions in order, as the keys records are matched against. */
  values: string[];
  /** What is printed under each position. */
  labels: string[];
  kind: 'date' | 'category';
  /** Spacing of a date axis. */
  step?: DateStep;
  /** Dates added to close gaps, which a count series must show as zero. */
  filled: number;
  /** True when a date axis was too long to fill and shows observed dates only. */
  gapsHidden: boolean;
  /** The x position a cell belongs to, or null when it is missing. */
  keyOf: (value: unknown) => string | null;
}

/**
 * The x-axis of a line chart for one column.
 *
 * Only a column of real ISO dates becomes a date axis. The previous code asked
 * the Date constructor about every label that contained a hyphen and
 * reformatted whatever it accepted, so the age bands "0-4", "5-9" and "10-14"
 * were printed as "Apr 1", "May 9" and "Oct 14", and a district called
 * "Ward-3" as "Mar 1". A category is now always printed as written.
 */
export function buildLineAxis(records: CaseRecord[], column: DataColumn): LineAxis {
  const cells = records.map(r => r[column.key]);
  const present = cells.filter(v => categoryOf(v) !== null);
  const isoDates = present.map(isoDateOf);
  const allIsoDates = present.length > 0 && isoDates.every(d => d !== null);

  if (allIsoDates) {
    const observed = Array.from(new Set(isoDates as string[])).sort();
    const axis = buildDateAxis(observed);
    const values = axis ? axis.values : observed;
    const step = axis ? axis.step : 'day';
    return {
      values,
      labels: formatDateLabels(values, step),
      kind: 'date',
      step,
      filled: axis ? axis.filled : 0,
      gapsHidden: axis === null,
      keyOf: isoDateOf,
    };
  }

  let values: string[];
  if (column.type === 'date') {
    // Dates the importer could not normalise. Order them by time when every
    // one parses, and print them exactly as stored.
    const unique = Array.from(new Set(present.map(v => categoryOf(v) as string)));
    const times = new Map(unique.map(v => [v, new Date(v).getTime()]));
    values = unique.every(v => !isNaN(times.get(v)!))
      ? unique.sort((a, b) => times.get(a)! - times.get(b)!)
      : orderCategories(unique);
  } else {
    values = categoriesInColumn(records, column);
  }
  return { values, labels: values, kind: 'category', filled: 0, gapsHidden: false, keyOf: categoryOf };
}

const MONTH_NAMES = new Set([
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
]);

/**
 * True when a set of categories has an order of its own: a declared order, a
 * Yes/No pair, month names, or values that open with a number such as age
 * bands and epi weeks. Charts that would otherwise rank bars by size keep
 * these in their own order by default, since an age distribution ranked by
 * count is no longer an age distribution.
 */
export function hasNaturalOrder(values: string[], column?: Pick<DataColumn, 'type' | 'valueOrder'>): boolean {
  if (values.length < 2) return false;
  if (column?.valueOrder && column.valueOrder.length > 0) return true;
  if (column?.type === 'number') return true;
  const real = values.filter(v => v !== 'Unknown');
  if (real.length === 0) return false;
  return real.every(v => MONTH_NAMES.has(v.toLowerCase())) || real.every(v => /^[<>~≤≥]?\s*-?\d/.test(v));
}

const EARLIER_WORDS = /^(before|pre|prior|baseline|start|first|initial|avant|antes)\b/i;
const LATER_WORDS = /^(after|post|endline|follow[\s-]?up|end|last|final|apr[eè]s|despu[eé]s|depois)\b/i;

/**
 * Order the values of a variable that names two periods, earlier one first.
 *
 * A slope chart reads left to right as then to now. Sorted alphabetically,
 * "After" comes before "Before" and "Post" before "Pre", so the chart ran
 * backwards in time for the two commonest ways of naming the periods. A
 * declared order still wins; otherwise the usual words for earlier and later
 * are recognised, and anything else falls back to the shared ordering.
 */
export function orderPeriods(values: Iterable<string>, column?: Pick<DataColumn, 'type' | 'valueOrder'>): string[] {
  const ordered = orderCategories(values, column);
  if (column?.valueOrder && column.valueOrder.length > 0) return ordered;
  const rank = (value: string) => (EARLIER_WORDS.test(value) ? -1 : LATER_WORDS.test(value) ? 1 : 0);
  return ordered
    .map((value, index) => ({ value, index, rank: rank(value) }))
    .sort((a, b) => (a.rank - b.rank) || (a.index - b.index))
    .map(item => item.value);
}
