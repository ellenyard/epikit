/**
 * The subset of a dataset the Visualize module draws.
 *
 * Every chart in the gallery drew every record. On the outbreak sample the
 * first bar chart was "Records by Case Status" with "Not a case" as its
 * biggest bar, while the epidemic curve next door had already left the
 * non-cases out. One filter now sits above the gallery and reaches every
 * chart: all records, or a column and the values to keep, with a one-click
 * "Cases only" when a case-status column can be recognised.
 */
import type { CaseRecord, DataColumn } from '../types/analysis';
import { pickOutcomeColumn, readsAsNonCase } from './caseDefinition';
import { collectCategoryValues, filterByCategoryValues, MISSING_CATEGORY_LABEL } from './recordFilter';

/** Most distinct values a column may have and still be offered to filter by. */
export const MAX_FILTER_VALUES = 30;

export interface RecordSubset {
  /** The column filtered on, or '' for all records. */
  column: string;
  /** The values kept. Empty with a column means nothing is excluded yet. */
  values: string[];
}

export const ALL_RECORDS: RecordSubset = { column: '', values: [] };

/** Columns a chart can be filtered by: a limited set of values, so not dates, measurements or IDs. */
export function filterableColumns(columns: DataColumn[], records: CaseRecord[]): DataColumn[] {
  return columns.filter(c =>
    c.type !== 'date' && c.type !== 'number'
    && collectCategoryValues(records, c.key).length <= MAX_FILTER_VALUES
  );
}

export interface CaseColumn {
  key: string;
  label: string;
  /** The column's values that mean "case". */
  caseValues: string[];
  /** The values that explicitly deny being a case. */
  nonCaseValues: string[];
}

/**
 * The column that says who is a case, found the way the epidemic curve and
 * the 2x2 panel find it: by a name that says so and values that split into
 * cases and non-cases. Null when there is no such column, or when nothing in
 * it reads as a non-case, in which case "cases only" would exclude nothing.
 */
export function findCaseColumn(columns: DataColumn[], records: CaseRecord[]): CaseColumn | null {
  const candidates = columns
    .filter(c => c.type !== 'date' && c.type !== 'number')
    .map(c => ({
      key: c.key,
      label: c.label,
      values: collectCategoryValues(records, c.key).filter(v => v !== MISSING_CATEGORY_LABEL),
    }))
    .filter(c => c.values.length >= 2 && c.values.length <= 20);
  const picked = pickOutcomeColumn(candidates);
  const column = picked ? candidates.find(c => c.key === picked.key) : undefined;
  if (!column) return null;
  const nonCaseValues = column.values.filter(v => readsAsNonCase(v));
  if (nonCaseValues.length === 0) return null;
  return {
    key: column.key,
    label: column.label,
    caseValues: column.values.filter(v => !nonCaseValues.includes(v)),
    nonCaseValues,
  };
}

/** The subset that keeps the cases of `caseColumn`: every value but the non-case ones. */
export function casesOnlySubset(caseColumn: CaseColumn): RecordSubset {
  return { column: caseColumn.key, values: caseColumn.caseValues };
}

/** True when the subset is the "cases only" one for this case column. */
export function isCasesOnly(subset: RecordSubset, caseColumn: CaseColumn | null): boolean {
  if (!caseColumn || subset.column !== caseColumn.key) return false;
  const kept = new Set(subset.values);
  return caseColumn.caseValues.every(v => kept.has(v)) && !caseColumn.nonCaseValues.some(v => kept.has(v));
}

/**
 * The subset as it applies to a dataset: dropped when its column is not in
 * the dataset, which is what happens when the dataset is switched.
 */
export function resolveSubset(subset: RecordSubset, columns: DataColumn[]): RecordSubset {
  if (!subset.column || !columns.some(c => c.key === subset.column)) return ALL_RECORDS;
  return subset;
}

/** The records a subset keeps. A column with no values ticked keeps everything. */
export function applySubset(records: CaseRecord[], subset: RecordSubset): CaseRecord[] {
  return filterByCategoryValues(records, subset.column, new Set(subset.values));
}

/**
 * The note a chart prints when the filter has excluded records: what was
 * kept and how many were left out, so an exported figure says what it shows.
 * '' when nothing is excluded.
 */
export function subsetNote(
  subset: RecordSubset,
  columns: DataColumn[],
  total: number,
  kept: number,
  caseColumn: CaseColumn | null,
): string {
  const excluded = total - kept;
  if (excluded <= 0 || !subset.column) return '';
  const label = columns.find(c => c.key === subset.column)?.label ?? subset.column;
  const noun = excluded === 1 ? 'record' : 'records';
  if (isCasesOnly(subset, caseColumn)) {
    return `Cases only: ${excluded} ${noun} marked as not a case in ${label} ${excluded === 1 ? 'is' : 'are'} not shown.`;
  }
  return `Only records with ${label} of ${subset.values.join(', ')} are shown; ${excluded} ${excluded === 1 ? 'other record is' : 'other records are'} not.`;
}
