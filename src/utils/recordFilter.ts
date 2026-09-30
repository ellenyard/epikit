/**
 * Filtering, grouping and sorting records.
 *
 * Two separate mechanisms had grown up here. The analysis modules each kept
 * their own copy of a value-set filter, identical in five files, and the line
 * list used a richer operator-based filter that nothing tested.
 *
 * Both mishandled missing values, in the way that has recurred throughout this
 * codebase: `String(value ?? 'Unknown')` only catches null and undefined, so an
 * empty cell became the category "", a whitespace-only cell became "   ", and
 * only a true null became "Unknown". Three categories for one missing value,
 * two of which render as indistinguishable blanks in a dropdown and as
 * duplicate strata in an epi curve legend.
 *
 * The operator filter had a sharper version of the same fault: it compared
 * String(null), which is the text "null", so a "contains n" filter silently
 * matched every record whose value was missing.
 */
import type { CaseRecord, DataColumn, FilterCondition, SortConfig } from '../types/analysis';

/** What a missing value is called wherever records are grouped or filtered. */
export const MISSING_CATEGORY_LABEL = 'Unknown';

/**
 * Normalised text for a cell, for comparison rather than display.
 * Missing is the empty string; everything else is trimmed.
 *
 * Trimming means " Confirmed " and "Confirmed" are one value rather than two.
 * Trailing whitespace out of a spreadsheet is common, and splitting a stratum
 * in two over it produces a legend with the same label twice, which reads as a
 * rendering fault rather than a data problem. The data quality panel is where
 * stray whitespace should be reported, not the epi curve.
 */
export function normalizedText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/** True when a cell holds nothing usable, whitespace included. */
export function isMissingValue(value: unknown): boolean {
  return normalizedText(value) === '';
}

/**
 * The category a cell belongs to when grouping, stratifying or filtering.
 * Every form of missing collapses to one label.
 */
export function categoryValue(value: unknown): string {
  const text = normalizedText(value);
  return text === '' ? MISSING_CATEGORY_LABEL : text;
}

/** Every distinct category present in a column, sorted for a stable dropdown. */
export function collectCategoryValues(records: CaseRecord[], column: string): string[] {
  const values = new Set<string>();
  for (const record of records) values.add(categoryValue(record[column]));
  return sortCategoryValues(Array.from(values));
}

/** How many records fall in one category, for the counts beside a filter. */
export function countInCategory(
  records: CaseRecord[],
  column: string,
  value: string
): number {
  let count = 0;
  for (const record of records) if (categoryValue(record[column]) === value) count++;
  return count;
}

/**
 * Keep records whose column value is one of the selected categories. An empty
 * selection means no filter, matching how the analysis panels behave: the
 * control starts empty and shows everything.
 */
export function filterByCategoryValues(
  records: CaseRecord[],
  column: string | null | undefined,
  selected: ReadonlySet<string>
): CaseRecord[] {
  if (!column || selected.size === 0) return records;
  return records.filter(record => selected.has(categoryValue(record[column])));
}

/**
 * Parse a date for comparison.
 *
 * A bare YYYY-MM-DD is parsed as UTC midnight by the Date constructor while a
 * value carrying a time is parsed as local, so a column mixing the two shifted
 * by the timezone offset and compared wrongly near midnight. Both are read as
 * local here, which is also how the importers now read spreadsheet dates.
 */
function parseComparableDate(value: string): number {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (dateOnly) {
    return new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3])
    ).getTime();
  }
  return new Date(value).getTime();
}

export function filterRecords(
  records: CaseRecord[],
  filters: FilterCondition[],
  columns?: DataColumn[]
): CaseRecord[] {
  if (filters.length === 0) return records;

  return records.filter(record =>
    filters.every(filter => {
      // Normalised, so a missing value compares as empty rather than as the
      // text "null", and stray whitespace does not make a value its own thing.
      const text = normalizedText(record[filter.column]).toLowerCase();
      const target = normalizedText(filter.value).toLowerCase();

      switch (filter.operator) {
        case 'equals':
          return text === target;
        case 'not_equals':
          return text !== target;
        case 'contains':
          // An empty target matches everything, which is what an empty search
          // box should do; a missing value matches nothing else.
          return text.includes(target);
        case 'greater_than':
        case 'less_than': {
          if (text === '' || target === '') return false;
          const columnType = columns?.find(c => c.key === filter.column)?.type;
          const left = columnType === 'date'
            ? parseComparableDate(String(record[filter.column]))
            : Number(text);
          const right = columnType === 'date'
            ? parseComparableDate(String(filter.value))
            : Number(target);
          if (Number.isNaN(left) || Number.isNaN(right)) return false;
          return filter.operator === 'greater_than' ? left > right : left < right;
        }
        case 'is_empty':
          return text === '';
        case 'is_not_empty':
          return text !== '';
        default:
          // An operator this build does not know, which can only arrive from a
          // stored or imported filter. Matching nothing is wrong but visible;
          // matching everything silently drops the filter and leaves the user
          // reading unfiltered data believing it was narrowed.
          return false;
      }
    })
  );
}

export function sortRecords(records: CaseRecord[], sort: SortConfig | null): CaseRecord[] {
  if (!sort) return records;

  return [...records].sort((a, b) => {
    const aVal = a[sort.column];
    const bVal = b[sort.column];

    // Missing values go last in both directions, as a spreadsheet does.
    // Previously they moved to the top on a descending sort, which pushed the
    // records the user was actually sorting for off the first screen.
    const aMissing = isMissingValue(aVal);
    const bMissing = isMissingValue(bVal);
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sort.direction === 'asc' ? aVal - bVal : bVal - aVal;
    }

    const comparison = String(aVal).localeCompare(String(bVal));
    return sort.direction === 'asc' ? comparison : -comparison;
  });
}

/**
 * Ordering category values for an axis or a legend.
 *
 * A bare sort is lexicographic, which puts April before January and "10-14"
 * before "5-9". Both are ordinary in epidemiological data: a month-by-district
 * heatmap is drawn precisely to show seasonality, and alphabetical months
 * scatter the season across the axis so the pattern cannot be seen at all.
 * Age bands fare no better.
 */

const MONTH_SEQUENCE = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const MONTH_ORDER = new Map<string, number>();
MONTH_SEQUENCE.forEach((name, index) => {
  MONTH_ORDER.set(name, index);
  MONTH_ORDER.set(name.slice(0, 3), index);
});

/** The month's position, or null when the text does not name one. */
function monthPosition(value: string): number | null {
  return MONTH_ORDER.get(value.trim().toLowerCase()) ?? null;
}

/** A leading number, so "5-9" sorts before "10-14" and "<5" before "5-9". */
function leadingNumber(value: string): number | null {
  const match = /^[<>~]?\s*(-?\d+(?:\.\d+)?)/.exec(value.trim());
  return match ? Number(match[1]) : null;
}

/**
 * Sort category values into the order a reader expects.
 *
 * An explicit valueOrder wins. Otherwise month names sort chronologically and
 * values opening with a number sort numerically, each only when every value
 * qualifies, so a single odd entry falls back to alphabetical rather than
 * producing a half-ordered axis. Missing always sorts last, where a reader
 * looks for it, rather than alphabetically into the middle of real categories.
 */
export function sortCategoryValues(values: string[], valueOrder?: string[]): string[] {
  const missing = values.filter(v => v === MISSING_CATEGORY_LABEL);
  const rest = values.filter(v => v !== MISSING_CATEGORY_LABEL);

  let ordered: string[];
  if (valueOrder && valueOrder.length > 0) {
    const rank = new Map(valueOrder.map((v, i) => [v, i]));
    const known = rest.filter(v => rank.has(v)).sort((a, b) => rank.get(a)! - rank.get(b)!);
    const unknown = sortCategoryValues(rest.filter(v => !rank.has(v)));
    ordered = [...known, ...unknown];
  } else if (rest.length > 0 && rest.every(v => monthPosition(v) !== null)) {
    ordered = [...rest].sort((a, b) => monthPosition(a)! - monthPosition(b)!);
  } else if (rest.length > 0 && rest.every(v => leadingNumber(v) !== null)) {
    ordered = [...rest].sort((a, b) => {
      const diff = leadingNumber(a)! - leadingNumber(b)!;
      return diff !== 0 ? diff : a.localeCompare(b);
    });
  } else {
    ordered = [...rest].sort((a, b) => a.localeCompare(b));
  }

  return [...ordered, ...missing];
}
