import type { CaseRecord } from '../types/analysis';
import { categoryOf, numberOf } from './chartCategories';

export type AggregationMode = 'mean' | 'sum' | 'count' | 'min' | 'max';

interface AggBucket {
  sum: number;
  /** Values seen, which drives mean, min and max. */
  count: number;
  min: number;
  max: number;
  /** Records in the category, whether or not they carried a value. */
  records?: number;
}

/**
 * Aggregate numeric values by a categorical key.
 * Returns one entry per unique category, with the aggregated value.
 */
export function aggregateByCategory(
  records: CaseRecord[],
  categoryKey: string,
  valueKey: string,
  mode: AggregationMode = 'mean',
): { category: string; value: number }[] {
  const buckets = new Map<string, AggBucket>();

  for (const rec of records) {
    // Trimmed, and a stored boolean reads Yes/No: see categoryOf.
    const catStr = categoryOf(rec[categoryKey]);
    if (catStr === null) continue;

    if (!buckets.has(catStr)) {
      buckets.set(catStr, { sum: 0, count: 0, min: Infinity, max: -Infinity, records: 0 });
    }
    const b = buckets.get(catStr)!;
    b.records = (b.records ?? 0) + 1;

    // Counting records does not read the value column, so a record missing it
    // still belongs to its category. Requiring a value here undercounted every
    // category by however many blanks it held.
    const num = numberOf(rec[valueKey]);
    if (num === null) continue;

    b.sum += num;
    b.count++;
    if (num < b.min) b.min = num;
    if (num > b.max) b.max = num;
  }

  return Array.from(buckets.entries()).map(([category, b]) => ({
    category,
    value: resolveAgg(b, mode),
  }));
}

/**
 * Aggregate two numeric values by category (e.g. start/end for slope charts,
 * actual/target for bullet charts).
 */
export function aggregatePairByCategory(
  records: CaseRecord[],
  categoryKey: string,
  valueKeyA: string,
  valueKeyB: string,
  mode: AggregationMode = 'mean',
): { category: string; valueA: number; valueB: number }[] {
  const buckets = new Map<string, { a: AggBucket; b: AggBucket }>();

  for (const rec of records) {
    const catStr = categoryOf(rec[categoryKey]);
    if (catStr === null) continue;

    if (!buckets.has(catStr)) {
      buckets.set(catStr, {
        a: { sum: 0, count: 0, min: Infinity, max: -Infinity },
        b: { sum: 0, count: 0, min: Infinity, max: -Infinity },
      });
    }
    const entry = buckets.get(catStr)!;

    const numA = numberOf(rec[valueKeyA]);
    if (numA !== null) {
      entry.a.sum += numA;
      entry.a.count++;
      if (numA < entry.a.min) entry.a.min = numA;
      if (numA > entry.a.max) entry.a.max = numA;
    }

    const numB = numberOf(rec[valueKeyB]);
    if (numB !== null) {
      entry.b.sum += numB;
      entry.b.count++;
      if (numB < entry.b.min) entry.b.min = numB;
      if (numB > entry.b.max) entry.b.max = numB;
    }
  }

  return Array.from(buckets.entries())
    .filter(([, e]) => e.a.count > 0 && e.b.count > 0)
    .map(([category, e]) => ({
      category,
      valueA: resolveAgg(e.a, mode),
      valueB: resolveAgg(e.b, mode),
    }));
}

/**
 * Count records per combination of category and group.
 * Useful for paired bar charts showing frequency distributions.
 */
export function countByCategoryAndGroup(
  records: CaseRecord[],
  categoryKey: string,
  groupKey: string,
): { category: string; group: string; count: number }[] {
  const counts = new Map<string, Map<string, number>>();

  for (const rec of records) {
    const catStr = categoryOf(rec[categoryKey]);
    const grpStr = categoryOf(rec[groupKey]);
    if (catStr === null || grpStr === null) continue;

    if (!counts.has(catStr)) counts.set(catStr, new Map());
    const inner = counts.get(catStr)!;
    inner.set(grpStr, (inner.get(grpStr) || 0) + 1);
  }

  const result: { category: string; group: string; count: number }[] = [];
  for (const [category, groups] of counts) {
    for (const [group, count] of groups) {
      result.push({ category, group, count });
    }
  }
  return result;
}

function resolveAgg(b: AggBucket, mode: AggregationMode): number {
  switch (mode) {
    case 'mean': return b.count > 0 ? b.sum / b.count : 0;
    case 'sum': return b.sum;
    // Records in the category, not records that happen to have a value.
    case 'count': return b.records ?? b.count;
    case 'min': return b.min === Infinity ? 0 : b.min;
    case 'max': return b.max === -Infinity ? 0 : b.max;
  }
}

export type CrossAggregationMode = 'count' | 'sum' | 'mean';

export interface CrossCell {
  /** The aggregate for this category and group. */
  value: number;
  /** Records that went into it. */
  n: number;
}

export interface CrossAggregate {
  /** Categories met, in the order of first appearance. Order them for display with orderCategories. */
  categories: string[];
  /** Groups met, likewise. */
  groups: string[];
  cells: Map<string, Map<string, CrossCell>>;
  /** Records left out because the category, the group or (outside count mode) the value was missing. */
  excludedMissing: number;
  /** Records left out because their group is not one of `onlyGroups`. */
  excludedOtherGroup: number;
}

/**
 * Aggregate by a category and a group at once: the table behind a grouped
 * bar chart, a population pyramid, a heatmap or a two-group slope chart.
 *
 * Those four charts each built this table inline and none of them reported
 * what they left out, so a figure of percentages gave no hint that it was a
 * percentage of the records that happened to have both answers. The counts
 * of excluded records come back with the table so the chart can print them.
 *
 * Count mode never reads the value column: a record with no value still
 * belongs to its cell.
 */
export function crossAggregate(
  records: CaseRecord[],
  categoryKey: string,
  groupKey: string,
  valueKey: string | null,
  mode: CrossAggregationMode,
  onlyGroups?: string[],
): CrossAggregate {
  const sums = new Map<string, Map<string, { sum: number; n: number }>>();
  const categories: string[] = [];
  const groups: string[] = [];
  const allowed = onlyGroups ? new Set(onlyGroups) : null;
  let excludedMissing = 0;
  let excludedOtherGroup = 0;

  for (const rec of records) {
    const cat = categoryOf(rec[categoryKey]);
    const grp = categoryOf(rec[groupKey]);
    if (cat === null || grp === null) {
      excludedMissing++;
      continue;
    }
    if (allowed && !allowed.has(grp)) {
      excludedOtherGroup++;
      continue;
    }

    let amount = 1;
    if (mode !== 'count') {
      const num = valueKey ? numberOf(rec[valueKey]) : null;
      if (num === null) {
        excludedMissing++;
        continue;
      }
      amount = num;
    }

    if (!sums.has(cat)) {
      sums.set(cat, new Map());
      categories.push(cat);
    }
    if (!groups.includes(grp)) groups.push(grp);
    const row = sums.get(cat)!;
    const cell = row.get(grp) ?? { sum: 0, n: 0 };
    cell.sum += amount;
    cell.n++;
    row.set(grp, cell);
  }

  const cells = new Map<string, Map<string, CrossCell>>();
  for (const [cat, row] of sums) {
    const out = new Map<string, CrossCell>();
    for (const [grp, cell] of row) {
      out.set(grp, { value: mode === 'mean' ? cell.sum / cell.n : cell.sum, n: cell.n });
    }
    cells.set(cat, out);
  }

  return { categories, groups, cells, excludedMissing, excludedOtherGroup };
}
