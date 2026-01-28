import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type { Dataset } from '../../types/analysis';
import { calculateCrossTabulation } from '../../utils/statistics';
import type { CrossTabResults } from '../../utils/statistics';

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

/**
 * TableBuilder: Drag-and-drop table builder for frequency tables and cross-tabulations
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
  // Use controlled state if provided, otherwise use local state
  const [internalRowVars, setInternalRowVars] = useState<string[]>([]);
  const [internalColVar, setInternalColVar] = useState<string>('');

  const rowVars = controlledRowVars !== undefined ? controlledRowVars : internalRowVars;
  const setRowVars = onRowVarsChange || setInternalRowVars;
  const colVar = controlledColVar !== undefined ? controlledColVar : internalColVar;
  const setColVar = onColVarChange || setInternalColVar;

  const [draggedVar, setDraggedVar] = useState<string | null>(null);
  const [tableOptions, setTableOptions] = useState<TableOptions>({
    percentType: 'column',
    showCumPercent: false,
    includeMissing: true,
  });
  const [copySuccess, setCopySuccess] = useState(false);

  // Filter state
  const [filterBy, setFilterBy] = useState<string>('');
  const [selectedFilterValues, setSelectedFilterValues] = useState<Set<string>>(new Set());
  const [showAllFilterValues, setShowAllFilterValues] = useState(false);

  // Apply initial row vars when they change (for quick actions from Explorer)
  useEffect(() => {
    if (initialRowVars.length > 0) {
      setRowVars(initialRowVars);
      onRowVarsUsed?.();
    }
  }, [initialRowVars, onRowVarsUsed, setRowVars]);

  // Get unique values for a variable
  const getUniqueValues = useCallback((varKey: string): string[] => {
    const values = new Set<string>();
    for (const record of dataset.records) {
      const val = record[varKey];
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        values.add(String(val));
      }
    }
    return Array.from(values).sort();
  }, [dataset.records]);

  // Get unique values for the filter dropdown
  const filterValues = useMemo(() => {
    if (!filterBy) return [];
    const values = new Set(dataset.records.map(r => String(r[filterBy] ?? 'Unknown')));
    return Array.from(values).sort();
  }, [dataset.records, filterBy]);

  // Reset selected filter values when filter variable changes
  useEffect(() => {
    setSelectedFilterValues(new Set());
    setShowAllFilterValues(false);
  }, [filterBy]);

  // Apply filter to records
  const filteredRecords = useMemo(() => {
    if (!filterBy || selectedFilterValues.size === 0) {
      return dataset.records;
    }
    return dataset.records.filter(record => {
      const value = String(record[filterBy] ?? 'Unknown');
      return selectedFilterValues.has(value);
    });
  }, [dataset.records, filterBy, selectedFilterValues]);

  // Drag handlers
  const handleDragStart = (varKey: string) => {
    setDraggedVar(varKey);
  };

  const handleDragEnd = () => {
    setDraggedVar(null);
  };

  const handleDropOnRows = () => {
    if (draggedVar && !rowVars.includes(draggedVar)) {
      // If it was in column, remove it from there
      if (colVar === draggedVar) {
        setColVar('');
      }
      setRowVars([...rowVars, draggedVar]);
    }
    setDraggedVar(null);
  };

  const handleDropOnCols = () => {
    if (draggedVar) {
      // If it was in rows, remove it from there
      setRowVars(rowVars.filter(v => v !== draggedVar));
      setColVar(draggedVar);
    }
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
        if (val === null || val === undefined || String(val).trim() === '') {
          missingCount++;
        } else {
          const strVal = String(val);
          valueCounts.set(strVal, (valueCounts.get(strVal) || 0) + 1);
        }
      }

      const denominator = tableOptions.includeMissing ? totalRecords : totalRecords - missingCount;
      const sortedValues = Array.from(valueCounts.entries()).sort((a, b) => b[1] - a[1]);

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

        if (rowVal === null || rowVal === undefined || String(rowVal).trim() === '') {
          rowMissingCount++;
          continue;
        }
        if (colVal === null || colVal === undefined || String(colVal).trim() === '') {
          colMissingCount++;
          continue;
        }

        const rv = String(rowVal);
        const cv = String(colVal);

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

        if (rowVal === null || rowVal === undefined || String(rowVal).trim() === '') continue;
        if (colVal === null || colVal === undefined || String(colVal).trim() === '') continue;

        data.push({
          rowValue: String(rowVal),
          colValue: String(colVal),
        });
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
  const getCellPercent = (cell: CrossTabCell): number => {
    switch (tableOptions.percentType) {
      case 'row': return cell.rowPercent;
      case 'column': return cell.colPercent;
      case 'total': return cell.totalPercent;
    }
  };

  const getPercentLabel = (): string => {
    switch (tableOptions.percentType) {
      case 'row': return 'Row %';
      case 'column': return 'Column %';
      case 'total': return 'Total %';
    }
  };

  // Export to CSV
  const exportToCSV = useCallback(() => {
    let csv = '';

    if (crossTabData) {
      // Cross-tabulation export - one section per row variable
      crossTabData.crossTabs.forEach((ct, index) => {
        if (index > 0) csv += '\n'; // Blank line between tables

        // Table title
        csv += `"${ct.rowLabel} by ${crossTabData.colLabel}"\n`;

        // Headers
        const headers = ['', ...crossTabData.colValues, 'Total'];
        csv += headers.map(h => `"${h}"`).join(',') + '\n';

        ct.rowValues.forEach(rv => {
          const row = [
            `"${rv}"`,
            ...crossTabData.colValues.map(cv => {
              const cell = ct.table.get(rv)!.get(cv)!;
              const pct = getCellPercent(cell);
              return `"${cell.count} (${pct.toFixed(1)}%)"`;
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
      });
    } else if (frequencyData.length > 0) {
      // Frequency table export
      const headers = ['Variable', 'Value', 'N', '%'];
      if (tableOptions.showCumPercent) headers.push('Cum %');
      csv = headers.join(',') + '\n';

      frequencyData.forEach(row => {
        const csvRow = [
          row.isVariableHeader ? `"${row.variableLabel}"` : '',
          `"${row.value}"`,
          String(row.count),
          row.percent.toFixed(1) + '%',
        ];
        if (tableOptions.showCumPercent) csvRow.push(row.isMissing ? '-' : row.cumPercent.toFixed(1) + '%');
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
  }, [crossTabData, frequencyData, tableOptions, dataset.name]);

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
              return `${cell.count} (${pct.toFixed(1)}%)`;
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
          row.percent.toFixed(1) + '%',
        ];
        if (tableOptions.showCumPercent) cols.push(row.isMissing ? '-' : row.cumPercent.toFixed(1) + '%');
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
  }, [crossTabData, frequencyData, tableOptions]);

  const hasData = rowVars.length > 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Table Builder</h3>
          <p className="text-sm text-gray-600">
            Drag variables to create frequency tables (rows only) or cross-tabulations (rows + column)
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
                onChange={(e) => setFilterBy(e.target.value)}
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
                      const count = dataset.records.filter(r => String(r[filterBy] ?? 'Unknown') === value).length;
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
            <p className="text-xs text-gray-500 mb-3">Drag to ROWS or COLUMN</p>
            <div className="space-y-1 max-h-48 overflow-auto">
              {dataset.columns.map(col => (
                <div
                  key={col.key}
                  draggable
                  onDragStart={() => handleDragStart(col.key)}
                  onDragEnd={handleDragEnd}
                  className={`px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded cursor-move hover:bg-blue-50 hover:border-blue-300 transition-colors ${
                    rowVars.includes(col.key) || colVar === col.key ? 'opacity-50' : ''
                  }`}
                >
                  {col.label}
                  <span className="text-xs text-gray-400 ml-2">({col.type})</span>
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
                        className="text-gray-500 hover:text-red-500 font-bold"
                      >
                        x
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Drop variables here for rows</p>
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
                  className="text-gray-500 hover:text-red-500 font-bold"
                >
                  x
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Drop here for cross-tab</p>
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
                                      {cell.count} ({pct.toFixed(1)}%)
                                    </td>
                                  );
                                })}
                                <td className="px-4 py-3 text-center font-medium">
                                  {ct.rowTotals.get(rv)}{tableOptions.percentType === 'row' && ' (100.0%)'}
                                </td>
                              </tr>
                            ))}
                            <tr className="bg-gray-50 font-medium">
                              <td className="px-4 py-3 border-t border-r border-gray-300">Total</td>
                              {crossTabData.colValues.map(cv => (
                                <td key={cv} className="px-4 py-3 text-center border-t border-gray-300">
                                  {ct.colTotals.get(cv)}{tableOptions.percentType === 'column' && ' (100.0%)'}
                                </td>
                              ))}
                              <td className="px-4 py-3 text-center border-t border-gray-300">{ct.grandTotal}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      {ct.excludedCount > 0 && (
                        <p className="text-xs text-gray-500 mt-3">
                          Note: {getPercentLabel()} shown. Excludes {ct.excludedCount} records with missing values.
                        </p>
                      )}

                      {/* Chi-Square Results */}
                      {chiSquareResults?.get(ct.rowVar) && (
                        <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                          <h5 className="text-sm font-semibold text-gray-900 mb-3">Chi-Square Test</h5>
                          <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                              <p className="text-xl font-bold text-gray-900">
                                {formatNumber(chiSquareResults.get(ct.rowVar)!.chiSquare.chiSquare)}
                              </p>
                              <p className="text-xs text-gray-500">χ² Statistic</p>
                            </div>
                            <div>
                              <p className="text-xl font-bold text-gray-900">
                                {chiSquareResults.get(ct.rowVar)!.chiSquare.degreesOfFreedom}
                              </p>
                              <p className="text-xs text-gray-500">df</p>
                            </div>
                            <div>
                              <p className={`text-xl font-bold ${chiSquareResults.get(ct.rowVar)!.chiSquare.pValue < 0.05 ? 'text-green-600' : 'text-gray-900'}`}>
                                {chiSquareResults.get(ct.rowVar)!.chiSquare.pValue < 0.001
                                  ? '< 0.001'
                                  : formatNumber(chiSquareResults.get(ct.rowVar)!.chiSquare.pValue, 3)}
                              </p>
                              <p className="text-xs text-gray-500">p-value</p>
                            </div>
                          </div>
                          <p className="mt-3 text-xs text-gray-600">
                            {chiSquareResults.get(ct.rowVar)!.chiSquare.pValue < 0.05
                              ? 'The association between these variables is statistically significant (p < 0.05).'
                              : 'No statistically significant association detected (p ≥ 0.05).'}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : frequencyData.length > 0 ? (
                // Frequency table preview
                <div>
                  <p className="text-sm font-medium text-gray-900 mb-4">
                    Table: Characteristics of Cases (N = {filteredRecords.length})
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
                                  </td>
                                </tr>
                              )}
                              <tr className={`hover:bg-gray-50 ${row.isMissing ? 'text-gray-500' : ''}`}>
                                <td className="px-4 py-2 pl-8">{row.value}</td>
                                <td className="px-4 py-2 text-right">{row.count}</td>
                                <td className="px-4 py-2 text-right">{row.percent.toFixed(1)}</td>
                                {tableOptions.showCumPercent && (
                                  <td className="px-4 py-2 text-right">{row.isMissing ? '-' : row.cumPercent.toFixed(1)}</td>
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
                    <p className="text-lg mb-2">Drag variables to build your table</p>
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
