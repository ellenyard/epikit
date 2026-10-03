import { useMemo, useState } from 'react';
import type { Dataset } from '../../types/analysis';
import { collectCategoryValues, countInCategory } from '../../utils/recordFilter';
import {
  ALL_RECORDS,
  casesOnlySubset,
  filterableColumns,
  isCasesOnly,
  type CaseColumn,
  type RecordSubset,
} from '../../utils/recordSubset';

interface RecordFilterProps {
  dataset: Dataset;
  subset: RecordSubset;
  onChange: (subset: RecordSubset) => void;
  /** The case-status column, when one was recognised. */
  caseColumn: CaseColumn | null;
  /** Records the subset keeps. */
  kept: number;
}

/** How many values are listed before "Show more". */
const VALUES_SHOWN = 6;

/**
 * The "Records" control above the chart gallery: which records every chart
 * is drawn from. All of them by default; a column and the values to keep;
 * or, when a case-status column is recognised, the cases alone in one click.
 */
export function RecordFilter({ dataset, subset, onChange, caseColumn, kept }: RecordFilterProps) {
  const [showAll, setShowAll] = useState(false);

  const columns = useMemo(() => filterableColumns(dataset.columns, dataset.records), [dataset]);
  const values = useMemo(
    () => (subset.column ? collectCategoryValues(dataset.records, subset.column) : []),
    [dataset.records, subset.column]
  );
  const total = dataset.records.length;
  const casesOnly = isCasesOnly(subset, caseColumn);
  const columnLabel = dataset.columns.find(c => c.key === subset.column)?.label ?? subset.column;

  const toggle = (value: string, on: boolean) => {
    const next = new Set(subset.values);
    if (on) next.add(value);
    else next.delete(value);
    onChange({ column: subset.column, values: Array.from(next) });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label htmlFor="visualize-records" className="text-sm font-medium text-gray-700">Records</label>
        <select
          id="visualize-records"
          value={subset.column}
          onChange={(e) => {
            setShowAll(false);
            onChange(e.target.value ? { column: e.target.value, values: [] } : ALL_RECORDS);
          }}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white min-w-0 max-w-full"
        >
          <option value="">All records</option>
          {columns.map(col => (
            <option key={col.key} value={col.key}>Only some values of {col.label}</option>
          ))}
        </select>
        {caseColumn && !casesOnly && (
          <button
            type="button"
            onClick={() => onChange(casesOnlySubset(caseColumn))}
            className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
          >
            Cases only
          </button>
        )}
        {subset.column && (
          <button
            type="button"
            onClick={() => onChange(ALL_RECORDS)}
            className="text-sm text-gray-600 hover:text-gray-900 underline"
          >
            Show all records
          </button>
        )}
        <span className="text-sm text-gray-500" aria-live="polite">
          {kept < total
            ? `Showing ${kept} of ${total} records${casesOnly ? ` (cases only, by ${caseColumn!.label})` : ''}`
            : `All ${total} records`}
        </span>
      </div>

      {subset.column && values.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">Keep records whose {columnLabel} is:</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => onChange({ column: subset.column, values })} className="text-xs text-gray-600 hover:text-gray-900">All</button>
              <button type="button" onClick={() => onChange({ column: subset.column, values: [] })} className="text-xs text-gray-500 hover:text-gray-700">Clear</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {(showAll ? values : values.slice(0, VALUES_SHOWN)).map(value => (
              <label key={value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={subset.values.includes(value)}
                  onChange={(e) => toggle(value, e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-gray-700">{value}</span>
                <span className="text-gray-400 text-xs">({countInCategory(dataset.records, subset.column, value)})</span>
              </label>
            ))}
          </div>
          {values.length > VALUES_SHOWN && (
            <button type="button" onClick={() => setShowAll(!showAll)} className="mt-1 text-xs text-gray-600 hover:text-gray-900">
              {showAll ? 'Show less' : `Show ${values.length - VALUES_SHOWN} more...`}
            </button>
          )}
          {subset.values.length === 0 && (
            <p className="text-xs text-gray-500 mt-1">Nothing is ticked yet, so every record is still shown.</p>
          )}
        </div>
      )}
    </div>
  );
}
