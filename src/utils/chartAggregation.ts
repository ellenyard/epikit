import type { CaseRecord } from '../types/analysis';

export type AggregationMode = 'mean' | 'sum' | 'count' | 'min' | 'max';

interface AggBucket {
  sum: number;
  count: number;
  min: number;
  max: number;
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
    const cat = rec[categoryKey];
    if (cat === null || cat === undefined || cat === '') continue;
    const catStr = String(cat);
    const raw = rec[valueKey];
    const num = Number(raw);
    if (raw === null || raw === undefined || raw === '' || isNaN(num)) continue;

    if (!buckets.has(catStr)) {
      buckets.set(catStr, { sum: 0, count: 0, min: Infinity, max: -Infinity });
    }
    const b = buckets.get(catStr)!;
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
    const cat = rec[categoryKey];
    if (cat === null || cat === undefined || cat === '') continue;
    const catStr = String(cat);

    if (!buckets.has(catStr)) {
      buckets.set(catStr, {
        a: { sum: 0, count: 0, min: Infinity, max: -Infinity },
        b: { sum: 0, count: 0, min: Infinity, max: -Infinity },
      });
    }
    const entry = buckets.get(catStr)!;

    const rawA = rec[valueKeyA];
    const numA = Number(rawA);
    if (rawA !== null && rawA !== undefined && rawA !== '' && !isNaN(numA)) {
      entry.a.sum += numA;
      entry.a.count++;
      if (numA < entry.a.min) entry.a.min = numA;
      if (numA > entry.a.max) entry.a.max = numA;
    }

    const rawB = rec[valueKeyB];
    const numB = Number(rawB);
    if (rawB !== null && rawB !== undefined && rawB !== '' && !isNaN(numB)) {
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
    const cat = rec[categoryKey];
    const grp = rec[groupKey];
    if (cat === null || cat === undefined || cat === '') continue;
    if (grp === null || grp === undefined || grp === '') continue;
    const catStr = String(cat);
    const grpStr = String(grp);

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
    case 'count': return b.count;
    case 'min': return b.min === Infinity ? 0 : b.min;
    case 'max': return b.max === -Infinity ? 0 : b.max;
  }
}
