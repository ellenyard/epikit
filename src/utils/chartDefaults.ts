/**
 * Default variable selection for charts that plot a category against a value.
 *
 * Shared by BarChart, DotPlot and LollipopChart, which previously each carried
 * their own copy. The copies had drifted: only one bounded the cardinality of
 * its last-resort fallback, so the others could auto-select a record-ID column
 * and try to draw one mark per record.
 */

import type { Dataset, DataColumn } from '../types/analysis';
import { categoryOf } from './chartCategories';

/**
 * Upper bound on distinct values for a column to be auto-selected as the
 * category axis.
 *
 * Columns commonly infer as 'text', and the first text column in a line list is
 * typically a case or record ID. Without this bound a 400-record import
 * auto-builds 400 marks and an SVG tens of thousands of pixels tall. The bound
 * applies to every branch of the search, including the fallback.
 */
export const MAX_AUTO_CATEGORIES = 30;

/**
 * Distinct categories in a column, counted the way the charts will draw them:
 * trimmed, with a whitespace-only cell as missing.
 */
function distinctCount(dataset: Dataset, key: string): number {
  const seen = new Set<string>();
  for (const record of dataset.records) {
    const category = categoryOf(record[key]);
    if (category !== null) seen.add(category);
  }
  return seen.size;
}

/**
 * Choose a category column: prefer a true grouping variable (a categorical
 * column with 3 to MAX_AUTO_CATEGORIES distinct values, e.g. Case Status) over
 * two-value columns like Sex, and over ID-like text columns entirely.
 *
 * @returns the column key, or '' when nothing is suitable, which leaves the
 *          picker showing its prompt rather than drawing something absurd.
 */
export function pickCategoryColumn(dataset: Dataset): string {
  const inRange = (c: DataColumn, min: number) => {
    const n = distinctCount(dataset, c.key);
    return n >= min && n <= MAX_AUTO_CATEGORIES;
  };

  const categoricals = dataset.columns.filter(c => c.type === 'categorical');
  const ideal = categoricals.find(c => inRange(c, 3));
  if (ideal) return ideal.key;

  const twoValue = categoricals.find(c => inRange(c, 2));
  if (twoValue) return twoValue.key;

  const plottableText = dataset.columns.find(c =>
    (c.type === 'text' || c.type === 'categorical' || c.type === 'boolean') && inRange(c, 2)
  );
  return plottableText?.key ?? '';
}

/** Choose a numeric column, or '' when the dataset has none. */
export function pickNumericColumn(dataset: Dataset): string {
  return dataset.columns.find(c => c.type === 'number')?.key ?? '';
}

/**
 * Resolve the column a chart should actually use: the user's choice when it is
 * still valid for the current dataset, otherwise the automatic pick.
 *
 * Deriving this rather than syncing it in an effect means the selection cannot
 * lag the dataset by a render, and switching datasets re-picks automatically.
 */
export function resolveColumnChoice(
  dataset: Dataset,
  choice: string,
  auto: string,
  requireNumeric = false
): string {
  const valid = choice !== '' && dataset.columns.some(c =>
    c.key === choice && (!requireNumeric || c.type === 'number')
  );
  return valid ? choice : auto;
}
