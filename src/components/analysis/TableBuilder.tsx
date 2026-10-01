import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type { Dataset } from '../../types/analysis';
import { calculateCrossTabulation } from '../../utils/statistics';
import type { CrossTabResults } from '../../utils/statistics';
import { formatSigFigs, formatStatPercent } from '../../utils/localeNumbers';
import { collectCategoryValues, countInCategory, filterByCategoryValues, normalizedText, sortCategoryValues } from '../../utils/recordFilter';

interface TableBuilderProps {
  dataset: Dataset;
  initialRowVars?: string[];
  onRowVarsUsed?: () => void;
  // Optional controlled state for persistence
  rowVars?: string[];
  onRowVarsChange?: (vars: string[]) => void;
  colVar?: string;
  onColVarChange?: (varKey: string) => void;
}

type PercentType = 'row' | 'column' | 'total';

interface TableOptions {
  percentType: PercentType;
  showCumPercent: boolean;
  includeMissing: boolean;
}

interface FrequencyRow {
  variable: string;
  variableLabel: string;
  value: string;
  count: number;
  percent: number;
  cumPercent: number;
  isVariableHeader: boolean;
  isMissing: boolean;
  /** What this variable's percentages are out of */
  denominator: number;
  /** Records with no value for this variable */
  missingCount: number;
}

interface CrossTabCell {
  count: number;
  rowPercent: number;
  colPercent: number;
  totalPercent: number;
}

interface SingleCrossTab {
  rowVar: string;
  rowLabel: string;
  rowValues: string[];
  table: Map<string, Map<string, CrossTabCell>>;
  rowTotals: Map<string, number>;
  colTotals: Map<string, number>;
  grandTotal: number;
  excludedCount: number;
}

/** A value quoted for CSV, with any quote inside it doubled. */
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * True when a set of category values has an order of its own: numbers, age
 * bands such as "5-9" and "10-14", or month names. A plain alphabetical sort
 * puts "10-14" before "5-9" and "10" before "2".
 */
function hasNaturalOrder(values: string[]): boolean {
  if (values.length === 0) return false;
  if (values.every(v => /^[<>~≤≥]?\s*-?\d/.test(v.trim()))) return true;
  const natural = sortCategoryValues(values);
  const alphabetical = [...values].sort((a, b) => a.localeCompare(b));
  return natural.some((v, i) => v !== alphabetical[i]);
}

/**
 * TableBuilder: table builder for frequency tables and cross-tabulations.
 * Variables are placed by dragging, or with the Row / Column buttons beside
 * each one, which also work from the keyboard and on touch screens.
 */
export function TableBuilder({
  dataset,
  initialRowVars = [],
  onRowVarsUsed,
  rowVars: controlledRowVars,
  onRowVarsChange,
  colVar: controlledColVar,
  onColVarChange,
}: TableBuilderProps) {
  // Persistence key for this dataset
  const persistenceKey = `epikit_tablebuilder_${dataset.id}`;

  // Load persisted state once during initialization
  const [saved] = useState<Record<string, unknown>>(() => {
    try {
      const raw = localStorage.getItem(persistenceKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // Use controlled state if provided, otherwise use local state
  const [internalRowVars, setInternalRowVars] = useState<string[]>([]);
  const [internalColVar, setInternalColVar] = useState<string>('');

  const rowVars = controlledRowVars !== undefined ? controlledRowVars : internalRowVars;
  const setRowVars = onRowVarsChange || setInternalRowVars;
  const colVar = controlledColVar !== undefined ? controlledColVar : internalColVar;
  const setColVar = onColVarChange || setInternalColVar;

  const [draggedVar, setDraggedVar] = useState<string | null>(null);
  const [tableOptions, setTableOptions] = useState<TableOptions>(() => {
    const savedOpts = saved.tableOptions as Record<string, unknown> | undefined;
    if (savedOpts) {
      return {
        percentType: (savedOpts.percentType as PercentType) || 'column',
        showCumPercent: savedOpts.showCumPercent !== undefined ? savedOpts.showCumPercent as boolean : false,
        includeMissing: savedOpts.includeMissing !== undefined ? savedOpts.includeMissing as boolean : true,
      };
    }
    return { percentType: 'column', showCumPercent: false, includeMissing: true };
  });
  const [copySuccess, setCopySuccess] = useState(false);

  // Filter state
  const [filterBy, setFilterBy] = useState<string>(() => (saved.filterBy as string) ?? '');
  const [selectedFilterValues, setSelectedFilterValues] = useState<Set<string>>(() => {
    const arr = saved.selectedFilterValues;
    return Array.isArray(arr) ? new Set(arr as string[]) : new Set();
  });
  const [showAllFilterValues, setShowAllFilterValues] = useState(false);

  // Reload persisted state when the dataset actually changes. Done while
  // rendering, so the save effect below never writes the previous dataset's
  // options under the new dataset's storage key.
  const [loadedDatasetId, setLoadedDatasetId] = useState(dataset.id);
  if (loadedDatasetId !== dataset.id) {
    let next: Record<string, unknown> = {};
    try {
      const raw = localStorage.getItem(persistenceKey);
      next = raw ? JSON.parse(raw) : {};
    } catch {
      next = {};
    }
    const savedOpts = next.tableOptions as Record<string, unknown> | undefined;
    setLoadedDatasetId(dataset.id);
    setTableOptions(savedOpts
      ? {
          percentType: (savedOpts.percentType as PercentType) || 'column',
          showCumPercent: savedOpts.showCumPercent !== undefined ? savedOpts.showCumPercent as boolean : false,
          includeMissing: savedOpts.includeMissing !== undefined ? savedOpts.includeMissing as boolean : true,
        }
      : { percentType: 'column', showCumPercent: false, includeMissing: true });
    setFilterBy((next.filterBy as string) ?? '');
    setSelectedFilterValues(Array.isArray(next.selectedFilterValues) ? new Set(next.selectedFilterValues as string[]) : new Set());
    setShowAllFilterValues(false);
  }

  // Save state to localStorage when it changes
  useEffect(() => {
    try {
      const toSave = {
        tableOptions,
        filterBy,
        selectedFilterValues: Array.from(selectedFilterValues),
      };
      localStorage.setItem(persistenceKey, JSON.stringify(toSave));
    } catch (e) {
      console.error('Failed to save table builder settings:', e);
    }
  }, [persistenceKey, tableOptions, filterBy, selectedFilterValues]);

  // Apply initial row vars when they change (for quick actions from Explorer)
  useEffect(() => {
    if (initialRowVars.length > 0) {
      setRowVars(initialRowVars);
      onRowVarsUsed?.();
    }
  }, [initialRowVars, onRowVarsUsed, setRowVars]);

  // Get unique values for a variable, in the order a reader expects: the
  // column's own order if it has one, numbers and age bands numerically,
  // months chronologically, anything else alphabetically. Values are trimmed,
  // so "Yes " and "Yes" are one category.
  const getUniqueValues = useCallback((varKey: string): string[] => {
    const values = new Set<string>();
    for (const record of dataset.records) {
      const text = normalizedText(record[varKey]);
      if (text !== '') values.add(text);
    }
    const column = dataset.columns.find(c => c.key === varKey);
    return sortCategoryValues(Array.from(values), column?.valueOrder);
  }, [dataset.records, dataset.columns]);

  // Get unique values for the filter dropdown
  const filterValues = useMemo(() => {
    if (!filterBy) return [];
    return collectCategoryValues(dataset.records, filterBy);
  }, [dataset.records, filterBy]);

  // Apply filter to records
  const filteredRecords = useMemo(
    () => filterByCategoryValues(dataset.records, filterBy, selectedFilterValues),
    [dataset.records, filterBy, selectedFilterValues]
  );

  // Drag handlers
  const handleDragStart = (varKey: string) => {
    setDraggedVar(varKey);
  };

  const handleDragEnd = () => {
    setDraggedVar(null);
  };

  // Placing a variable. Shared by drag-and-drop and by the Row / Column
  // buttons, which are the only route on a touch screen or from the keyboard:
  // native HTML drag events do not fire for either.
  const addToRows = (varKey: string) => {
    if (rowVars.includes(varKey)) return;
    // If it was in column, remove it from there
    if (colVar === varKey) {
      setColVar('');
    }
    setRowVars([...rowVars, varKey]);
  };

  const setAsColumn = (varKey: string) => {
    // If it was in rows, remove it from there
    setRowVars(rowVars.filter(v => v !== varKey));
    setColVar(varKey);
  };

  const handleDropOnRows = () => {
    if (draggedVar) addToRows(draggedVar);
    setDraggedVar(null);
  };

  const handleDropOnCols = () => {
    if (draggedVar) setAsColumn(draggedVar);
    setDraggedVar(null);
  };

  const removeRowVar = (varKey: string) => {
    setRowVars(rowVars.filter(v => v !== varKey));
  };

  const clearColumn = () => {
    setColVar('');
  };

  // Calculate frequency table data (for rows only)
  const frequencyData = useMemo((): FrequencyRow[] => {
    if (rowVars.length === 0 || colVar) return [];

    const rows: FrequencyRow[] = [];
    const totalRecords = filteredRecords.length;

    for (const varKey of rowVars) {
      const column = dataset.columns.find(c => c.key === varKey);
      if (!column) continue;

      // Count values
      const valueCounts = new Map<string, number>();
      let missingCount = 0;

      for (const record of filteredRecords) {
        const val = record[varKey];
        const strVal = normalizedText(val);
        if (strVal === '') {
          missingCount++;
        } else {
          valueCounts.set(strVal, (valueCounts.get(strVal) || 0) + 1);
        }
      }

      const denominator = tableOptions.includeMissing ? totalRecords : totalRecords - missingCount;
      // Ordered categories (a defined order, numbers, age bands, months) keep
      // their order, so the cumulative percent means something. Unordered
      // ones are listed most frequent first.
      const present = Array.from(valueCounts.keys());
      const ordered = (column.valueOrder && column.valueOrder.length > 0)
        || column.type === 'number'
        || hasNaturalOrder(present);
      const sortedValues: [string, number][] = ordered
        ? sortCategoryValues(present, column.valueOrder).map(v => [v, valueCounts.get(v) || 0])
        : Array.from(valueCounts.entries()).sort((a, b) => b[1] - a[1]);

      let cumCount = 0;
      sortedValues.forEach(([value, count], index) => {
        cumCount += count;
        rows.push({
          variable: varKey,
          variableLabel: column.label,
          value,
          count,
          percent: denominator > 0 ? (count / denominator) * 100 : 0,
          cumPercent: denominator > 0 ? (cumCount / denominator) * 100 : 0,
          isVariableHeader: index === 0,
          isMissing: false,
          denominator,
          missingCount,
        });
      });

      // Add missing row if enabled
      if (tableOptions.includeMissing && missingCount > 0) {
        rows.push({
          variable: varKey,
          variableLabel: column.label,
          value: '(Missing)',
          count: missingCount,
          percent: denominator > 0 ? (missingCount / denominator) * 100 : 0,
          cumPercent: 100,
          isVariableHeader: sortedValues.length === 0,
          isMissing: true,
          denominator,
          missingCount,
        });
      }
    }

    return rows;
  }, [rowVars, colVar, dataset.columns, filteredRecords, tableOptions.includeMissing]);

  // Calculate cross-tabulation data (when both row and column vars are set)
  // Returns an array of cross-tabs, one for each row variable
  const crossTabData = useMemo(() => {
    if (rowVars.length === 0 || !colVar) return null;

    const colValues = getUniqueValues(colVar);
    const colLabel = dataset.columns.find(c => c.key === colVar)?.label || colVar;

    const crossTabs: SingleCrossTab[] = [];

    for (const rowVar of rowVars) {
      const rowValues = getUniqueValues(rowVar);
      const rowLabel = dataset.columns.find(c => c.key === rowVar)?.label || rowVar;

      const table: Map<string, Map<string, CrossTabCell>> = new Map();
      const rowTotals: Map<string, number> = new Map();
      const colTotals: Map<string, number> = new Map();
      let grandTotal = 0;
      let rowMissingCount = 0;
      let colMissingCount = 0;

      // Initialize
      rowValues.forEach(rv => {
        table.set(rv, new Map());
        colValues.forEach(cv => {
          table.get(rv)!.set(cv, { count: 0, rowPercent: 0, colPercent: 0, totalPercent: 0 });
        });
        rowTotals.set(rv, 0);
      });
      colValues.forEach(cv => colTotals.set(cv, 0));

      // Count
      for (const record of filteredRecords) {
        const rowVal = record[rowVar];
        const colVal = record[colVar];

        const rv = normalizedText(rowVal);
        const cv = normalizedText(colVal);

        if (rv === '') {
          rowMissingCount++;
          continue;
        }
        if (cv === '') {
          colMissingCount++;
          continue;
        }

        if (table.has(rv) && table.get(rv)!.has(cv)) {
          const cell = table.get(rv)!.get(cv)!;
          cell.count++;
          rowTotals.set(rv, (rowTotals.get(rv) || 0) + 1);
          colTotals.set(cv, (colTotals.get(cv) || 0) + 1);
          grandTotal++;
        }
      }

      // Calculate percentages
      rowValues.forEach(rv => {
        colValues.forEach(cv => {
          const cell = table.get(rv)!.get(cv)!;
          const rowTotal = rowTotals.get(rv) || 0;
          const colTotal = colTotals.get(cv) || 0;
          cell.rowPercent = rowTotal > 0 ? (cell.count / rowTotal) * 100 : 0;
          cell.colPercent = colTotal > 0 ? (cell.count / colTotal) * 100 : 0;
          cell.totalPercent = grandTotal > 0 ? (cell.count / grandTotal) * 100 : 0;
        });
      });

      crossTabs.push({
        rowVar,
        rowLabel,
        rowValues,
        table,
        rowTotals,
        colTotals,
        grandTotal,
        excludedCount: rowMissingCount + colMissingCount,
      });
    }

    return {
      colVar,
      colLabel,
      colValues,
      crossTabs,
    };
  }, [rowVars, colVar, dataset.columns, filteredRecords, getUniqueValues]);

  // Calculate chi-square for each cross-tab
  const chiSquareResults = useMemo(() => {
    if (!crossTabData || rowVars.length === 0 || !colVar) return null;

    const results: Map<string, CrossTabResults> = new Map();

    for (const ct of crossTabData.crossTabs) {
      // Build data for chi-square calculation
      const data: { rowValue: string; colValue: string }[] = [];

      for (const record of filteredRecords) {
        const rowVal = record[ct.rowVar];
        const colVal = record[colVar];

        const rowValue = normalizedText(rowVal);
        const colValue = normalizedText(colVal);
        if (rowValue === '' || colValue === '') continue;

        data.push({ rowValue, colValue });
      }

      if (data.length > 0) {
        results.set(ct.rowVar, calculateCrossTabulation(data));
      }
    }

    return results;
  }, [crossTabData, rowVars, colVar, filteredRecords]);

  const formatNumber = (n: number, decimals: number = 2): string => {
    if (!isFinite(n)) return 'N/A';
    return n.toFixed(decimals);
  };

  // Helper to get the correct percentage based on percentType
  const getCellPercent = useCallback((cell: CrossTabCell): number => {
    switch (tableOptions.percentType) {
      case 'row': return cell.rowPercent;
      case 'column': return cell.colPercent;
      case 'total': return cell.totalPercent;
    }
  }, [tableOptions.percentType]);

  const getPercentLabel = useCallback((): string => {
    switch (tableOptions.percentType) {
      case 'row': return 'Row %';
      case 'column': return 'Column %';
      case 'total': return 'Total %';
    }
  }, [tableOptions.percentType]);

  // Export to CSV
  const exportToCSV = useCallback(() => {
    let csv = '';

    if (crossTabData) {
      // Cross-tabulation export - one section per row variable
      crossTabData.crossTabs.forEach((ct, index) => {
        if (index > 0) csv += '\n'; // Blank line between tables

        // Table title
        csv += csvCell(`${ct.rowLabel} by ${crossTabData.colLabel} (${getPercentLabel()})`) + '\n';

        // Headers
        const headers = ['', ...crossTabData.colValues, 'Total'];
        csv += headers.map(csvCell).join(',') + '\n';

        ct.rowValues.forEach(rv => {
          const row = [
            csvCell(rv),
            ...crossTabData.colValues.map(cv => {
              const cell = ct.table.get(rv)!.get(cv)!;
              const pct = getCellPercent(cell);
              return csvCell(`${cell.count} (${formatStatPercent(pct, ct.grandTotal)}%)`);
            }),
            String(ct.rowTotals.get(rv) || 0),
          ];
          csv += row.join(',') + '\n';
        });

        // Totals row
        const totalsRow = [
          '"Total"',
          ...crossTabData.colValues.map(cv => String(ct.colTotals.get(cv) || 0)),
          String(ct.grandTotal),
        ];
        csv += totalsRow.join(',') + '\n';
        if (ct.excludedCount > 0) {
          csv += csvCell(`Excludes ${ct.excludedCount} records with missing values`) + '\n';
        }
      });
    } else if (frequencyData.length > 0) {
      // Frequency table export
      const headers = ['Variable', 'Value', 'N', '%'];
      if (tableOptions.showCumPercent) headers.push('Cum %');
      csv = headers.join(',') + '\n';

      frequencyData.forEach(row => {
        const csvRow = [
          row.isVariableHeader ? csvCell(row.variableLabel) : '',
          csvCell(row.value),
          String(row.count),
          formatStatPercent(row.percent, row.denominator) + '%',
        ];
        if (tableOptions.showCumPercent) csvRow.push(row.isMissing ? '-' : formatStatPercent(row.cumPercent, row.denominator) + '%');
        csv += csvRow.join(',') + '\n';
      });
    }

    if (!csv) return;

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dataset.name}_table.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [crossTabData, frequencyData, tableOptions, dataset.name, getCellPercent, getPercentLabel]);

  // Copy table to clipboard
  const copyToClipboard = useCallback(async () => {
    let text = '';

    if (crossTabData) {
      // Cross-tabulation - one section per row variable
      crossTabData.crossTabs.forEach((ct, index) => {
        if (index > 0) text += '\n'; // Blank line between tables

        // Table title
        text += `${ct.rowLabel} by ${crossTabData.colLabel}\n`;

        // Headers
        const headers = ['', ...crossTabData.colValues, 'Total'];
        text += headers.join('\t') + '\n';

        ct.rowValues.forEach(rv => {
          const row = [
            rv,
            ...crossTabData.colValues.map(cv => {
              const cell = ct.table.get(rv)!.get(cv)!;
              const pct = getCellPercent(cell);
              return `${cell.count} (${formatStatPercent(pct, ct.grandTotal)}%)`;
            }),
            String(ct.rowTotals.get(rv) || 0),
          ];
          text += row.join('\t') + '\n';
        });

        const totalsRow = [
          'Total',
          ...crossTabData.colValues.map(cv => String(ct.colTotals.get(cv) || 0)),
          String(ct.grandTotal),
        ];
        text += totalsRow.join('\t') + '\n';
      });
    } else if (frequencyData.length > 0) {
      // Frequency table
      const headers = ['Variable', 'Value', 'N', '%'];
      if (tableOptions.showCumPercent) headers.push('Cum %');
      text = headers.join('\t') + '\n';

      frequencyData.forEach(row => {
        const cols = [
          row.isVariableHeader ? row.variableLabel : '',
          row.value,
          String(row.count),
          formatStatPercent(row.percent, row.denominator) + '%',
        ];
        if (tableOptions.showCumPercent) cols.push(row.isMissing ? '-' : formatStatPercent(row.cumPercent, row.denominator) + '%');
        text += cols.join('\t') + '\n';
      });
    }

    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      console.error('Failed to copy to clipboard');
    }
  }, [crossTabData, frequencyData, tableOptions, getCellPercent]);

  const hasData = rowVars.length > 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Table Builder</h3>
          <p className="text-sm text-gray-600">
            Place variables in ROWS for frequency tables, or in ROWS and COLUMN for cross-tabulations. Drag them, or use the Row and Column buttons.
          </p>
        </div>
        {hasData && (
          <div className="flex gap-2">
            <button
              onClick={copyToClipboard}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                copySuccess
                  ? 'text-green-700 bg-green-100 border border-green-300'
                  : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {copySuccess ? 'Copied!' : 'Copy Table'}
            </button>
            <button
              onClick={exportToCSV}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Export CSV
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Available Variables & Drop Zones */}
        <div className="space-y-4">
          {/* Filter Data */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Filter Data (optional)</h4>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Filter by</label>
              <select
                value={filterBy}
                onChange={(e) => {
                  // A new filter variable starts with nothing selected
                  setFilterBy(e.target.value);
                  setSelectedFilterValues(new Set());
                  setShowAllFilterValues(false);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="">None (show all)</option>
                {dataset.columns.map(col => (
                  <option key={col.key} value={col.key}>{col.label}</option>
                ))}
              </select>

              {/* Filter value checkboxes */}
              {filterBy && filterValues.length > 0 && (
                <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500">Select values:</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedFilterValues(new Set(filterValues))}
                        className="text-xs text-gray-600 hover:text-gray-900"
                      >
                        All
                      </button>
                      <button
                        onClick={() => setSelectedFilterValues(new Set())}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1 max-h-32 overflow-auto">
                    {(showAllFilterValues ? filterValues : filterValues.slice(0, 5)).map(value => {
                      const count = countInCategory(dataset.records, filterBy, value);
                      return (
                        <label key={value} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedFilterValues.has(value)}
                            onChange={(e) => {
                              const newSet = new Set(selectedFilterValues);
                              if (e.target.checked) {
                                newSet.add(value);
                              } else {
                                newSet.delete(value);
                              }
                              setSelectedFilterValues(newSet);
                            }}
                            className="rounded border-gray-300"
                          />
                          <span className="text-gray-700 truncate flex-1">{value}</span>
                          <span className="text-gray-400 text-xs">({count})</span>
                        </label>
                      );
                    })}
                  </div>
                  {filterValues.length > 5 && (
                    <button
                      onClick={() => setShowAllFilterValues(!showAllFilterValues)}
                      className="mt-2 text-xs text-gray-600 hover:text-gray-900"
                    >
                      {showAllFilterValues ? 'Show less' : `Show ${filterValues.length - 5} more...`}
                    </button>
                  )}
                </div>
              )}
            </div>
            {filterBy && selectedFilterValues.size > 0 && (
              <div className="mt-2 text-xs text-gray-600">
                Showing <span className="font-medium">{filteredRecords.length}</span> of {dataset.records.length} records
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Available Variables</h4>
            <p className="text-xs text-gray-500 mb-3">Drag to ROWS or COLUMN, or use the buttons</p>
            <div className="space-y-1 max-h-48 overflow-auto">
              {dataset.columns.map(col => (
                <div
                  key={col.key}
                  draggable
                  onDragStart={() => handleDragStart(col.key)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-2 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded cursor-move hover:bg-blue-50 hover:border-blue-300 transition-colors ${
                    rowVars.includes(col.key) || colVar === col.key ? 'opacity-50' : ''
                  }`}
                >
                  <span className="flex-1 min-w-0 truncate">
                    {col.label}
                    <span className="text-xs text-gray-400 ml-2">({col.type})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => addToRows(col.key)}
                    disabled={rowVars.includes(col.key)}
                    aria-label={`Add ${col.label} to rows`}
                    className="px-2 py-0.5 text-xs text-blue-700 bg-white border border-blue-200 rounded hover:bg-blue-50 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-default"
                  >
                    Row
                  </button>
                  <button
                    type="button"
                    onClick={() => setAsColumn(col.key)}
                    disabled={colVar === col.key}
                    aria-label={`Use ${col.label} as the column`}
                    className="px-2 py-0.5 text-xs text-green-700 bg-white border border-green-200 rounded hover:bg-green-50 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-default"
                  >
                    Column
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Drop Zones */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDropOnRows}
            className={`border-2 border-dashed rounded-lg p-4 transition-colors ${
              draggedVar ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
            }`}
          >
            <h4 className="text-sm font-semibold text-gray-700 mb-2">ROWS</h4>
            {rowVars.length > 0 ? (
              <div className="space-y-1">
                {rowVars.map(varKey => {
                  const col = dataset.columns.find(c => c.key === varKey);
                  return (
                    <div key={varKey} className="flex items-center justify-between px-2 py-1.5 bg-blue-100 rounded text-sm">
                      <span>{col?.label}</span>
                      <button
                        onClick={() => removeRowVar(varKey)}
                        aria-label={`Remove ${col?.label ?? varKey} from rows`}
                        className="text-gray-500 hover:text-red-500 font-bold"
                      >
                        x
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Drop variables here, or press Row beside a variable</p>
            )}
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDropOnCols}
            className={`border-2 border-dashed rounded-lg p-4 transition-colors ${
              draggedVar ? 'border-green-400 bg-green-50' : 'border-gray-300'
            }`}
          >
            <h4 className="text-sm font-semibold text-gray-700 mb-2">
              COLUMN <span className="font-normal text-gray-400">(optional, max 1)</span>
            </h4>
            {colVar ? (
              <div className="flex items-center justify-between px-2 py-1.5 bg-green-100 rounded text-sm">
                <span>{dataset.columns.find(c => c.key === colVar)?.label}</span>
                <button
                  onClick={clearColumn}
                  aria-label="Remove the column variable"
                  className="text-gray-500 hover:text-red-500 font-bold"
                >
                  x
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Drop here for a cross-tab, or press Column</p>
            )}
          </div>

          {/* Table Options */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Table Options</h4>
            <div className="space-y-3 text-sm">
              {/* Percent Type - only relevant for cross-tabs */}
              {colVar && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Percentage type:</p>
                  <div className="space-y-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="percentType"
                        checked={tableOptions.percentType === 'row'}
                        onChange={() => setTableOptions(prev => ({ ...prev, percentType: 'row' }))}
                        className="border-gray-300"
                      />
                      Row %
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="percentType"
                        checked={tableOptions.percentType === 'column'}
                        onChange={() => setTableOptions(prev => ({ ...prev, percentType: 'column' }))}
                        className="border-gray-300"
                      />
                      Column %
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="percentType"
                        checked={tableOptions.percentType === 'total'}
                        onChange={() => setTableOptions(prev => ({ ...prev, percentType: 'total' }))}
                        className="border-gray-300"
                      />
                      Total %
                    </label>
                  </div>
                </div>
              )}
              {/* Cumulative percent and the missing row apply to frequency
                  tables only. Cross-tabs always exclude records missing either
                  variable and report the count below the table, so leaving these
                  on screen invited unticking "Include missing as row" and
                  concluding from no visible change that nothing was missing. */}
              {!colVar && (
                <>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tableOptions.showCumPercent}
                      onChange={(e) => setTableOptions(prev => ({ ...prev, showCumPercent: e.target.checked }))}
                      className="rounded border-gray-300"
                    />
                    Show Cumulative %
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tableOptions.includeMissing}
                      onChange={(e) => setTableOptions(prev => ({ ...prev, includeMissing: e.target.checked }))}
                      className="rounded border-gray-300"
                    />
                    Include missing as row
                  </label>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Table Preview */}
        <div className="lg:col-span-3">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden h-full">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <h4 className="text-sm font-semibold text-gray-900">Table Preview</h4>
              <p className="text-xs text-gray-500">This is how your table will appear when exported</p>
            </div>

            <div className="p-6">
              {crossTabData ? (
                // Cross-tabulation preview - one table per row variable
                <div className="space-y-8">
                  {crossTabData.crossTabs.map((ct, index) => (
                    <div key={ct.rowVar}>
                      <p className="text-sm font-medium text-gray-900 mb-4">
                        {crossTabData.crossTabs.length > 1 ? `Table ${index + 1}: ` : 'Table: '}
                        {ct.rowLabel} by {crossTabData.colLabel}
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border border-gray-300">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-left border-b border-r border-gray-300"></th>
                              <th className="px-4 py-3 text-center border-b border-gray-300" colSpan={crossTabData.colValues.length}>
                                {crossTabData.colLabel}
                              </th>
                              <th className="px-4 py-3 text-center border-b border-gray-300" rowSpan={2}>Total</th>
                            </tr>
                            <tr>
                              <th className="px-4 py-3 text-left border-b border-r border-gray-300">
                                {ct.rowLabel}
                              </th>
                              {crossTabData.colValues.map(cv => (
                                <th key={cv} className="px-4 py-3 text-center border-b border-gray-300">{cv}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {ct.rowValues.map(rv => (
                              <tr key={rv} className="hover:bg-gray-50">
                                <td className="px-4 py-3 font-medium border-r border-gray-300">{rv}</td>
                                {crossTabData.colValues.map(cv => {
                                  const cell = ct.table.get(rv)!.get(cv)!;
                                  const pct = getCellPercent(cell);
                                  return (
                                    <td key={cv} className="px-4 py-3 text-center">
                                      {cell.count} ({formatStatPercent(pct, ct.grandTotal)}%)
                                    </td>
                                  );
                                })}
                                <td className="px-4 py-3 text-center font-medium">
                                  {ct.rowTotals.get(rv)}{tableOptions.percentType === 'row' && ' (100%)'}
                                </td>
                              </tr>
                            ))}
                            <tr className="bg-gray-50 font-medium">
                              <td className="px-4 py-3 border-t border-r border-gray-300">Total</td>
                              {crossTabData.colValues.map(cv => (
                                <td key={cv} className="px-4 py-3 text-center border-t border-gray-300">
                                  {ct.colTotals.get(cv)}{tableOptions.percentType === 'column' && ' (100%)'}
                                </td>
                              ))}
                              <td className="px-4 py-3 text-center border-t border-gray-300">{ct.grandTotal}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-gray-500 mt-3">
                        Note: {getPercentLabel()} shown.
                        {ct.excludedCount > 0 && ` Excludes ${ct.excludedCount} records with missing values.`}
                      </p>

                      {/* Chi-Square Results */}
                      {(() => {
                        const result = chiSquareResults?.get(ct.rowVar);
                        if (!result) return null;

                        const { chiSquare: cs, rows: csRows, columnValues: csCols } = result;
                        const computable = cs.degreesOfFreedom > 0;
                        // Chi-square assumes expected counts of at least 5. Below
                        // that the p-value is still a number and still looks
                        // authoritative, so it has to be labelled rather than left
                        // for the reader to infer.
                        const assumptionMet = cs.cellsBelowFive === 0;
                        const totalCells = csRows.length * csCols.length;
                        const trustworthy = computable && assumptionMet;

                        return (
                          <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                            <h5 className="text-sm font-semibold text-gray-900 mb-1">
                              {cs.yatesCorrected ? 'Chi-Square Test with Yates\u2019 Correction' : 'Pearson Chi-Square Test'}
                            </h5>
                            <p className="text-xs text-gray-500 mb-3">
                              {cs.yatesCorrected
                                ? 'Continuity-corrected, as for every 2×2 table here and in the 2×2 analysis, so both tabs give the same p-value.'
                                : 'Uncorrected; the continuity correction applies to 2×2 tables only.'}
                            </p>
                            <div className="grid grid-cols-3 gap-4 text-center">
                              <div>
                                <p className="text-xl font-bold text-gray-900">
                                  {formatSigFigs(cs.chiSquare, 3)}
                                </p>
                                <p className="text-xs text-gray-500">χ² Statistic</p>
                              </div>
                              <div>
                                <p className="text-xl font-bold text-gray-900">{cs.degreesOfFreedom}</p>
                                <p className="text-xs text-gray-500">df</p>
                              </div>
                              <div>
                                <p className={`text-xl font-bold ${trustworthy && cs.pValue < 0.05 ? 'text-green-600' : 'text-gray-900'}`}>
                                  {cs.pValue < 0.001 ? '< 0.001' : formatNumber(cs.pValue, 3)}
                                </p>
                                <p className="text-xs text-gray-500">p-value</p>
                              </div>
                            </div>

                            {!assumptionMet && computable && (
                              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900">
                                <p className="font-semibold mb-1">This p-value is unreliable</p>
                                <p>
                                  {cs.cellsBelowFive} of {totalCells} cells have an expected count below 5
                                  {isFinite(cs.minExpectedCount) && ` (smallest ${formatNumber(cs.minExpectedCount, 1)})`}.
                                  Chi-square assumes expected counts of at least 5, so it should not be
                                  quoted for this table.
                                </p>
                                <p className="mt-1">
                                  {csRows.length === 2 && csCols.length === 2
                                    ? 'Use Fisher\u2019s exact test instead: the 2×2 analysis shows it automatically for a table like this.'
                                    : 'Combine sparse categories until every expected count reaches 5, or use an exact test.'}
                                </p>
                              </div>
                            )}

                            <p className="mt-3 text-xs text-gray-600">
                              {!computable
                                ? 'Not computable: the test needs at least two row and two column values.'
                                : !assumptionMet
                                ? 'Interpretation is withheld because the test assumptions are not met.'
                                : cs.pValue < 0.05
                                ? 'The association between these variables is statistically significant (p < 0.05).'
                                : 'No statistically significant association detected (p ≥ 0.05).'}
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              ) : frequencyData.length > 0 ? (
                // Frequency table preview
                <div>
                  <p className="text-sm font-medium text-gray-900 mb-4">
                    Table: Frequency of selected variables (N = {filteredRecords.length} records)
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-gray-300">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left border-b border-gray-300">Characteristic</th>
                          <th className="px-4 py-3 text-right border-b border-gray-300">N</th>
                          <th className="px-4 py-3 text-right border-b border-gray-300">%</th>
                          {tableOptions.showCumPercent && (
                            <th className="px-4 py-3 text-right border-b border-gray-300">Cum %</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {frequencyData.map((row, idx) => {
                          const isNewVariable = row.isVariableHeader;
                          const prevVariable = idx > 0 ? frequencyData[idx - 1].variable : null;
                          const showSeparator = isNewVariable && prevVariable && prevVariable !== row.variable;

                          return (
                            <React.Fragment key={`${row.variable}-${row.value}`}>
                              {showSeparator && (
                                <tr>
                                  <td colSpan={4} className="border-t-2 border-gray-300"></td>
                                </tr>
                              )}
                              {isNewVariable && (
                                <tr className="bg-gray-50">
                                  <td
                                    className="px-4 py-2 font-semibold text-gray-900"
                                    colSpan={3 + (tableOptions.showCumPercent ? 1 : 0)}
                                  >
                                    {row.variableLabel}
                                    {/* Say what the percentages are out of whenever it is not N */}
                                    {row.denominator !== filteredRecords.length && (
                                      <span className="ml-2 text-xs font-normal text-gray-500">
                                        (n = {row.denominator}; {row.missingCount} missing excluded from %)
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              )}
                              <tr className={`hover:bg-gray-50 ${row.isMissing ? 'text-gray-500' : ''}`}>
                                <td className="px-4 py-2 pl-8">{row.value}</td>
                                <td className="px-4 py-2 text-right">{row.count}</td>
                                <td className="px-4 py-2 text-right">{formatStatPercent(row.percent, row.denominator)}</td>
                                {tableOptions.showCumPercent && (
                                  <td className="px-4 py-2 text-right">{row.isMissing ? '-' : formatStatPercent(row.cumPercent, row.denominator)}</td>
                                )}
                              </tr>
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-400 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                  <div className="text-center">
                    <p className="text-lg mb-2">Add variables to build your table</p>
                    <p className="text-sm">ROWS only = frequency table</p>
                    <p className="text-sm">ROWS + COLUMN = cross-tabulation</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
