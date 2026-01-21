import { useState, useMemo, useCallback } from 'react';
import type { Dataset } from '../../types/analysis';

interface OneWayTablesProps {
  dataset: Dataset;
}

interface VariableConfig {
  expanded: boolean;
  valueOfInterest: string;
}

interface TableRow {
  variable: string;
  variableLabel: string;
  denominatorN: number;
  value: string;
  count: number;
  percent: number;
  isFirstRowForVariable: boolean;
}

export function OneWayTables({ dataset }: OneWayTablesProps) {
  const [selectedVariables, setSelectedVariables] = useState<string[]>([]);
  const [variableConfigs, setVariableConfigs] = useState<Record<string, VariableConfig>>({});
  const [percentMode, setPercentMode] = useState<'total' | 'non-missing'>('total');
  const [showPercentHelp, setShowPercentHelp] = useState(false);

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

  // Get config for a variable, with defaults
  const getConfig = useCallback((varKey: string): VariableConfig => {
    if (variableConfigs[varKey]) {
      return variableConfigs[varKey];
    }
    const uniqueValues = getUniqueValues(varKey);
    // Default to "Yes" if it exists, otherwise first value
    const defaultValue = uniqueValues.includes('Yes') ? 'Yes' : uniqueValues[0] || '';
    return { expanded: true, valueOfInterest: defaultValue };
  }, [variableConfigs, getUniqueValues]);

  // Update config for a variable
  const updateConfig = useCallback((varKey: string, updates: Partial<VariableConfig>) => {
    setVariableConfigs(prev => ({
      ...prev,
      [varKey]: { ...getConfig(varKey), ...updates }
    }));
  }, [getConfig]);

  // Toggle variable selection
  const toggleVariable = useCallback((varKey: string) => {
    setSelectedVariables(prev => {
      if (prev.includes(varKey)) {
        return prev.filter(v => v !== varKey);
      } else {
        return [...prev, varKey];
      }
    });
  }, []);

  // Calculate table rows
  const tableRows = useMemo((): TableRow[] => {
    const rows: TableRow[] = [];
    const totalRecords = dataset.records.length;

    for (const varKey of selectedVariables) {
      const column = dataset.columns.find(c => c.key === varKey);
      if (!column) continue;

      const config = getConfig(varKey);

      // Count values and missing
      const valueCounts = new Map<string, number>();
      let missingCount = 0;

      for (const record of dataset.records) {
        const val = record[varKey];
        if (val === null || val === undefined || String(val).trim() === '') {
          missingCount++;
        } else {
          const strVal = String(val);
          valueCounts.set(strVal, (valueCounts.get(strVal) || 0) + 1);
        }
      }

      // Calculate denominator based on percent mode
      const denominatorN = percentMode === 'total' ? totalRecords : totalRecords - missingCount;

      // Get values to display
      let valuesToShow: string[];
      if (config.expanded) {
        valuesToShow = Array.from(valueCounts.keys()).sort();
        // Add missing as a row if percent mode is total and there are missing values
        if (percentMode === 'total' && missingCount > 0) {
          valuesToShow.push('(Missing)');
        }
      } else {
        valuesToShow = [config.valueOfInterest];
      }

      // Create rows
      valuesToShow.forEach((value, index) => {
        const count = value === '(Missing)' ? missingCount : (valueCounts.get(value) || 0);
        const percent = denominatorN > 0 ? (count / denominatorN) * 100 : 0;

        rows.push({
          variable: varKey,
          variableLabel: column.label,
          denominatorN,
          value,
          count,
          percent,
          isFirstRowForVariable: index === 0,
        });
      });
    }

    return rows;
  }, [selectedVariables, dataset, getConfig, percentMode]);

  // Export to CSV
  const exportToCSV = useCallback(() => {
    if (tableRows.length === 0) return;

    // Determine if any variable is expanded (needs Value column)
    const hasExpandedVariables = selectedVariables.some(v => getConfig(v).expanded);

    let headers: string[];
    let csvRows: string[][];

    if (hasExpandedVariables) {
      headers = ['Variable', 'Value', 'N', '%'];
      csvRows = tableRows.map(row => [
        row.isFirstRowForVariable ? `${row.variableLabel} (n=${row.denominatorN})` : '',
        row.value,
        String(row.count),
        row.percent.toFixed(1) + '%',
      ]);
    } else {
      headers = ['Variable', 'N', '%'];
      csvRows = tableRows.map(row => [
        `${row.variableLabel} (n=${row.denominatorN})`,
        String(row.count),
        row.percent.toFixed(1) + '%',
      ]);
    }

    const csv = [
      headers.join(','),
      ...csvRows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dataset.name}_one_way_table.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [tableRows, selectedVariables, getConfig, dataset.name]);

  // Check if any variable is expanded
  const hasExpandedVariables = selectedVariables.some(v => getConfig(v).expanded);

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">1-Way Tables</h3>
        <p className="text-sm text-gray-600">
          Create frequency tables for multiple variables. Select variables below, then configure each as expanded (all values) or condensed (single value).
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Configuration */}
        <div className="lg:col-span-1 space-y-4">
          {/* Percentage Mode */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-900">Percentage Calculation</h4>
              <button
                onClick={() => setShowPercentHelp(!showPercentHelp)}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                {showPercentHelp ? 'Hide help' : 'Help'}
              </button>
            </div>

            {showPercentHelp && (
              <div className="mb-3 p-3 bg-blue-50 rounded-lg text-xs text-blue-800">
                <p className="font-medium mb-1">Which should I choose?</p>
                <p className="mb-2">
                  <strong>% of Total Records:</strong> Use when missing data is meaningful (e.g., "refused to answer" or data not collected). Missing values appear as a row.
                </p>
                <p>
                  <strong>% of Non-Missing:</strong> Use when missing values should be excluded from analysis (e.g., data entry errors, not applicable). Percentages are based only on valid responses.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="percentMode"
                  checked={percentMode === 'total'}
                  onChange={() => setPercentMode('total')}
                  className="text-blue-600"
                />
                <span className="text-sm text-gray-700">% of Total Records</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="percentMode"
                  checked={percentMode === 'non-missing'}
                  onChange={() => setPercentMode('non-missing')}
                  className="text-blue-600"
                />
                <span className="text-sm text-gray-700">% of Non-Missing Values</span>
              </label>
            </div>
          </div>

          {/* Variable Selection */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Select Variables</h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {dataset.columns.map(col => (
                <label key={col.key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedVariables.includes(col.key)}
                    onChange={() => toggleVariable(col.key)}
                    className="text-blue-600 rounded"
                  />
                  <span className="text-sm text-gray-700 truncate" title={col.label}>
                    {col.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Variable Configurations */}
          {selectedVariables.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Variable Settings</h4>
              <div className="space-y-4">
                {selectedVariables.map(varKey => {
                  const column = dataset.columns.find(c => c.key === varKey);
                  const config = getConfig(varKey);
                  const uniqueValues = getUniqueValues(varKey);

                  return (
                    <div key={varKey} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                      <p className="text-sm font-medium text-gray-800 mb-2">{column?.label}</p>
                      <div className="flex items-center gap-3 mb-2">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name={`mode-${varKey}`}
                            checked={config.expanded}
                            onChange={() => updateConfig(varKey, { expanded: true })}
                            className="text-blue-600"
                          />
                          <span className="text-xs text-gray-600">Expanded</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name={`mode-${varKey}`}
                            checked={!config.expanded}
                            onChange={() => updateConfig(varKey, { expanded: false })}
                            className="text-blue-600"
                          />
                          <span className="text-xs text-gray-600">Condensed</span>
                        </label>
                      </div>
                      {!config.expanded && (
                        <select
                          value={config.valueOfInterest}
                          onChange={(e) => updateConfig(varKey, { valueOfInterest: e.target.value })}
                          className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                        >
                          {uniqueValues.map(val => (
                            <option key={val} value={val}>{val}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Results Table */}
        <div className="lg:col-span-2">
          {selectedVariables.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-400">
              <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>Select variables to create a table</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              {/* Table Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900">Results</h4>
                <button
                  onClick={exportToCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export CSV
                </button>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Variable
                      </th>
                      {hasExpandedVariables && (
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Value
                        </th>
                      )}
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        N
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        %
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {tableRows.map((row, index) => {
                      const config = getConfig(row.variable);
                      return (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {row.isFirstRowForVariable ? (
                              <span>
                                {row.variableLabel}{' '}
                                <span className="text-gray-500">(n={row.denominatorN})</span>
                              </span>
                            ) : ''}
                          </td>
                          {hasExpandedVariables && (
                            <td className="px-4 py-2 text-sm text-gray-700">
                              {config.expanded ? row.value : ''}
                            </td>
                          )}
                          <td className="px-4 py-2 text-sm text-gray-900 text-right font-medium">
                            {row.count}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900 text-right">
                            {row.percent.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer note */}
              <div className="px-4 py-2 bg-gray-50 border-t border-gray-200">
                <p className="text-xs text-gray-500">
                  Percentages calculated as % of {percentMode === 'total' ? 'total records' : 'non-missing values'}.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
