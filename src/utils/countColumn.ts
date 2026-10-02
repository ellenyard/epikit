/**
 * Recognising aggregated data: one row per report, with a column that says how
 * many cases the row stands for.
 *
 * Every tool counted rows. For a line list that is the number of cases. For a
 * surveillance extract (district, month, disease, cases) it is the number of
 * reports, which is the same in every district and every month: the bar chart
 * drew four identical bars and the epidemic curve a flat line, both under an
 * axis that said "cases". The tools that can add up a column use this to offer
 * the right one, and to start from it.
 */

import type { CaseRecord, DataColumn } from '../types/analysis';

/** Words that name a count of cases, in the languages line lists arrive in. */
const CASE_WORDS = new Set(['case', 'cases', 'cas', 'caso', 'casos']);

/** Words that name a count when they are the whole of a column's name. */
const COUNT_WORDS = new Set(['count', 'counts', 'n', 'number', 'num', 'total', 'nombre', 'numero', 'número']);

/**
 * Words that make a numeric column something other than a count of cases, even
 * when it also mentions cases: a rate, a share, a denominator, a target.
 */
const NOT_A_COUNT = new Set([
  'rate', 'rates', 'per', 'percent', 'percentage', 'pct', 'proportion', 'ratio', 'incidence', 'prevalence',
  'cfr', 'fatality', 'population', 'pop', 'denominator', 'target', 'completeness', 'coverage',
  'id', 'age', 'year', 'month', 'week', 'day', 'date', 'time', 'status', 'definition', 'code',
  'latitude', 'longitude', 'lat', 'lon', 'lng',
]);

function nameTokens(column: DataColumn): string[] {
  return `${column.key} ${column.label}`
    .toLowerCase()
    .split(/[^a-zà-ÿ]+/)
    .filter(Boolean);
}

/** Whether a column's recorded values are all whole numbers of zero or more, and whether any row stands for several. */
function countShape(records: CaseRecord[], key: string): { wholeNumbers: boolean; aboveOne: boolean } {
  let recorded = 0;
  let aboveOne = false;
  for (const record of records) {
    const value = record[key];
    if (value === null || value === undefined || value === '') continue;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return { wholeNumbers: false, aboveOne: false };
    recorded++;
    if (value > 1) aboveOne = true;
  }
  return { wholeNumbers: recorded > 0, aboveOne };
}

/** True when every recorded value is a whole number of zero or more, and some row stands for several. */
function holdsCounts(records: CaseRecord[], key: string): boolean {
  const shape = countShape(records, key);
  return shape.wholeNumbers && shape.aboveOne;
}

/**
 * Columns a user could reasonably point to as the count of cases: numeric,
 * whole numbers of zero or more, and not named for something else. Offering
 * every numeric column put "Age" and "Latitude" on the list.
 */
export function countColumnCandidates(columns: DataColumn[], records: CaseRecord[]): DataColumn[] {
  return columns.filter(column =>
    column.type === 'number'
    && !nameTokens(column).some(t => NOT_A_COUNT.has(t))
    && countShape(records, column.key).wholeNumbers
  );
}

/**
 * The column that holds the number of cases each row stands for, or null when
 * the dataset is one row per case (or it is not clear).
 *
 * A column qualifies by name and by content: it is numeric, named for cases
 * ("Cases Reported", "n_cases", "cas") or simply "count" or "n", holds only
 * whole numbers of zero or more, and at least one row stands for more than one
 * case. A 0/1 "case" indicator in a line list therefore does not qualify, and
 * neither does a rate or a population. Deaths are not offered: a curve of
 * deaths under an axis that says cases is a worse default than counting rows.
 */
export function findCountColumn(columns: DataColumn[], records: CaseRecord[]): DataColumn | null {
  let fallback: DataColumn | null = null;
  for (const column of columns) {
    if (column.type !== 'number') continue;
    const tokens = nameTokens(column);
    if (tokens.some(t => NOT_A_COUNT.has(t))) continue;
    const namesCases = tokens.some(t => CASE_WORDS.has(t));
    // "Count" or "n" on its own; "Total Facilities" counts something else.
    const namesCount = tokens.every(t => COUNT_WORDS.has(t));
    if (!namesCases && !namesCount) continue;
    if (!holdsCounts(records, column.key)) continue;
    if (namesCases) return column;
    fallback ??= column;
  }
  return fallback;
}
