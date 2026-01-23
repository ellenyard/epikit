import { useState, useMemo, useCallback } from 'react';
import type { Dataset } from '../../types/analysis';
import { ResultsActions, ExportIcons, AdvancedOptions } from '../shared';

interface TwoWayTableBuilderProps {
  dataset: Dataset;
  onNavigateTo2x2?: () => void;
}

type DenominatorMode = 'total' | 'valid';

interface CrossTabCell {
  count: number;
  rowPercent: number;
  colPercent: number;
  totalPercent: number;
}

interface CrossTabResult {
  rowValues: string[];
  colValues: string[];
  cells: Map<string, CrossTabCell>; // key: `${rowVal}|${colVal}`
  rowTotals: Map<string, number>;
  colTotals: Map<string, number>;
  grandTotal: number;
  missingRowCount: number;
  missingColCount: number;
  missingBothCount: number;
}

// Format number to specified significant figures
const formatSigFigs = (n: number, sigFigs: number = 2): string => {
  if (!isFinite(n) || n === 0) return '0';
  const magnitude = Math.floor(Math.log10(Math.abs(n)));
  const precision = sigFigs - 1 - magnitude;
  if (precision < 0) {
    return Math.round(n / Math.pow(10, -precision)) * Math.pow(10, -precision) + '';
  }
  return n.toFixed(Math.max(0, precision));
};

// Format percentage based on sample size
const formatPercent = (value: number, sampleSize: number): string => {
  const sigFigs = sampleSize >= 1000 ? 3 : 2;
  return formatSigFigs(value, sigFigs);
};

export function TwoWayTableBuilder({ dataset, onNavigateTo2x2 }: TwoWayTableBuilderProps) {
  const [rowVariable, setRowVariable] = useState<string>('');
  const [colVariable, setColVariable] = useState<string>('');
  const [denominatorMode, setDenominatorMode] = useState<DenominatorMode>('total');
  const [includeMissingInPercent, setIncludeMissingInPercent] = useState<boolean>(false);
  const [showRowPercent, setShowRowPercent] = useState<boolean>(true);
  const [showColPercent, setShowColPercent] = useState<boolean>(true);
  const [showTotalPercent, setShowTotalPercent] = useState<boolean>(false);

  // Get valid categorical/date columns (exclude ID, free-text, coordinates)
  const validColumns = useMemo(() => {
    return dataset.columns.filter(col => {
      // Exclude likely ID/text/coordinate fields
      const keyLower = col.key.toLowerCase();
      const labelLower = col.label.toLowerCase();

      // Check for ID patterns
      if (keyLower === 'id' || keyLower.endsWith('_id') || keyLower.includes('participant') ||
          labelLower.includes('id') && labelLower.split(' ').length <= 2) {
        return false;
      }

      // Check for coordinate patterns
      if (keyLower.includes('latitude') || keyLower.includes('longitude') ||
          keyLower.includes('lat') || keyLower.includes('lon') || keyLower.includes('long')) {
        return false;
      }

      // Exclude pure numeric types (except dates) unless they have few unique values
      if (col.type === 'number') {
        const uniqueValues = new Set(dataset.records.map(r => r[col.key]));
        // Allow if it appears to be categorical (few unique values)
        if (uniqueValues.size > 20) {
          return false;
        }
      }

      // Check unique values - exclude if too many (likely free-text)
      const uniqueValues = new Set(
        dataset.records
          .map(r => r[col.key])
          .filter(v => v !== null && v !== undefined && String(v).trim() !== '')
      );

      return uniqueValues.size >= 2 && uniqueValues.size <= 30;
    });
  }, [dataset]);

  // Get unique values for a variable
  const getUniqueValues = useCallback((varKey: string): string[] => {
    const values = new Set<string>();
    for (const record of dataset.records) {
      const val = record[varKey];
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        values.add(String(val));
      }
    }
    // Preserve original order from the dataset
    const orderedValues: string[] = [];
    const seen = new Set<string>();
    for (const record of dataset.records) {
      const val = record[varKey];
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        const strVal = String(val);
        if (!seen.has(strVal)) {
          seen.add(strVal);
          orderedValues.push(strVal);
        }
      }
    }
    return orderedValues;
  }, [dataset.records]);

  // Calculate cross-tabulation
  const crossTab = useMemo((): CrossTabResult | null => {
    if (!rowVariable || !colVariable) return null;

    const rowValues = getUniqueValues(rowVariable);
    const colValues = getUniqueValues(colVariable);

    // Initialize cells
    const cells = new Map<string, CrossTabCell>();
    const rowTotals = new Map<string, number>();
    const colTotals = new Map<string, number>();

    // Initialize all cells to 0
    for (const rv of rowValues) {
      rowTotals.set(rv, 0);
      for (const cv of colValues) {
        cells.set(`${rv}|${cv}`, { count: 0, rowPercent: 0, colPercent: 0, totalPercent: 0 });
      }
    }
    for (const cv of colValues) {
      colTotals.set(cv, 0);
    }

    // Add Missing/Unknown categories
    rowValues.push('Missing/Unknown');
    colValues.push('Missing/Unknown');
    rowTotals.set('Missing/Unknown', 0);
    colTotals.set('Missing/Unknown', 0);

    // Initialize missing cells
    for (const rv of rowValues) {
      cells.set(`${rv}|Missing/Unknown`, { count: 0, rowPercent: 0, colPercent: 0, totalPercent: 0 });
    }
    for (const cv of colValues) {
      cells.set(`Missing/Unknown|${cv}`, { count: 0, rowPercent: 0, colPercent: 0, totalPercent: 0 });
    }

    let grandTotal = 0;
    let missingRowCount = 0;
    let missingColCount = 0;
    let missingBothCount = 0;

    // Count records
    for (const record of dataset.records) {
      const rowVal = record[rowVariable];
      const colVal = record[colVariable];

      const rowStr = (rowVal === null || rowVal === undefined || String(rowVal).trim() === '')
        ? 'Missing/Unknown'
        : String(rowVal);
      const colStr = (colVal === null || colVal === undefined || String(colVal).trim() === '')
        ? 'Missing/Unknown'
        : String(colVal);

      const key = `${rowStr}|${colStr}`;
      const cell = cells.get(key) || { count: 0, rowPercent: 0, colPercent: 0, totalPercent: 0 };
      cell.count++;
      cells.set(key, cell);

      rowTotals.set(rowStr, (rowTotals.get(rowStr) || 0) + 1);
      colTotals.set(colStr, (colTotals.get(colStr) || 0) + 1);
      grandTotal++;

      if (rowStr === 'Missing/Unknown') missingRowCount++;
      if (colStr === 'Missing/Unknown') missingColCount++;
      if (rowStr === 'Missing/Unknown' && colStr === 'Missing/Unknown') missingBothCount++;
    }

    // Calculate denominator based on mode
    let percentDenom = grandTotal;
    if (denominatorMode === 'valid' && !includeMissingInPercent) {
      // Exclude records where either variable is missing
      percentDenom = grandTotal - missingRowCount - missingColCount + missingBothCount;
    }

    // Calculate percentages
    for (const rv of rowValues) {
      const rowTotal = rowTotals.get(rv) || 0;

      for (const cv of colValues) {
        const key = `${rv}|${cv}`;
        const cell = cells.get(key);
        if (cell) {
          const colTotal = colTotals.get(cv) || 0;

          // Row percentage (denominator = row total)
          cell.rowPercent = rowTotal > 0 ? (cell.count / rowTotal) * 100 : 0;

          // Column percentage (denominator = column total)
          cell.colPercent = colTotal > 0 ? (cell.count / colTotal) * 100 : 0;

          // Total percentage (denominator = grand total or valid total)
          if (denominatorMode === 'total' || includeMissingInPercent) {
            cell.totalPercent = grandTotal > 0 ? (cell.count / grandTotal) * 100 : 0;
          } else {
            // Only calculate for non-missing cells
            if (rv !== 'Missing/Unknown' && cv !== 'Missing/Unknown') {
              cell.totalPercent = percentDenom > 0 ? (cell.count / percentDenom) * 100 : 0;
            } else {
              cell.totalPercent = 0;
            }
          }
        }
      }
    }

    return {
      rowValues,
      colValues,
      cells,
      rowTotals,
      colTotals,
      grandTotal,
      missingRowCount,
      missingColCount,
      missingBothCount,
    };
  }, [rowVariable, colVariable, dataset.records, getUniqueValues, denominatorMode, includeMissingInPercent]);

  // Check for small cell counts
  const hasSmallCells = useMemo(() => {
    if (!crossTab) return false;
    for (const cell of crossTab.cells.values()) {
      if (cell.count > 0 && cell.count < 5) {
        return true;
      }
    }
    return false;
  }, [crossTab]);

  // Get column label
  const getColumnLabel = (key: string): string => {
    const col = dataset.columns.find(c => c.key === key);
    return col?.label || key;
  };

  // Export to CSV
  const exportToCSV = useCallback(() => {
    if (!crossTab || !rowVariable || !colVariable) return;

    const timestamp = new Date().toISOString();
    const rowLabel = getColumnLabel(rowVariable);
    const colLabel = getColumnLabel(colVariable);

    let csv = `# Two-Way Table Export\n`;
    csv += `# Timestamp: ${timestamp}\n`;
    csv += `# Row Variable: ${rowLabel}\n`;
    csv += `# Column Variable: ${colLabel}\n`;
    csv += `# Denominator: ${denominatorMode === 'total' ? 'Total records' : 'Valid records only'}\n`;
    csv += `# Include missing in percentages: ${includeMissingInPercent ? 'Yes' : 'No'}\n\n`;

    // Header row
    const headers = [rowLabel, ...crossTab.colValues.slice(0, -1), 'Missing/Unknown', 'Row Total'];
    csv += headers.map(h => `"${h}"`).join(',') + '\n';

    // Data rows
    for (const rv of crossTab.rowValues) {
      const rowTotal = crossTab.rowTotals.get(rv) || 0;
      const rowData = [rv];

      for (const cv of crossTab.colValues) {
        const cell = crossTab.cells.get(`${rv}|${cv}`);
        if (cell) {
          let cellValue = String(cell.count);
          const percentParts: string[] = [];
          if (showRowPercent) percentParts.push(`Row: ${formatPercent(cell.rowPercent, crossTab.grandTotal)}%`);
          if (showColPercent) percentParts.push(`Col: ${formatPercent(cell.colPercent, crossTab.grandTotal)}%`);
          if (showTotalPercent) percentParts.push(`Total: ${formatPercent(cell.totalPercent, crossTab.grandTotal)}%`);
          if (percentParts.length > 0) {
            cellValue += ` (${percentParts.join('; ')})`;
          }
          rowData.push(cellValue);
        } else {
          rowData.push('0');
        }
      }

      rowData.push(String(rowTotal));
      csv += rowData.map(d => `"${d}"`).join(',') + '\n';
    }

    // Column totals row
    const colTotalRow = ['Column Total'];
    for (const cv of crossTab.colValues) {
      colTotalRow.push(String(crossTab.colTotals.get(cv) || 0));
    }
    colTotalRow.push(String(crossTab.grandTotal));
    csv += colTotalRow.map(d => `"${d}"`).join(',') + '\n';

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `two_way_table_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [crossTab, rowVariable, colVariable, denominatorMode, includeMissingInPercent, showRowPercent, showColPercent, showTotalPercent]);

  // Check if selected variables are valid
  const showFreeTextWarning = useMemo(() => {
    if (!rowVariable && !colVariable) return false;
    const allColumns = dataset.columns;

    const checkColumn = (key: string) => {
      const col = allColumns.find(c => c.key === key);
      if (!col) return false;

      const uniqueValues = new Set(
        dataset.records
          .map(r => r[key])
          .filter(v => v !== null && v !== undefined && String(v).trim() !== '')
      );

      return uniqueValues.size > 30;
    };

    return (rowVariable && checkColumn(rowVariable)) || (colVariable && checkColumn(colVariable));
  }, [rowVariable, colVariable, dataset]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Configuration */}
        <div className="lg:col-span-1 space-y-4">
          {/* Variable Selection */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-4">Select Variables</h4>

            {/* Row Variable */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Row Variable
              </label>
              <select
                value={rowVariable}
                onChange={(e) => setRowVariable(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-sm"
              >
                <option value="">Select variable...</option>
                {validColumns.map(col => (
                  <option
                    key={col.key}
                    value={col.key}
                    disabled={col.key === colVariable}
                  >
                    {col.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Column Variable */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Column Variable
              </label>
              <select
                value={colVariable}
                onChange={(e) => setColVariable(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-sm"
              >
                <option value="">Select variable...</option>
                {validColumns.map(col => (
                  <option
                    key={col.key}
                    value={col.key}
                    disabled={col.key === rowVariable}
                  >
                    {col.label}
                  </option>
                ))}
              </select>
            </div>

            {showFreeTextWarning && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg" role="alert">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-yellow-800">High-Cardinality Variable Detected</p>
                    <p className="text-sm text-yellow-700 mt-1">
                      One or more selected variables has more than 30 unique values and may be a free-text or ID field.
                      Consider creating categories in <strong>Review/Clean</strong> before using this analysis.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Denominator Settings */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Percentage Settings</h4>

            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Denominator for Total %</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="denominatorMode"
                      checked={denominatorMode === 'total'}
                      onChange={() => setDenominatorMode('total')}
                      className="text-gray-700"
                    />
                    <span className="text-sm text-gray-700">% of total records</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="denominatorMode"
                      checked={denominatorMode === 'valid'}
                      onChange={() => setDenominatorMode('valid')}
                      className="text-gray-700"
                    />
                    <span className="text-sm text-gray-700">% of valid records</span>
                  </label>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeMissingInPercent}
                    onChange={(e) => setIncludeMissingInPercent(e.target.checked)}
                    className="rounded text-gray-700 focus:ring-gray-500"
                  />
                  <span className="text-sm text-gray-700">Include missing in % denominator</span>
                </label>
              </div>
            </div>
          </div>

          {/* Display Options */}
          <AdvancedOptions>
            <div className="space-y-3">
              <p className="text-xs font-medium text-gray-600 mb-2">Show Percentages</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showRowPercent}
                  onChange={(e) => setShowRowPercent(e.target.checked)}
                  className="rounded text-gray-700 focus:ring-gray-500"
                />
                <span className="text-sm text-gray-700">Row % (denominator = row total)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showColPercent}
                  onChange={(e) => setShowColPercent(e.target.checked)}
                  className="rounded text-gray-700 focus:ring-gray-500"
                />
                <span className="text-sm text-gray-700">Column % (denominator = column total)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTotalPercent}
                  onChange={(e) => setShowTotalPercent(e.target.checked)}
                  className="rounded text-gray-700 focus:ring-gray-500"
                />
                <span className="text-sm text-gray-700">Total % (denominator = grand total)</span>
              </label>
            </div>
          </AdvancedOptions>
        </div>

        {/* Right Panel - Results */}
        <div className="lg:col-span-2">
          {/* Descriptive-Only Notice Banner */}
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="text-sm font-medium text-blue-900">Descriptive counts and percentages only</p>
                <p className="text-sm text-blue-700 mt-1">
                  This table shows frequency distributions without statistical testing.
                  {onNavigateTo2x2 && (
                    <>
                      {' '}For analytic comparisons with risk ratios, odds ratios, and confidence intervals,{' '}
                      <button
                        onClick={onNavigateTo2x2}
                        className="font-medium underline hover:text-blue-900"
                      >
                        use the 2×2 Analysis tab
                      </button>.
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>

          {!rowVariable || !colVariable ? (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-400">
              <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <p>Select a row and column variable to create a two-way table</p>
            </div>
          ) : crossTab ? (
            <div className="space-y-4">
              {/* Small Cell Warning */}
              {hasSmallCells && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg" role="alert">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-yellow-800">Small Cell Sizes Detected</p>
                      <p className="text-sm text-yellow-700 mt-1">
                        Some cells have counts less than 5. Small cell sizes may risk disclosure; consider grouping categories.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Results Table */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-900">
                    {getColumnLabel(rowVariable)} × {getColumnLabel(colVariable)}
                  </h4>
                  <p className="text-xs text-gray-500 mt-1">
                    N = {crossTab.grandTotal} |
                    Missing row: {crossTab.missingRowCount} |
                    Missing column: {crossTab.missingColCount}
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase border-b border-r border-gray-200">
                          {getColumnLabel(rowVariable)} \ {getColumnLabel(colVariable)}
                        </th>
                        {crossTab.colValues.map(cv => (
                          <th
                            key={cv}
                            className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase border-b border-gray-200"
                          >
                            {cv}
                          </th>
                        ))}
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-700 uppercase border-b border-l border-gray-200 bg-gray-100">
                          Row Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {crossTab.rowValues.map((rv, rowIdx) => {
                        const rowTotal = crossTab.rowTotals.get(rv) || 0;
                        const isLastRow = rowIdx === crossTab.rowValues.length - 1;

                        return (
                          <tr
                            key={rv}
                            className={`${rv === 'Missing/Unknown' ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                          >
                            <td className={`px-3 py-2 font-medium text-gray-900 border-r border-gray-200 ${isLastRow ? 'border-t' : ''}`}>
                              {rv}
                            </td>
                            {crossTab.colValues.map((cv, colIdx) => {
                              const cell = crossTab.cells.get(`${rv}|${cv}`);
                              const count = cell?.count || 0;
                              const isSmall = count > 0 && count < 5;
                              const isLastCol = colIdx === crossTab.colValues.length - 1;

                              return (
                                <td
                                  key={cv}
                                  className={`px-3 py-2 text-center ${isSmall ? 'bg-yellow-50' : ''} ${isLastRow ? 'border-t' : ''} ${isLastCol ? 'bg-gray-50' : ''}`}
                                >
                                  <div className="font-medium text-gray-900">{count}</div>
                                  {cell && (showRowPercent || showColPercent || showTotalPercent) && (
                                    <div className="text-xs text-gray-500 mt-0.5 space-y-0.5">
                                      {showRowPercent && (
                                        <div>Row: {formatPercent(cell.rowPercent, crossTab.grandTotal)}%</div>
                                      )}
                                      {showColPercent && (
                                        <div>Col: {formatPercent(cell.colPercent, crossTab.grandTotal)}%</div>
                                      )}
                                      {showTotalPercent && (
                                        <div>Total: {formatPercent(cell.totalPercent, crossTab.grandTotal)}%</div>
                                      )}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                            <td className={`px-3 py-2 text-center font-semibold text-gray-900 border-l border-gray-200 bg-gray-100 ${isLastRow ? 'border-t' : ''}`}>
                              {rowTotal}
                            </td>
                          </tr>
                        );
                      })}
                      {/* Column Totals Row */}
                      <tr className="bg-gray-100 border-t border-gray-200">
                        <td className="px-3 py-2 font-semibold text-gray-700 border-r border-gray-200">
                          Column Total
                        </td>
                        {crossTab.colValues.map(cv => (
                          <td key={cv} className="px-3 py-2 text-center font-semibold text-gray-900">
                            {crossTab.colTotals.get(cv) || 0}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-center font-bold text-gray-900 border-l border-gray-200">
                          {crossTab.grandTotal}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Footer Note */}
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 space-y-1">
                  <p className="text-xs text-gray-600">
                    <strong>Denominator:</strong>{' '}
                    {denominatorMode === 'total' ? 'Total records' : 'Valid records only'}
                    {' | '}
                    <strong>Missing in %:</strong> {includeMissingInPercent ? 'Included' : 'Excluded'}
                  </p>
                  <p className="text-xs text-gray-500">
                    Row % = count ÷ row total | Col % = count ÷ column total | Total % = count ÷ grand total
                  </p>
                </div>

                {/* Results Actions */}
                <div className="px-4 pb-4">
                  <ResultsActions
                    actions={[
                      {
                        label: 'Export CSV',
                        onClick: exportToCSV,
                        icon: ExportIcons.csv,
                        variant: 'primary',
                      },
                    ]}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
